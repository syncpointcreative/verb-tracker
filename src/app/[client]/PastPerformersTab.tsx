'use client'

import { useEffect, useState } from 'react'
import type { PastPerformer } from '@/app/api/past-performers/route'

type ViewFilter = 'all' | 'reuse' | 'running'

interface Props {
  clientSlug: string
}

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null
  const cls =
    stage === 'Awareness'             ? 'text-rose-600 bg-rose-50 border-rose-200' :
    stage === 'Consideration'         ? 'text-amber-600 bg-amber-50 border-amber-200' :
    stage === 'Conversion'            ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
    stage === 'Community Interaction' ? 'text-sky-600 bg-sky-50 border-sky-200' :
    'text-stone-500 bg-stone-100 border-stone-200'
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>{stage}</span>
  )
}

function PeakPill({ name, value }: { name: string | null; value: number | null }) {
  if (!name || value == null) return null
  let label: string
  if (name === 'roas')       label = `${value.toFixed(2)}x ROAS`
  else if (name === 'watch_rate') label = `${value.toFixed(1)}% hook`
  else if (name === 'ctr')   label = `${value.toFixed(2)}% CTR`
  else if (name === 'eng_per_1k') label = `${value.toFixed(1)}/1k eng`
  else label = String(value)
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
      ⭐ {label}
    </span>
  )
}

function StatePill({ state, reason }: { state: string | null; reason: string | null }) {
  if (!state) return null
  if (state === 'still_performing') return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
      🟢 Still running
    </span>
  )
  if (state === 'needs_replacing' && reason === 'faded') return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
      📉 Faded — reuse concept
    </span>
  )
  if (state === 'needs_replacing' && reason === 'aged_out') return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
      📅 Aged out — reuse concept
    </span>
  )
  if (state === 'needs_replacing') return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
      🔴 Needs replacing
    </span>
  )
  if (state === 'underperforming') return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
      🟡 Underperforming
    </span>
  )
  return null
}

function TypeBadge({ type }: { type: 'asset' | 'spark' }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
      type === 'spark'
        ? 'bg-violet-50 text-violet-600 border border-violet-200'
        : 'bg-stone-50 text-stone-500 border border-stone-200'
    }`}>
      {type === 'spark' ? '⚡ Spark' : 'Content'}
    </span>
  )
}

function PeakDate({ peakAt }: { peakAt: string | null }) {
  if (!peakAt) return null
  const d = new Date(peakAt)
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  return (
    <span className="text-[10px] text-stone-400">Peak {label}</span>
  )
}

function PerformerCard({ item }: { item: PastPerformer }) {
  const title = item.name.length > 90 ? item.name.slice(0, 87) + '…' : item.name
  const isReuse = item.freshness_state !== 'still_performing'

  return (
    <div className={`border rounded-lg p-4 flex flex-col gap-3 transition-colors ${
      isReuse
        ? 'bg-amber-50/40 border-amber-100 hover:border-amber-200'
        : 'bg-white border-stone-200 hover:border-stone-300'
    }`}>
      {/* Title */}
      <p className="text-sm text-stone-700 font-medium leading-snug" title={item.name}>
        {title}
      </p>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <TypeBadge type={item.type} />
        <StageBadge stage={item.stage} />
        {item.product_name && (
          <span className="text-[10px] text-stone-400 border border-stone-100 px-1.5 py-0.5 rounded">
            {item.product_name}
          </span>
        )}
      </div>

      {/* Peak + current state */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <PeakPill name={item.peak_metric_name} value={item.peak_metric_value} />
        <StatePill state={item.freshness_state} reason={item.freshness_reason} />
      </div>

      {/* Detail + date */}
      <div className="flex items-center justify-between gap-2">
        {item.freshness_detail ? (
          <span className="text-[10px] text-stone-400 truncate flex-1" title={item.freshness_detail}>
            {item.freshness_detail}
          </span>
        ) : item.creator_name ? (
          <span className="text-[10px] text-stone-400 truncate flex-1">@{item.creator_name}</span>
        ) : <span />}
        <PeakDate peakAt={item.peak_at} />
      </div>

      {/* Spark Ad link */}
      {item.type === 'spark' && item.video_url && (
        <a
          href={item.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#d4865e] hover:underline self-start border border-[#d4865e]/30 rounded px-1.5 py-0.5"
        >
          View on TikTok ↗
        </a>
      )}
    </div>
  )
}

export default function PastPerformersTab({ clientSlug }: Props) {
  const [items, setItems]     = useState<PastPerformer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState<ViewFilter>('all')

  useEffect(() => {
    fetch(`/api/past-performers?client_slug=${encodeURIComponent(clientSlug)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setItems(data.items ?? [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [clientSlug])

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
      Loading past performers…
    </div>
  )
  if (error) return (
    <div className="py-10 text-center text-red-400 text-sm">Error: {error}</div>
  )

  const reuseItems   = items.filter(i => i.freshness_state !== 'still_performing')
  const runningItems = items.filter(i => i.freshness_state === 'still_performing')

  const visible =
    filter === 'reuse'   ? reuseItems :
    filter === 'running' ? runningItems :
    items

  // Group by stage for display
  const stages = ['Awareness', 'Consideration', 'Conversion', 'Community Interaction']
  const groups = stages.reduce<Record<string, PastPerformer[]>>((acc, stage) => {
    const stageItems = visible.filter(i => i.stage === stage)
    if (stageItems.length > 0) acc[stage] = stageItems
    return acc
  }, {})
  // Catch anything with no stage
  const unsorted = visible.filter(i => !i.stage || !stages.includes(i.stage))
  if (unsorted.length > 0) groups['Other'] = unsorted

  const filterBtn = (f: ViewFilter, label: string, count: number) => (
    <button
      onClick={() => setFilter(f)}
      className={`text-[11px] px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
        filter === f
          ? 'bg-[#3b2b52] text-[#f0d7c0] border-[#3b2b52]'
          : 'text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700 bg-white'
      }`}
    >
      {label}
      <span className={`tabular-nums text-[10px] ${filter === f ? 'opacity-70' : 'text-stone-400'}`}>{count}</span>
    </button>
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <p className="text-sm text-stone-400 font-serif italic">
          Creatives that have scored <span className="text-emerald-600">still performing</span> at least once. Reuse candidates are faded winners — the concept worked, the creative aged out.
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap mb-6">
        {filterBtn('all',     'All',                items.length)}
        {filterBtn('reuse',   '📉 Reuse Candidates', reuseItems.length)}
        {filterBtn('running', '🟢 Still Running',    runningItems.length)}
      </div>

      {visible.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No past performers recorded yet.</p>
          <p className="text-stone-300 text-xs mt-1.5 font-mono">
            Scores accumulate as freshness_score.py runs — check back after the next cron.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([stage, groupItems]) => (
            <div key={stage}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-6 h-px bg-[#d4865e]" />
                <p className="text-[10px] tracking-[0.18em] text-[#d4865e] uppercase font-medium">{stage}</p>
                <span className="text-[10px] text-stone-300">
                  {groupItems.length} creative{groupItems.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupItems.map(item => (
                  <PerformerCard key={`${item.type}-${item.id}`} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
