'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { Asset, Product } from '@/lib/supabase'
import type { Stage, AssetStatus } from '@/lib/supabase'
import { STAGES, STATUS_CONFIG } from '@/lib/constants'
import { daysLive } from '@/lib/freshness'
import { AssetPreviewModal } from '@/components/AssetPreviewModal'

interface Campaign { id: string; name: string; tiktok_campaign_id?: string | null }

interface Props {
  assets: Asset[]
  campaigns: Campaign[]
  clientId: string
  initialStatus?: string | null
  onStatusChange?: (id: string, newStatus: AssetStatus, updatedAsset?: Asset) => void
}

// ── Freshness ────────────────────────────────────────────────────────────────

function getFreshness(asset: Asset): { days: number } | 'not-live' | 'paused' | null {
  if (['Pulled', 'Removed by Request', 'Pending Review'].includes(asset.status)) return null
  if (asset.status === 'Paused') return 'paused'
  if (!asset.date_live) return 'not-live'
  const days = daysLive(asset.date_live)
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
        <div className="bg-[#3b2b52] rounded-t-2xl px-5 py-4">
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
                    ? 'bg-[#3b2b52] text-white border-[#3b2b52] shadow-sm'
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
              className="flex-1 text-xs py-2.5 rounded-xl bg-[#3b2b52] text-white hover:bg-[#4c3a6b] transition-colors disabled:opacity-50"
            >
              {saving ? 'Pulling…' : 'Confirm Pull'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Approval Modal ────────────────────────────────────────────────────────────

function ApprovalModal({
  asset,
  onConfirm,
  onCancel,
}: {
  asset: Asset
  onConfirm: (adOnly: boolean) => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function choose(adOnly: boolean) {
    setSaving(true)
    await onConfirm(adOnly)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#3b2b52] rounded-t-2xl px-5 py-4">
          <p className="text-[10px] text-white/40 tracking-widest uppercase mb-1">Approve asset</p>
          <p className="font-serif text-white text-base leading-snug line-clamp-2">{asset.asset_name}</p>
        </div>

        <div className="px-5 py-5">
          <p className="text-xs text-stone-500 mb-4 leading-relaxed">
            Does this asset count toward the monthly delivery total, or is it approved for ads use only?
          </p>

          <div className="flex flex-col gap-2.5 mb-5">
            {/* Ads + Counter */}
            <button
              onClick={() => choose(false)}
              disabled={saving}
              className="w-full text-left px-4 py-3.5 rounded-xl border-2 border-[#3b2b52] bg-[#3b2b52] text-white hover:bg-[#4c3a6b] transition-colors disabled:opacity-50"
            >
              <div className="font-medium text-sm mb-0.5">✅ Ads + Counter</div>
              <div className="text-[11px] text-white/60">Approved for ads and counts toward the monthly total</div>
            </button>

            {/* Ads Only */}
            <button
              onClick={() => choose(true)}
              disabled={saving}
              className="w-full text-left px-4 py-3.5 rounded-xl border-2 border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50 transition-colors disabled:opacity-50"
            >
              <div className="font-medium text-sm mb-0.5">✔️ Ads Only</div>
              <div className="text-[11px] text-stone-400">Approved for ads but does not count toward the monthly total</div>
            </button>
          </div>

          <button
            onClick={onCancel}
            className="w-full text-xs py-2 text-stone-400 hover:text-stone-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Freshness Reset Dialog ────────────────────────────────────────────────────

function FreshnessResetDialog({
  assetName,
  existingDateLive,
  onReset,
  onKeep,
  onCancel,
}: {
  assetName: string
  existingDateLive: string
  onReset: () => void
  onKeep: () => void
  onCancel: () => void
}) {
  const [saving, setSaving] = useState(false)

  const daysOld = daysLive(existingDateLive)

  async function handle(action: () => void) {
    setSaving(true)
    action()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#3b2b52] rounded-t-2xl px-5 py-4">
          <p className="text-[10px] text-white/40 tracking-widest uppercase mb-1">Restore asset</p>
          <p className="font-serif text-white text-base leading-snug line-clamp-2">{assetName}</p>
        </div>

        <div className="px-5 py-5">
          <p className="text-xs text-stone-500 mb-1 leading-relaxed">
            This asset was last live <span className="font-medium text-stone-700">{daysOld}d ago</span>. Reset its freshness counter?
          </p>
          <p className="text-[11px] text-stone-400 mb-4 leading-relaxed italic">
            Resetting treats this as a brand-new run, so freshness starts at day 0.
          </p>

          <div className="flex flex-col gap-2.5 mb-5">
            <button
              onClick={() => handle(onReset)}
              disabled={saving}
              className="w-full text-left px-4 py-3.5 rounded-xl border-2 border-[#3b2b52] bg-[#3b2b52] text-white hover:bg-[#4c3a6b] transition-colors disabled:opacity-50"
            >
              <div className="font-medium text-sm mb-0.5">🔄 Reset Freshness</div>
              <div className="text-[11px] text-white/60">Start the freshness clock from today</div>
            </button>

            <button
              onClick={() => handle(onKeep)}
              disabled={saving}
              className="w-full text-left px-4 py-3.5 rounded-xl border-2 border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50 transition-colors disabled:opacity-50"
            >
              <div className="font-medium text-sm mb-0.5">⏳ Keep Existing</div>
              <div className="text-[11px] text-stone-400">Continue from where it left off ({daysOld}d old)</div>
            </button>
          </div>

          <button
            onClick={onCancel}
            className="w-full text-xs py-2 text-stone-400 hover:text-stone-600 transition-colors"
          >
            Cancel
          </button>
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

// ── Campaign Picker ───────────────────────────────────────────────────────────

function CampaignPicker({
  asset,
  campaigns,
  onToggle,
  onClose,
}: {
  asset: Asset
  campaigns: Campaign[]
  onToggle: (name: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const assigned = new Set(asset.campaigns ?? [])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-30 bg-white border border-stone-200 rounded-xl shadow-xl py-1.5 min-w-[200px] max-w-[240px]"
      onClick={e => e.stopPropagation()}
    >
      <p className="text-[9px] font-semibold tracking-widest text-stone-400 uppercase px-3 pb-1 pt-0.5">Campaigns</p>
      {campaigns.length === 0 ? (
        <p className="text-[11px] text-stone-300 px-3 py-1 italic">No campaigns yet</p>
      ) : (
        campaigns.map(c => {
          const active = assigned.has(c.name)
          return (
            <button
              key={c.id}
              onClick={() => onToggle(c.name)}
              className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 transition-colors hover:bg-stone-50 ${active ? 'text-indigo-700' : 'text-stone-600'}`}
            >
              <span className={`w-3 h-3 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-stone-300'}`}>
                {active && <span className="text-[8px] leading-none">✓</span>}
              </span>
              <span className="truncate">{c.name}</span>
            </button>
          )
        })
      )}
      <div className="border-t border-stone-100 mt-1 pt-1 px-2">
        <form
          onSubmit={e => {
            e.preventDefault()
            if (newName.trim()) { onToggle(newName.trim()); setNewName('') }
          }}
          className="flex items-center gap-1"
        >
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New campaign…"
            className="flex-1 text-[11px] border border-stone-200 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-400 placeholder:text-stone-300 min-w-0"
          />
          <button
            type="submit"
            className="text-[11px] px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex-shrink-0"
          >+</button>
        </form>
      </div>
    </div>
  )
}

// ── Asset Card ────────────────────────────────────────────────────────────────

interface CardProps {
  asset: Asset
  campaigns: Campaign[]
  onStatusChange: (id: string, newStatus: AssetStatus) => void
  onPullRequest: (asset: Asset) => void
  onApprovalRequest: (asset: Asset) => void
  onCampaignToggle: (id: string, campaignName: string) => void
  onPreview: (asset: Asset) => void
}

function AssetCard({ asset, campaigns, onStatusChange, onPullRequest, onApprovalRequest, onCampaignToggle, onPreview }: CardProps) {
  const product = asset.product as Product | null
  const cfg = STATUS_CONFIG[asset.status]
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)

  function handleStatusSelect(s: AssetStatus) {
    setDropdownOpen(false)
    if (s === 'Pulled') {
      onPullRequest(asset)
    } else if (s === 'Ready to Upload' && asset.status === 'Pending Review') {
      // Intercept: ask whether this counts toward the monthly counter
      onApprovalRequest(asset)
    } else {
      onStatusChange(asset.id, s)
    }
  }

  const showLiveDatePrompt = asset.status === 'Ready to Upload'

  const assignedCampaigns = asset.campaigns ?? []

  return (
    <div className="bg-[#f0d7c0] border border-stone-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-stone-300 transition-all group">

      {/* Row 1: Status + Freshness */}
      <div className="flex items-start justify-between gap-2 mb-2">
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
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {asset.ad_only && (
            <span className="text-[9px] font-semibold tracking-wide text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 uppercase">
              Ads Only
            </span>
          )}
          <FreshnessPill asset={asset} />
        </div>
      </div>

      {/* Row 2: Asset name */}
      <button
        onClick={() => onPreview(asset)}
        className="text-left font-serif text-base font-light text-[#3b2b52] leading-snug mb-1.5 hover:text-[#d4865e] transition-colors w-full group/name"
        title="Click to preview"
      >
        {asset.asset_name || '—'}
        <span className="opacity-0 group-hover/name:opacity-40 text-[10px] ml-1.5 align-middle transition-opacity">▶</span>
      </button>

      {/* Row 3: Campaign tags */}
      <div className="relative flex items-center gap-1 flex-wrap mb-2">
        {assignedCampaigns.map(name => (
          <span key={name} className="inline-flex items-center gap-1 text-[9px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5">
            {name}
          </span>
        ))}
        <button
          onClick={() => setCampaignOpen(v => !v)}
          className="text-[9px] text-stone-400 hover:text-indigo-600 transition-colors px-1.5 py-0.5 rounded-full hover:bg-indigo-50 border border-transparent hover:border-indigo-200"
          title="Assign campaigns"
        >
          {assignedCampaigns.length === 0 ? '+ campaign' : '+'}
        </button>
        {campaignOpen && (
          <CampaignPicker
            asset={asset}
            campaigns={campaigns}
            onToggle={name => onCampaignToggle(asset.id, name)}
            onClose={() => setCampaignOpen(false)}
          />
        )}
      </div>

      {/* Row 4: Product + meta + dates */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          {product && (
            <p className="text-[11px] text-[#d4865e] tracking-wide truncate mb-1">{product.name}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {asset.content_type && (
              <span className="text-[10px] text-stone-500 bg-stone-100 rounded-md px-1.5 py-0.5">{asset.content_type}</span>
            )}
            {asset.posted_by && (
              <span className="text-[10px] text-stone-400 truncate">{asset.posted_by}</span>
            )}
            {asset.performance && (
              <span className="text-[10px] text-stone-400 italic">
                {asset.performance === 'High Performer' ? '🔥' : asset.performance === 'Average Performer' ? '👍' : '❌'}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          {asset.date_live ? (
            <>
              <span className="text-[10px] text-stone-400">
                Live {new Date(asset.date_live + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {asset.first_live && (
                <span className="text-[9px] text-stone-300 italic">
                  First {new Date(asset.first_live + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                </span>
              )}
            </>
          ) : showLiveDatePrompt ? (
            <span className="text-[10px] text-stone-300 italic">ready</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  assets,
  campaigns,
  onStatusChange,
  onPullRequest,
  onApprovalRequest,
  onCampaignToggle,
  onPreview,
}: {
  stage: Stage
  assets: Asset[]
  campaigns: Campaign[]
  onStatusChange: (id: string, newStatus: AssetStatus) => void
  onPullRequest: (asset: Asset) => void
  onApprovalRequest: (asset: Asset) => void
  onCampaignToggle: (id: string, name: string) => void
  onPreview: (asset: Asset) => void
}) {
  const col = COLUMN[stage]

  return (
    <div className="flex flex-col min-w-0">
      <div className="bg-[#3b2b52] rounded-xl px-4 py-3 mb-3 flex-shrink-0">
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
              campaigns={campaigns}
              onStatusChange={onStatusChange}
              onPullRequest={onPullRequest}
              onApprovalRequest={onApprovalRequest}
              onCampaignToggle={onCampaignToggle}
              onPreview={onPreview}
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
            ? 'bg-[#3b2b52] text-[#f0d7c0] border-[#3b2b52]'
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

export default function KanbanBoard({ assets: initialAssets, campaigns: initialCampaigns, clientId, initialStatus, onStatusChange: notifyParent }: Props) {
  const [localAssets, setLocalAssets]       = useState<Asset[]>(initialAssets)
  const [localCampaigns, setLocalCampaigns] = useState<Campaign[]>(initialCampaigns)
  const [statusFilter, setStatusFilter]     = useState<string | null>(initialStatus ?? null)
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null)
  const [mobileStage, setMobileStage]       = useState<Stage>('Awareness')
  const [pullTarget, setPullTarget]         = useState<Asset | null>(null)
  const [approvalTarget, setApprovalTarget] = useState<Asset | null>(null)
  const [previewTarget, setPreviewTarget]   = useState<Asset | null>(null)
  const [freshnessTarget, setFreshnessTarget] = useState<{ id: string; assetName: string; existingDateLive: string } | null>(null)
  const [toast, setToast]                   = useState<string | null>(null)

  // Keep local state in sync if the parent re-renders with new data
  useEffect(() => { setLocalAssets(initialAssets) }, [initialAssets])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // ── Optimistic status update ─────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, newStatus: AssetStatus) => {
    const today = new Date().toISOString().split('T')[0]

    // Intercept Live/Running for assets that already have a date_live (not resuming from Paused)
    if (newStatus === 'Live / Running') {
      const asset = localAssets.find(a => a.id === id)
      if (asset && asset.date_live && asset.status !== 'Paused') {
        setFreshnessTarget({ id, assetName: asset.asset_name, existingDateLive: asset.date_live })
        return
      }
    }

    // Optimistically update local state — also stamp date_live immediately
    // for any Live/Running reactivation (except resuming from Paused) so the
    // freshness pill updates before the server responds.
    setLocalAssets(prev =>
      prev.map(a => {
        if (a.id !== id) return a
        const isReactivation = newStatus === 'Live / Running' && a.status !== 'Paused'
        return {
          ...a,
          status: newStatus,
          ...(isReactivation && a.date_live
            ? { date_live: today, first_live: a.first_live ?? a.date_live }
            : {}),
          ...(isReactivation && !a.date_live
            ? { date_live: today }
            : {}),
        }
      })
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
      notifyParent?.(id, newStatus, updated)
      showToast(`Marked ${newStatus}`)
    } catch {
      // Revert on failure
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...a, status: a.status } : a))
      showToast('Update failed — please try again')
    }
  }, [notifyParent, localAssets])

  // ── Freshness reset confirm ──────────────────────────────────────────────
  const handleFreshnessConfirm = useCallback(async (reset: boolean) => {
    if (!freshnessTarget) return
    const { id, existingDateLive } = freshnessTarget
    const today = new Date().toISOString().split('T')[0]
    const dateLive = reset ? today : existingDateLive

    setFreshnessTarget(null)

    // Optimistic update
    setLocalAssets(prev =>
      prev.map(a => {
        if (a.id !== id) return a
        return {
          ...a,
          status: 'Live / Running',
          date_live: dateLive,
          ...(reset ? { first_live: a.first_live ?? a.date_live } : {}),
        }
      })
    )

    try {
      // Pass date_live explicitly so the server's auto-stamp logic is bypassed
      const res = await fetch(`/api/assets?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Live / Running', date_live: dateLive }),
      })
      if (!res.ok) throw new Error('Failed')
      const updated: Asset = await res.json()
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...updated, product: a.product, client: a.client } : a))
      notifyParent?.(id, 'Live / Running', updated)
      showToast(reset ? 'Freshness reset — clock starts today ✓' : 'Back live — keeping original date ✓')
    } catch {
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...a, status: a.status } : a))
      showToast('Update failed — please try again')
    }
  }, [freshnessTarget, notifyParent])

  // ── Approve from app (with counter choice) ──────────────────────────────
  const handleApproval = useCallback(async (adOnly: boolean) => {
    if (!approvalTarget) return
    const id = approvalTarget.id

    setLocalAssets(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'Ready to Upload', ad_only: adOnly } : a)
    )
    setApprovalTarget(null)

    try {
      const res = await fetch(`/api/assets?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Ready to Upload', ad_only: adOnly }),
      })
      if (!res.ok) throw new Error('Failed')
      const updated: Asset = await res.json()
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...updated, product: a.product, client: a.client } : a))
      notifyParent?.(id, 'Ready to Upload', updated)
      showToast(adOnly ? 'Approved — Ads Only ✔️' : 'Approved — Ads + Counter ✅')
    } catch {
      setLocalAssets(prev => prev.map(a => a.id === id ? { ...a, status: 'Pending Review' } : a))
      showToast('Approval failed — please try again')
    }
  }, [approvalTarget, notifyParent])

  // ── Campaign toggle ──────────────────────────────────────────────────────
  const handleCampaignToggle = useCallback(async (assetId: string, campaignName: string) => {
    // If this campaign doesn't exist yet in client_campaigns, create it
    if (!localCampaigns.find(c => c.name === campaignName)) {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, name: campaignName }),
      })
      if (res.ok) {
        const created = await res.json()
        setLocalCampaigns(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }
    }

    // Toggle campaign on the asset
    setLocalAssets(prev => prev.map(a => {
      if (a.id !== assetId) return a
      const current = new Set(a.campaigns ?? [])
      if (current.has(campaignName)) {
        current.delete(campaignName)
      } else {
        current.add(campaignName)
      }
      const updated = [...current]
      // Fire-and-forget PATCH
      fetch(`/api/assets?id=${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaigns: updated }),
      })
      return { ...a, campaigns: updated }
    }))
  }, [localCampaigns, clientId])

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
      notifyParent?.(id, 'Pulled', updated)
      showToast('Asset pulled ✓')
    } catch {
      showToast('Pull failed — please try again')
    }
  }, [pullTarget, notifyParent])

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
    let filtered = statusFilter === STALE_FILTER
      ? localAssets.filter(isStale)
      : statusFilter
        ? localAssets.filter(a => a.status === statusFilter)
        : localAssets
    if (campaignFilter) {
      filtered = filtered.filter(a => (a.campaigns ?? []).includes(campaignFilter))
    }
    const grouped: Record<Stage, Asset[]> = { Awareness: [], Consideration: [], Conversion: [] }
    for (const a of filtered) {
      if (a.stage in grouped) grouped[a.stage as Stage].push(a)
    }
    return grouped
  }, [localAssets, statusFilter, campaignFilter])

  const totalFiltered = Object.values(byStage).reduce((n, arr) => n + arr.length, 0)

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#3b2b52] text-white text-xs px-4 py-2.5 rounded-full shadow-lg pointer-events-none animate-fade-in">
          {toast}
        </div>
      )}

      {/* Preview Modal */}
      {previewTarget && (
        <AssetPreviewModal
          asset={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Approval Modal */}
      {approvalTarget && (
        <ApprovalModal
          asset={approvalTarget}
          onConfirm={handleApproval}
          onCancel={() => setApprovalTarget(null)}
        />
      )}

      {/* Freshness Reset Dialog */}
      {freshnessTarget && (
        <FreshnessResetDialog
          assetName={freshnessTarget.assetName}
          existingDateLive={freshnessTarget.existingDateLive}
          onReset={() => handleFreshnessConfirm(true)}
          onKeep={() => handleFreshnessConfirm(false)}
          onCancel={() => setFreshnessTarget(null)}
        />
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
      <div className="mb-5 space-y-2">
        <FilterBar
          activeFilter={statusFilter}
          onFilter={setStatusFilter}
          counts={statusCounts}
          staleCount={staleCount}
        />
        {/* Campaign filter chips */}
        {localCampaigns.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-stone-400 tracking-wide">Campaign:</span>
            {localCampaigns.map(c => (
              <button
                key={c.id}
                onClick={() => setCampaignFilter(campaignFilter === c.name ? null : c.name)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                  campaignFilter === c.name
                    ? 'bg-indigo-600 text-white border-transparent'
                    : 'text-stone-500 border-stone-200 hover:border-indigo-300 hover:text-indigo-600 bg-white'
                }`}
              >
                {c.name}
              </button>
            ))}
            {campaignFilter && (
              <button onClick={() => setCampaignFilter(null)} className="text-[10px] text-stone-300 hover:text-stone-500 transition-colors">✕ clear</button>
            )}
          </div>
        )}
        {(statusFilter || campaignFilter) && totalFiltered === 0 && (
          <p className="text-xs text-stone-400">No assets match this filter.</p>
        )}
      </div>

      {/* ── Desktop: 3-column grid ── */}
      <div className="hidden md:grid grid-cols-3 gap-4">
        {STAGES.map(stage => (
          <KanbanColumn
            key={stage}
            stage={stage}
            assets={byStage[stage]}
            campaigns={localCampaigns}
            onStatusChange={handleStatusChange}
            onPullRequest={setPullTarget}
            onApprovalRequest={setApprovalTarget}
            onCampaignToggle={handleCampaignToggle}
            onPreview={setPreviewTarget}
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
                    ? 'bg-[#3b2b52] text-[#f0d7c0]'
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
          campaigns={localCampaigns}
          onStatusChange={handleStatusChange}
          onPullRequest={setPullTarget}
          onApprovalRequest={setApprovalTarget}
          onCampaignToggle={handleCampaignToggle}
          onPreview={setPreviewTarget}
        />
      </div>
    </div>
  )
}
