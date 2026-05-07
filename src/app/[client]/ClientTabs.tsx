'use client'

import { useState } from 'react'
import type { Asset, Product } from '@/lib/supabase'
import AssetTable from './AssetTable'
import BriefPanel from './BriefPanel'
import { STAGE_CONFIG, STATUS_CONFIG } from '@/lib/constants'
import type { Stage } from '@/lib/supabase'

interface BriefSection { id: string; title: string; content: string; sort_order: number }
interface MissingItem { product: Product; stage: Stage; reason: 'aging' | 'missing' }

interface Props {
  assets: Asset[]
  products: Product[]
  briefSections: BriefSection[]
  missingCoverage: MissingItem[]
}

const ARCHIVE_STATUSES = ['Pulled', 'Removed by Request']

export default function ClientTabs({ assets, products, briefSections, missingCoverage }: Props) {
  const [tab, setTab] = useState<'assets' | 'archive' | 'brief'>('assets')

  const activeAssets  = assets.filter(a => !ARCHIVE_STATUSES.includes(a.status))
  const archivedAssets = assets.filter(a => ARCHIVE_STATUSES.includes(a.status))

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
      active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`

  const freshSuggestions: Record<Stage, string> = {
    Awareness:     'Hook video — stop the scroll, introduce product',
    Consideration: 'Demo, tutorial, or testimonial showing value',
    Conversion:    'Promo/offer-led video with clear CTA',
  }
  const agingSuggestions: Record<Stage, string> = {
    Awareness:     'Existing creative hitting Refresh Soon — start new hook video',
    Consideration: 'Existing creative aging out — prep fresh demo or testimonial',
    Conversion:    'Existing creative aging out — prep new promo or offer video',
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-3">
        <button className={tabCls(tab === 'assets')} onClick={() => setTab('assets')}>
          Active Assets
        </button>
        {archivedAssets.length > 0 && (
          <button className={tabCls(tab === 'archive')} onClick={() => setTab('archive')}>
            Archive
            <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
              {archivedAssets.length}
            </span>
          </button>
        )}
        {briefSections.length > 0 && (
          <button className={tabCls(tab === 'brief')} onClick={() => setTab('brief')}>
            Creator Brief
          </button>
        )}
      </div>

      {/* Active Assets tab */}
      {tab === 'assets' && (
        <>
          <AssetTable assets={activeAssets} products={products} />
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
                    {missingCoverage.map(({ product, stage, reason }) => (
                      <tr key={`${product.id}-${stage}`} className="hover:bg-amber-100/50">
                        <td className="px-4 py-2 font-medium text-gray-800">{product.name}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_CONFIG[stage].badge}`}>
                            {stage}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600 text-xs">
                          {reason === 'aging' ? agingSuggestions[stage] : freshSuggestions[stage]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Archive tab */}
      {tab === 'archive' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Previously used assets — pulled from rotation or rejected. Click the status badge to restore an asset if needed.
          </p>
          {archivedAssets.length === 0 ? (
            <div className="text-center text-gray-400 py-12 border border-dashed border-gray-200 rounded-lg">
              No archived assets yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Asset Name</th>
                    <th className="text-left px-4 py-2.5 w-36">Product</th>
                    <th className="text-left px-4 py-2.5 w-32">Stage</th>
                    <th className="text-left px-4 py-2.5 w-36">Status</th>
                    <th className="text-left px-4 py-2.5 w-28">Type</th>
                    <th className="text-left px-4 py-2.5 w-24">Date Added</th>
                    <th className="text-left px-4 py-2.5 w-28">Posted By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {archivedAssets
                    .sort((a, b) => (b.date_added ?? '').localeCompare(a.date_added ?? ''))
                    .map((asset, i) => {
                      const cfg = STATUS_CONFIG[asset.status]
                      return (
                        <tr key={asset.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2.5 text-gray-700 font-medium">{asset.asset_name}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{(asset.product as Product)?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{asset.stage}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {asset.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{asset.content_type ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">
                            {asset.date_added ? new Date(asset.date_added + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{asset.posted_by ?? '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Brief tab */}
      {tab === 'brief' && <BriefPanel sections={briefSections} />}
    </div>
  )
}
