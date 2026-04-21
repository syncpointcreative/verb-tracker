'use client'

import { useState, useRef, useMemo } from 'react'
import { STAGE_CONFIG, STAGES, STATUS_CONFIG } from '@/lib/constants'
import type { Asset, Product, Stage } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientProduct { id: string; name: string; sort_order: number }

interface PendingChange {
  product_id?:   string
  content_type?: string | null
  posted_by?:    string | null
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
  // Only count once the asset is live — show neutral state otherwise
  if (status === 'Ready to Upload' || !dateLive) {
    return <span className="text-gray-300 text-xs">Not live yet</span>
  }

  const days = Math.floor((Date.now() - new Date(dateLive + 'T12:00:00').getTime()) / 86_400_000)
  const tier = FRESHNESS.find(t => days <= t.maxDays) ?? FRESHNESS[FRESHNESS.length - 1]
  const pct  = Math.min(100, Math.round((days / 30) * 100)) // 30 days = full bar

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
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ notes: local || null }),
    })
    original.current = local
    setSaving(false)
  }

  return (
    <input
      type="text"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="Add a note…"
      disabled={saving}
      className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none px-0 py-0.5 text-xs text-gray-600 placeholder-gray-300 disabled:opacity-50"
    />
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

const ALL_STATUSES = ['Ready to Upload', 'Live / Running', 'Expired', 'Needs Refresh / Missing']

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

  // ── Filters & sort ──
  const [selectedProductId,   setSelectedProductId]   = useState<string>('')
  const [selectedCreator,     setSelectedCreator]     = useState<string>('')
  const [selectedStatus,      setSelectedStatus]      = useState<string>('')
  const [selectedContentType, setSelectedContentType] = useState<string>('')
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc') // default: newest first

  const [localAssets, setLocalAssets] = useState<Asset[]>(assets)

  // Derive unique creator options from actual data
  const creatorOptions = useMemo(() =>
    [...new Set(localAssets.map(a => a.posted_by).filter(Boolean) as string[])].sort()
  , [localAssets])

  // Derive unique content type options from actual data
  const contentTypeOptions = useMemo(() =>
    [...new Set(localAssets.map(a => a.content_type).filter(Boolean) as string[])].sort()
  , [localAssets])

  // Apply all filters then sort
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

  const byStage: Record<Stage, Asset[]> = {
    Awareness:     filteredAssets.filter(a => a.stage === 'Awareness'),
    Consideration: filteredAssets.filter(a => a.stage === 'Consideration'),
    Conversion:    filteredAssets.filter(a => a.stage === 'Conversion'),
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
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(changes),
      })
    ))

    setLocalAssets(prev => prev.map(a => {
      const change = pending[a.id]
      if (!change) return a
      const updated = { ...a, ...change }
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

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Product */}
        {products.length > 1 && (
          <select
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
            className={selectedProductId ? activeSelectCls : selectCls}
          >
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {/* Creator */}
        <select
          value={selectedCreator}
          onChange={e => setSelectedCreator(e.target.value)}
          className={selectedCreator ? activeSelectCls : selectCls}
        >
          <option value="">All Creators</option>
          {creatorOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status */}
        <select
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          className={selectedStatus ? activeSelectCls : selectCls}
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Content Type */}
        <select
          value={selectedContentType}
          onChange={e => setSelectedContentType(e.target.value)}
          className={selectedContentType ? activeSelectCls : selectCls}
        >
          <option value="">All Types</option>
          {contentTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}

        {/* Spacer + Edit controls */}
        <div className="flex items-center gap-2 ml-auto">
          {savedMsg && <span className="text-xs text-green-600 font-medium">Saved ✓</span>}
          {editMode ? (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Saving…' : `Save Changes${Object.keys(pending).length ? ` (${Object.keys(pending).length})` : ''}`}
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50"
            >
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      {/* Stage tables */}
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
                      <th className="text-left px-3 py-2 w-24">Status</th>
                      <th className="text-left px-3 py-2 w-24">
                        <button
                          onClick={() => setDateSort(d => d === 'desc' ? 'asc' : 'desc')}
                          className="flex items-center gap-1 hover:text-gray-800 font-semibold uppercase tracking-wide"
                          title="Toggle date sort"
                        >
                          Date
                          <span className="text-gray-400">{dateSort === 'desc' ? '↓' : '↑'}</span>
                        </button>
                      </th>
                      <th className="text-left px-3 py-2 w-28">Posted By</th>
                      <th className="text-left px-3 py-2 w-24">Freshness</th>
                      <th className="text-left px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stageAssets.map((asset, i) => {
                      const statusCfg = STATUS_CONFIG[asset.status]
                      const change    = pending[asset.id] ?? {}
                      const curProdId = change.product_id   ?? asset.product_id
                      const curType   = change.content_type !== undefined ? change.content_type : asset.content_type
                      const curBy     = change.posted_by    !== undefined ? change.posted_by    : asset.posted_by
                      return (
                        <tr key={asset.id} className={`${i % 2 === 0 ? 'bg-white' : cfg.rowBg} hover:bg-gray-50`}>

                          {/* Product */}
                          <td className="px-3 py-2">
                            {editMode ? (
                              <select
                                value={curProdId ?? ''}
                                onChange={e => setPendingField(asset.id, 'product_id', e.target.value)}
                                className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                              >
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            ) : (
                              <span className="text-gray-700 font-medium text-xs">
                                {(asset.product as Product)?.name ?? '—'}
                              </span>
                            )}
                          </td>

                          {/* Asset Name */}
                          <td className="px-3 py-2 text-gray-900 font-medium text-sm">{asset.asset_name}</td>

                          {/* Content Type */}
                          <td className="px-3 py-2">
                            {editMode ? (
                              <select
                                value={curType ?? ''}
                                onChange={e => setPendingField(asset.id, 'content_type', e.target.value || null)}
                                className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                              >
                                <option value="">—</option>
                                {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            ) : (
                              <span className="text-gray-600 text-xs">{asset.content_type ?? '—'}</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                              {asset.status}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="px-3 py-2 text-gray-500 text-xs">{fmt(asset.date_added)}</td>

                          {/* Posted By */}
                          <td className="px-3 py-2">
                            {editMode ? (
                              <input
                                type="text"
                                value={curBy ?? ''}
                                onChange={e => setPendingField(asset.id, 'posted_by', e.target.value || null)}
                                placeholder="Creator name"
                                className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            ) : (
                              <span className="text-gray-500 text-xs">{asset.posted_by ?? '—'}</span>
                            )}
                          </td>

                          {/* Freshness */}
                          <td className="px-3 py-2"><FreshnessMeter dateLive={asset.date_live ?? null} status={asset.status} /></td>

                          {/* Notes */}
                          <td className="px-3 py-2"><NotesCell value={asset.notes} assetId={asset.id} /></td>
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
    </div>
  )
}
