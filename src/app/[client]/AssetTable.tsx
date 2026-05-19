'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { STAGES, STATUS_CONFIG } from '@/lib/constants'
import type { Asset, AssetStatus, Product, Stage } from '@/lib/supabase'
import { AssetPreviewModal } from '@/components/AssetPreviewModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientProduct { id: string; name: string; sort_order: number }

interface PendingChange {
  product_id?:   string
  stage?:        string
  content_type?: string | null
  posted_by?:    string | null
}

// Statuses shown in the main stage tables (active assets)
const ACTIVE_STATUSES: AssetStatus[] = ['Ready to Upload', 'Live / Running', 'Paused', 'Needs Refresh / Missing', 'Expired']

// Valid next-state transitions per current status
const STATUS_TRANSITIONS: Partial<Record<AssetStatus, AssetStatus[]>> = {
  'Pending Review':          ['Ready to Upload', 'Removed by Request'],
  'Ready to Upload':         ['Live / Running', 'Pulled', 'Removed by Request'],
  'Live / Running':          ['Paused', 'Pulled', 'Needs Refresh / Missing', 'Removed by Request'],
  'Paused':                  ['Live / Running', 'Pulled'],
  'Needs Refresh / Missing': ['Ready to Upload', 'Pulled'],
  'Expired':                 ['Ready to Upload', 'Pulled'],
  'Pulled':                  ['Ready to Upload'],
  'Removed by Request':      ['Ready to Upload'],
}

// Stage config — dark charcoal headers, warm tinted content areas
const STAGE_STYLE: Record<Stage, {
  headerBg:    string
  accentColor: string
  accentBg:    string   // bg equivalent of accentColor, declared explicitly for Tailwind scanning
  accentLabel: string
  lightBg:     string
  rowBg:       string
  border:      string
  description: string
}> = {
  Awareness: {
    headerBg:    'bg-[#2B3428]',
    accentColor: 'text-rose-300',
    accentBg:    'bg-rose-300',
    accentLabel: 'Awareness',
    lightBg:     'bg-rose-50/40',
    rowBg:       'bg-rose-50/20',
    border:      'border-rose-100',
    description: 'Stop the scroll. Introduce the brand.',
  },
  Consideration: {
    headerBg:    'bg-[#2B3428]',
    accentColor: 'text-amber-300',
    accentBg:    'bg-amber-300',
    accentLabel: 'Consideration',
    lightBg:     'bg-amber-50/40',
    rowBg:       'bg-amber-50/20',
    border:      'border-amber-100',
    description: 'Educate. Build desire. Differentiate.',
  },
  Conversion: {
    headerBg:    'bg-[#2B3428]',
    accentColor: 'text-emerald-300',
    accentBg:    'bg-emerald-300',
    accentLabel: 'Conversion',
    lightBg:     'bg-emerald-50/40',
    rowBg:       'bg-emerald-50/20',
    border:      'border-emerald-100',
    description: 'Drive the click. Close the sale.',
  },
}

// ─── Freshness meter ──────────────────────────────────────────────────────────

const FRESHNESS = [
  { maxDays: 7,        label: 'Fresh',        bar: 'bg-emerald-400', text: 'text-emerald-700', track: 'bg-emerald-100' },
  { maxDays: 14,       label: 'Monitor',      bar: 'bg-yellow-400',  text: 'text-yellow-700',  track: 'bg-yellow-100'  },
  { maxDays: 21,       label: 'Refresh Soon', bar: 'bg-orange-400',  text: 'text-orange-700',  track: 'bg-orange-100'  },
  { maxDays: 30,       label: 'Stale',        bar: 'bg-red-400',     text: 'text-red-700',     track: 'bg-red-100'     },
  { maxDays: Infinity, label: 'Expired',      bar: 'bg-stone-400',   text: 'text-stone-500',   track: 'bg-stone-100'   },
]

