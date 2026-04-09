'use client'

import { useState, useRef } from 'react'
import { STAGE_CONFIG, STAGES, STATUS_CONFIG } from '@/lib/constants'
import type { Asset, Product, Stage } from '@/lib/supabase'

// ─── Freshness meter ──────────────────────────────────────────────────────────

const FRESHNESS_THRESHOLDS = [
  { maxDays: 14, label: 'Fresh',        bar: 'bg-green-400',  text: 'text-green-700',  track: 'bg-green-100' },
  { maxDays: 30, label: 'Monitor',      bar: 'bg-yellow-400', text: 'text-yellow-700', track: 'bg-yellow-100' },
  { maxDays: 60, label: 'Refresh Soon', bar: 'bg-orange-400', text: 'text-orange-700', track: 'bg-orange-100' },
  { maxDays: 90, label: 'Stale',        bar: 'bg-red-400',    text: 'text-red-700',    track: 'bg-red-100' },
  { maxDays: Infinity, label: 'Expired', bar: 'bg-gray-400',  text: 'text-gray-600',   track: 'bg-gray-100' },
]

function FreshnessMeter({ dateStr }: { dateStr: string | null }) {
  if (!dateStr) return <span className="text-gray-300 text-xs">—</span>

  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  const tier = FRESHNESS_THRESHOLDS.find(t => days <= t.maxDays) ?? FRESHNESS_THRESHOLDS[4]

  // Fill % within the 90-day window (caps at 100)
  const pct = Math.min(100, Math.round((days / 90) * 100))

  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold ${tier.text}`}>{tier.label}</span>
        <span className="text-[10px] text-gray-400">{days}d</span>
      </div>
      <div className={`h-1.5 rounded-full ${tier.track} overflow-hidden`}>
        <div
          className={`h-full rounded-full ${tier.bar} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Inline editable cell ─────────────────────────────────────────────────────

function EditableCell({
  value,
  assetId,
  field,
  placeholder,
  className = '',
}: {
  value: string | null
  assetId: string
  field: 'notes' | 'asset_name'
  placeholder?: string
  className?: string
}) {
  const [local, setLocal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const original = useRef(value ?? '')

  const save = async () => {
    if (local === original.current) return
    setSaving(true)
    await fetch(`/api/assets?id=${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: local || null }),
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
      placeholder={placeholder}
      disabled={saving}
      className={`w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none px-0 py-0.5 text-xs placeholder-gray-300 disabled:opacity-50 transition-colors ${className}`}
    />
  )
}

// ─── Asset Table ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

interface Props {
  assets: Asset[]
}

export default function AssetTable({ assets }: Props) {
  const byStage: Record<Stage, Asset[]> = {
    Awareness:     assets.filter(a => a.stage === 'Awareness'),
    Consideration: assets.filter(a => a.stage === 'Consideration'),
    Conversion:    assets.filter(a => a.stage === 'Conversion'),
  }

  return (
    <>
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
                      <th className="text-left px-3 py-2 w-32">Product</th>
                      <th className="text-left px-3 py-2">Asset Name</th>
                      <th className="text-left px-3 py-2 w-28">Content Type</th>
                      <th className="text-left px-3 py-2 w-24">Status</th>
                      <th className="text-left px-3 py-2 w-24">Date Added</th>
                      <th className="text-left px-3 py-2 w-24">Posted By</th>
                      <th className="text-left px-3 py-2 w-24">Freshness</th>
                      <th className="text-left px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stageAssets.map((asset, i) => {
                      const statusCfg = STATUS_CONFIG[asset.status]
                      return (
                        <tr
                          key={asset.id}
                          className={`${i % 2 === 0 ? 'bg-white' : cfg.rowBg} hover:bg-gray-50`}
                        >
                          <td className="px-3 py-2 text-gray-700 font-medium text-xs">
                            {(asset.product as Product)?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-900 font-medium">
                            {asset.asset_name}
                          </td>
                          <td className="px-3 py-2 text-gray-600 text-xs">{asset.content_type ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                              {asset.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(asset.date_added)}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{asset.posted_by ?? '—'}</td>
                          <td className="px-3 py-2">
                            <FreshnessMeter dateStr={asset.date_added} />
                          </td>
                          <td className="px-3 py-2">
                            <EditableCell
                              value={asset.notes}
                              assetId={asset.id}
                              field="notes"
                              placeholder="Add a note…"
                              className="text-gray-600"
                            />
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
    </>
  )
}
