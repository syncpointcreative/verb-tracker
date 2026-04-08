import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { STAGE_CONFIG, STAGES, STATUS_CONFIG, TARGET_ASSETS_PER_STAGE, EXPIRY_DAYS } from '@/lib/constants'
import type { Asset, Product, Stage } from '@/lib/supabase'

interface Props {
  params: { client: string }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)
  return new Date(dateStr) < cutoff
}

export const revalidate = 60

export default async function ClientPage({ params }: Props) {
  const supabase = createServerClient()

  // Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', params.client)
    .single()

  if (!client) notFound()

  // Fetch products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('client_id', client.id)
    .order('sort_order')

  // Fetch assets with product joined
  const { data: assets } = await supabase
    .from('assets')
    .select('*, product:products(*)')
    .eq('client_id', client.id)
    .order('stage')
    .order('date_added', { ascending: false })

  const allAssets: Asset[] = assets ?? []
  const allProducts: Product[] = products ?? []

  // Group assets by stage
  const byStage: Record<Stage, Asset[]> = {
    Awareness:     allAssets.filter(a => a.stage === 'Awareness'),
    Consideration: allAssets.filter(a => a.stage === 'Consideration'),
    Conversion:    allAssets.filter(a => a.stage === 'Conversion'),
  }

  // Find missing product coverage: products that have 0 active assets in any stage
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)

  const coveredSet = new Set<string>() // productId-stage
  for (const asset of allAssets) {
    if (asset.status !== 'Needs Refresh / Missing' && asset.status !== 'Expired') {
      if (!asset.date_added || new Date(asset.date_added) >= cutoff) {
        coveredSet.add(`${asset.product_id}-${asset.stage}`)
      }
    }
  }

  const missingCoverage: { product: Product; stage: Stage }[] = []
  for (const product of allProducts) {
    for (const stage of STAGES) {
      if (!coveredSet.has(`${product.id}-${stage}`)) {
        missingCoverage.push({ product, stage })
      }
    }
  }

  // Stage active counts
  const activeCounts: Record<Stage, number> = { Awareness: 0, Consideration: 0, Conversion: 0 }
  for (const asset of allAssets) {
    if (asset.status !== 'Needs Refresh / Missing' && asset.status !== 'Expired') {
      if (!asset.date_added || new Date(asset.date_added) >= cutoff) {
        activeCounts[asset.stage as Stage]++
      }
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{client.name}</span>
      </div>

      {/* Client header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <div className="flex gap-4 mt-2">
            {STAGES.map(stage => {
              const count = activeCounts[stage]
              const met = count >= TARGET_ASSETS_PER_STAGE
              const cfg = STAGE_CONFIG[stage]
              return (
                <span key={stage} className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${met ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {cfg.label}: {count}/{TARGET_ASSETS_PER_STAGE}
                </span>
              )
            })}
          </div>
        </div>
        {client.drive_url && (
          <a
            href={client.drive_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline bg-blue-50 px-3 py-1.5 rounded-lg"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            Open Drive Folder
          </a>
        )}
      </div>

      {/* Asset tables by stage */}
      {STAGES.map(stage => {
        const stageAssets = byStage[stage]
        const cfg = STAGE_CONFIG[stage]
        return (
          <div key={stage} className="mb-8">
            {/* Stage header */}
            <div className={`${cfg.headerBg} text-white px-4 py-2.5 rounded-t-lg flex items-center justify-between`}>
              <div>
                <span className="font-semibold">{cfg.label}</span>
                <span className="ml-2 text-xs opacity-80">— {cfg.description}</span>
              </div>
              <span className="text-xs opacity-80">{stageAssets.length} asset{stageAssets.length !== 1 ? 's' : ''}</span>
            </div>

            {stageAssets.length === 0 ? (
              <div className={`${cfg.lightBg} border border-t-0 ${cfg.border} rounded-b-lg px-4 py-6 text-center text-sm text-gray-500`}>
                No assets yet — add via Slack or manually
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
                  <thead>
                    <tr className={`${cfg.lightBg} border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide`}>
                      <th className="text-left px-3 py-2 w-36">Product</th>
                      <th className="text-left px-3 py-2">Asset Name</th>
                      <th className="text-left px-3 py-2 w-32">Content Type</th>
                      <th className="text-left px-3 py-2 w-24">Status</th>
                      <th className="text-left px-3 py-2 w-24">Date Added</th>
                      <th className="text-left px-3 py-2 w-24">Posted By</th>
                      <th className="text-left px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stageAssets.map((asset, i) => {
                      const expired = isExpired(asset.date_added)
                      const statusCfg = STATUS_CONFIG[asset.status]
                      return (
                        <tr
                          key={asset.id}
                          className={`${i % 2 === 0 ? 'bg-white' : cfg.rowBg} ${expired ? 'opacity-50' : ''} hover:bg-gray-50`}
                        >
                          <td className="px-3 py-2 text-gray-700 font-medium text-xs">
                            {(asset.product as Product)?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-900">{asset.asset_name}</td>
                          <td className="px-3 py-2 text-gray-600">{asset.content_type ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                              {asset.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(asset.date_added)}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{asset.posted_by ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{asset.notes ?? ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Missing Coverage */}
      {missingCoverage.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-3">⚠ Missing Coverage</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-100 border-b border-amber-200 text-xs text-amber-800 uppercase tracking-wide">
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-left px-4 py-2">Missing Stage</th>
                  <th className="text-left px-4 py-2">Suggested Ask</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {missingCoverage.map(({ product, stage }) => {
                  const suggestions: Record<Stage, string> = {
                    Awareness: 'Hook video — stop the scroll, introduce product',
                    Consideration: 'Demo, tutorial, or testimonial showing value',
                    Conversion: 'Promo/offer-led video with clear CTA',
                  }
                  return (
                    <tr key={`${product.id}-${stage}`} className="hover:bg-amber-100/50">
                      <td className="px-4 py-2 font-medium text-gray-800">{product.name}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_CONFIG[stage].badge}`}>
                          {stage}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{suggestions[stage]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
