'use client'

import { useState, useMemo } from 'react'
import type { Asset, Product } from '@/lib/supabase'
import type { Stage, AssetStatus } from '@/lib/supabase'
import { STAGES, STATUS_CONFIG } from '@/lib/constants'

interface Props {
  assets: Asset[]
  initialStatus?: string | null
}

// ── Freshness ────────────────────────────────────────────────────────────────

// Mirrors AssetTable's FreshnessMeter exactly:
// - Only counts from date_live (the TikTok upload date), never date_added
// - Returns null for statuses that don't have a meaningful live age
function getFreshness(asset: Asset): { days: number } | 'not-live' | null {
  if (['Pulled', 'Removed by Request', 'Pending Review'].includes(asset.status)) return null
  if (!asset.date_live) return 'not-live'
  const days = Math.floor((Date.now() - new Date(asset.date_live + 'T12:00:00').getTime()) / 86_400_000)
  return { days }
}

function FreshnessPill({ asset }: { asset: Asset }) {
  const f = getFreshness(asset)
  if (f === null) return null
  if (f === 'not-live') return (
    <span className="text-[10px] tracking-wide text-stone-400 bg-stone-100 border border-stone-200 rounded-full px-2 py-0.5">Not live</span>
  )
  const { days } = f
  if (days <= 7)  return <span className="text-[10px] tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{days}d · Fresh</span>
  if (days <= 14) return <span className="text-[10px] tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">{days}d · Monitor</span>
  if (days <= 21) return <span className="text-[10px] tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{days}d · Refresh</span>
  return <span className="text-[10px] tracking-wide text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{days}d · Stale</span>
}

// ── Column config (ProEthical palette) ───────────────────────────────────────

const COLUMN: Record<Stage, { accent: string; rule: string; label: string; description: string }> = {
  Awareness:     { accent: 'text-rose-300',   rule: 'bg-rose-300',   label: 'Awareness',     description: 'Stop the scroll. Introduce the brand.' },
  Consideration: { accent: 'text-amber-300',  rule: 'bg-amber-300',  label: 'Consideration', description: 'Educate. Build desire. Differentiate.'  },
  Conversion:    { accent: 'text-emerald-300', rule: 'bg-emerald-300', label: 'Conversion',   description: 'Drive the click. Close the sale.'       },
}

// ── Asset card ───────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: Asset }) {
  const product = asset.product as Product | null
  const cfg = STATUS_CONFIG[asset.status]

  return (
    <div className="bg-[#F5F1EB] border border-stone-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-stone-300 transition-all group">
      {/* Status + freshness row */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} flex-shrink-0`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {asset.status}
        </span>
        <FreshnessPill asset={asset} />
      </div>

      {/* Asset name */}
      <p className="font-serif text-base font-light text-[#2B3428] leading-snug mb-1 group-hover:text-[#3a4636] transition-colors">
        {asset.asset_name || '—'}
      </p>

      {/* Product */}
      {product && (
        <p className="text-[11px] text-[#C4A263] tracking-wide mb-2.5 truncate">
          {product.name}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {asset.content_type && (
          <span className="text-[10px] text-stone-500 bg-stone-100 rounded-md px-1.5 py-0.5 tracking-wide">
            {asset.content_type}
          </span>
        )}
        {asset.posted_by && (
          <span className="text-[10px] text-stone-400 truncate">
            {asset.posted_by}
          </span>
        )}
        {asset.date_live && (
          <span className="text-[10px] text-stone-400 ml-auto">
            Live {new Date(asset.date_live + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({ stage, assets }: { stage: Stage; assets: Asset[] }) {
  const col = COLUMN[stage]

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div className="bg-[#2B3428] rounded-xl px-4 py-3 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-6 h-px ${col.rule}`} />
          <span className={`text-[10px] tracking-[0.2em] uppercase font-semibold ${col.accent}`}>
            {col.label}
          </span>
          <span className="ml-auto text-[10px] text-white/30 tabular-nums">
            {assets.length}
          </span>
        </div>
        <p className="text-[11px] text-white/40 font-serif italic pl-8">{col.description}</p>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2.5 flex-1">
        {assets.length === 0 ? (
          <div className="flex-1 border-2 border-dashed border-stone-200 rounded-xl flex items-center justify-center py-10">
            <p className="text-xs text-stone-300 text-center px-4">No assets in this stage</p>
          </div>
        ) : (
          assets.map(asset => <AssetCard key={asset.id} asset={asset} />)
        )}
      </div>
    </div>
  )
}

