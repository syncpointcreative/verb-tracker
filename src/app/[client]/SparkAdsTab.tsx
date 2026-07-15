'use client'

import { useEffect, useState } from 'react'
import type { SparkAd } from '@/lib/supabase'
import { freshnessVerdict } from '@/lib/freshness'

type StatusFilter = 'all' | 'active' | 'paused'

interface Props {
  clientSlug: string
}

function StatusBadge({ adStatus }: { adStatus: string | null }) {
  const isActive = adStatus === 'AD_STATUS_DELIVERY_OK'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
      isActive
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-stone-100 text-stone-500 border border-stone-200'
    }`}>
      {isActive ? '🟢' : '⏸'} {isActive ? 'Active' : 'Paused'}
    </span>
  )
}

function FreshnessPill({ state, reason }: { state: string | null; reason: string | null }) {
  const verdict = freshnessVerdict(state, reason)
  if (!verdict) return null
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${verdict.cls}`}
      title={verdict.hint ?? undefined}
    >
      {verdict.emoji} {verdict.label}
    </span>
  )
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
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {stage}
    </span>
  )
}

function KeyMetric({ ad }: { ad: SparkAd }) {
  const stage = ad.stage
  if (!stage || ad.spend == null || ad.spend < 1) return null

  let label: string, value: string
  if (stage === 'Conversion') {
    label = 'ROAS'; value = ad.roas != null ? `${ad.roas.toFixed(2)}x` : '—'
  } else if (stage === 'Awareness') {
    label = 'Watch'; value = ad.watch_rate != null ? `${ad.watch_rate.toFixed(1)}%` : '—'
  } else if (stage === 'Consideration') {
    label = 'CTR'; value = ad.ctr != null ? `${ad.ctr.toFixed(2)}%` : '—'
  } else {
    const eng = (ad.follows ?? 0) + (ad.likes ?? 0)
    label = 'Eng.'; value = eng > 0 ? eng.toLocaleString() : '—'
  }

  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full border text-stone-600 bg-stone-50 border-stone-200">
      {label} {value}
    </span>
  )
}

export default function SparkAdsTab({ clientSlug }: Props) {
  const [items, setItems]     = useState<SparkAd[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [filter, setFilter]   = useState<StatusFilter>('all')

  useEffect(() => {
    fetch(`/api/spark-ads?client_slug=${encodeURIComponent(clientSlug)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setItems(data.items ?? [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [clientSlug])

  function archiveAd(id: string) {
    setItems(prev => prev.filter(a => a.id !== id))
    fetch(`/api/spark-ads?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-stone-400 text-sm">Loading Spark Ads…</div>
  )
  if (error) return (
    <div className="py-10 text-center text-red-400 text-sm">Error: {error}</div>
  )

  const activeCount = items.filter(a => a.ad_status === 'AD_STATUS_DELIVERY_OK').length
  const pausedCount = items.length - activeCount

  const visible = filter === 'active'
    ? items.filter(a => a.ad_status === 'AD_STATUS_DELIVERY_OK')
    : filter === 'paused'
    ? items.filter(a => a.ad_status !== 'AD_STATUS_DELIVERY_OK')
    : items

  const groups = visible.reduce<Record<string, SparkAd[]>>((acc, ad) => {
    const key = ad.campaign_name ?? '(No Campaign)'
    if (!acc[key]) acc[key] = []
    acc[key].push(ad)
    return acc
  }, {})

  const filterBtn = (f: StatusFilter, label: string, count: number) => (
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
      <div className="flex items-center gap-1.5 flex-wrap mb-6">
        {filterBtn('all',    'All',       items.length)}
        {filterBtn('active', '🟢 Active', activeCount)}
        {filterBtn('paused', '⏸ Paused',  pausedCount)}
      </div>

      {visible.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-stone-200 rounded-xl">
          <p className="text-stone-400 text-sm">No Spark Ads synced yet.</p>
          <p className="text-stone-300 text-xs mt-1.5 font-mono">Run sync_spark_ads.py to populate.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([campaign, ads]) => (
            <div key={campaign}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-6 h-px bg-[#d4865e]" />
                <p className="text-[10px] tracking-[0.18em] text-[#d4865e] uppercase font-medium">{campaign}</p>
                <span className="text-[10px] text-stone-300">{ads.length} ad{ads.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ads.map(ad => (
                  <SparkAdCard key={ad.id} ad={ad} onArchive={archiveAd} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SparkAdCard({ ad, onArchive }: { ad: SparkAd; onArchive: (id: string) => void }) {
  const [authCode, setAuthCode] = useState('')
  const isActive = ad.ad_status === 'AD_STATUS_DELIVERY_OK'

  const title = ad.ad_name
    ? ad.ad_name.length > 80 ? ad.ad_name.slice(0, 77) + '…' : ad.ad_name
    : '(Untitled)'

  return (
    <div className={`border rounded-lg p-4 flex flex-col gap-3 transition-colors ${
      isActive
        ? 'bg-white border-stone-200 hover:border-stone-300'
        : 'bg-stone-50 border-stone-100 hover:border-stone-200'
    }`}>
      {/* Title + archive */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-stone-700 font-medium leading-snug flex-1" title={ad.ad_name ?? undefined}>
          {title}
        </p>
        <button
          onClick={() => onArchive(ad.id)}
          title="Remove this entry"
          className="text-stone-300 hover:text-red-400 transition-colors text-xs flex-shrink-0 mt-0.5"
        >✕</button>
      </div>

      {/* Status + stage + performance pill */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge adStatus={ad.ad_status} />
        <StageBadge stage={ad.stage} />
        {isActive
          ? <KeyMetric ad={ad} />
          : <FreshnessPill state={ad.freshness_state} reason={ad.freshness_reason} />
        }
      </div>

      {/* Ad group */}
      {ad.adgroup_name && (
        <p className="text-[10px] text-stone-400 truncate" title={ad.adgroup_name}>{ad.adgroup_name}</p>
      )}

      {/* TikTok video ID — copy to find in Ads Manager or TikTok search */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-stone-400 font-mono truncate flex-1" title={ad.tiktok_item_id}>
          {ad.tiktok_item_id}
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(ad.tiktok_item_id)}
          title="Copy TikTok video ID"
          className="text-[10px] text-stone-400 hover:text-[#d4865e] transition-colors flex-shrink-0 border border-stone-200 rounded px-1.5 py-0.5"
        >
          Copy ID
        </button>
      </div>

      {/* Auth code */}
      <div>
        <label className="block text-[10px] text-stone-400 uppercase tracking-[0.12em] mb-1">Auth Code</label>
        <input
          type="text"
          value={authCode}
          onChange={e => setAuthCode(e.target.value)}
          placeholder="Paste from Content Suite"
          className="w-full text-xs border border-stone-200 rounded-md px-2.5 py-1.5 text-stone-600 placeholder-stone-300 focus:outline-none focus:ring-1 focus:ring-[#d4865e]/40 focus:border-[#d4865e]/60 transition"
        />
      </div>
    </div>
  )
}
