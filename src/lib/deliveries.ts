/**
 * Shared delivery counter logic.
 *
 * refreshDeliveredCount(supabase, clientId, billingDay?)
 *   - billingDay defaults to 1 (calendar month). Pass 19 for FaceTub-style periods.
 *   - Counts assets by created_at (when submitted to the system), not date_added (filename date).
 *   - The April baseline already accounts for pre-system content; no launch-date cutoff needed.
 *   - Caps delivered at quota; overflows roll forward through as many periods as needed.
 *   - Safe to run multiple times — always recalculates from the fixed baseline.
 *   - MAX_LOOKAHEAD_MONTHS caps how far forward we propagate (prevents infinite loops).
 */
import { SupabaseClient } from '@supabase/supabase-js'

const MAX_LOOKAHEAD_MONTHS = 12

/** Returns "YYYY-MM-DD" for the given year, month (1-indexed), and day. */
function periodStr(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day)
  return d.toISOString().split('T')[0]
}

/** Given a billing day and a reference date, return the current period start. */
function getCurrentPeriodYM(billingDay: number, now: Date): { year: number; month: number } {
  const today = now.getDate()
  if (today >= billingDay) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
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
  // Count only Slack-submitted assets (slack_message_ts IS NOT NULL).
  // Manually-entered assets are backfills already captured in the baseline.
  // Use created_at (submission timestamp) so filename dates don't affect bucketing.
  // Exclude ad_only assets (✔️ reaction) — approved for ads but not billed as deliverables.
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('ad_only', false)
    .not('slack_message_ts', 'is', null)
    .gte('created_at', periodStart)
    .lt('created_at', periodEnd)
  return count ?? 0
}

export async function refreshDeliveredCount(
  supabase: SupabaseClient,
  clientId: string,
  billingDay = 1
) {
  try {
    const now   = new Date()
    const curYM = getCurrentPeriodYM(billingDay, now)

    // ── Current period ─────────────────────────────────────────────────────────
    const periodStart = periodStr(curYM.year, curYM.month, billingDay)
    const periodEnd   = periodStr(addMonthsToYM(curYM, 1).year, addMonthsToYM(curYM, 1).month, billingDay)

    const { data: curRow } = await supabase
      .from('monthly_deliveries')
      .select('quota, baseline_delivered')
      .eq('client_id', clientId)
      .eq('month', periodStart)
      .single()

    const curBaseline = curRow?.baseline_delivered ?? 0
    const quota       = curRow?.quota ?? 30
    const curAssets   = await countNewAssets(supabase, clientId, periodStart, periodEnd)
    const raw         = curBaseline + curAssets
    const curDelivered = Math.min(raw, quota)
    let   overflow    = Math.max(0, raw - quota)

    await supabase.from('monthly_deliveries').upsert({
      client_id:          clientId,
      month:              periodStart,
      quota,
      baseline_delivered: curBaseline,
      delivered:          curDelivered,
    }, { onConflict: 'client_id,month' })

    // ── Future periods: roll overflow forward until it drains ─────────────────
    // We also update any future periods that already have a row (e.g. manually-set
    // quotas or baselines) even if overflow is zero.
    for (let i = 1; i <= MAX_LOOKAHEAD_MONTHS; i++) {
      const futureYM    = addMonthsToYM(curYM, i)
      const futureStart = periodStr(futureYM.year, futureYM.month, billingDay)
      const futureEnd   = periodStr(addMonthsToYM(futureYM, 1).year, addMonthsToYM(futureYM, 1).month, billingDay)

      const { data: futureRow } = await supabase
        .from('monthly_deliveries')
        .select('quota, baseline_delivered')
        .eq('client_id', clientId)
        .eq('month', futureStart)
        .single()

      // Stop if there's no overflow left AND no existing row to update
      if (overflow === 0 && !futureRow) break

      const futureBaseline  = futureRow?.baseline_delivered ?? 0
      const futureQuota     = futureRow?.quota ?? quota
      const futureAssets    = await countNewAssets(supabase, clientId, futureStart, futureEnd)
      const futureRaw       = futureBaseline + futureAssets + overflow
      const futureDelivered = Math.min(futureRaw, futureQuota)
      const nextOverflow    = Math.max(0, futureRaw - futureQuota)

      await supabase.from('monthly_deliveries').upsert({
        client_id:          clientId,
        month:              futureStart,
        quota:              futureQuota,
        baseline_delivered: futureBaseline,
        delivered:          futureDelivered,
      }, { onConflict: 'client_id,month' })

      overflow = nextOverflow
      if (overflow === 0 && !futureRow) break
    }
  } catch (err) {
    console.error('refreshDeliveredCount error:', err)
  }
}
