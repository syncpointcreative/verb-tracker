'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { Asset, Product } from '@/lib/supabase'
import type { Stage, AssetStatus } from '@/lib/supabase'
import { STAGES, STATUS_CONFIG } from '@/lib/constants'

interface Props {
  assets: Asset[]
  initialStatus?: string | null
}

// ── Freshness ────────────────────────────────────────────────────────────────

function getFreshness(asset: Asset): { days: number } | 'not-live' | 'paused' | null {
  if (['Pulled', 'Removed by Request', 'Pending Review'].includes(asset.status)) return null
  if (asset.status === 'Paused') return 'paused'
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
  if (f === 'paused') return (
    <span className="text-[10px] tracking-wide text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">⏸ Paused</span>
  )
  const { days } = f
  if (days <= 7)  return <span className="text-[10px] tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{days}d · Fresh</span>
  if (days <= 14) return <span className="text-[10px] tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">{days}d · Monitor</span>
  if (days <= 21) return <span className="text-[10px] tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{days}d · Refresh</span>
  return <span className="text-[10px] tracking-wide text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">{days}d · Stale</span>
}

// ── Column config ─────────────────────────────────────────────────────────────

const COLUMN: Record<Stage, { accent: string; rule: string; label: string; description: string }> = {
  Awareness:     { accent: 'text-rose-300',    rule: 'bg-rose-300',    label: 'Awareness',     description: 'Stop the scroll. Introduce the brand.' },
  Consideration: { accent: 'text-amber-300',   rule: 'bg-amber-300',   label: 'Consideration', description: 'Educate. Build desire. Differentiate.'  },
  Conversion:    { accent: 'text-emerald-300', rule: 'bg-emerald-300', label: 'Conversion',    description: 'Drive the click. Close the sale.'       },
}

// ── Pull Modal ────────────────────────────────────────────────────────────────

type Performance = 'High Performer' | 'Average Performer' | 'Poor Performer'

const PERF_OPTIONS: { value: Performance; emoji: string; label: string }[] = [
  { value: 'High Performer',    emoji: '🔥', label: 'Strong' },
  { value: 'Average Performer', emoji: '👍', label: 'OK' },
  { value: 'Poor Performer',    emoji: '❌', label: 'Poor' },
]

