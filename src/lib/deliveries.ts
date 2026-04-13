/**
 * Shared delivery counter logic.
 *
 * refreshDeliveredCount(supabase, clientId)
 *   - Only counts assets added on or after SYSTEM_LAUNCH_DATE (when the tracker
 *     went live). Assets before that date are already captured in baseline_delivered.
 *   - Caps delivered at quota for the current month.
 *   - Computes overflow and writes it into next month's delivered WITHOUT
 *     mutating next month's baseline_delivered (which stays as the manual baseline).
 *   - Safe to run multiple times — always recalculates from the fixed baseline.
 */
import { SupabaseClient } from '@supabase/supabase-js'

// Assets dated before this are already captured in baseline_delivered.
// Do not count them again.
const SYSTEM_LAUNCH_DATE = '2026-04-08'

function monthStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function addMonths(base: { year: number; month: number }, n: number) {
  const d = new Date(base.year, base.month - 1 + n, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

async function countNewAssets(
  supabase: SupabaseClient,
  clientId: string,
  monthStart: string,
  monthEnd: string
): Promise<number> {
  // Only count assets on/after the system launch date — earlier ones are in baseline
  const countFrom = monthStart < SYSTEM_LAUNCH_DATE ? SYSTEM_LAUNCH_DATE : monthStart
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('date_added', countFrom)
    .lt('date_added', monthEnd)
  return count ?? 0
}

export async function refreshDeliveredCount(
  supabase: SupabaseClient,
  clientId: string
) {
  try {
    const now = new Date()
    const cur   = { year: now.getFullYear(), month: now.getMonth() + 1 }
    const next  = addMonths(cur, 1)
    const after = addMonths(cur, 2)

    const curStart   = monthStr(cur.year,   cur.month)
    const nextStart  = monthStr(next.year,  next.month)
    const afterStart = monthStr(after.year, after.month)

    // ── Current month ──────────────────────────────────────────────────────────
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

    // Update current month — never change baseline_delivered (it's the manual baseline)
    await supabase.from('monthly_deliveries').upsert({
      client_id:          clientId,
      month:              curStart,
      quota,
      baseline_delivered: curBaseline,
      delivered:          curDelivered,
    }, { onConflict: 'client_id,month' })

    // ── Next month: add overflow into delivered only, not into baseline ────────
    // baseline_delivered stays as whatever was manually set for next month.
    // delivered = baseline_delivered + next_month_new_assets + overflow_from_this_month
    const { data: nextRow } = await supabase
      .from('monthly_deliveries')
      .select('quota, baseline_delivered')
      .eq('client_id', clientId)
      .eq('month', nextStart)
      .single()

    // Only touch next month row if it exists OR there's overflow to record
    if (nextRow || overflow > 0) {
      const nextBaseline  = nextRow?.baseline_delivered ?? 0
      const nextQuota     = nextRow?.quota ?? quota
      const nextAssets    = await countNewAssets(supabase, clientId, nextStart, afterStart)
      const nextDelivered = Math.min(nextBaseline + nextAssets + overflow, nextQuota)

      await supabase.from('monthly_deliveries').upsert({
        client_id:          clientId,
        month:              nextStart,
        quota:              nextQuota,
        baseline_delivered: nextBaseline,  // never modified — stays as manual baseline
        delivered:          nextDelivered,
      }, { onConflict: 'client_id,month' })
    }
  } catch (err) {
    console.error('refreshDeliveredCount error:', err)
  }
}
