'use client'

import { useState, useRef } from 'react'
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
  { maxDays: 14,       label: 'Fresh',        bar: 'bg-green-400',  text: 'text-green-700',  track: 'bg-green-100'  },
  { maxDays: 30,       label: 'Monitor',      bar: 'bg-yellow-400', text: 'text-yellow-700', track: 'bg-yellow-100' },
  { maxDays: 60,       label: 'Refresh Soon', bar: 'bg-orange-400', text: 'text-orange-700', track: 'bg-orange-100' },
  { maxDays: 90,       label: 'Stale',        bar: 'bg-red-400',    text: 'text-red-700',    track: 'bg-red-100'    },
  { maxDays: Infinity, label: 'Expired',      bar: 'bg-gray-400',   text: 'text-gray-500',   track: 'bg-gray-100'   },
]

function FreshnessMeter({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-gray-300 text-xs">—</span>
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  const tier = FRESHNESS.find(t => days <= t.maxDays) ?? FRESHNESS[4]
  const pct  = Math.min(100, Math.round((days / 90) * 100))
  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold ${tier.text}`}>{tier.label}</span>
        <span className="text-[10px] text-gray-400">{days}d</span>
      </div>
      <div className={`h-1.5 rounded-full ${tier.track} overflow-hidden`}>
        <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Inline editable notes cell (always editable) ────────────────────────────

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
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

const CONTENT_TYPES = [
  'UGC', 'Brand / Lifestyle', 'Product Demo', 'Creator-Led',
  'Testimonial / Review', 'Tutorial / How-To', 'Trend-Led', 'Promotional',
]

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  assets:   Asset[]
  products: ClientProduct[]   // all products for this client, for the dropdown
}

export default function AssetTable({ assets, products }: Props) {
  const [editMode, setEditMode]       = useState(false)
  const [pending, setPending]         = useState<Record<string, PendingChange>>({})
  const [saving, setSaving]           = useState(false)
  const [savedMsg, setSavedMsg]       = useState(false)

  // Track local display state after saves so UI stays fresh without a full reload
  const [localAssets, setLocalAssets] = useState<Asset[]>(assets)

  const byStage: Record<Stage, Asset[]> = {
    Awareness:     localAssets.filter(a => a.stage === 'Awareness'),
    Consideration: localAssets.filter(a => a.stage === 'Consideration'),
    Conversion:    localAssets.filter(a => a.stage === 'Conversion'),
  }

  const setPendingField = (id: string, field: keyof PendingChange, value: string | null) => {
    setPending(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const handleCancel = () => {
    setPending({})
    setEditMode(false)
  }

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

    // Apply changes to local state so the table updates immediately
    setLocalAssets(prev => prev.map(a => {
      const change = pending[a.id]
      if (!change) return a
      const updated = { ...a, ...change }
      // Update the product display object if product_id changed
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
      {/* Edit / Save / Cancel controls */}
      <div className="flex items-center justify-end gap-2 mb-4">
        {savedMsg && (
          <span className="text-xs text-green-600 font-medium">Saved ✓</span>
        )}
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
                No assets yet — add via Slack or manually
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
                      <th className="text-left px-3 py-2 w-24">Date</th>
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
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-700 font-medium text-xs">
                                {(asset.product as Product)?.name ?? '—'}
                              </span>
                            )}
                          </td>

                          {/* Asset Name (read-only on client page) */}
                          <td className="px-3 py-2 text-gray-900 font-medium text-sm">
                            {asset.asset_name}
                          </td>

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

                          {/* Status (always read-only here — edit in Admin) */}
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
                          <td className="px-3 py-2">
                            <FreshnessMeter dateStr={asset.date_added} />
                          </td>

                          {/* Notes (always editable) */}
                          <td className="px-3 py-2">
                            <NotesCell value={asset.notes} assetId={asset.id} />
                          </td>
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
