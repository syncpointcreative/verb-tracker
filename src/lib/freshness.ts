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

/**
 * The actionable split of "needs replacing". The reason (faded vs never-performed)
 * is a diagnosis; this turns it into the PLAY the creative team runs, and the red
 * pill itself becomes that action instead of a generic "Needs replacing":
 *   • faded            → 📉 Replace — make a fresh variant (the concept worked)
 *   • never_performed  → 💀 Kill — don't repeat the concept/hook
 * `label` is the short chip word; `action` is the full pill text.
 */
export type ReplaceAction = 'replace' | 'kill'

export const REPLACE_ACTION_META: Record<ReplaceAction, { emoji: string; label: string; action: string; cls: string; hint: string }> = {
  replace: { emoji: '📉', label: 'Replace', action: 'Replace — fresh variant', cls: 'text-orange-700 bg-orange-50 border-orange-200', hint: 'Performed early, then faded with age — make a fresh variant of the concept.' },
  kill:    { emoji: '💀', label: 'Kill',    action: "Kill — don't repeat",     cls: 'text-red-700 bg-red-50 border-red-200',        hint: "Never performed from the start — don't repeat this concept/hook." },
}

export function replaceActionFor(reason: string | null | undefined): ReplaceAction {
  return reason === 'faded' ? 'replace' : 'kill'
}

/**
 * The single pill verdict shown on a card/row. For needs_replacing (with a reason),
 * the pill becomes the action (Replace/Kill); every other state passes through its
 * own meta unchanged. Returns null when the asset has no analyzer verdict yet.
 */
export function freshnessVerdict(state: string | null | undefined, reason: string | null | undefined):
  { emoji: string; label: string; cls: string; hint?: string } | null {
  const meta = freshnessMeta(state)
  if (!meta) return null
  if (isNeedsReplacing(state) && reason) {
    const a = REPLACE_ACTION_META[replaceActionFor(reason)]
    return { emoji: a.emoji, label: a.action, cls: a.cls, hint: a.hint }
  }
  return { emoji: meta.emoji, label: meta.label, cls: meta.cls }
}

/** Dashboard verdict chip (count + label), in actionable order. */
export type VerdictChip = { key: string; emoji: string; label: string; cls: string; count: number }

/**
 * Dashboard health chips in most-actionable order, with needs_replacing split into
 * Replace (faded) and Kill (never-performed) so the card counts mirror the board.
 * `faded`/`kill` are the reason-split sub-counts of `needs_replacing`.
 */
export function verdictChips(counts: FreshnessCounts & { faded?: number; kill?: number }): VerdictChip[] {
  const chips: VerdictChip[] = []
  for (const key of FRESHNESS_STATE_ORDER) {
    if (key === 'needs_replacing') {
      const faded = counts.faded ?? 0, kill = counts.kill ?? 0
      if (faded) chips.push({ key: 'replace', count: faded, emoji: REPLACE_ACTION_META.replace.emoji, label: REPLACE_ACTION_META.replace.label, cls: REPLACE_ACTION_META.replace.cls })
      if (kill)  chips.push({ key: 'kill',    count: kill,  emoji: REPLACE_ACTION_META.kill.emoji,    label: REPLACE_ACTION_META.kill.label,    cls: REPLACE_ACTION_META.kill.cls })
      // any needs_replacing the analyzer hasn't reason-tagged yet still surfaces
      const untagged = counts.needs_replacing - faded - kill
      if (untagged > 0) chips.push({ key: 'needs_replacing', count: untagged, emoji: FRESHNESS_META.needs_replacing.emoji, label: FRESHNESS_META.needs_replacing.label, cls: FRESHNESS_META.needs_replacing.cls })
    } else if (counts[key] > 0) {
      chips.push({ key, count: counts[key], emoji: FRESHNESS_META[key].emoji, label: FRESHNESS_META[key].label, cls: FRESHNESS_META[key].cls })
    }
  }
  return chips
}

/** Counts of each performance verdict for a set of assets. */
export type FreshnessCounts = Record<FreshnessState, number>