function FreshnessMeter({ dateLive, status }: { dateLive: string | null; status: string }) {
  if (status === 'Pulled' || status === 'Removed by Request' || status === 'Pending Review') {
    return <span className="text-stone-300 text-xs">—</span>
  }
  if (status === 'Paused') {
    return <span className="text-sky-500 text-xs font-medium">Paused ⏸</span>
  }
  if (status === 'Ready to Upload' || !dateLive) {
    return <span className="text-stone-300 text-xs">Not live</span>
  }
  const days = Math.floor((Date.now() - new Date(dateLive + 'T12:00:00').getTime()) / 86_400_000)
  const tier = FRESHNESS.find(t => days <= t.maxDays) ?? FRESHNESS[FRESHNESS.length - 1]
  const pct  = Math.min(100, Math.round((days / 30) * 100))
  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[10px] font-semibold ${tier.text}`}>{tier.label}</span>
        <span className="text-[10px] text-stone-400">{days}d</span>
      </div>
      <div className={`h-1 rounded-full ${tier.track} overflow-hidden`}>
        <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Inline editable notes cell ───────────────────────────────────────────────

function NotesCell({ value, assetId }: { value: string | null; assetId: string }) {
  const [local, setLocal]   = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const original = useRef(value ?? '')
  const save = async () => {
    if (local === original.current) return
    setSaving(true)
    await fetch(`/api/assets?id=${assetId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: local || null }),
    })
    original.current = local
    setSaving(false)
  }
  return (
    <input
      type="text" value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="Add a note…" disabled={saving}
      className="w-full bg-transparent border-b border-transparent hover:border-stone-200 focus:border-[#C4A263] focus:outline-none px-0 py-0.5 text-xs text-stone-600 placeholder-stone-300 disabled:opacity-50 transition-colors"
    />
  )
}

// ─── Inline status dropdown ───────────────────────────────────────────────────