function PullModal({
  asset,
  onConfirm,
  onCancel,
}: {
  asset: Asset
  onConfirm: (performance: Performance | null, notes: string) => void
  onCancel: () => void
}) {
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    await onConfirm(performance, notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#2B3428] rounded-t-2xl px-5 py-4">
          <p className="text-[10px] text-white/40 tracking-widest uppercase mb-1">Pull asset</p>
          <p className="font-serif text-white text-base leading-snug line-clamp-2">{asset.asset_name}</p>
        </div>

        <div className="px-5 py-4">
          {/* Performance rating */}
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">Performance</p>
          <div className="flex gap-2 mb-4">
            {PERF_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPerformance(performance === opt.value ? null : opt.value)}
                className={`flex-1 text-xs py-2.5 rounded-xl border transition-all font-medium ${
                  performance === opt.value
                    ? 'bg-[#2B3428] text-white border-[#2B3428] shadow-sm'
                    : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700 bg-white'
                }`}
              >
                <div className="text-base mb-0.5">{opt.emoji}</div>
                <div>{opt.label}</div>
              </button>
            ))}
          </div>

          {/* Notes */}
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest mb-2">Notes <span className="normal-case font-normal text-stone-300">(optional)</span></p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Why was it pulled? Any observations..."
            className="w-full text-xs border border-stone-200 rounded-xl px-3 py-2.5 mb-4 resize-none h-16 focus:outline-none focus:border-stone-400 placeholder:text-stone-300"
          />

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 text-xs py-2.5 rounded-xl border border-stone-200 text-stone-500 hover:border-stone-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex-1 text-xs py-2.5 rounded-xl bg-[#2B3428] text-white hover:bg-[#3a4636] transition-colors disabled:opacity-50"
            >
              {saving ? 'Pulling…' : 'Confirm Pull'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Status Dropdown ───────────────────────────────────────────────────────────

const ALL_STATUSES: AssetStatus[] = [
  'Pending Review',
  'Ready to Upload',
  'Live / Running',
  'Paused',
  'Needs Refresh / Missing',
  'Expired',
  'Pulled',
  'Removed by Request',
]

function StatusDropdown({
  current,
  onSelect,
  onClose,
}: {
  current: AssetStatus
  onSelect: (s: AssetStatus) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-30 bg-white border border-stone-200 rounded-xl shadow-xl py-1 min-w-[190px]"
    >
      {ALL_STATUSES.map(s => {
        const cfg = STATUS_CONFIG[s]
        const isActive = s === current
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 transition-colors ${
              isActive ? 'bg-stone-50' : 'hover:bg-stone-50'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
            <span className={isActive ? `${cfg.text} font-semibold` : 'text-stone-600'}>{s}</span>
            {isActive && <span className="ml-auto text-stone-300 text-[10px]">current</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Asset Card ────────────────────────────────────────────────────────────────

interface CardProps {
  asset: Asset
  onStatusChange: (id: string, newStatus: AssetStatus) => void
  onPullRequest: (asset: Asset) => void
}

function AssetCard({ asset, onStatusChange, onPullRequest }: CardProps) {
  const product = asset.product as Product | null
  const cfg = STATUS_CONFIG[asset.status]
  const [dropdownOpen, setDropdownOpen] = useState(false)

  function handleStatusSelect(s: AssetStatus) {
    setDropdownOpen(false)
    if (s === 'Pulled') {
      onPullRequest(asset)
    } else {
      onStatusChange(asset.id, s)
    }
  }

  const showLiveDatePrompt = asset.status === 'Ready to Upload'

  return (
    <div className="bg-[#F5F1EB] border border-stone-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-stone-300 transition-all group">
      {/* Status row */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        {/* Clickable status badge → dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-all cursor-pointer hover:opacity-80 active:scale-95 ${cfg.bg} ${cfg.text}`}
            title="Change status"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {asset.status}
            <span className="opacity-50 ml-0.5">▾</span>
          </button>
          {dropdownOpen && (
            <StatusDropdown
              current={asset.status}
              onSelect={handleStatusSelect}
              onClose={() => setDropdownOpen(false)}
            />
          )}
        </div>
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
        {asset.date_live ? (
          <span className="text-[10px] text-stone-400 ml-auto">
            Live {new Date(asset.date_live + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : showLiveDatePrompt ? (
          <span className="text-[10px] text-stone-300 ml-auto italic">ready to upload</span>
        ) : null}
      </div>

      {/* Performance badge (shown on pulled assets) */}
      {asset.performance && (
        <div className="mt-2 pt-2 border-t border-stone-200/60">
          <span className="text-[10px] text-stone-400 italic">
            {asset.performance === 'High Performer' && '🔥 '}
            {asset.performance === 'Average Performer' && '👍 '}
            {asset.performance === 'Poor Performer' && '❌ '}
            {asset.performance}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  assets,
  onStatusChange,
  onPullRequest,
}: {
  stage: Stage
  assets: Asset[]
  onStatusChange: (id: string, newStatus: AssetStatus) => void
  onPullRequest: (asset: Asset) => void
}) {
  const col = COLUMN[stage]

  return (
    <div className="flex flex-col min-w-0">
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

      <div className="flex flex-col gap-2.5 flex-1">
        {assets.length === 0 ? (
          <div className="flex-1 border-2 border-dashed border-stone-200 rounded-xl flex items-center justify-center py-10">
            <p className="text-xs text-stone-300 text-center px-4">No assets in this stage</p>
          </div>
        ) : (
          assets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onStatusChange={onStatusChange}
              onPullRequest={onPullRequest}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const ALL_ACTIVE_STATUSES: AssetStatus[] = [
  'Ready to Upload',
  'Pending Review',
  'Live / Running',
  'Paused',
  'Needs Refresh / Missing',
  'Expired',
]

const STALE_FILTER = '__stale__'

function isStale(asset: Asset): boolean {
  const f = getFreshness(asset)
  return typeof f === 'object' && f !== null && f.days > 21
}

function FilterBar({
  activeFilter,
  onFilter,
  counts,
  staleCount,
}: {
  activeFilter: string | null
  onFilter: (s: string | null) => void
  counts: Record<string, number>
  staleCount: number
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
      {staleCount > 0 && (
        <button
          onClick={() => onFilter(activeFilter === STALE_FILTER ? null : STALE_FILTER)}
          className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
            activeFilter === STALE_FILTER
              ? 'bg-red-100 text-red-700 border-transparent'
              : 'text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700 bg-white'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Stale
          <span className={`tabular-nums text-[10px] ${activeFilter === STALE_FILTER ? 'opacity-70' : 'text-stone-400'}`}>
            {staleCount}
          </span>
        </button>
      )}
    </div>
  )
}

// ── Board ─────────────────────────────────────────────────────────────────────

export default function KanbanBoard({ assets: initialAssets, initialStatus }: Props) {
  const [localAssets, setLocalAssets]   = useState<Asset[]>(initialAssets)
  const [statusFilter, setStatusFilter] = useState<string | null>(initialStatus ?? null)
  const [mobileStage, setMobileStage]   = useState<Stage>('Awareness')
  const [pullTarget, setPullTarget]     = useState<Asset | null>(null)
  const [toast, setToast]               = useState<string | null>(null)

  // Keep local state in sync if the parent re-renders with new data
  useEffect(() => { setLocalAssets(initialAssets) }, [initialAssets])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // ── Optimistic status update ─────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, newStatus: AssetStatus) => {
    // Optimistically update local state
    setLocalAssets(prev =>
      prev.map(a => a.id === id ? { ...a, status: newStatus } : a)
    )

    try {
      const res = await fetch(`/api/assets?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed')
      const updated: Asset = await res.json()
      // Merge the server response (gets date_live auto-stamp etc.)
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...updated, product: a.product, client: a.client } : a))
      showToast(`Marked ${newStatus}`)
    } catch {
      // Revert on failure
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...a, status: a.status } : a))
      showToast('Update failed — please try again')
    }
  }, [])

  // ── Pull with performance rating ─────────────────────────────────────────
  const handlePull = useCallback(async (performance: Performance | null, notes: string) => {
    if (!pullTarget) return
    const id = pullTarget.id

    // Optimistic update
    setLocalAssets(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'Pulled', performance: performance ?? null, notes: notes || a.notes } : a)
    )
    setPullTarget(null)

    try {
      const body: Record<string, unknown> = { status: 'Pulled' }
      if (performance) body.performance = performance
      if (notes) body.notes = notes

      const res = await fetch(`/api/assets?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed')
      const updated: Asset = await res.json()
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...updated, product: a.product, client: a.client } : a))
      showToast('Asset pulled ✓')
    } catch {
      showToast('Pull failed — please try again')
    }
  }, [pullTarget])

  // ── Counts + grouping ────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of localAssets) {
      counts[a.status] = (counts[a.status] ?? 0) + 1
    }
    return counts
  }, [localAssets])

  const staleCount = useMemo(() => localAssets.filter(isStale).length, [localAssets])

  const byStage = useMemo(() => {
    const filtered = statusFilter === STALE_FILTER
      ? localAssets.filter(isStale)
      : statusFilter
        ? localAssets.filter(a => a.status === statusFilter)
        : localAssets
    const grouped: Record<Stage, Asset[]> = { Awareness: [], Consideration: [], Conversion: [] }
    for (const a of filtered) {
      if (a.stage in grouped) grouped[a.stage as Stage].push(a)
    }
    return grouped
  }, [localAssets, statusFilter])

  const totalFiltered = Object.values(byStage).reduce((n, arr) => n + arr.length, 0)

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#2B3428] text-white text-xs px-4 py-2.5 rounded-full shadow-lg pointer-events-none animate-fade-in">
          {toast}
        </div>
      )}

      {/* Pull Modal */}
      {pullTarget && (
        <PullModal
          asset={pullTarget}
          onConfirm={handlePull}
          onCancel={() => setPullTarget(null)}
        />
      )}

      {/* Filter bar */}
      <div className="mb-5">
        <FilterBar
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          counts={statusCounts}
          staleCount={staleCount}
        />
        {statusFilter && totalFiltered === 0 && (
          <p className="mt-3 text-xs text-stone-400">No assets match this filter.</p>
        )}
      </div>

      {/* ── Desktop: 3-column grid ── */}
      <div className="hidden md:grid grid-cols-3 gap-4">
        {STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            stage={stage}
            assets={byStage[stage]}
            onStatusChange={handleStatusChange}
            onPullRequest={setPullTarget}
          />
        ))}
      </div>

      {/* ── Mobile: stage tabs + single column ── */}
      <div className="md:hidden">
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

        <KanbanColumn
          stage={mobileStage}
          assets={byStage[mobileStage]}
          onStatusChange={handleStatusChange}
          onPullRequest={setPullTarget}
        />
      </div>
    </div>
  )
}
