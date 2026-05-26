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

interface Campaign { id: string; name: string }

interface Props {
  assets: Asset[]
  products: Product[]
  campaigns: Campaign[]
  clientId: string
  briefSections: BriefSection[]
  missingCoverage: MissingItem[]
  initialStatus?: string | null
}

const ARCHIVE_STATUSES = ['Pulled', 'Removed by Request']

type Tab = 'board' | 'assets' | 'archive' | 'brief'

export default function ClientTabs({ assets, products, campaigns, clientId, briefSections, missingCoverage, initialStatus }: Props) {
  const [tab, setTab]           = useState<Tab>('board')
  const [localAssets, setLocalAssets] = useState<Asset[]>(assets)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const activeAssets   = localAssets.filter(a => !ARCHIVE_STATUSES.includes(a.status))
  const archivedAssets = localAssets.filter(a =>  ARCHIVE_STATUSES.includes(a.status))

  // Shared status-change handler — keeps all tabs in sync without a page reload.
  // Both KanbanBoard and AssetTable call this after a successful PATCH so that
  // switching tabs never shows stale data.
  const handleStatusChange = (id: string, _newStatus: AssetStatus, updatedAsset?: Asset) => {
    setLocalAssets(prev => prev.map(a => {
      if (a.id !== id) return a
      return updatedAsset ? { ...updatedAsset, product: a.product, client: a.client } : { ...a, status: _newStatus }
    }))
  }

  const restoreAsset = async (asset: Asset) => {
    setRestoringId(asset.id)
    await fetch(`/api/assets?id=${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Ready to Upload' }),
    })
    setLocalAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: 'Ready to Upload' } : a))
    setRestoringId(null)
  }

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
          <KanbanBoard assets={activeAssets} campaigns={campaigns} clientId={clientId} initialStatus={initialStatus} onStatusChange={handleStatusChange} />

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
        <AssetTable assets={activeAssets} products={products} onStatusChange={handleStatusChange} />
      )}

      {/* Archive tab */}
      {tab === 'archive' && (
        <div>
          <p className="text-sm text-stone-400 mb-5 font-serif italic">
            Previously used assets — pulled from rotation or rejected. Click the status badge to restore to Ready to Upload.
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
                    <th className="text-left px-4 py-2.5 w-36 hidden sm:table-cell">Performance</th>
                    <th className="text-left px-4 py-2.5 w-28 hidden sm:table-cell">Archived</th>
                    <th className="text-left px-4 py-2.5 w-28 hidden sm:table-cell">Posted By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {archivedAssets
                    .sort((a, b) => (b.status_changed_at ?? b.date_added ?? '').localeCompare(a.status_changed_at ?? a.date_added ?? ''))
                    .map(asset => {
                      const cfg = STATUS_CONFIG[asset.status]
                      const perfColor =
                        asset.performance === 'High Performer'    ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
                        asset.performance === 'Average Performer' ? 'text-amber-700 bg-amber-50 border-amber-200' :
                        asset.performance === 'Poor Performer'    ? 'text-red-700 bg-red-50 border-red-200' :
                        'text-stone-400 bg-stone-50 border-stone-200'
                      return (
                        <tr key={asset.id} className="hover:bg-stone-50/80 transition-colors">
                          <td className="px-4 py-2.5 text-stone-700 font-medium">{asset.asset_name}</td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs">{(asset.product as Product)?.name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs">{asset.stage}</td>
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => restoreAsset(asset)}
                              disabled={restoringId === asset.id}
                              title="Click to restore to Ready to Upload"
                              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-all hover:ring-2 hover:ring-offset-1 hover:ring-[#C4A263]/50 disabled:opacity-50 cursor-pointer ${cfg.bg} ${cfg.text}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {restoringId === asset.id ? 'Restoring…' : asset.status}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <select
                              value={asset.performance ?? ''}
                              onChange={async e => {
                                const val = e.target.value || null
                                setLocalAssets(prev => prev.map(a => a.id === asset.id ? { ...a, performance: val as Asset['performance'] } : a))
                                await fetch(`/api/assets?id=${asset.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ performance: val }),
                                })
                              }}
                              className={`text-[10px] border rounded-full px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#C4A263]/40 ${perfColor}`}
                            >
                              <option value="">— Rate it —</option>
                              <option value="High Performer">High Performer</option>
                              <option value="Average Performer">Average Performer</option>
                              <option value="Poor Performer">Poor Performer</option>
                            </select>
                          </td>
                          <td className="px-4 py-2.5 text-stone-400 text-xs hidden sm:table-cell">
                            {asset.status_changed_at
                              ? new Date(asset.status_changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                              : asset.date_added
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
