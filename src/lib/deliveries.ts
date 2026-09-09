/**
 * Shared delivery counter logic — content-month basis with cumulative rollover.
 *
 * refreshDeliveredCount(supabase, clientId, billingDay?)
 *   - billingDay defaults to 1 (calendar month). Pass 19 for FaceTub-style periods.
 *   - Counts deliverables by date_added (the CONTENT month), excluding ad_only assets.
 *   - Each period has a quota (default 30). Anything produced over quota rolls
 *     forward to the next period and accumulates — surplus is never lost.
 *   - Carry is accumulated from the client's FIRST active period, NOT reset at the
 *     current month. This is the key fix: rebuilding the current month from scratch
 *     used to wipe the surplus rolled in by the prior month every time the calendar
 *     flipped. Now every recompute reproduces the full running balance.
 *   - delivered = min(produced + carryIn, quota); carryOut = max(0, produced + carryIn - quota).
 *     A period under quota is simply topped up by carry-in (e.g. 0 produced + 29 carried = 29/30).
 *   - Safe to run repeatedly — fully deterministic from the assets table.
 *   - MAX_LOOKAHEAD_MONTHS caps how far past the current period we propagate.
 */
import { SupabaseClient } from '@supabase/supabase-js'

const MAX_LOOKAHEAD_MONTHS = 12
const DEFAULT_QUOTA = 30
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Earliest month the tracker accounts for. Content dated before this is treated
// as bad data (e.g. a filename-date typo) and never anchors the rollover walk —
// this prevents a single mis-dated asset from generating years of empty periods.
const PROGRAM_START: YM = { year: 2026, month: 3 }

type YM = { year: number; month: number }

/** Returns "YYYY-MM-DD" for the given year, month (1-indexed), and day. */
function periodStr(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day)
  return d.toISOString().split('T')[0]
}

/** Current billing period (as a year/month anchor) for a billing day + reference date. */
function getCurrentPeriodYM(billingDay: number, now: Date): YM {
  if (now.getDate() >= billingDay) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 }
}

