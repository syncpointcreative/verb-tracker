'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { STAGE_CONFIG, STAGES, STATUS_CONFIG } from '@/lib/constants'
import type { Asset, AssetStatus, Product, Stage } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientProduct { id: string; name: string; sort_order: number }

interface PendingChange {
  product_id?:   string
  stage?:        string
  content_type?: string | null
  posted_by?:    string | null
}

// Statuses shown in the main stage tables (active assets)
const ACTIVE_STATUSES: AssetStatus[] = ['Ready to Upload', 'Live / Running', 'Needs Refresh / Missing', 'Expired']

// Valid next-state transitions per current status
const STATUS_TRANSITIONS: Partial<Record<AssetStatus, AssetStatus[]>> = {
  'Pending Review':          ['Ready to Upload', 'Removed by Request'],
  'Ready to Upload':         ['Live / Running', 'Pulled', 'Removed by Request'],
  'Live / Running':          ['Pulled', 'Needs Refresh / Missing', 'Removed by Request'],
  'Needs Refresh / Missing': ['Ready to Upload', 'Pulled'],
  'Expired':                 ['Ready to Upload', 'Pulled'],
  'Pulled':                  ['Ready to Upload'],
  'Removed by Request':      ['Ready to Upload'],
}

// ─── Freshness meter ──────────────────────────────────────────────────────────

const FRESHNESS = [
  { maxDays: 7,        label: 'Fresh',        emoji: null, bar: 'bg-green-400',  text: 'text-green-700',  track: 'bg-green-100'  },
  { maxDays: 14,       label: 'Monitor',      emoji: null, bar: 'bg-yellow-400', text: 'text-yellow-700', track: 'bg-yellow-100' },
  { maxDays: 21,       label: 'Refresh Soon', emoji: null, bar: 'bg-orange-400', text: 'text-orange-700', track: 'bg-orange-100' },
  { maxDays: 30,       label: 'Stale',        emoji: null, bar: 'bg-red-400',    text: 'text-red-700',    track: 'bg-red-100'    },
  { maxDays: Infinity, label: 'Expired',      emoji: '💩', bar: 'bg-gray-400',   text: 'text-gray-500',   track: 'bg-gray-100'   },
]

function FreshnessMeter({ dateLive, status }: { dateLive: string | null; status: string }) {
  if (status === 'Pulled' || status === 'Removed by Request' || status === 'Pending Review') {
    return <span className="text-gray-400 text-xs italic">—</span>
  }
  if (status === 'Ready to Upload' || !dateLive) {
    return <span className="text-gray-300 text-xs">Not live yet</span>
  }
  const days = Math.floor((Date.now() - new Date(dateLive + 'T12:00:00').getTime()) / 86_400_000)
  const tier = FRESHNESS.find(t => days <= t.maxDays) ?? FRESHNESS[FRESHNESS.length - 1]
  const pct  = Math.min(100, Math.round((days / 30) * 100))
  return (
    <div className="flex flex-col gap-0.5 min-w-[90px]">
      <div className="flex items-center justify-between gap-1">
        <span className={`text-[10px] font-semibold ${tier.text}`}>
          {tier.emoji && <span className="mr-0.5">{tier.emoji}</span>}{tier.label}
        </span>
        <span className="text-[10px] text-gray-400">{days}d</span>
      </div>
      <div className={`h-1.5 rounded-full ${tier.track} overflow-hidden`}>
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
      className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none px-0 py-0.5 text-xs text-gray-600 placeholder-gray-300 disabled:opacity-50"
    />
  )
}

// ─── Inline status dropdown ───────────────────────────────────────────────────

