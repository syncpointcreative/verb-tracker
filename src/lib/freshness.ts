/**
 * Shared freshness math.
 *
 * Freshness was previously computed inline in three places (dashboard,
 * Kanban board, asset table) as:
 *     Math.floor((Date.now() - new Date(date + 'T12:00:00')) / 86_400_000)
 *
 * `new Date('YYYY-MM-DDT12:00:00')` (no zone) is parsed in the *runtime's*
 * local timezone. The dashboard renders on the server (UTC) while the board
 * and table re-render in the browser (e.g. US Central), so the SAME asset
 * could read 22 days (Stale) on the dashboard but 21 days (Refresh) in the
 * board/table — and the "Stale" grouping silently vanished client-side.
 *
 * daysLive() anchors everything to UTC calendar days so every view agrees.
 */

export type FreshnessTier = 'fresh' | 'monitor' | 'refreshSoon' | 'stale' | 'expired'

/** Whole calendar days from a YYYY-MM-DD date until today, computed in UTC. */
export function daysLive(dateStr: string): number {
  const start = Date.parse(dateStr + 'T00:00:00Z')
  if (Number.isNaN(start)) return 0
  const now = new Date()
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((todayUTC - start) / 86_400_000)
}

/** Map a day count to a freshness tier (same thresholds everywhere). */
export function tierForDays(days: number): FreshnessTier {
  if (days <= 7)  return 'fresh'
  if (days <= 14) return 'monitor'
  if (days <= 21) return 'refreshSoon'
  if (days <= 30) return 'stale'
  return 'expired'
}

/**
 * Canonical asset bucket — the SINGLE source of truth for status counts in the
 * dashboard, Kanban board, and asset table.
 *
 * These three views used to each classify assets with their own slightly
 * different logic, so their counts disagreed (e.g. a paused asset was aged into
 * "stale/expired" on the dashboard but shown as "paused" on the board). Every
 * view must now route through classifyAsset() so the numbers reconcile by
 * construction instead of by three hand-maintained copies that drift apart.
 *
 *   fresh | monitor | refreshSoon | stale | expired  → live asset, aged by days-live
 *   paused      → status === 'Paused' (a deliberate off-state, never aged)
 *   notLive     → not yet live (Ready to Upload, or no date_live)
 *   excluded    → out of the freshness picture entirely (Pulled, Removed by Request, Pending Review)
 */
export type AssetBucket = FreshnessTier | 'paused' | 'notLive' | 'excluded'

/** Statuses that never participate in freshness aging. */
const EXCLUDED_STATUSES = ['Pulled', 'Removed by Request', 'Pending Review']

export function classifyAsset(asset: { status?: string | null; date_live?: string | null }): AssetBucket {
  const status = asset.status ?? ''
  if (EXCLUDED_STATUSES.includes(status)) return 'excluded'
  if (status === 'Paused')                return 'paused'
  if (status === 'Expired')               return 'expired'   // explicitly retired → expired tier
  if (status === 'Ready to Upload' || !asset.date_live) return 'notLive'
  return tierForDays(daysLive(asset.date_live))
}

/** True only for the freshness "stale" tier (22–30 days live). */
export function isStaleBucket(asset: { status?: string | null; date_live?: string | null }): boolean {
  return classifyAsset(asset) === 'stale'
}

/** True only for the freshness "expired" tier (>30 days live, or status Expired). */
export function isExpiredBucket(asset: { status?: string | null; date_live?: string | null }): boolean {
  return classifyAsset(asset) === 'expired'
}
