import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { STAGE_CONFIG, STAGES, STATUS_CONFIG, TARGET_ASSETS_PER_STAGE, EXPIRY_DAYS } from '@/lib/constants'
import type { Client, Asset, Stage } from '@/lib/supabase'

interface MonthlyDelivery {
  client_id: string
  month: string
  delivered: number
  quota: number
}

interface ClientSummary {
  client: Client
  stageCounts: Record<Stage, { active: number; total: number }>
  onTarget: boolean
  totalActive: number
  totalAssets: number
  deliveries: MonthlyDelivery[]
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

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)

  const { current, next } = getCurrentAndNextMonth()

  const [{ data: assets }, { data: deliveries }] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .in('client_id', clients.map(c => c.id))
      .neq('status', 'Needs Refresh / Missing'),
    supabase
      .from('monthly_deliveries')
      .select('*')
      .in('client_id', clients.map(c => c.id))
      .in('month', [current, next])
      .order('month'),
  ])

  const assetsByClient: Record<string, Asset[]> = {}
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

    const stageCounts: Record<Stage, { active: number; total: number }> = {
      Awareness:     { active: 0, total: 0 },
      Consideration: { active: 0, total: 0 },
      Conversion:    { active: 0, total: 0 },
    }

    for (const asset of clientAssets) {
      const stage = asset.stage as Stage
      stageCounts[stage].total++
      const isDateExpired = asset.date_added
        ? new Date(asset.date_added) < cutoff
        : false
      if (!isDateExpired && asset.status !== 'Expired') {
        stageCounts[stage].active++
      }
    }

    const onTarget = STAGES.every(s => stageCounts[s].active >= TARGET_ASSETS_PER_STAGE)
    const totalActive = STAGES.reduce((sum, s) => sum + stageCounts[s].active, 0)
    const totalAssets = clientAssets.length

    return {
      client,
      stageCounts,
      onTarget,
      totalActive,
      totalAssets,
      deliveries: deliveriesByClient[client.id] ?? [],
    }
  })
}

export const revalidate = 60

export default async function DashboardPage() {
  const summaries = await getClientSummaries()
  const { current } = getCurrentAndNextMonth()

  const onTargetCount = summaries.filter(s => s.onTarget).length
  const attentionCount = summaries.length - onTargetCount

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Content Dashboard</h1>
        <p className="text-gray-500 mt-1">
          {onTargetCount} on target · {attentionCount} need attention · {TARGET_ASSETS_PER_STAGE} active assets per stage required
        </p>
      </div>

      {/* Client cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {summaries.map(({ client, stageCounts, onTarget, totalActive, totalAssets, deliveries }) => {
          // Find current and next month delivery records
          const currentDelivery = deliveries.find(d => d.month.startsWith(current.slice(0, 7)))
          const nextDelivery    = deliveries.find(d => !d.month.startsWith(current.slice(0, 7)))
          const isMaxed = currentDelivery ? currentDelivery.delivered >= currentDelivery.quota : false

          return (
            <Link
              key={client.id}
              href={`/${client.slug}`}
              className="block bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all"
            >
              {/* Card header */}
              <div
                className="rounded-t-xl px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: client.color_hex + '18', borderBottom: `2px solid ${client.color_hex}` }}
              >
                <span className="font-semibold text-gray-900">{client.name}</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${onTarget ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {onTarget ? '✓ On Target' : '⚠ Attention Needed'}
                </span>
              </div>

              {/* Monthly delivery counter */}
              {currentDelivery && (
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
                    <p className="text-xs text-green-600 mt-1">Monthly quota met — next pieces roll to {new Date(new Date(currentDelivery.month).getFullYear(), new Date(currentDelivery.month).getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'short' })}</p>
                  )}
                </div>
              )}

              {/* Stage breakdown */}
              <div className="p-4 space-y-2">
                {STAGES.map(stage => {
                  const { active } = stageCounts[stage]
                  const cfg = STAGE_CONFIG[stage]
                  const met = active >= TARGET_ASSETS_PER_STAGE
                  return (
                    <div key={stage} className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${cfg.text}`}>{stage}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${met ? 'bg-green-500' : 'bg-amber-400'}`}
                            style={{ width: `${Math.min(100, (active / TARGET_ASSETS_PER_STAGE) * 100)}%` }}
                          />
                        </div>
                        <span className={`w-8 text-right ${met ? 'text-green-600' : 'text-amber-600'} font-medium`}>
                          {active}/{TARGET_ASSETS_PER_STAGE}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="px-4 pb-3 flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-2">
                <span>{totalActive} active of {totalAssets} total</span>
                {client.drive_url && (
                  <a href={client.drive_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                    Drive ↗
                  </a>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Status legend */}
      <div className="mt-10 border-t border-gray-200 pt-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Status Key</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
            <div key={status} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              {status}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