function StatusDropdown({
  asset,
  onStatusChange,
}: {
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
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} ${next.length > 0 ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} disabled:opacity-60`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {saving ? '…' : asset.status}
        {next.length > 0 && !saving && <span className="ml-0.5 opacity-50">▾</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
          {next.map(s => {
            const c = STATUS_CONFIG[s]
            const isMarkLive = s === 'Live / Running'
            return (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${isMarkLive ? 'font-semibold' : ''}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                <span className={isMarkLive ? 'text-green-700' : 'text-gray-700'}>
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

const ALL_STATUSES: AssetStatus[] = ['Pending Review', 'Ready to Upload', 'Live / Running', 'Expired', 'Needs Refresh / Missing', 'Pulled', 'Removed by Request']

const selectCls = "border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
const activeSelectCls = "border-blue-400 ring-1 ring-blue-300 rounded-lg px-2.5 py-1.5 text-sm text-blue-700 bg-blue-50 focus:outline-none"

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  assets:   Asset[]
  products: ClientProduct[]
}

export default function AssetTable({ assets, products }: Props) {
  const [editMode, setEditMode] = useState(false)
  const [pending, setPending]   = useState<Record<string, PendingChange>>({})
  const [saving, setSaving]     = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const [selectedProductId,   setSelectedProductId]   = useState<string>('')
  const [selectedCreator,     setSelectedCreator]     = useState<string>('')
  const [selectedStatus,      setSelectedStatus]      = useState<string>('')
  const [selectedContentType, setSelectedContentType] = useState<string>('')
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc')

  const [localAssets, setLocalAssets] = useState<Asset[]>(assets)

  const creatorOptions = useMemo(() =>
    [...new Set(localAssets.map(a => a.posted_by).filter(Boolean) as string[])].sort()
  , [localAssets])

  const contentTypeOptions = useMemo(() =>
    [...new Set(localAssets.map(a => a.content_type).filter(Boolean) as string[])].sort()
  , [localAssets])

  const filteredAssets = useMemo(() => {
    let result = localAssets
    if (selectedProductId)   result = result.filter(a => a.product_id === selectedProductId)
    if (selectedCreator)     result = result.filter(a => a.posted_by === selectedCreator)
    if (selectedStatus)      result = result.filter(a => a.status === selectedStatus)
    if (selectedContentType) result = result.filter(a => a.content_type === selectedContentType)
    return [...result].sort((a, b) => {
      const da = a.date_added ?? ''
      const db = b.date_added ?? ''
      return dateSort === 'desc' ? db.localeCompare(da) : da.localeCompare(db)
    })
  }, [localAssets, selectedProductId, selectedCreator, selectedStatus, selectedContentType, dateSort])

  // Split: pending review queue vs active assets
  const pendingReview = filteredAssets.filter(a => a.status === 'Pending Review')
  const activeAssets  = filteredAssets.filter(a => ACTIVE_STATUSES.includes(a.status))

  const byStage: Record<Stage, Asset[]> = {
    Awareness:     activeAssets.filter(a => a.stage === 'Awareness'),
    Consideration: activeAssets.filter(a => a.stage === 'Consideration'),
    Conversion:    activeAssets.filter(a => a.stage === 'Conversion'),
  }

  const activeFilterCount = [selectedProductId, selectedCreator, selectedStatus, selectedContentType].filter(Boolean).length
  const clearFilters = () => {
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

  // ── Inline status change ─────────────────────────────────────────────────────
  const handleStatusChange = async (assetId: string, newStatus: AssetStatus) => {
    const body: Record<string, string> = { status: newStatus }
    if (newStatus === 'Live / Running') {
      body.date_live = new Date().toISOString().split('T')[0]
    }
    setLocalAssets(prev => prev.map(a =>
      a.id === assetId
        ? { ...a, status: newStatus, ...(body.date_live ? { date_live: body.date_live } : {}) }
        : a
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
      <tr key={asset.id} className={`${i % 2 === 0 ? 'bg-white' : rowBg} hover:bg-gray-50`}>

        {/* Product */}
        <td className="px-3 py-2">
          {editMode ? (
            <select value={curProdId ?? ''} onChange={e => setPendingField(asset.id, 'product_id', e.target.value)}
              className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <span className="text-gray-700 font-medium text-xs">{(asset.product as Product)?.name ?? '—'}</span>
          )}
        </td>

        {/* Asset Name */}
        <td className="px-3 py-2 text-gray-900 font-medium text-sm">{asset.asset_name}</td>

        {/* Content Type */}
        <td className="px-3 py-2">
          {editMode ? (
            <select value={curType ?? ''} onChange={e => setPendingField(asset.id, 'content_type', e.target.value || null)}
              className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">—</option>
              {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <span className="text-gray-600 text-xs">{asset.content_type ?? '—'}</span>
          )}
        </td>

        {/* Status — click to change */}
        <td className="px-3 py-2">
          <StatusDropdown asset={asset} onStatusChange={handleStatusChange} />
        </td>

        {/* Date */}
        <td className="px-3 py-2 text-gray-500 text-xs">{fmt(asset.date_added)}</td>

        {/* Posted By */}
        <td className="px-3 py-2">
          {editMode ? (
            <input type="text" value={curBy ?? ''} onChange={e => setPendingField(asset.id, 'posted_by', e.target.value || null)}
              placeholder="Creator name"
              className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          ) : (
            <span className="text-gray-500 text-xs">{asset.posted_by ?? '—'}</span>
          )}
        </td>

        {/* Freshness */}
        <td className="px-3 py-2"><FreshnessMeter dateLive={asset.date_live ?? null} status={asset.status} /></td>

        {/* Stage (edit mode only) */}
        {editMode && (
          <td className="px-3 py-2">
            <select value={curStage} onChange={e => setPendingField(asset.id, 'stage', e.target.value)}
              className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
              {['Awareness', 'Consideration', 'Conversion'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </td>
        )}

        {/* Notes */}
        <td className="px-3 py-2"><NotesCell value={asset.notes} assetId={asset.id} /></td>
      </tr>
    )
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
          className={selectedStatus ? activeSelectCls : selectCls}>
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={selectedContentType} onChange={e => setSelectedContentType(e.target.value)}
          className={selectedContentType ? activeSelectCls : selectCls}>
          <option value="">All Types</option>
          {contentTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-700 underline">
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {savedMsg && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
          {editMode ? (
            <>
              <button onClick={handleCancel} disabled={saving}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-50">
                {saving ? 'Saving…' : `Save${Object.keys(pending).length ? ` (${Object.keys(pending).length})` : ''}`}
              </button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)}
              className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50">
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      {/* Pending Review queue */}
      {pendingReview.length > 0 && (
        <div className="mb-6">
          <div className="bg-violet-50 border border-violet-200 rounded-t-lg px-4 py-2.5 flex items-center justify-between">
            <div>
              <span className="font-semibold text-violet-900">Pending Review</span>
              <span className="ml-2 text-xs text-violet-600">— awaiting Libby&apos;s ✅ or ❌ in Slack</span>
            </div>
            <span className="text-xs text-violet-500">{pendingReview.length} asset{pendingReview.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-t-0 border-violet-200 rounded-b-lg overflow-hidden">
              <thead>
                <tr className="bg-violet-50 border-b border-violet-100 text-xs text-violet-700 uppercase tracking-wide">
                  <th className="text-left px-3 py-2 w-36">Product</th>
                  <th className="text-left px-3 py-2">Asset Name</th>
                  <th className="text-left px-3 py-2 w-36">Content Type</th>
                  <th className="text-left px-3 py-2 w-36">Status</th>
                  <th className="text-left px-3 py-2 w-24">Date</th>
                  <th className="text-left px-3 py-2 w-28">Posted By</th>
                  {editMode && <th className="text-left px-3 py-2 w-32">Stage</th>}
                  <th className="text-left px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100">
                {pendingReview.map((asset, i) => renderRow(asset, i, 'bg-violet-50/30'))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stage tables — active assets only */}
      {STAGES.map(stage => {
        const stageAssets = byStage[stage]
        const cfg = STAGE_CONFIG[stage]
        return (
          <div key={stage} className="mb-8">
            <div className={`${cfg.headerBg} text-white px-4 py-2.5 rounded-t-lg flex items-center justify-between`}>
              <div>
                <span className="font-semibold">{cfg.label}</span>
                <span className="ml-2 text-xs opacity-80">— {cfg.description}</span>
              </div>
              <span className="text-xs opacity-80">{stageAssets.length} asset{stageAssets.length !== 1 ? 's' : ''}</span>
            </div>
            {stageAssets.length === 0 ? (
              <div className={`${cfg.lightBg} border border-t-0 ${cfg.border} rounded-b-lg px-4 py-6 text-center text-sm text-gray-500`}>
                {activeFilterCount > 0 ? 'No assets match the current filters' : 'No assets yet — add via Slack or manually'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
                  <thead>
                    <tr className={`${cfg.lightBg} border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide`}>
                      <th className="text-left px-3 py-2 w-36">Product</th>
                      <th className="text-left px-3 py-2">Asset Name</th>
                      <th className="text-left px-3 py-2 w-36">Content Type</th>
                      <th className="text-left px-3 py-2 w-36">Status</th>
                      <th className="text-left px-3 py-2 w-24">
                        <button onClick={() => setDateSort(d => d === 'desc' ? 'asc' : 'desc')}
                          className="flex items-center gap-1 hover:text-gray-800 font-semibold uppercase tracking-wide" title="Toggle date sort">
                          Date <span className="text-gray-400">{dateSort === 'desc' ? '↓' : '↑'}</span>
                        </button>
                      </th>
                      <th className="text-left px-3 py-2 w-28">Posted By</th>
                      <th className="text-left px-3 py-2 w-24">Freshness</th>
                      {editMode && <th className="text-left px-3 py-2 w-32">Stage</th>}
                      <th className="text-left px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stageAssets.map((asset, i) => renderRow(asset, i, cfg.rowBg))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