function addMonthsToYM(base: YM, n: number): YM {
  const d = new Date(base.year, base.month - 1 + n, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** Whole-month distance from a → b (positive if b is later). */
function ymDiff(a: YM, b: YM): number {
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/** The billing-period anchor that a given date falls into. */
function periodYMForDate(dateStr: string, billingDay: number): YM {
  const d = new Date(dateStr + 'T12:00:00')
  if (d.getDate() >= billingDay) {
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  }
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 }
}

/**
 * Count deliverables whose CONTENT month (date_added) falls in [periodStart, periodEnd).
 * Excludes ad_only assets (✔️ — approved for ads but not billed as deliverables).
 */
async function countDeliverables(
  supabase: SupabaseClient,
  clientId: string,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('ad_only', false)
    .is('spark_item_id', null)
    .not('asset_name', 'ilike', '%-EXT-%')
    .gte('date_added', periodStart)
    .lt('date_added', periodEnd)
  return count ?? 0
}

export interface QuotaRolloverResult {
  newDateAdded: string  // "YYYY-MM-DD" — the target period's start date
  folderName:   string  // "Month YYYY" — the Drive folder this asset must land in
}

/**
 * Hard-line quota rollover (Seth, 2026-09-09): once a client's period already
 * has `quota` qualifying deliverables, any further asset for that period is
 * bumped to the next period — both its `date_added` (so it counts against the
 * next period, not the maxed-out current one) and its Drive folder placement.
 * No grace buffer: the very next asset over quota rolls immediately.
 *
 * Call this at ✅ approval time, BEFORE the asset's ad_only flag flips to
 * false (i.e. before it starts counting) and BEFORE refreshDeliveredCount, so
 * the recompute picks up the corrected date_added in one pass.
 *
 * Returns null if the asset's period still has room (no rollover needed).
 * Logs every rollover to `quota_rollovers` — notify-after, not a hard gate;
 * Seth gets pinged per rollover and manually deletes from Drive if it's a reject.
 */
export async function checkAndApplyQuotaRollover(
  supabase: SupabaseClient,
  asset: { id: string; asset_name: string; date_added: string },
  client: { id: string; name: string; billing_day: number | null; default_quota: number | null }
): Promise<QuotaRolloverResult | null> {
  const billingDay = client.billing_day ?? 1
  const clientQuota = client.default_quota ?? DEFAULT_QUOTA

  let ym = periodYMForDate(asset.date_added, billingDay)

  // Walk forward until we find a period with room (normally exactly one hop —
  // capped at MAX_LOOKAHEAD_MONTHS as a safety guard against runaway loops).
  for (let hop = 0; hop <= MAX_LOOKAHEAD_MONTHS; hop++) {
    const nextYM = addMonthsToYM(ym, 1)
    const pStart = periodStr(ym.year, ym.month, billingDay)
    const pEnd   = periodStr(nextYM.year, nextYM.month, billingDay)

    const { data: row } = await supabase
      .from('monthly_deliveries')
      .select('quota')
      .eq('client_id', client.id)
      .eq('month', pStart)
      .maybeSingle()
    const quota = row?.quota ?? clientQuota

    const { count } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('ad_only', false)
      .is('spark_item_id', null)
      .not('asset_name', 'ilike', '%-EXT-%')
      .gte('date_added', pStart)
      .lt('date_added', pEnd)
      .neq('id', asset.id)

    if ((count ?? 0) < quota) {
      if (hop === 0) return null // this asset's original period still has room

      // Rolled forward at least one period — persist + log it.
      const folderName = `${MONTHS[ym.month - 1]} ${ym.year}`
      await supabase.from('assets').update({ date_added: pStart }).eq('id', asset.id)
      await supabase.from('quota_rollovers').insert({
        asset_id:            asset.id,
        client_id:           client.id,
        client_name:         client.name,
        asset_name:          asset.asset_name,
        original_date_added: asset.date_added,
        new_date_added:      pStart,
        folder_name:         folderName,
      })
      return { newDateAdded: pStart, folderName }
    }

    ym = nextYM
  }

  console.error(`[quota-rollover] exhausted ${MAX_LOOKAHEAD_MONTHS}-month lookahead for asset ${asset.id} — leaving date_added unchanged`)
  return null
}

export async function refreshDeliveredCount(
  supabase: SupabaseClient,
  clientId: string,
  billingDay = 1
) {
  try {
    // Skip clients whose delivery counter is turned off (e.g. non-social clients).
    const { data: client } = await supabase
      .from('clients')
      .select('tracks_deliveries, default_quota')
      .eq('id', clientId)
      .maybeSingle()
    if (client && client.tracks_deliveries === false) return

    // Per-client monthly quota for periods that don't have an explicit row yet.
    const clientQuota = client?.default_quota ?? DEFAULT_QUOTA

    const now   = new Date()
    const curYM = getCurrentPeriodYM(billingDay, now)

    // ── Determine the anchor: the earliest period we need to compute ──────────────
    // Start from the client's first content month (or first existing delivery row),
    // so carry accumulates across every closed period up to today and beyond.
    let startYM = curYM

    const { data: earliestAsset } = await supabase
      .from('assets')
      .select('date_added')
      .eq('client_id', clientId)
      .eq('ad_only', false)
      .is('spark_item_id', null)
      .not('asset_name', 'ilike', '%-EXT-%')
      .not('date_added', 'is', null)
      .order('date_added', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (earliestAsset?.date_added) {
      const ym = periodYMForDate(earliestAsset.date_added, billingDay)
      if (ymDiff(ym, startYM) > 0) startYM = ym
    }

    const { data: earliestRow } = await supabase
      .from('monthly_deliveries')
      .select('month')
      .eq('client_id', clientId)
      .order('month', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (earliestRow?.month) {
      const ym = periodYMForDate(earliestRow.month, billingDay)
      if (ymDiff(ym, startYM) > 0) startYM = ym
    }

    // Never anchor before the program start (guards against mis-dated assets).
    if (ymDiff(PROGRAM_START, startYM) < 0) startYM = PROGRAM_START

    // ── Walk every period from the anchor forward, carrying surplus ──────────────
    const totalSpan = ymDiff(startYM, curYM) + MAX_LOOKAHEAD_MONTHS
    let carry = 0

    for (let i = 0; i <= totalSpan; i++) {
      const ym       = addMonthsToYM(startYM, i)
      const nextYM   = addMonthsToYM(ym, 1)
      const pStart   = periodStr(ym.year, ym.month, billingDay)
      const pEnd     = periodStr(nextYM.year, nextYM.month, billingDay)
      const isFuture = ymDiff(curYM, ym) > 0

      const { data: row } = await supabase
        .from('monthly_deliveries')
        .select('quota')
        .eq('client_id', clientId)
        .eq('month', pStart)
        .maybeSingle()

      const produced = await countDeliverables(supabase, clientId, pStart, pEnd)

      // Don't create empty future rows once there's nothing left to show.
      if (isFuture && carry === 0 && produced === 0 && !row) break

      const quota     = row?.quota ?? clientQuota
      const raw       = produced + carry
      const delivered = Math.min(raw, quota)
      carry           = Math.max(0, raw - quota)

      await supabase.from('monthly_deliveries').upsert({
        client_id:          clientId,
        month:              pStart,
        quota,
        baseline_delivered: 0,
        delivered,
      }, { onConflict: 'client_id,month' })
    }
  } catch (err) {
    console.error('refreshDeliveredCount error:', err)
  }
}