function StatusDropdown({ asset, onStatusChange }: {
  asset: Asset
  onStatusChange: (assetId: string, newStatus: AssetStatus) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const next = STATUS_TRANSITIONS[asset.status] ?? []
  const cfg  = STATUS_CONFIG[asset.status]

  const handleSelect = async (newStatus: AssetStatus) => {
    setSaving(true)
    setOpen(false)
    await onStatusChange(asset.id, newStatus)
    setSaving(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => !saving && next.length > 0 && setOpen(o => !o)}
        disabled={saving || next.length === 0}
        title={next.length > 0 ? 'Click to change status' : undefined}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} ${next.length > 0 ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} disabled:opacity-60 transition-opacity`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {saving ? '…' : asset.status}
        {next.length > 0 && !saving && <span className="ml-0.5 opacity-40">▾</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-[160px]">
          {next.map(s => {
            const c = STATUS_CONFIG[s]
            const isMarkLive = s === 'Live / Running'
            return (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-stone-50 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                <span className={isMarkLive ? 'text-emerald-700 font-semibold' : 'text-stone-700'}>
                  {isMarkLive ? '↑ Mark Live' : s}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

const CONTENT_TYPES = [
  'UGC', 'Brand / Lifestyle', 'Product Demo', 'Creator-Led',
  'Testimonial / Review', 'Tutorial / How-To', 'Promotional',
  'Static Imagery', 'Motion Graphics', 'Affiliate Video',
]

// Input / select styles
const selectCls = "border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#C4A263]/40 focus:border-[#C4A263]"
const activeSelectCls = "border-[#C4A263] rounded-lg px-2.5 py-1.5 text-sm text-[#2B3428] bg-amber-50 focus:outline-none focus:ring-2 focus:ring-[#C4A263]/40"

// Status summary strip
const STATUS_STRIP: { status: AssetStatus; label: string; bg: string; text: string; dot: string; activeBg: string }[] = [
  { status: 'Pending Review',          label: 'Pending',       bg: 'bg-violet-100',  text: 'text-violet-700', dot: 'bg-violet-400',  activeBg: 'bg-violet-200'  },
  { status: 'Ready to Upload',         label: 'Ready',         bg: 'bg-blue-100',    text: 'text-blue-700',   dot: 'bg-blue-400',    activeBg: 'bg-blue-200'    },
  { status: 'Live / Running',          label: 'Live',          bg: 'bg-emerald-100', text: 'text-emerald-700',dot: 'bg-emerald-400', activeBg: 'bg-emerald-200' },
  { status: 'Paused',                  label: 'Paused',        bg: 'bg-sky-100',     text: 'text-sky-700',    dot: 'bg-sky-400',     activeBg: 'bg-sky-200'     },
  { status: 'Needs Refresh / Missing', label: 'Needs Refresh', bg: 'bg-amber-100',   text: 'text-amber-700',  dot: 'bg-amber-400',   activeBg: 'bg-amber-200'   },
  { status: 'Expired',                 label: 'Expired',       bg: 'bg-stone-100',   text: 'text-stone-500',  dot: 'bg-stone-400',   activeBg: 'bg-stone-200'   },
]

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  assets:   Asset[]
  products: ClientProduct[]
}

export default function AssetTable({ assets, products }: Props) {
  const [editMode, setEditMode]       = useState(false)
  const [pending, setPending]         = useState<Record<string, PendingChange>>({})
  const [saving, setSaving]           = useState(false)
  const [savedMsg, setSavedMsg]       = useState(false)
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null)

  const [searchQuery,          setSearchQuery]          = useState('')
  const [selectedProductId,    setSelectedProductId]    = useState<string>('')
  const [selectedCreator,      setSelectedCreator]      = useState<string>('')
  const [selectedStatus,       setSelectedStatus]       = useState<string>('')
  const [selectedContentType,  setSelectedContentType]  = useState<string>('')
  const [dateSort,             setDateSort]             = useState<'desc' | 'asc'>('desc')

  const [collapsed, setCollapsed] = useState<Record<Stage, boolean>>({
    Awareness: false, Consideration: false, Conversion: false,
  })

  const [localAssets, setLocalAssets] = useState<Asset[]>(assets)

  const creatorOptions = useMemo(() =>
    [...new Set(localAssets.map(a => a.posted_by).filter(Boolean) as string[])].sort()
  , [localAssets])

  const contentTypeOptions = useMemo(() =>
    [...new Set(localAssets.map(a => a.content_type).filter(Boolean) as string[])].sort()
  , [localAssets])

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<AssetStatus, number>> = {}
    for (const a of localAssets) counts[a.status] = (counts[a.status] ?? 0) + 1
    return counts
  }, [localAssets])

  const filteredAssets = useMemo(() => {
    let result = localAssets
    if (searchQuery)         result = result.filter(a => a.asset_name.toLowerCase().includes(searchQuery.toLowerCase()))
    if (selectedProductId)   result = result.filter(a => a.product_id === selectedProductId)
    if (selectedCreator)     result = result.filter(a => a.posted_by === selectedCreator)
    if (selectedStatus)      result = result.filter(a => a.status === selectedStatus)
    if (selectedContentType) result = result.filter(a => a.content_type === selectedContentType)
    return [...result].sort((a, b) => {
      const da = a.date_added ?? ''; const db = b.date_added ?? ''
      return dateSort === 'desc' ? db.localeCompare(da) : da.localeCompare(db)
    })
  }, [localAssets, searchQuery, selectedProductId, selectedCreator, selectedStatus, selectedContentType, dateSort])

  const pendingReview = filteredAssets.filter(a => a.status === 'Pending Review')
  const activeAssets  = filteredAssets.filter(a => ACTIVE_STATUSES.includes(a.status))

  const byStage: Record<Stage, Asset[]> = {
    Awareness:     activeAssets.filter(a => a.stage === 'Awareness'),
    Consideration: activeAssets.filter(a => a.stage === 'Consideration'),
    Conversion:    activeAssets.filter(a => a.stage === 'Conversion'),
  }

  const activeFilterCount = [searchQuery, selectedProductId, selectedCreator, selectedStatus, selectedContentType].filter(Boolean).length
  const clearFilters = () => {
    setSearchQuery('')
    setSelectedProductId('')
    setSelectedCreator('')
    setSelectedStatus('')
    setSelectedContentType('')
  }

  const setPendingField = (id: string, field: keyof PendingChange, value: string | null) => {
    setPending(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleCancel = () => { setPending({}); setEditMode(false) }

  const handleSave = async () => {
    const entries = Object.entries(pending)
    if (!entries.length) { setEditMode(false); return }
    setSaving(true)
    await Promise.all(entries.map(([id, changes]) =>
      fetch(`/api/assets?id=${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
    ))
    setLocalAssets(prev => prev.map(a => {
      const change = pending[a.id]
      if (!change) return a
      const updated = { ...a, ...change, stage: (change.stage ?? a.stage) as Asset['stage'] }
      if (change.product_id) {
        const prod = products.find(p => p.id === change.product_id)
        if (prod) updated.product = prod as unknown as Product
      }
      return updated
    }))
    setPending({})
    setSaving(false)
    setEditMode(false)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2500)
  }

  const handleStatusChange = async (assetId: string, newStatus: AssetStatus) => {
    const asset = localAssets.find(a => a.id === assetId)
    const body: Record<string, string> = { status: newStatus }
    // Only stamp date_live on first-ever go-live. Resuming from Paused keeps the original date.
    if (newStatus === 'Live / Running' && !asset?.date_live) {
      body.date_live = new Date().toISOString().split('T')[0]
    }
    setLocalAssets(prev => prev.map(a =>
      a.id === assetId ? { ...a, status: newStatus, ...(body.date_live ? { date_live: body.date_live } : {}) } : a
    ))
    await fetch(`/api/assets?id=${assetId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  // ── Shared row renderer ──────────────────────────────────────────────────────
  const renderRow = (asset: Asset, i: number, rowBg: string) => {
    const change    = pending[asset.id] ?? {}
    const curProdId = change.product_id   ?? asset.product_id
    const curStage  = change.stage        ?? asset.stage
    const curType   = change.content_type !== undefined ? change.content_type : asset.content_type
    const curBy     = change.posted_by    !== undefined ? change.posted_by    : asset.posted_by
    return (
      <tr key={asset.id} className={`${i % 2 === 0 ? 'bg-white' : rowBg} hover:bg-stone-50/80 group transition-colors`}>

        {/* Product */}
        <td className="px-3 py-2">
          {editMode ? (
            <select value={curProdId ?? ''} onChange={e => setPendingField(asset.id, 'product_id', e.target.value)}
              className="w-full border border-stone-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#C4A263]">
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <span className="text-stone-400 text-xs">{(asset.product as Product)?.name ?? '—'}</span>
          )}
        </td>

        {/* Asset Name + content type stacked */}
        <td className="px-3 py-2">
          <button
            onClick={() => setPreviewAsset(asset)}
            className="font-medium text-sm text-stone-900 leading-tight text-left hover:text-[#C4A263] transition-colors group/name"
            title="Click to preview"
          >
            {asset.asset_name}
            <span className="opacity-0 group-hover/name:opacity-40 text-[10px] ml-1 transition-opacity">▶</span>
          </button>
          {editMode ? (
            <select value={curType ?? ''} onChange={e => setPendingField(asset.id, 'content_type', e.target.value || null)}
              className="mt-1 w-full border border-stone-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C4A263]">
              <option value="">—</option>
              {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <div className="text-xs text-stone-400 mt-0.5">{asset.content_type ?? '—'}</div>
          )}
        </td>

        {/* Status */}
        <td className="px-3 py-2">
          <StatusDropdown asset={asset} onStatusChange={handleStatusChange} />
        </td>

        {/* Date added + last status change */}
        <td className="px-3 py-2 text-stone-400 text-xs whitespace-nowrap">
          <div>{fmt(asset.date_added)}</div>
          {asset.status_changed_at && (
            <div className="text-[10px] text-stone-300 mt-0.5">
              Status: {new Date(asset.status_changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            </div>
          )}
        </td>

        {/* Creator */}
        <td className="px-3 py-2">
          {editMode ? (
            <input type="text" value={curBy ?? ''} onChange={e => setPendingField(asset.id, 'posted_by', e.target.value || null)}
              placeholder="Creator"
              className="w-full border border-stone-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C4A263]" />
          ) : (
            <span className="text-stone-400 text-xs">{asset.posted_by ?? '—'}</span>
          )}
        </td>

        {/* Freshness */}
        <td className="px-3 py-2"><FreshnessMeter dateLive={asset.date_live ?? null} status={asset.status} /></td>

        {/* Stage (edit mode only) */}
        {editMode && (
          <td className="px-3 py-2">
            <select value={curStage} onChange={e => setPendingField(asset.id, 'stage', e.target.value)}
              className="w-full border border-stone-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C4A263]">
              {['Awareness', 'Consideration', 'Conversion'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </td>
        )}

        {/* Notes */}
        <td className="px-3 py-2"><NotesCell value={asset.notes} assetId={asset.id} /></td>
      </tr>
    )
  }

  const thCls = "text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.1em]"

  return (
    <div>

      {/* Preview Modal */}
      {previewAsset && (
        <AssetPreviewModal
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
        />
      )}

      {/* ── Status summary strip ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_STRIP.map(({ status, label, bg, text, dot, activeBg }) => {
          const count = statusCounts[status] ?? 0
          if (count === 0) return null
          const isActive = selectedStatus === status
          return (
            <button
              key={status}
              onClick={() => setSelectedStatus(isActive ? '' : status)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                isActive
                  ? `${activeBg} ${text} border-current ring-2 ring-offset-1 ring-current`
                  : `${bg} ${text} border-transparent hover:opacity-90`
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              {count} {label}
            </button>
          )
        })}
        {selectedStatus && (
          <button onClick={() => setSelectedStatus('')} className="text-xs text-stone-400 hover:text-stone-600 px-1 transition-colors">
            ✕ clear
          </button>
        )}
      </div>

      {/* ── Search + filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search assets…"
            className="pl-8 pr-3 py-1.5 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#C4A263]/40 focus:border-[#C4A263] w-48 transition-colors placeholder:text-stone-300"
          />
        </div>

        {products.length > 1 && (
          <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}
            className={selectedProductId ? activeSelectCls : selectCls}>
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select value={selectedCreator} onChange={e => setSelectedCreator(e.target.value)}
          className={selectedCreator ? activeSelectCls : selectCls}>
          <option value="">All Creators</option>
          {creatorOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={selectedContentType} onChange={e => setSelectedContentType(e.target.value)}
          className={selectedContentType ? activeSelectCls : selectCls}>
          <option value="">All Types</option>
          {contentTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-stone-500 hover:text-stone-700 underline transition-colors">
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}

        {/* Edit controls */}
        <div className="flex items-center gap-2 ml-auto">
          {savedMsg && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
          {editMode ? (
            <>
              <button onClick={handleCancel} disabled={saving}
                className="text-sm text-stone-500 hover:text-stone-700 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-medium text-white bg-[#2B3428] hover:bg-[#3a4636] px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : `Save${Object.keys(pending).length ? ` (${Object.keys(pending).length})` : ''}`}
              </button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)}
              className="text-sm text-[#2B3428] hover:text-[#C4A263] px-3 py-1.5 rounded-lg border border-stone-200 hover:border-[#C4A263] bg-white transition-colors">
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Pending Review queue ── */}
      {pendingReview.length > 0 && (
        <div className="mb-5">
          <div className="bg-[#2B3428] px-4 py-3 rounded-t-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-px bg-violet-400" />
              <span className="text-[10px] tracking-[0.16em] text-violet-300 uppercase font-medium">Pending Review</span>
              <span className="text-xs text-[#A8A09A]">— awaiting approval in Slack</span>
            </div>
            <span className="text-xs text-[#A8A09A]">{pendingReview.length} asset{pendingReview.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-t-0 border-stone-200 rounded-b-lg overflow-hidden bg-white">
              <thead>
                <tr className="bg-violet-50/60 border-b border-stone-100">
                  <th className={`${thCls} w-28`}>Product</th>
                  <th className={thCls}>Asset</th>
                  <th className={`${thCls} w-36`}>Status</th>
                  <th className={`${thCls} w-24`}>Date</th>
                  <th className={`${thCls} w-28`}>Creator</th>
                  <th className={`${thCls} w-24`}>Freshness</th>
                  {editMode && <th className={`${thCls} w-28`}>Stage</th>}
                  <th className={thCls}>Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {pendingReview.map((asset, i) => renderRow(asset, i, 'bg-violet-50/20'))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Stage tables ── */}
      {STAGES.map(stage => {
        const stageAssets = byStage[stage]
        const s = STAGE_STYLE[stage]
        const isCollapsed = collapsed[stage]

        return (
          <div key={stage} className="mb-5">
            {/* Stage header */}
            <button
              onClick={() => setCollapsed(c => ({ ...c, [stage]: !c[stage] }))}
              className={`w-full ${s.headerBg} px-5 py-3 rounded-t-lg flex items-center justify-between hover:opacity-95 transition-opacity`}
            >
              <div className="flex items-center gap-3">
                {/* Thin accent rule + small-caps label (ProEthical motif) */}
                <div className={`w-6 h-px ${s.accentBg}`} />
                <span className={`text-[10px] tracking-[0.18em] ${s.accentColor} uppercase font-medium`}>
                  {s.accentLabel}
                </span>
                <span className="font-serif italic text-sm text-[#F5F1EB]/70 font-light hidden sm:inline">
                  {s.description}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-[#A8A09A] tracking-wide">{stageAssets.length} asset{stageAssets.length !== 1 ? 's' : ''}</span>
                <span className={`text-[#A8A09A] text-xs transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>
                  ▾
                </span>
              </div>
            </button>

            {!isCollapsed && (
              stageAssets.length === 0 ? (
                <div className={`${s.lightBg} border border-t-0 ${s.border} rounded-b-lg px-4 py-6 text-center`}>
                  <p className="text-sm text-stone-400">
                    {activeFilterCount > 0 ? 'No assets match the current filters' : 'No assets yet — add via Slack or manually'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={`w-full text-sm border border-t-0 ${s.border} rounded-b-lg overflow-hidden`}>
                    <thead>
                      <tr className={`${s.lightBg} border-b ${s.border}`}>
                        <th className={`${thCls} w-28`}>Product</th>
                        <th className={thCls}>Asset</th>
                        <th className={`${thCls} w-36`}>Status</th>
                        <th className={`${thCls} w-24`}>
                          <button onClick={() => setDateSort(d => d === 'desc' ? 'asc' : 'desc')}
                            className="flex items-center gap-1 hover:text-stone-600 uppercase tracking-[0.1em] font-semibold text-[10px]">
                            Date <span className="text-stone-300">{dateSort === 'desc' ? '↓' : '↑'}</span>
                          </button>
                        </th>
                        <th className={`${thCls} w-24`}>Creator</th>
                        <th className={`${thCls} w-24`}>Freshness</th>
                        {editMode && <th className={`${thCls} w-28`}>Stage</th>}
                        <th className={thCls}>Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {stageAssets.map((asset, i) => renderRow(asset, i, s.rowBg))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
