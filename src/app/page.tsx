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
}

const FRESHNESS_TIERS = [
  { key: 'fresh',       maxDays: 7,        label: 'Fresh',        dot: 'bg-green-400',  text: 'text-green-700'  },
  { key: 'monitor',     maxDays: 14,       label: 'Monitor',      dot: 'bg-yellow-400', text: 'text-yellow-700' },
  { key: 'refreshSoon', maxDays: 21,       label: 'Refresh Soon', dot: 'bg-orange-400', text: 'text-orange-700' },
  { key: 'stale',       maxDays: 30,       label: 'Stale',        dot: 'bg-red-400',    text: 'text-red-700'    },
  { key: 'expired',     maxDays: Infinity, label: 'Expired',      dot: 'bg-gray-400',   text: 'text-gray-500'   },
] as const

function getFreshnessTier(asset: { date_added: string | null; date_live?: string | null; status?: string }): keyof FreshnessCounts {
  const status = asset.status ?? ''

  // Pre-launch: fatigue clock hasn't started yet — always Fresh
  if (status === 'Ready to Upload') return 'fresh'

  // Definitionally expired
  if (status === 'Expired') return 'expired'

  // Live / Running and Needs Refresh / Missing: count from date_live if set, else date_added
  const dateStr = asset.date_live ?? asset.date_added
  if (!dateStr) return 'expired'

  const days = Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 7)  return 'fresh'
  if (days <= 14) return 'monitor'
  if (days <= 21) return 'refreshSoon'
  if (days <= 30) return 'stale'
  return 'expired'
}

/** Returns current and next period start dates for a given billing day. */
function getBillingPeriod(billingDay: number, now = new Date()) {
  const today = now.getDate()
  let pYear  = now.getFullYear()
  let pMonth = now.getMonth() // 0-indexed

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

/** Format a period start date for display. Calendar-month clients get "Apr 2026";
 *  custom-billing clients get "Apr 19 – May 18". */
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

interface LeaderboardEntry {
  name: string
  count: number
}

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
    if (asset.posted_by) {
      counts[asset.posted_by] = (counts[asset.posted_by] ?? 0) + 1
    }
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

async function getClientSummaries(): Promise<ClientSummary[]> {
  const supabase = createServerClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  if (!clients?.length) return []

  // Compute per-client billing periods; collect all relevant period starts for the DB query
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
    supabase
      .from('assets')
      .select('client_id, date_added, date_live, status, content_type')
      .in('client_id', clients.map(c => c.id)),
    supabase
      .from('monthly_deliveries')
      .select('*')
      .in('client_id', clients.map(c => c.id))
      .in('month', Array.from(allPeriodStarts))
      .order('month'),
  ])

  const assetsByClient: Record<string, Pick<Asset, 'client_id' | 'date_added' | 'content_type'>[]> = {}
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

    for (const asset of clientAssets) {
      const tier = getFreshnessTier(asset)
      freshness[tier]++

      if (asset.content_type) {
        contentTypeCounts[asset.content_type] = (contentTypeCounts[asset.content_type] ?? 0) + 1
      }
    }

    return {
      client,
      totalAssets: clientAssets.length,
      freshness,
      contentTypeCounts,
      deliveries: deliveriesByClient[client.id] ?? [],
      currentStart,
      nextStart,
      billingDay,
    }
  })
}

export const revalidate = 60

