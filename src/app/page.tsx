import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import type { Client, Asset } from '@/lib/supabase'

interface MonthlyDelivery {
  client_id: string
  month: string
  delivered: number
  quota: number
}

interface FreshnessCounts {
  fresh: number
  monitor: number
  refreshSoon: number
  stale: number
  expired: number
}

interface ClientSummary {
  client: Client
  totalAssets: number
  freshness: FreshnessCounts
  contentTypeCounts: Record<string, number>
  deliveries: MonthlyDelivery[]
  currentStart: string
  nextStart: string
  billingDay: number
  pendingReview: number
  readyToUpload: number
  needsRefresh: number
}

const FRESHNESS_TIERS = [
  { key: 'fresh',       maxDays: 7,        label: 'Fresh',        dot: 'bg-emerald-400', text: 'text-emerald-700'  },
  { key: 'monitor',     maxDays: 14,       label: 'Monitor',      dot: 'bg-yellow-400',  text: 'text-yellow-700'  },
  { key: 'refreshSoon', maxDays: 21,       label: 'Refresh Soon', dot: 'bg-orange-400',  text: 'text-orange-700'  },
  { key: 'stale',       maxDays: 30,       label: 'Stale',        dot: 'bg-red-400',     text: 'text-red-700'     },
  { key: 'expired',     maxDays: Infinity, label: 'Expired',      dot: 'bg-stone-400',   text: 'text-stone-500'   },
] as const

function getFreshnessTier(asset: { date_added: string | null; date_live?: string | null; status?: string }): keyof FreshnessCounts {
  const status = asset.status ?? ''
  if (status === 'Ready to Upload') return 'fresh'
  if (status === 'Expired') return 'expired'
  const dateStr = asset.date_live ?? asset.date_added
  if (!dateStr) return 'expired'
  const days = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 7)  return 'fresh'
  if (days <= 14) return 'monitor'
  if (days <= 21) return 'refreshSoon'
  if (days <= 30) return 'stale'
  return 'expired'
}

function getBillingPeriod(billingDay: number, now = new Date()) {
  const today = now.getDate()
  let pYear  = now.getFullYear()
  let pMonth = now.getMonth()
  if (today < billingDay) {
    pMonth -= 1
    if (pMonth < 0) { pMonth = 11; pYear-- }
  }
  const curDate = new Date(pYear, pMonth, billingDay)
  const nxtDate = new Date(pYear, pMonth + 1, billingDay)
  return {
    currentStart: curDate.toISOString().split('T')[0],
    nextStart:    nxtDate.toISOString().split('T')[0],
  }
}

function formatBillingPeriod(periodStart: string, billingDay: number): string {
  if (billingDay === 1) {
    return new Date(periodStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }
  const start   = new Date(periodStart + 'T12:00:00')
  const endDate = new Date(start.getFullYear(), start.getMonth() + 1, billingDay - 1)
  return (
    start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' – ' +
    endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  )
}

interface LeaderboardEntry { name: string; count: number }

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const supabase = createServerClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
  const { data: assets } = await supabase
    .from('assets')
    .select('posted_by')
    .gte('date_added', monthStart)
    .lt('date_added', monthEnd)
    .not('posted_by', 'is', null)
  const counts: Record<string, number> = {}
  for (const asset of (assets ?? [])) {
    if (asset.posted_by) counts[asset.posted_by] = (counts[asset.posted_by] ?? 0) + 1
  }
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
    allPeriodStarts.add(currentStart)
    allPeriodStarts.add(nextStart)
  }

  const [{ data: assets }, { data: deliveries }] = await Promise.all([
    supabase.from('assets').select('client_id, date_added, date_live, status, content_type').in('client_id', clients.map(c => c.id)),
    supabase.from('monthly_deliveries').select('*').in('client_id', clients.map(c => c.id)).in('month', Array.from(allPeriodStarts)).order('month'),
  ])

  const assetsByClient: Record<string, Pick<Asset, 'client_id' | 'date_added' | 'date_live' | 'status' | 'content_type'>[]> = {}
  for (const asset of (assets ?? [])) {
    if (!assetsByClient[asset.client_id]) assetsByClient[asset.client_id] = []
    assetsByClient[asset.client_id].push(asset)
  }

  const deliveriesByClient: Record<string, MonthlyDelivery[]> = {}
  for (const d of (deliveries ?? [])) {
    if (!deliveriesByClient[d.client_id]) deliveriesByClient[d.client_id] = []
    deliveriesByClient[d.client_id].push(d)
  }

  return clients.map(client => {
    const clientAssets = assetsByClient[client.id] ?? []
    const { currentStart, nextStart, billingDay } = clientPeriods.get(client.id)!
    const freshness: FreshnessCounts = { fresh: 0, monitor: 0, refreshSoon: 0, stale: 0, expired: 0 }
    const contentTypeCounts: Record<string, number> = {}
    let pendingReview = 0, readyToUpload = 0, needsRefresh = 0
    for (const asset of clientAssets) {
      if (asset.status === 'Pending Review')          pendingReview++
      if (asset.status === 'Ready to Upload')         readyToUpload++
      if (asset.status === 'Needs Refresh / Missing') needsRefresh++
      if (asset.status === 'Pulled' || asset.status === 'Removed by Request') continue
      freshness[getFreshnessTier(asset)]++
      if (asset.content_type) contentTypeCounts[asset.content_type] = (contentTypeCounts[asset.content_type] ?? 0) + 1
    }
    return { client, totalAssets: clientAssets.length, freshness, contentTypeCounts, deliveries: deliveriesByClient[client.id] ?? [], currentStart, nextStart, billingDay, pendingReview, readyToUpload, needsRefresh }
  })
}

