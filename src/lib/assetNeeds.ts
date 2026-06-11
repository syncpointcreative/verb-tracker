/**
 * assetNeeds — performance-aware creative-ask scoring.
 *
 * The original freshness alert fired on ONE signal: days live ≥ threshold.
 * That throws an ask whenever a slot ages out, regardless of whether the
 * creative ever worked. This module makes the ask *measured*: it ranks each
 * aging/missing slot by evidence, and — crucially — checks the bench before
 * asking for new production.
 *
 * Signals it blends (all already in the assets table):
 *   • performance  — 'High Performer' | 'Average Performer' | 'Poor Performer'
 *                    Set by the team on pull today; populated for live assets
 *                    once ad-level ROAS grades are written back. Logic reads it
 *                    regardless of who set it, so it sharpens automatically.
 *   • status       — Pulled High Performers = the bench (reach-back reserve).
 *                    Ready/Pending for a slot = a replacement is already queued.
 *   • days live    — staleness, same UTC-day math as the rest of the app.
 *
 * Output: every need lands in exactly one priority bucket (see NeedBucket),
 * so asks are justified by why they fire — proven decay, an idle bench winner,
 * a routine refresh — and pure gaps are demoted to a footnote instead of
 * leading the alert.
 *
 * Framework-free and type-only imports on purpose: the same source renders the
 * Slack alert AND the dry-run preview (transpiled and run under plain node).
 */

import type { Stage } from './supabase'

export type Performance = 'High Performer' | 'Average Performer' | 'Poor Performer'

/** Minimal asset shape this module needs — a subset of the full Asset row. */
export interface NeedAsset {
  id: string
  status: string
  stage: Stage
  content_type: string | null
  date_added: string | null
  date_live: string | null
  first_live?: string | null
  client_id: string
  product_id: string
  performance: Performance | null
  asset_name?: string | null
  notes?: string | null
  product: { name: string; discontinued?: boolean } | null
  client: { id: string; name: string; slug: string } | null
}

export type NeedBucket =
  | 'provenDecay'   // a known winner is the asset aging out — refresh the concept now
  | 'reactivate'    // a pulled High Performer matches this open slot — reuse before producing
  | 'standard'      // routine refresh — aging, average/ungraded, nothing queued
  | 'lowPriority'   // poor performer aging, or a gap with no proven history — demote
  | 'covered'       // a replacement is already queued (Ready/Pending) — not an ask

export interface ScoredNeed {
  asset: NeedAsset
  daysLive: number
  daysOver: number
  bucket: NeedBucket
  /** Pulled High Performer that could fill this slot without new production. */
  benchCandidate: NeedAsset | null
  /** Queued replacement (Ready to Upload / Pending Review) covering this slot. */
  queuedReplacement: NeedAsset | null
  /** How many replacements are queued for this slot — annotates a proven-decay FYI. */
  queuedCount: number
  score: number
}

export interface ClientNeeds {
  client: { id: string; name: string; slug: string }
  needs: ScoredNeed[]
  counts: Record<NeedBucket, number>
  /** Asks worth surfacing = everything except `covered`. */
  actionable: number
}

const ACTIVE_SLOT = new Set(['Live / Running', 'Needs Refresh / Missing'])
const QUEUED = new Set(['Ready to Upload', 'Pending Review'])

const PERF_WEIGHT: Record<Performance, number> = {
  'High Performer': 3,
  'Average Performer': 1.5,
  'Poor Performer': 0.4,
}

/** Live assets date from go-live; everything else from when it entered the board. */
export function relevantDate(a: NeedAsset): string | null {
  if (a.status === 'Live / Running' && a.date_live) return a.date_live
  return a.date_added
}

/** Whole UTC calendar days from a YYYY-MM-DD date until `now`. */
export function daysSince(dateStr: string, now: Date): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return 0
  const then = Date.UTC(y, m - 1, d)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - then) / 86_400_000)
}

const comboKey = (a: { client_id: string; product_id: string; stage: Stage }) =>
  `${a.client_id}:${a.product_id}:${a.stage}`

export interface ScoreOpts {
  refreshSoonDays: number
  now: Date
}

/**
 * Score every aging/missing slot across all clients.
 * `allAssets` should be the full asset set (any status) so the scorer can see
 * the bench (Pulled High Performers) and the pipeline (Ready/Pending).
 */
