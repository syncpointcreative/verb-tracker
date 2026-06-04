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