export const revalidate = 0

// ── Section opener motif (thin gold rule + small-caps label) ─────────────────
function SectionOpener({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-px bg-[#C4A263]" />
      <span className="text-xs tracking-[0.18em] text-[#C4A263] uppercase font-medium">{label}</span>
    </div>
  )
}

export default async function DashboardPage() {
  const [summaries, leaderboard] = await Promise.all([getClientSummaries(), getLeaderboard()])
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const pendingClients      = summaries.filter(s => s.pendingReview > 0)
  const readyClients        = summaries.filter(s => s.readyToUpload > 0)
  const needsRefreshClients = summaries.filter(s => s.needsRefresh > 0 || s.freshness.stale > 0 || s.freshness.expired > 0)
  const hasAttentionItems   = pendingClients.length > 0 || readyClients.length > 0 || needsRefreshClients.length > 0

  return (
    <div>

      {/* ── Page header ── */}
      <div className="mb-8">
        <p className="text-xs tracking-[0.18em] text-[#C4A263] uppercase font-medium mb-1">SyncPoint Creative</p>
        <h1 className="font-serif text-4xl font-light text-[#2B3428] tracking-wide">Content Dashboard</h1>
        <p className="text-sm text-stone-500 mt-1">{summaries.length} active client{summaries.length !== 1 ? 's' : ''}</p>
      </div>

      {/* ── Needs Attention panel ── */}
      {hasAttentionItems && (
        <div className="mb-8 bg-[#2B3428] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/10">
            <SectionOpener label="Needs Attention" />
          </div>
          <div className="divide-y divide-white/10">

            {pendingClients.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold text-[#A8A09A] uppercase tracking-[0.14em] mb-2.5">
                  Pending Review
                </p>
                <div className="flex flex-wrap gap-2">
                  {pendingClients.map(({ client, pendingReview }) => (
                    <Link key={client.id} href={`/${client.slug}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-500/20 border border-violet-400/30 rounded-full text-xs font-medium text-violet-300 hover:bg-violet-500/30 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                      {client.name}
                      <span className="opacity-70">{pendingReview}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {readyClients.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold text-[#A8A09A] uppercase tracking-[0.14em] mb-2.5">
                  Ready to Upload
                </p>
                <div className="flex flex-wrap gap-2">
                  {readyClients.map(({ client, readyToUpload }) => (
                    <Link key={client.id} href={`/${client.slug}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 border border-blue-400/30 rounded-full text-xs font-medium text-blue-300 hover:bg-blue-500/30 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      {client.name}
                      <span className="opacity-70">{readyToUpload}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {needsRefreshClients.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-semibold text-[#A8A09A] uppercase tracking-[0.14em] mb-2.5">
                  Aging / Needs Refresh
                </p>
                <div className="flex flex-wrap gap-2">
                  {needsRefreshClients.map(({ client, needsRefresh, freshness }) => {
                    const count = needsRefresh + freshness.stale + freshness.expired
                    return (
                      <Link key={client.id} href={`/${client.slug}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 border border-amber-400/30 rounded-full text-xs font-medium text-amber-300 hover:bg-amber-500/30 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        {client.name}
                        <span className="opacity-70">{count}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Client cards ── */}
      <div className="mb-2">
        <SectionOpener label="Clients" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {summaries.map(({ client, totalAssets, freshness, contentTypeCounts, deliveries, currentStart, nextStart, billingDay }) => {
          const currentDelivery = deliveries.find(d => d.month === currentStart)
          const nextDelivery    = deliveries.find(d => d.month === nextStart)
          const isMaxed = currentDelivery ? currentDelivery.delivered >= currentDelivery.quota : false
          const activeTiers = FRESHNESS_TIERS.filter(t => freshness[t.key] > 0)
          const sortedTypes = Object.entries(contentTypeCounts).sort((a, b) => b[1] - a[1])

          return (
            <div
              key={client.id}
              className="relative bg-white rounded-xl border border-stone-200 hover:border-stone-300 hover:shadow-md transition-all overflow-hidden"
              style={{ borderLeftWidth: '4px', borderLeftColor: client.color_hex }}
            >
              <Link href={`/${client.slug}`} className="block">

                {/* Card header */}
                <div className="px-4 pt-4 pb-3 border-b border-stone-100">
                  <h2 className="font-serif text-lg font-medium text-[#2B3428] tracking-wide leading-tight">
                    {client.name}
                  </h2>
                  <p className="text-[10px] tracking-[0.12em] text-stone-400 uppercase mt-0.5">
                    {totalAssets} asset{totalAssets !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Monthly delivery */}
                {currentDelivery && (
                  <div className={`px-4 pt-3 pb-2.5 border-b border-stone-100 ${isMaxed ? 'bg-emerald-50/50' : ''}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.1em]">
                        {formatBillingPeriod(currentDelivery.month, billingDay)}
                      </span>
                      <span className={`text-sm font-semibold ${isMaxed ? 'text-emerald-700' : 'text-stone-700'}`}>
                        {currentDelivery.delivered}/{currentDelivery.quota}{isMaxed && ' ✓'}
                      </span>
                    </div>
                    <div className="w-full bg-stone-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isMaxed ? 'bg-emerald-500' : 'bg-[#C4A263]'}`}
                        style={{ width: `${Math.min(100, (currentDelivery.delivered / currentDelivery.quota) * 100)}%` }}
                      />
                    </div>
                    {isMaxed && nextDelivery && (
                      <p className="text-[10px] text-emerald-600 mt-1">
                        Rolling → {formatBillingPeriod(nextDelivery.month, billingDay)}: {nextDelivery.delivered}/{nextDelivery.quota}
                      </p>
                    )}
                    {isMaxed && !nextDelivery && (
                      <p className="text-[10px] text-emerald-600 mt-1">
                        Quota met — rolls to {formatBillingPeriod(nextStart, billingDay)}
                      </p>
                    )}
                  </div>
                )}

                {/* Library freshness */}
                {activeTiers.length > 0 && (
                  <div className="px-4 pt-3 pb-2.5 border-b border-stone-100">
                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.1em] mb-1.5">Library</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {activeTiers.map(tier => (
                        <span key={tier.key} className={`flex items-center gap-1 text-xs ${tier.text}`}>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${tier.dot}`} />
                          {freshness[tier.key]} {tier.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content coverage */}
                {sortedTypes.length > 0 && (
                  <div className="px-4 pt-3 pb-3">
                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.1em] mb-1.5">Coverage</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {sortedTypes.map(([type, count]) => (
                        <span key={type} className="text-xs text-stone-500">
                          {type} <span className="font-semibold text-stone-700">{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {client.drive_url && <div className="pb-7" />}
              </Link>

              {/* Drive link */}
              {client.drive_url && (
                <div className="absolute bottom-3 right-4">
                  <a href={client.drive_url} target="_blank" rel="noreferrer"
                    className="text-[10px] text-[#C4A263] hover:text-[#D4B373] tracking-wide transition-colors">
                    Drive ↗
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Freshness legend ── */}
      <div className="mt-10 border-t border-stone-300 pt-6">
        <SectionOpener label="Freshness Key" />
        <div className="flex flex-wrap gap-2">
          {FRESHNESS_TIERS.map(tier => (
            <div key={tier.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs bg-white border border-stone-200 ${tier.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tier.dot}`} />
              {tier.label} — {
                tier.key === 'fresh'       ? '0–7 days'   :
                tier.key === 'monitor'     ? '8–14 days'  :
                tier.key === 'refreshSoon' ? '15–21 days' :
                tier.key === 'stale'       ? '22–30 days' :
                '31+ days'
              }
            </div>
          ))}
        </div>
      </div>

      {/* ── Creator leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="bg-[#2B3428] px-5 py-4">
            <SectionOpener label={`${monthLabel} Leaderboard`} />
            <p className="text-[10px] text-[#A8A09A] uppercase tracking-[0.12em]">Assets Delivered This Month</p>
          </div>
          <div className="divide-y divide-stone-100">
            {leaderboard.map((entry, i) => {
              const pct      = Math.round((entry.count / leaderboard[0].count) * 100)
              const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
              const barColor = i === 0 ? 'bg-[#C4A263]' : i === 1 ? 'bg-stone-400' : i === 2 ? 'bg-orange-300' : 'bg-stone-300'
              return (
                <div key={entry.name} className={`flex items-center gap-4 px-5 py-3 ${i === 0 ? 'bg-amber-50/50' : ''}`}>
                  <span className="text-lg w-7 text-center flex-shrink-0">
                    {medal ?? <span className="text-xs text-stone-400 font-medium">{i + 1}</span>}
                  </span>
                  <span className="font-medium text-stone-800 w-44 flex-shrink-0 truncate text-sm">{entry.name}</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-base font-bold w-8 text-right flex-shrink-0 ${i === 0 ? 'text-[#C4A263]' : 'text-stone-600'}`}>
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
