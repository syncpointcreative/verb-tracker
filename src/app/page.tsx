import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { FRESHNESS_META, REPLACE_ACTION_META, verdictChips, type FreshnessState } from '@/lib/freshness'
import type { Client, Asset } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyDelivery {
  client_id: string
  month: string
  delivered: number
  quota: number
}

// Performance-verdict counts (from the analyzer) — the health of what's actually running.
type FreshnessCounts = Record<FreshnessState, number>

interface ClientSummary {
  client: Client
  totalAssets: number
  freshness: FreshnessCounts
  faded: number
  kill: number
  contentTypeCounts: Record<string, number>
  deliveries: MonthlyDelivery[]
  currentStart: string
  nextStart: string
  billingDay: number
  pendingReview: number
  readyToUpload: number
  needsRefresh: number
  needsReplacing: number
}

// ─── Freshness helpers ────────────────────────────────────────────────────────

// Performance-key legend, most-actionable first. "Needs replacing" is split into
// its two plays — Replace (faded) vs Kill (never-performed) — to match the board.
const LEGEND: { emoji: string; label: string; cls: string; desc: string }[] = [
  { emoji: REPLACE_ACTION_META.replace.emoji, label: REPLACE_ACTION_META.replace.action, cls: REPLACE_ACTION_META.replace.cls, desc: 'performed, then faded — make a fresh variant' },
  { emoji: REPLACE_ACTION_META.kill.emoji,    label: REPLACE_ACTION_META.kill.action,    cls: REPLACE_ACTION_META.kill.cls,    desc: "never performed — don't repeat the concept/hook" },
  { emoji: FRESHNESS_META.underperforming.emoji,  label: FRESHNESS_META.underperforming.label,  cls: FRESHNESS_META.underperforming.cls,  desc: 'tested but middling — watch it' },
  { emoji: FRESHNESS_META.still_performing.emoji, label: FRESHNESS_META.still_performing.label, cls: FRESHNESS_META.still_performing.cls, desc: 'good stage metrics for the spend' },
  { emoji: FRESHNESS_META.under_delivered.emoji,  label: FRESHNESS_META.under_delivered.label,  cls: FRESHNESS_META.under_delivered.cls,  desc: 'not enough spend/signal yet to judge' },
]

// ─── Billing period helpers ───────────────────────────────────────────────────

function getBillingPeriod(billingDay: number, now = new Date()) {
  const today = now.getDate()
  let pYear = now.getFullYear(), pMonth = now.getMonth()
  if (today < billingDay) { pMonth--; if (pMonth < 0) { pMonth = 11; pYear-- } }
  return {
    currentStart: new Date(pYear, pMonth, billingDay).toISOString().split('T')[0],
    nextStart:    new Date(pYear, pMonth + 1, billingDay).toISOString().split('T')[0],
  }
}