// ── Filter bar ───────────────────────────────────────────────────────────────

const ALL_ACTIVE_STATUSES: AssetStatus[] = [
  'Ready to Upload',
  'Pending Review',
  'Live / Running',
  'Needs Refresh / Missing',
  'Expired',
]

function FilterBar({
  activeFilter,
  onFilter,
  counts,
}: {
  activeFilter: string | null
  onFilter: (s: string | null) => void
  counts: Record<string, number>
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onFilter(null)}
        className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
          activeFilter === null
            ? 'bg-[#2B3428] text-[#F5F1EB] border-[#2B3428]'
            : 'text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700 bg-white'
        }`}
      >
        All
      </button>
      {ALL_ACTIVE_STATUSES.map(s => {
        const count = counts[s] ?? 0
        if (count === 0) return null
        const cfg = STATUS_CONFIG[s]
        return (
          <button
            key={s}
            onClick={() => onFilter(activeFilter === s ? null : s)}
            className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              activeFilter === s
                ? `${cfg.bg} ${cfg.text} border-transparent`
                : 'text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700 bg-white'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {s}
            <span className={`tabular-nums text-[10px] ${activeFilter === s ? 'opacity-70' : 'text-stone-400'}`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Board ─────────────────────────────────────────────────────────────────────

export default function KanbanBoard({ assets, initialStatus }: Props) {
  const [statusFilter, setStatusFilter] = useState<string | null>(initialStatus ?? null)
  const [mobileStage, setMobileStage] = useState<Stage>('Awareness')

  // Count assets per status (for filter bar)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of assets) {
      counts[a.status] = (counts[a.status] ?? 0) + 1
    }
    return counts
  }, [assets])

  // Filtered + grouped by stage
  const byStage = useMemo(() => {
    const filtered = statusFilter ? assets.filter(a => a.status === statusFilter) : assets
    const grouped: Record<Stage, Asset[]> = { Awareness: [], Consideration: [], Conversion: [] }
    for (const a of filtered) {
      if (a.stage in grouped) grouped[a.stage as Stage].push(a)
    }
    return grouped
  }, [assets, statusFilter])

  const totalFiltered = Object.values(byStage).reduce((n, arr) => n + arr.length, 0)

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-5">
        <FilterBar
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          counts={statusCounts}
        />
        {statusFilter && totalFiltered === 0 && (
          <p className="mt-3 text-xs text-stone-400">No assets match this filter.</p>
        )}
      </div>

      {/* ── Desktop: 3-column grid ── */}
      <div className="hidden md:grid grid-cols-3 gap-4">
        {STAGES.map(stage => (
          <KanbanColumn key={stage} stage={stage} assets={byStage[stage]} />
        ))}
      </div>

      {/* ── Mobile: stage tabs + single column ── */}
      <div className="md:hidden">
        {/* Stage tab switcher */}
        <div className="flex rounded-xl overflow-hidden border border-stone-200 mb-4">
          {STAGES.map(stage => {
            const col = COLUMN[stage]
            const count = byStage[stage].length
            const isActive = mobileStage === stage
            return (
              <button
                key={stage}
                onClick={() => setMobileStage(stage)}
                className={`flex-1 py-2.5 text-[11px] font-medium tracking-wide transition-colors ${
                  isActive
                    ? 'bg-[#2B3428] text-[#F5F1EB]'
                    : 'bg-white text-stone-500 hover:bg-stone-50'
                }`}
              >
                <span className={isActive ? col.accent : ''}>{stage}</span>
                <span className={`ml-1.5 text-[10px] ${isActive ? 'text-white/40' : 'text-stone-300'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <KanbanColumn stage={mobileStage} assets={byStage[mobileStage]} />
      </div>
    </div>
  )
}
