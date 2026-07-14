'use client'

import { useEffect, useState } from 'react'
import type { SparkAd } from '@/lib/supabase'

interface Props {
  clientSlug: string
}

function StatusBadge({ adStatus }: { adStatus: string | null }) {
  const isActive = adStatus === 'AD_STATUS_DELIVERY_OK'
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        isActive
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-stone-100 text-stone-500 border border-stone-200'
      }`}
    >
      {isActive ? '🟢' : '⏸'} {isActive ? 'ACTIVE' : 'PAUSED'}
    </span>
  )
}

export default function SparkAdsTab({ clientSlug }: Props) {
  const [items, setItems]     = useState<SparkAd[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
        Loading Spark Ads…
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-10 text-center text-red-400 text-sm">
        Error: {error}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="py-16 text-center border border-dashed border-stone-200 rounded-xl">
        <p className="text-stone-400 text-sm">No Spark Ads synced yet.</p>
        <p className="text-stone-300 text-xs mt-1.5 font-mono">Run sync_spark_ads.py to populate.</p>
      </div>
    )
  }

  // Group by campaign_name
  const groups = items.reduce<Record<string, SparkAd[]>>((acc, ad) => {
    const key = ad.campaign_name ?? '(No Campaign)'
    if (!acc[key]) acc[key] = []
    acc[key].push(ad)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      {Object.entries(groups).map(([campaign, ads]) => (
        <div key={campaign}>
          {/* Campaign header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-px bg-[#d4865e]" />
            <p className="text-[10px] tracking-[0.18em] text-[#d4865e] uppercase font-medium">
              {campaign}
            </p>
            <span className="text-[10px] text-stone-300">{ads.length} ad{ads.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ads.map(ad => (
              <SparkAdCard key={ad.id} ad={ad} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SparkAdCard({ ad }: { ad: SparkAd }) {
  const [authCode, setAuthCode] = useState('')

  const title = ad.ad_name
    ? ad.ad_name.length > 80
      ? ad.ad_name.slice(0, 77) + '…'
      : ad.ad_name
    : '(Untitled)'

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-3 hover:border-stone-300 transition-colors">
      {/* Title */}
      <p className="text-sm text-stone-700 font-medium leading-snug" title={ad.ad_name ?? undefined}>
        {title}
      </p>

      {/* Status + adgroup row */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge adStatus={ad.ad_status} />
        {ad.adgroup_name && (
          <span className="text-[10px] text-stone-400 truncate max-w-[180px]" title={ad.adgroup_name}>
            {ad.adgroup_name}
          </span>
        )}
      </div>

      {/* TikTok link */}
      <a
        href={`https://www.tiktok.com/video/${ad.tiktok_item_id}`}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] text-[#d4865e] hover:text-[#e0a07d] font-mono tracking-wide underline underline-offset-2 transition-colors"
      >
        {ad.tiktok_item_id}
      </a>

      {/* Auth code field */}
      <div>
        <label className="block text-[10px] text-stone-400 uppercase tracking-[0.12em] mb-1">
          Auth Code
        </label>
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