function formatBillingPeriod(periodStart: string, billingDay: number): string {
  if (billingDay === 1)
    return new Date(periodStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const start   = new Date(periodStart + 'T12:00:00')
  const endDate = new Date(start.getFullYear(), start.getMonth() + 1, billingDay - 1)
  return start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' – ' + endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Data fetching ────────────────────────────────────────────────────────────

interface LeaderboardEntry { name: string; count: number }

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const supabase = createServerClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
  const { data: assets } = await supabase
    .from('assets').select('posted_by')
    .gte('date_added', monthStart).lt('date_added', monthEnd)
    .not('posted_by', 'is', null)
  const counts: Record<string, number> = {}
  for (const a of (assets ?? [])) if (a.posted_by) counts[a.posted_by] = (counts[a.posted_by] ?? 0) + 1
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

async function getClientSummaries(): Promise<ClientSummary[]> {
  const supabase = createServerClient()
  const { data: clients } = await supabase.from('clients').select('*').order('name')
  if (!clients?.length) return []

  const clientPeriods = new Map<string, { currentStart: string; nextStart: string; billingDay: number }>()
  const allPeriodStarts = new Set<string>()
  for (const client of clients) {
    const billingDay = client.billing_day ?? 1
    const { currentStart, nextStart } = getBillingPeriod(billingDay)
    clientPeriods.set(client.id, { currentStart, nextStart, billingDay })
    allPeriodStarts.add(currentStart); allPeriodStarts.add(nextStart)
  }

  const [{ data: assets }, { data: deliveries }] = await Promise.all([
    supabase.from('assets').select('client_id, date_added, date_live, status, content_type, freshness_state, freshness_reason, asset_name, spark_item_id')
      .in('client_id', clients.map(c => c.id)),
    supabase.from('monthly_deliveries').select('*')
      .in('client_id', clients.map(c => c.id))
      .in('month', Array.from(allPeriodStarts)).order('month'),
  ])

  const assetsByClient: Record<string, Pick<Asset, 'client_id' | 'date_added' | 'date_live' | 'status' | 'content_type' | 'freshness_state' | 'freshness_reason' | 'asset_name' | 'spark_item_id'>[]> = {}
  for (const a of (assets ?? [])) {
    if (!assetsByClient[a.client_id]) assetsByClient[a.client_id] = []
    assetsByClient[a.client_id].push(a)
  }

  const deliveriesByClient: Record<string, MonthlyDelivery[]> = {}
  for (const d of (deliveries ?? [])) {
    if (!deliveriesByClient[d.client_id]) deliveriesByClient[d.client_id] = []
    deliveriesByClient[d.client_id].push(d)
  }

  return clients.map(client => {
    const allAssets = assetsByClient[client.id] ?? []
    // Spark Ads and EXT-titled assets are brand/external content — exclude from team content counts.
    const isBrandContent = (a: typeof allAssets[0]) =>
      !!a.spark_item_id || (a.asset_name ?? '').toUpperCase().includes('EXT')
    const clientAssets = allAssets.filter(a => !isBrandContent(a))
    const { currentStart, nextStart, billingDay } = clientPeriods.get(client.id)!
    const freshness: FreshnessCounts = { still_performing: 0, underperforming: 0, needs_replacing: 0, under_delivered: 0 }
    const contentTypeCounts: Record<string, number> = {}
    let pendingReview = 0, readyToUpload = 0, needsRefresh = 0
    // needs_replacing splits by reason into its two plays (📉 Replace vs 💀 Kill).
    let faded = 0, kill = 0

    for (const asset of clientAssets) {
      if (asset.status === 'Pending Review')          pendingReview++
      if (asset.status === 'Ready to Upload')         readyToUpload++
      if (asset.status === 'Needs Refresh / Missing') needsRefresh++
      if (asset.status === 'Pulled' || asset.status === 'Removed by Request') continue
      // Health chips reflect the analyzer's performance verdict (live, scored assets only).
      const state = asset.freshness_state as FreshnessState | null
      if (state && state in freshness) freshness[state]++
      if (state === 'needs_replacing') { if (asset.freshness_reason === 'faded') faded++; else kill++ }
      if (asset.content_type) contentTypeCounts[asset.content_type] = (contentTypeCounts[asset.content_type] ?? 0) + 1
    }

    return { client, totalAssets: clientAssets.length, freshness, faded, kill, contentTypeCounts, deliveries: deliveriesByClient[client.id] ?? [], currentStart, nextStart, billingDay, pendingReview, readyToUpload, needsRefresh, needsReplacing: freshness.needs_replacing }
  })
}

export const revalidate = 0

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionOpener({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-px bg-[#d4865e]" />
      <span className="text-xs tracking-[0.18em] text-[#d4865e] uppercase font-medium">{label}</span>
    </div>
  )
}

// Action row inside Today's Work
function ActionGroup({
  label, total, items, color,
}: {
  label: string
  total: number
  items: { client: Client; count: number; statusParam: string }[]
  color: { dot: string; pill: string; pillText: string; pillHover: string }
}) {
  if (items.length === 0) return null
  return (
    <div className="px-5 py-4 border-b border-white/10 last:border-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-6 h-px ${color.dot}`} />
          <span className="text-[10px] tracking-[0.16em] text-[#A8A09A] uppercase font-medium">{label}</span>
        </div>
        <span className="text-xs font-semibold text-[#f0d7c0]">{total}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(({ client, count, statusParam }) => (
          <Link
            key={client.id}
            href={`/${client.slug}?status=${encodeURIComponent(statusParam)}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1 ${color.pill} border ${color.pillText} rounded-full text-xs font-medium ${color.pillHover} transition-colors`}
          >
            {client.name}
            <span className="opacity-60 font-normal">{count}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [summaries, leaderboard] = await Promise.all([getClientSummaries(), getLeaderboard()])
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Build Today's Work groups
  const uploadItems  = summaries.filter(s => s.readyToUpload > 0)
    .map(s => ({ client: s.client, count: s.readyToUpload,  statusParam: 'Ready to Upload'         }))
  const pendingItems = summaries.filter(s => s.pendingReview > 0)
    .map(s => ({ client: s.client, count: s.pendingReview,  statusParam: 'Pending Review'           }))
  const refreshItems = summaries.filter(s => s.needsRefresh > 0 || s.needsReplacing > 0)
    .map(s => ({ client: s.client, count: s.needsRefresh + s.needsReplacing, statusParam: 'Needs Refresh / Missing' }))

  const totalUpload  = uploadItems.reduce((n, i) => n + i.count, 0)
  const totalPending = pendingItems.reduce((n, i) => n + i.count, 0)
  const totalRefresh = refreshItems.reduce((n, i) => n + i.count, 0)

  const hasWork = totalUpload + totalPending + totalRefresh > 0

  return (
    <div>

      {/* ── Page header ── */}
      <div className="mb-7">
        <p className="text-xs tracking-[0.18em] text-[#d4865e] uppercase font-medium mb-1">{today}</p>
        <h1 className="font-serif text-4xl font-light text-[#3b2b52] tracking-wide">Today&apos;s Work</h1>
      </div>

      {/* ── Today's Work command center ── */}
      {hasWork ? (
        <div className="mb-8 bg-[#3b2b52] rounded-xl overflow-hidden">
          <ActionGroup
            label="Upload Queue"
            total={totalUpload}
            items={uploadItems}
            color={{
              dot: 'bg-blue-400',
              pill: 'bg-blue-500/20',
              pillText: 'text-blue-300 border-blue-400/30',
              pillHover: 'hover:bg-blue-500/30',
            }}
          />
          <ActionGroup
            label="Pending Review"
            total={totalPending}
            items={pendingItems}
            color={{
              dot: 'bg-violet-400',
              pill: 'bg-violet-500/20',
              pillText: 'text-violet-300 border-violet-400/30',
              pillHover: 'hover:bg-violet-500/30',
            }}
          />
          <ActionGroup
            label="Needs Fresh Creative"
            total={totalRefresh}
            items={refreshItems}
            color={{
              dot: 'bg-amber-400',
              pill: 'bg-amber-500/20',
              pillText: 'text-amber-300 border-amber-400/30',
              pillHover: 'hover:bg-amber-500/30',
            }}
          />
        </div>
      ) : (
        <div className="mb-8 bg-[#3b2b52] rounded-xl px-5 py-6 flex items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          <p className="text-sm text-[#f0d7c0] font-medium">All clear — no pending actions across any client.</p>
        </div>
      )}

      {/* ── Client overview ── */}
      <div className="mb-2">
        <SectionOpener label={`${summaries.length} Clients`} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaries.map(({ client, totalAssets, freshness, faded, kill, contentTypeCounts, deliveries, currentStart, nextStart, billingDay }) => {
          const currentDelivery = deliveries.find(d => d.month === currentStart)
          const nextDelivery    = deliveries.find(d => d.month === nextStart)
          const isMaxed = currentDelivery ? currentDelivery.delivered >= currentDelivery.quota : false
          const activeTiers = verdictChips({ ...freshness, faded, kill })
          const sortedTypes = Object.entries(contentTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)

          return (
            <Link
              key={client.id}
              href={`/${client.slug}`}
              className="block bg-white rounded-xl border border-stone-200 hover:border-stone-300 hover:shadow-md transition-all overflow-hidden"
              style={{ borderLeftWidth: '4px', borderLeftColor: client.color_hex }}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-stone-100 flex items-start justify-between">
                <div>
                  <h2 className="font-serif text-lg font-medium text-[#3b2b52] tracking-wide leading-tight">
                    {client.name}
                  </h2>
                  <p className="text-[10px] tracking-[0.1em] text-stone-400 uppercase mt-0.5">
                    {totalAssets} asset{totalAssets !== 1 ? 's' : ''}
                  </p>
                </div>
                {/* Needs-replacing alert dot (performance verdict) */}
                {freshness.needs_replacing > 0 && (
                  <span className="w-2 h-2 rounded-full bg-red-400 mt-1 flex-shrink-0" />
                )}
              </div>

              {/* Delivery progress (hidden for clients we don't track social deliveries for) */}
              {client.tracks_deliveries !== false && currentDelivery && (
                <div className={`px-4 pt-3 pb-2.5 border-b border-stone-100 ${isMaxed ? 'bg-emerald-50/50' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.08em]">
                      {formatBillingPeriod(currentDelivery.month, billingDay)}
                    </span>
                    <span className={`text-sm font-semibold ${isMaxed ? 'text-emerald-700' : 'text-stone-700'}`}>
                      {currentDelivery.delivered}/{currentDelivery.quota}{isMaxed && ' ✓'}
                    </span>
                  </div>
                  <div className="w-full bg-stone-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${isMaxed ? 'bg-emerald-500' : 'bg-[#d4865e]'}`}
                      style={{ width: `${Math.min(100, (currentDelivery.delivered / currentDelivery.quota) * 100)}%` }}
                    />
                  </div>
                  {isMaxed && nextDelivery && (
                    <p className="text-[10px] text-emerald-600 mt-1">
                      Rolling → {formatBillingPeriod(nextDelivery.month, billingDay)}: {nextDelivery.delivered}/{nextDelivery.quota}
                    </p>
                  )}
                </div>
              )}

              {/* Live performance health (analyzer verdict) */}
              {activeTiers.length > 0 && (
                <div className="px-4 pt-3 pb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {activeTiers.map(tier => (
                      <span key={tier.key} className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${tier.cls}`}>
                        {tier.emoji} {tier.count} {tier.label}
                      </span>
                    ))}
                  </div>
                  {sortedTypes.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pt-2 border-t border-stone-100">
                      {sortedTypes.map(([type, count]) => (
                        <span key={type} className="text-xs text-stone-400">
                          {type} <span className="font-semibold text-stone-600">{count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Link>
          )
        })}
      </div>

      {/* ── Freshness legend ── */}
      <div className="mt-10 border-t border-stone-300 pt-6">
        <SectionOpener label="Performance Key" />
        <div className="flex flex-wrap gap-2">
          {LEGEND.map(tier => (
            <div key={tier.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border ${tier.cls}`}>
              {tier.emoji} {tier.label} — {tier.desc}
            </div>
          ))}
        </div>
      </div>

      {/* ── Leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="bg-[#3b2b52] px-5 py-4">
            <SectionOpener label={`${monthLabel} Leaderboard`} />
            <p className="text-[10px] text-[#A8A09A] uppercase tracking-[0.12em]">Assets Delivered This Month</p>
          </div>
          <div className="divide-y divide-stone-100">
            {leaderboard.map((entry, i) => {
              const pct      = Math.round((entry.count / leaderboard[0].count) * 100)
              const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
              const barColor = i === 0 ? 'bg-[#d4865e]' : i === 1 ? 'bg-stone-400' : i === 2 ? 'bg-orange-300' : 'bg-stone-300'
              return (
                <div key={entry.name} className={`flex items-center gap-4 px-5 py-3 ${i === 0 ? 'bg-amber-50/50' : ''}`}>
                  <span className="text-lg w-7 text-center flex-shrink-0">
                    {medal ?? <span className="text-xs text-stone-400 font-medium">{i + 1}</span>}
                  </span>
                  <span className="font-medium text-stone-800 w-40 flex-shrink-0 truncate text-sm">{entry.name}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-base font-bold w-8 text-right flex-shrink-0 ${i === 0 ? 'text-[#d4865e]' : 'text-stone-600'}`}>
                    {entry.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
