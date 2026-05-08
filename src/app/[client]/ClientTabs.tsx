'use client'

import { useState } from 'react'
import type { Asset, Product } from '@/lib/supabase'
import AssetTable from './AssetTable'
import KanbanBoard from './KanbanBoard'
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
  initialStatus?: string | null
}

const ARCHIVE_STATUSES = ['Pulled', 'Removed by Request']

type Tab = 'board' | 'assets' | 'archive' | 'brief'

export default function ClientTabs({ assets, products, briefSections, missingCoverage, initialStatus }: Props) {
  const [tab, setTab] = useState<Tab>('board')

  const activeAssets   = assets.filter(a => !ARCHIVE_STATUSES.includes(a.status))
  const archivedAssets = assets.filter(a =>  ARCHIVE_STATUSES.includes(a.status))

  // Tab bar styling — ProEthical palette
  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm tracking-wide transition-colors rounded-lg ${
      active
        ? 'bg-[#2B3428] text-[#F5F1EB] font-medium'
        : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
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
      <div className="flex items-center gap-1 mb-6 border-b border-stone-200 pb-3 overflow-x-auto">
        <button className={tabCls(tab === 'board')} onClick={() => setTab('board')}>
          Board
        </button>
        <button className={tabCls(tab === 'assets')} onClick={() => setTab('assets')}>
          Table
        </button>
        {archivedAssets.length > 0 && (
          <button className={tabCls(tab === 'archive')} onClick={() => setTab('archive')}>
            Archive
            <span className="ml-1.5 text-[10px] bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded-full">
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

      {/* Board tab — Kanban view */}
      {tab === 'board' && (
        <>
          <KanbanBoard assets={activeAssets} initialStatus={initialStatus} />

          {/* Missing coverage panel below the board */}
          {missingCoverage.length > 0 && (
            <div className="mt-8">
              {/* Section opener */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-px bg-[#C4A263]" />
                <p className="text-[10px] tracking-[0.18em] text-[#C4A263] uppercase font-medium">
                  Coverage Gaps
                </p>
              </div>
              <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-100/60 border-b border-amber-200/60 text-[10px] text-amber-800 uppercase tracking-[0.12em]">
                      <th className="text-left px-4 py-2.5">Product</th>
                      <th className="text-left px-4 py-2.5">Missing Stage</th>
                      <th className="text-left px-4 py-2.5 hidden sm:table-cell">Suggested Ask</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100/60">
                    {missingCoverage.map(({ product, stage, reason }) => (
                      <tr key={`${product.id}-${stage}`} className="hover:bg-amber-100/40 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-stone-700 text-sm">{product.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STAGE_CONFIG[stage].badge}`}>
                            {stage}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-stone-500 text-xs hidden sm:table-cell">
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

      {/* Table tab — full AssetTable for editing */}
      {tab === 'assets' && (
        <AssetTable assets={activeAssets} products={products} />
      )}

      {/* Archive tab */}
      {tab === 'archive' && (
        <div>
          <p className="text-sm text-stone-400 mb-5 font-serif italic">
            Previously used assets — pulled from rotation or rejected. Click the status badge to restore if needed.
          </p>
          {archivedAssets.length === 0 ? (
            <div className="text-center text-stone-300 py-12 border border-dashed border-stone-200 rounded-xl">
              No archived assets yet
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-[10px] text-stone-400 uppercase tracking-[0.12em]">
                    <th className="text-left px-4 py-2.5">Asset Name</th>
                    <th className="text-left px-4 py-2.5 w-36">Product</th>
                    <th className="text-left px-4 py-2.5 w-32">Stage</th>
                    <th className="text-left px-4 py-2.5 w-36">Status</th>
                    <th className="text-left px-4 py-2.5 w-28 hidden sm:table-cell">Type</th>
                    <th className="text-left px-4 py-2.5 w-24 hidden sm:table-cell">Date Added</th>
                    <th className="text-left px-4 py-2.5 w-28 hidden sm:table-cell">Posted By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {archivedAssets
                    .sort((a, b) => (b.date_added ?? '').localeCompare(a.date_added ?? ''))
                    .map(asset => {
                      const cfg = STATUS_CONFIG[asset.status]
                      return (
                        <tr key={asset.id} className="hover:bg-stone-50/80 transition-colors">
                          <td className="px-4 py-2.5 text-stone-700 font-medium">{asset.asset_name}</td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs">{(asset.product as Product)?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs">{asset.stage}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {asset.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs hidden sm:table-cell">{asset.content_type ?? '—'}</td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs hidden sm:table-cell">
                            {asset.date_added
                              ? new Date(asset.date_added + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs hidden sm:table-cell">{asset.posted_by ?? '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Creator Brief tab */}
      {tab === 'brief' && <BriefPanel sections={briefSections} />}
    </div>
  )
}
