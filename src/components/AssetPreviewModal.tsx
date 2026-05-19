'use client'

import { useEffect, useState } from 'react'
import type { Asset } from '@/lib/supabase'
import { SLACK_CHANNEL_ID } from '@/lib/constants'

interface PreviewMeta {
  available:      boolean
  mimetype?:      string
  drive_queue_id?: string
}

function slackMessageUrl(ts: string | null): string | null {
  if (!ts) return null
  // Slack web URL format: remove the dot from the timestamp
  return `https://slack.com/archives/${SLACK_CHANNEL_ID}/p${ts.replace('.', '')}`
}

export function AssetPreviewModal({
  asset,
  onClose,
}: {
  asset: Asset
  onClose: () => void
}) {
  const [meta, setMeta] = useState<PreviewMeta | null>(null)

  const fileName  = asset.file_name
  const slackLink = slackMessageUrl(asset.slack_message_ts)
  const previewUrl = fileName
    ? `/api/preview?file=${encodeURIComponent(fileName)}`
    : null

  useEffect(() => {
    if (!fileName) { setMeta({ available: false }); return }

    fetch(`/api/preview?file=${encodeURIComponent(fileName)}&meta=1`)
      .then(r => r.json())
      .then((data: PreviewMeta) => setMeta(data))
      .catch(() => setMeta({ available: false }))
  }, [fileName])

  // Keyboard close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const isVideo = meta?.mimetype?.startsWith('video/')
  const isImage = meta?.mimetype?.startsWith('image/')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#2B3428] px-5 py-4 flex items-start justify-between gap-4 flex-shrink-0">
          <div className="min-w-0">
            <p className="font-serif text-white text-base leading-snug truncate">
              {asset.asset_name}
            </p>
            {fileName && (
              <p className="text-[10px] text-white/30 font-mono mt-0.5 truncate">{fileName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-lg leading-none flex-shrink-0 mt-0.5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto bg-stone-950 flex items-center justify-center min-h-[220px]">
          {meta === null ? (
            <p className="text-stone-500 text-sm animate-pulse">Loading…</p>

          ) : meta.available && isVideo ? (
            <video
              key={previewUrl!}
              src={previewUrl!}
              controls
              playsInline
              className="max-w-full max-h-[55vh]"
            />

          ) : meta.available && isImage ? (
            <img
              src={previewUrl!}
              alt={asset.asset_name}
              className="max-w-full max-h-[55vh] object-contain"
            />

          ) : (
            /* No file in queue or unsupported type */
            <div className="text-center px-8 py-12">
              <div className="text-4xl mb-3 opacity-30">
                {meta.available ? '📄' : '🔍'}
              </div>
              <p className="text-stone-400 text-sm mb-1">
                {meta.available
                  ? 'Preview not available for this file type'
                  : 'File not yet in the download queue'}
              </p>
              <p className="text-stone-600 text-xs mb-5">
                {meta.available
                  ? 'Download the file to view it locally.'
                  : 'This asset was added manually or hasn\'t been approved in Slack yet.'}
              </p>
              {slackLink && (
                <a
                  href={slackLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white bg-[#4A154B] hover:bg-[#5a256b] px-4 py-2 rounded-xl transition-colors"
                >
                  <span>View in Slack</span>
                  <span className="text-xs opacity-60">↗</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-100 bg-stone-50 flex items-center gap-3 flex-wrap flex-shrink-0">
          {/* Asset meta pills */}
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            {asset.content_type && (
              <span className="text-[11px] text-stone-500 bg-stone-100 rounded-md px-2 py-0.5">
                {asset.content_type}
              </span>
            )}
            {asset.posted_by && (
              <span className="text-[11px] text-stone-400">{asset.posted_by}</span>
            )}
            {asset.date_live && (
              <span className="text-[11px] text-stone-400">
                Live {new Date(asset.date_live + 'T12:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: '2-digit',
                })}
              </span>
            )}
            {asset.performance && (
              <span className="text-[11px] text-stone-400 italic">
                {asset.performance === 'High Performer' && '🔥 '}
                {asset.performance === 'Average Performer' && '👍 '}
                {asset.performance === 'Poor Performer' && '❌ '}
                {asset.performance}
              </span>
            )}
          </div>

          {/* Action links */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {slackLink && (
              <a
                href={slackLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-stone-400 hover:text-stone-600 underline transition-colors"
              >
                Slack ↗
              </a>
            )}
            {meta?.drive_queue_id && (
              <a
                href={`/api/download?id=${meta.drive_queue_id}`}
                download
                className="text-[11px] font-medium text-white bg-[#2B3428] hover:bg-[#3a4636] px-3 py-1.5 rounded-lg transition-colors"
              >
                ↓ Download
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