export default async function DashboardPage() {
  const [summaries, leaderboard] = await Promise.all([getClientSummaries(), getLeaderboard()])
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Content Dashboard</h1>
        <p className="text-gray-500 mt-1">{summaries.length} active clients</p>
      </div>

      {/* Client cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {summaries.map(({ client, totalAssets, freshness, contentTypeCounts, deliveries, currentStart, nextStart, billingDay }) => {
          const currentDelivery = deliveries.find(d => d.month === currentStart)
          const nextDelivery    = deliveries.find(d => d.month === nextStart)
          const isMaxed = currentDelivery ? currentDelivery.delivered >= currentDelivery.quota : false

          // Only show freshness tiers that have assets
          const activeTiers = FRESHNESS_TIERS.filter(t => freshness[t.key] > 0)

          // Sort content types by count descending
          const sortedTypes = Object.entries(contentTypeCounts)
            .sort((a, b) => b[1] - a[1])

          return (
            <div
              key={client.id}
              className="relative bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all"
            >
              <Link href={`/${client.slug}`} className="block">
              {/* Card header */}
              <div
                className="rounded-t-xl px-4 py-3"
                style={{ backgroundColor: client.color_hex + '18', borderBottom: `2px solid ${client.color_hex}` }}
              >
                <span className="font-semibold text-gray-900">{client.name}</span>
              </div>

              {/* Monthly delivery counter */}
              {currentDelivery ? (
                <div className={`px-4 pt-3 pb-2 border-b border-gray-100 ${isMaxed ? 'bg-green-50' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {formatBillingPeriod(currentDelivery.month, billingDay)} Deliveries
                    </span>
                    <span className={`text-sm font-bold ${isMaxed ? 'text-green-700' : 'text-gray-700'}`}>
                      {currentDelivery.delivered}/{currentDelivery.quota}
                      {isMaxed && ' ✓'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isMaxed ? 'bg-green-500' : 'bg-blue-400'}`}
                      style={{ width: `${Math.min(100, (currentDelivery.delivered / currentDelivery.quota) * 100)}%` }}
                    />
                  </div>
                  {isMaxed && nextDelivery && (
                    <p className="text-xs text-green-600 mt-1">
                      Rolling → {formatBillingPeriod(nextDelivery.month, billingDay)}: {nextDelivery.delivered}/{nextDelivery.quota}
                    </p>
                  )}
                  {isMaxed && !nextDelivery && (
                    <p className="text-xs text-green-600 mt-1">
                      Quota met — next pieces roll to {formatBillingPeriod(nextStart, billingDay)}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Library health */}
              <div className="px-4 pt-3 pb-2 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Library</span>
                  <span className="text-xs text-gray-400">{totalAssets} assets</span>
                </div>
                {activeTiers.length > 0 ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {activeTiers.map(tier => (
                      <span key={tier.key} className={`flex items-center gap-1 text-xs font-medium ${tier.text}`}>
                        <span className={`inline-block w-2 h-2 rounded-full ${tier.dot}`} />
                        {freshness[tier.key]} {tier.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">No assets yet</span>
                )}
              </div>

              {/* Content type coverage */}
              {sortedTypes.length > 0 && (
                <div className="px-4 pt-3 pb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Coverage</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {sortedTypes.map(([type, count]) => (
                      <span key={type} className="text-xs text-gray-600">
                        {type} <span className="font-semibold text-gray-800">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Spacer so Drive link doesn't overlap content */}
              {client.drive_url && <div className="pb-8" />}
              </Link>

              {/* Drive link — outside <Link> to avoid nested <a> tags */}
              {client.drive_url && (
                <div className="absolute bottom-3 right-4">
                  <a
                    href={client.drive_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Drive ↗
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Freshness legend */}
      <div className="mt-10 border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Freshness Key</h2>
        <div className="flex flex-wrap gap-3">
          {FRESHNESS_TIERS.map(tier => (
            <div key={tier.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 ${tier.text}`}>
              <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
              {tier.label} — {
                tier.key === 'fresh'       ? '0–7 days' :
                tier.key === 'monitor'     ? '8–14 days' :
                tier.key === 'refreshSoon' ? '15–21 days' :
                tier.key === 'stale'       ? '22–30 days' :
                '31+ days'
              }
            </div>
          ))}
        </div>
      </div>

      {/* Creator Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-gray-900 to-gray-700 px-5 py-3 flex items-center justify-between">
            <span className="text-white font-bold text-base">🏆 {monthLabel} Leaderboard</span>
            <span className="text-gray-400 text-xs uppercase tracking-wider">Assets This Month</span>
          </div>
          <div className="divide-y divide-gray-100">
            {leaderboard.map((entry, i) => {
              const pct      = Math.round((entry.count / leaderboard[0].count) * 100)
              const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
              const barColor = i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-blue-300'
              return (
                <div key={entry.name} className={`flex items-center gap-4 px-5 py-3 ${i === 0 ? 'bg-yellow-50' : ''}`}>
                  <span className="text-xl w-8 text-center flex-shrink-0">
                    {medal ?? <span className="text-sm text-gray-400 font-medium">{i + 1}</span>}
                  </span>
                  <span className="font-medium text-gray-900 w-44 flex-shrink-0 truncate">{entry.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-lg font-bold w-8 text-right flex-shrink-0 ${i === 0 ? 'text-yellow-600' : 'text-gray-700'}`}>
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
