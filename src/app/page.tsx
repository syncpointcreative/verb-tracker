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
}

const FRESHNESS_TIERS = [
  { key: 'fresh',       maxDays: 14,       label: 'Fresh',        dot: 'bg-green-400',  text: 'text-green-700'  },
  { key: 'monitor',     maxDays: 30,       label: 'Monitor',      dot: 'bg-yellow-400', text: 'text-yellow-700' },
  { key: 'refreshSoon', maxDays: 60,       label: 'Refresh Soon', dot: 'bg-orange-400', text: 'text-orange-700' },
  { key: 'stale',       maxDays: 90,       label: 'Stale',        dot: 'bg-red-400',    text: 'text-red-700'    },
  { key: 'expired',     maxDays: Infinity, label: 'Expired',      dot: 'bg-gray-400',   text: 'text-gray-500'   },
] as const

function getFreshnessTier(dateAdded: string | null): keyof FreshnessCounts {
  if (!dateAdded) return 'expired'
  const days = Math.floor((Date.now() - new Date(dateAdded).getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 14) return 'fresh'
  if (days <= 30) return 'monitor'
  if (days <= 60) return 'refreshSoon'
  if (days <= 90) return 'stale'
  return 'expired'
}

function getCurrentAndNextMonth() {
  const now = new Date()
  const current = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
  return { current, next }
}

function formatMonth(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

async function getClientSummaries(): Promise<ClientSummary[]> {
  const supabase = createServerClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  if (!clients?.length) return []

  const { current, next } = getCurrentAndNextMonth()

  const [{ data: assets }, { data: deliveries }] = await Promise.all([
    supabase
      .from('assets')
      .select('client_id, date_added, content_type')
      .in('client_id', clients.map(c => c.id)),
    supabase
      .from('monthly_deliveries')
      .select('*')
      .in('client_id', clients.map(c => c.id))
      .in('month', [current, next])
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

    const freshness: FreshnessCounts = { fresh: 0, monitor: 0, refreshSoon: 0, stale: 0, expired: 0 }
    const contentTypeCounts: Record<string, number> = {}

    for (const asset of clientAssets) {
      const tier = getFreshnessTier(asset.date_added)
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
    }
  })
}

export const revalidate = 60

export default async function DashboardPage() {
  const summaries = await getClientSummaries()
  const { current } = getCurrentAndNextMonth()

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Content Dashboard</h1>
        <p className="text-gray-500 mt-1">{summaries.length} active clients</p>
      </div>

      {/* Client cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {summaries.map(({ client, totalAssets, freshness, contentTypeCounts, deliveries }) => {
          const currentDelivery = deliveries.find(d => d.month.startsWith(current.slice(0, 7)))
          const nextDelivery    = deliveries.find(d => !d.month.startsWith(current.slice(0, 7)))
          const isMaxed = currentDelivery ? currentDelivery.delivered >= currentDelivery.quota : false

          // Only show freshness tiers that have assets
          const activeTiers = FRESHNESS_TIERS.filter(t => freshness[t.key] > 0)

          // Sort content types by count descending
          const sortedTypes = Object.entries(contentTypeCounts)
            .sort((a, b) => b[1] - a[1])

          return (
            <Link
              key={client.id}
              href={`/${client.slug}`}
              className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all"
            >
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
                      {formatMonth(currentDelivery.month)} Deliveries
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
                      Rolling → {formatMonth(nextDelivery.month)}: {nextDelivery.delivered}/{nextDelivery.quota}
                    </p>
                  )}
                  {isMaxed && !nextDelivery && (
                    <p className="text-xs text-green-600 mt-1">
                      Quota met — next pieces roll to{' '}
                      {new Date(new Date(currentDelivery.month).getFullYear(), new Date(currentDelivery.month).getMonth() + 1, 1)
                        .toLocaleDateString('en-US', { month: 'short' })}
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

              {/* Footer */}
              {client.drive_url && (
                <div className="px-4 pb-3 border-t border-gray-100 pt-2 flex justify-end">
                  <a
                    href={client.drive_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Drive ↗
                  </a>
                </div>
              )}
            </Link>
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
                tier.key === 'fresh'       ? '0–14 days' :
                tier.key === 'monitor'     ? '15–30 days' :
                tier.key === 'refreshSoon' ? '31–60 days' :
                tier.key === 'stale'       ? '61–90 days' :
                '90+ days'
              }
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