export function scoreNeeds(allAssets: NeedAsset[], opts: ScoreOpts): ClientNeeds[] {
  const { refreshSoonDays, now } = opts

  const live = allAssets.filter(a => !a.product?.discontinued)

  // Index the bench: pulled High Performers, by client:product:stage.
  const bench = new Map<string, NeedAsset>()
  for (const a of live) {
    if (a.status === 'Pulled' && a.performance === 'High Performer') {
      const k = comboKey(a)
      // Keep the most recently added bench winner for the slot.
      const cur = bench.get(k)
      if (!cur || (a.date_added ?? '') > (cur.date_added ?? '')) bench.set(k, a)
    }
  }

  // Index the pipeline: queued replacements, by client:product:stage.
  const queued = new Map<string, NeedAsset>()
  const queuedCount = new Map<string, number>()
  for (const a of live) {
    if (QUEUED.has(a.status)) {
      const k = comboKey(a)
      if (!queued.has(k)) queued.set(k, a)
      queuedCount.set(k, (queuedCount.get(k) ?? 0) + 1)
    }
  }

  // Candidate slots: active (live or missing) and past the refresh threshold.
  const candidates = live.filter(a => {
    if (!ACTIVE_SLOT.has(a.status)) return false
    const d = relevantDate(a)
    if (!d) return a.status === 'Needs Refresh / Missing' // undated gap still counts
    return daysSince(d, now) >= refreshSoonDays
  })

  const byClient = new Map<string, ClientNeeds>()

  for (const a of candidates) {
    if (!a.client) continue
    const d = relevantDate(a)
    const daysLive = d ? daysSince(d, now) : refreshSoonDays
    const daysOver = Math.max(0, daysLive - refreshSoonDays)
    const k = comboKey(a)

    const queuedReplacement = queued.get(k) ?? null
    const benchCandidate = bench.get(k) ?? null

    let bucket: NeedBucket
    if (a.performance === 'High Performer') {
      // A proven winner aging out always surfaces — even when replacements are
      // queued. Generic queued creative ≠ a refresh of the proven concept, so
      // we flag it (annotated with the queue below) rather than let a winner
      // die quietly while unproven swings ship in its place.
      bucket = 'provenDecay'
    } else if (queuedReplacement) {
      bucket = 'covered'
    } else if (benchCandidate) {
      bucket = 'reactivate'
    } else if (a.performance === 'Poor Performer') {
      bucket = 'lowPriority'
    } else if (a.status === 'Needs Refresh / Missing' && !a.performance) {
      bucket = 'lowPriority' // pure gap, no proven history → footnote
    } else {
      bucket = 'standard'
    }

    const perfWeight = a.performance ? PERF_WEIGHT[a.performance] : 1
    const score = (daysOver + 1) * perfWeight

    const cn = byClient.get(a.client.id) ?? {
      client: a.client,
      needs: [],
      counts: { provenDecay: 0, reactivate: 0, standard: 0, lowPriority: 0, covered: 0 },
      actionable: 0,
    }
    cn.needs.push({ asset: a, daysLive, daysOver, bucket, benchCandidate, queuedReplacement, queuedCount: queuedCount.get(k) ?? 0, score })
    cn.counts[bucket]++
    byClient.set(a.client.id, cn)
  }

  for (const cn of byClient.values()) {
    cn.needs.sort((x, y) => y.score - x.score)
    cn.actionable = cn.needs.length - cn.counts.covered
  }

  // Clients with the most actionable asks first.
  return [...byClient.values()].sort((a, b) => b.actionable - a.actionable)
}

// ─── Presentation ─────────────────────────────────────────────────────────────

const STAGE_EMOJI: Record<string, string> = {
  Awareness: '👀',
  Consideration: '🤔',
  Conversion: '🎯',
}

const STAGE_SUGGESTION: Record<string, string> = {
  Awareness: 'New hook video — stop the scroll, introduce product',
  Consideration: 'Fresh demo, tutorial, or testimonial showing value',
  Conversion: 'New promo/offer-led video with clear CTA',
}

interface BucketMeta {
  emoji: string
  title: string
  blurb: string
}

const BUCKET_META: Record<Exclude<NeedBucket, 'covered'>, BucketMeta> = {
  provenDecay: {
    emoji: '🔴',
    title: 'Proven winner fading — refresh the concept',
    blurb: 'These worked. Get a fresh take in before the concept dies, not a blind new swing.',
  },
  reactivate: {
    emoji: '🪑',
    title: 'Reactivate from the bench — before producing new',
    blurb: 'A pulled High Performer matches this slot. Reach back for it first; save production for gaps.',
  },
  standard: {
    emoji: '🟡',
    title: 'Routine refresh',
    blurb: 'Aging out, no proven grade yet — standard new-creative ask.',
  },
  lowPriority: {
    emoji: '⚪',
    title: 'Low priority — confirm the slot still earns its place',
    blurb: 'Underperformers or never-proven gaps. Ask only if this slot is still worth filling.',
  },
}

