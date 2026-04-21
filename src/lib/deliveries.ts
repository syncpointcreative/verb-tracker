/**
 * Shared delivery counter logic.
 *
 * refreshDeliveredCount(supabase, clientId, billingDay?)
 *   - billingDay defaults to 1 (calendar month). Pass 19 for FaceTub-style periods.
 *   - Only counts assets added on or after SYSTEM_LAUNCH_DATE.
 *   - Caps delivered at quota; overflows roll into the next billing period.
 *   - Safe to run multiple times — always recalculates from the fixed baseline.
 */
import { SupabaseClient } from '@supabase/supabase-js'

const SYSTEM_LAUNCH_DATE = '2026-04-08'

/** Returns "YYYY-MM-DD" for the given year, month (1-indexed), and day. */
function periodStr(year: number, month: number, day: number): string {
  // Handle month overflow (e.g. month=13 → year+1, month=1)
  const d = new Date(year, month - 1, day)
  return d.toISOString().split('T')[0]
}

/** Given a billing day and a reference date, return the current period start. */
function getCurrentPeriodYM(billingDay: number, now: Date): { year: number; month: number } {
  const today = now.getDate()
  if (today >= billingDay) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  // Haven't reached billing day yet — period started last month
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 }
}

function addMonthsToYM(base: { year: number; month: number }, n: number) {
  const d = new Date(base.year, base.month - 1 + n, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

async function countNewAssets(
  supabase: SupabaseClient,
  clientId: string,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const countFrom = periodStart < SYSTEM_LAUNCH_DATE ? SYSTEM_LAUNCH_DATE : periodStart
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('date_added', countFrom)
    .lt('date_added', periodEnd)
  return count ?? 0
}

export async function refreshDeliveredCount(
  supabase: SupabaseClient,
  clientId: string,
  billingDay = 1
) {
  try {
    const now = new Date()
    const curYM   = getCurrentPeriodYM(billingDay, now)
    const nextYM  = addMonthsToYM(curYM, 1)
    const afterYM = addMonthsToYM(curYM, 2)

    const curStart   = periodStr(curYM.year,   curYM.month,   billingDay)
    const nextStart  = periodStr(nextYM.year,  nextYM.month,  billingDay)
    const afterStart = periodStr(afterYM.year, afterYM.month, billingDay)

    // ── Current period ─────────────────────────────────────────────────────────
    const curAssets = await countNewAssets(supabase, clientId, curStart, nextStart)

    const { data: curRow } = await supabase
      .from('monthly_deliveries')
      .select('quota, baseline_delivered')
      .eq('client_id', clientId)
      .eq('month', curStart)
      .single()

    const curBaseline  = curRow?.baseline_delivered ?? 0
    const quota        = curRow?.quota ?? 30
    const raw          = curBaseline + curAssets
    const curDelivered = Math.min(raw, quota)
    const overflow     = Math.max(0, raw - quota)

    await supabase.from('monthly_deliveries').upsert({
      client_id:          clientId,
      month:              curStart,
      quota,
      baseline_delivered: curBaseline,
      delivered:          curDelivered,
    }, { onConflict: 'client_id,month' })

    // ── Next period: carry overflow only ───────────────────────────────────────
    const { data: nextRow } = await supabase
      .from('monthly_deliveries')
      .select('quota, baseline_delivered')
      .eq('client_id', clientId)
      .eq('month', nextStart)
      .single()

    if (nextRow || overflow > 0) {
      const nextBaseline  = nextRow?.baseline_delivered ?? 0
      const nextQuota     = nextRow?.quota ?? quota
      const nextAssets    = await countNewAssets(supabase, clientId, nextStart, afterStart)
      const nextDelivered = Math.min(nextBaseline + nextAssets + overflow, nextQuota)

      await supabase.from('monthly_deliveries').upsert({
        client_id:          clientId,
        month:              nextStart,
        quota:              nextQuota,
        baseline_delivered: nextBaseline,
        delivered:          nextDelivered,
      }, { onConflict: 'client_id,month' })
    }
  } catch (err) {
    console.error('refreshDeliveredCount error:', err)
  }
}
