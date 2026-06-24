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
 * Performance-based freshness state, written by the off-platform analyzer
 * (TikTok spend + stage metrics). When present it supersedes the age tier:
 * the board judges "is it still worth running" rather than "how old is it".
 */
export type FreshnessState =
  | 'still_performing' | 'underperforming' | 'needs_replacing' | 'under_delivered'

export const FRESHNESS_META: Record<FreshnessState, { emoji: string; label: string; cls: string }> = {
  still_performing: { emoji: '🟢', label: 'Still performing', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  underperforming:  { emoji: '🟡', label: 'Underperforming',  cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  needs_replacing:  { emoji: '🔴', label: 'Needs replacing',  cls: 'text-red-700 bg-red-50 border-red-200' },
  under_delivered:  { emoji: '⏳', label: 'Under-delivered',  cls: 'text-stone-600 bg-stone-100 border-stone-200' },
}

/** Display order for state breakdowns — most-actionable first. */
export const FRESHNESS_STATE_ORDER: FreshnessState[] =
  ['needs_replacing', 'underperforming', 'still_performing', 'under_delivered']

export function freshnessMeta(state: string | null | undefined) {
  return state ? FRESHNESS_META[state as FreshnessState] ?? null : null
}

export function isNeedsReplacing(state: string | null | undefined): boolean {
  return state === 'needs_replacing'
}

/**
 * Replacement reason, written by the analyzer alongside a needs_replacing state.
 * Splits "earned its retirement" (performed, then faded) from "never worked"
 * (dud from the start) so the creative team knows whether to remix or move on.
 */
export type FreshnessReason = 'faded' | 'never_performed'

export const FRESHNESS_REASON_META: Record<FreshnessReason, { emoji: string; label: string; cls: string; hint: string }> = {
  faded:           { emoji: '📉', label: 'Faded',           cls: 'text-orange-700 bg-orange-50 border-orange-200',  hint: 'Performed early, then declined with age — worth a fresh variant of the concept.' },
  never_performed: { emoji: '💀', label: 'Never performed', cls: 'text-stone-600 bg-stone-100 border-stone-300',    hint: "Underperformed from the start — don't repeat this concept/hook." },
}

export function freshnessReasonMeta(reason: string | null | undefined) {
  return reason ? FRESHNESS_REASON_META[reason as FreshnessReason] ?? null : null
}