const BUCKET_ORDER: Exclude<NeedBucket, 'covered'>[] = [
  'provenDecay',
  'reactivate',
  'standard',
  'lowPriority',
]

function needLine(n: ScoredNeed): string {
  const product = n.asset.product?.name ?? 'Unknown product'
  const type = n.asset.content_type ?? 'Unknown type'
  const age = n.asset.status === 'Needs Refresh / Missing' && n.daysOver === 0
    ? 'missing'
    : `*${n.daysLive} days* live`
  let line = `    › ${product} — ${type} — ${age}`
  if (n.bucket === 'reactivate' && n.benchCandidate) {
    const bn = n.benchCandidate.asset_name ?? 'bench asset'
    line += `\n        ↳ _bench: relaunch *${bn}* (pulled High Performer) — no new production needed_`
  }
  if (n.bucket === 'provenDecay') {
    line += n.queuedCount > 0
      ? `\n        ↳ _${n.queuedCount} replacement${n.queuedCount !== 1 ? 's' : ''} queued — make sure one carries this proven concept, don't just ship the new swings_`
      : `\n        ↳ _no refresh queued — get a fresh take on this winner in before the concept fades_`
  }
  return line
}

/** Build the Monday Slack blocks for one client from its scored needs. */
export function buildMondayBlocks(
  cn: ClientNeeds,
  appUrl: string,
): { channel?: string; text: string; blocks: object[] } {
  const headerText = `📋 This Week's Creative Asks — ${cn.client.name}`
  const blocks: object[] = [
    { type: 'header', text: { type: 'plain_text', text: headerText, emoji: true } },
  ]

  const summary =
    `*${cn.actionable} ask${cn.actionable !== 1 ? 's' : ''}* this week, ranked by evidence` +
    (cn.counts.provenDecay ? ` · 🔴 ${cn.counts.provenDecay} proven fading` : '') +
    (cn.counts.reactivate ? ` · 🪑 ${cn.counts.reactivate} on the bench` : '') +
    (cn.counts.covered ? ` · ✅ ${cn.counts.covered} already in pipeline` : '')
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: summary } })

  for (const bucket of BUCKET_ORDER) {
    const items = cn.needs.filter(n => n.bucket === bucket)
    if (!items.length) continue
    const meta = BUCKET_META[bucket]

    // One section per stage within the bucket (avoids Slack's 3000-char limit).
    const stages: Stage[] = ['Awareness', 'Consideration', 'Conversion']
    const stageText = stages.flatMap(stage => {
      const si = items.filter(n => n.asset.stage === stage)
      if (!si.length) return []
      const lines = si.map(needLine).join('\n')
      const ask = bucket === 'standard'
        ? `\n    _Ask: ${STAGE_SUGGESTION[stage] ?? ''}_`
        : ''
      return [`${STAGE_EMOJI[stage] ?? '•'} *${stage}*\n${lines}${ask}`]
    }).join('\n')

    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `${meta.emoji} *${meta.title}*\n_${meta.blurb}_` },
    })
    if (stageText) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: stageText } })
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'actions',
    elements: [{
      type: 'button',
      style: 'primary',
      text: { type: 'plain_text', text: `View ${cn.client.name} Dashboard →`, emoji: true },
      url: `${appUrl}/${cn.client.slug}`,
    }],
  })

  return { text: headerText, blocks }
}

/** Faithful plain-text render of a client's blocks — for dry-run preview. */
export function renderTextPreview(cn: ClientNeeds): string {
  const out: string[] = [`📋 This Week's Creative Asks — ${cn.client.name}`]
  out.push(
    `${cn.actionable} ask(s), ranked by evidence` +
    (cn.counts.provenDecay ? ` · 🔴 ${cn.counts.provenDecay} proven fading` : '') +
    (cn.counts.reactivate ? ` · 🪑 ${cn.counts.reactivate} on the bench` : '') +
    (cn.counts.covered ? ` · ✅ ${cn.counts.covered} in pipeline` : '')
  )
  for (const bucket of BUCKET_ORDER) {
    const items = cn.needs.filter(n => n.bucket === bucket)
    if (!items.length) continue
    const meta = BUCKET_META[bucket]
    out.push(`\n${meta.emoji} ${meta.title.toUpperCase()}`)
    const stages: Stage[] = ['Awareness', 'Consideration', 'Conversion']
    for (const stage of stages) {
      const si = items.filter(n => n.asset.stage === stage)
      if (!si.length) continue
      out.push(`  ${STAGE_EMOJI[stage] ?? '•'} ${stage}`)
      for (const n of si) {
        out.push('  ' + needLine(n).replace(/\*/g, '').trimStart())
      }
    }
  }
  return out.join('\n')
}
