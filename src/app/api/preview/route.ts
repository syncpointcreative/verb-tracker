/**
 * GET /api/preview?file=<file_name>                   — stream file inline (video/image player)
 * GET /api/preview?file=<file_name>&meta=1            — return JSON metadata only (no body stream)
 * GET /api/preview?asset_id=<uuid>                    — stream using asset's own slack_file_url
 * GET /api/preview?asset_id=<uuid>&meta=1             — metadata only (checks drive_queue too)
 *
 * Priority for resolving the Slack download URL:
 *   1. asset.slack_file_url — stored at ingest (fast, no extra API call)
 *   2. Live Slack conversations.history lookup via asset.slack_message_ts (for assets ingested
 *      before slack_file_url was added). Result is cached back to the assets table.
 *   3. drive_queue row by file_name (legacy path, file= param)
 *
 * Streams with Content-Disposition: inline so browsers render in-place.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { SLACK_CHANNEL_ID } from '@/lib/constants'

// Edge runtime has no response body size limit — critical for streaming large video files.
// Serverless functions cap at 4.5MB which cuts off any video bigger than that.
export const runtime = 'edge'

/** Fetch url_private_download + mimetype for a file from a Slack message. */
async function fetchSlackFileUrl(
  token: string,
  messageTs: string,
  fileName: string | null,
): Promise<{ url: string; mimetype: string } | null> {
  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL_ID}&latest=${messageTs}&limit=1&inclusive=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const json = await res.json() as {
    ok: boolean
    messages?: Array<{
      files?: Array<{ name: string; url_private_download: string; mimetype: string }>
    }>
  }

  if (!json.ok || !json.messages?.[0]?.files?.length) return null

  const files = json.messages[0].files!

  // If we know the file name, match exactly; otherwise take the first file
  const match = fileName
    ? files.find(f => f.name === fileName) ?? files[0]
    : files[0]

  return { url: match.url_private_download, mimetype: match.mimetype ?? 'application/octet-stream' }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const assetId  = searchParams.get('asset_id')
  const file     = searchParams.get('file')
  const metaOnly = searchParams.get('meta') === '1'
  // ?diag=1 — returns JSON about the upstream fetch (status, headers) without streaming the body.
  // Useful for debugging when videos won't play: open /api/preview?asset_id=<id>&diag=1 in a new tab.
  const diagMode = searchParams.get('diag') === '1'

  if (!assetId && !file) {
    return NextResponse.json({ error: 'Missing ?asset_id= or ?file=' }, { status: 400 })
  }

  const supabase = createServerClient()
  const token    = process.env.SLACK_BOT_TOKEN

  // ── Path 1: asset_id supplied ────────────────────────────────────────────────
  if (assetId) {
    const { data: asset } = await supabase
      .from('assets')
      .select('id, file_name, slack_message_ts, slack_file_url, slack_mimetype')
      .eq('id', assetId)
      .single()

    if (!asset) {
      if (metaOnly) return NextResponse.json({ available: false })
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    // Resolve the Slack download URL — stored field first, live API fallback second
    let slackUrl:  string | null = asset.slack_file_url
    let mimeType:  string | null = asset.slack_mimetype

    if (!slackUrl && asset.slack_message_ts && token) {
      // Fetch live from Slack and cache it back for next time
      const fetched = await fetchSlackFileUrl(token, asset.slack_message_ts, asset.file_name)
      if (fetched) {
        slackUrl = fetched.url
        mimeType = fetched.mimetype
        // Cache back — fire-and-forget, don't block the response
        supabase
          .from('assets')
          .update({ slack_file_url: slackUrl, slack_mimetype: mimeType })
          .eq('id', assetId)
          .then(() => {}) // intentionally not awaited
      }
    }

    // Also look for a drive_queue entry so we can surface the Download button
    let driveQueueId: string | null = null
    if (asset.file_name) {
      const { data: queueItems } = await supabase
        .from('drive_queue')
        .select('id, status')
        .eq('file_name', asset.file_name)
        .order('created_at', { ascending: false })
        .limit(5)

      const queueItem = queueItems?.find(r => r.status !== 'error') ?? queueItems?.[0] ?? null
      driveQueueId = queueItem?.id ?? null
    }

    if (!slackUrl) {
      if (metaOnly) return NextResponse.json({ available: false, drive_queue_id: driveQueueId })
      return NextResponse.json({ error: 'No Slack file URL available for this asset' }, { status: 404 })
    }

    if (metaOnly) {
      return NextResponse.json({
        available:      true,
        mimetype:       mimeType ?? 'application/octet-stream',
        drive_queue_id: driveQueueId,
      })
    }

    // Detect whether this is a migrated Google Drive URL or a Slack URL.
    // Drive URLs are publicly readable — no auth header needed.
    const isDriveUrl = slackUrl.includes('drive.google.com') || slackUrl.includes('googleapis.com')

    if (!isDriveUrl && !token) {
      return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })
    }

    // Forward Range header from the browser so video seeking works.
    // Without this, the browser fetches the whole file before playing.
    const rangeHeader = req.headers.get('range')
    const upstreamHeaders: Record<string, string> = {}
    if (!isDriveUrl) upstreamHeaders['Authorization'] = `Bearer ${token!}`
    if (rangeHeader)  upstreamHeaders['Range'] = rangeHeader

    const upstreamRes = await fetch(slackUrl, { headers: upstreamHeaders })

    // ?diag=1 — return JSON about the upstream response without streaming the body.
    // Open /api/preview?asset_id=<id>&diag=1 in a browser tab to debug fetch errors.
    if (diagMode) {
      const diagHeaders: Record<string, string> = {}
      upstreamRes.headers.forEach((v, k) => { diagHeaders[k] = v })
      return NextResponse.json({
        status:      upstreamRes.status,
        ok:          upstreamRes.ok,
        slackUrl:    slackUrl.substring(0, 100),
        tokenPrefix: token ? token.substring(0, 12) + '…' : null,
        headers:     diagHeaders,
      })
    }

    if (!upstreamRes.ok) {
      console.error(`[preview] upstream fetch failed: ${upstreamRes.status} — ${slackUrl.substring(0, 80)}`)
      return NextResponse.json(
        { error: `${isDriveUrl ? 'Drive' : 'Slack'} fetch failed: ${upstreamRes.status}` },
        { status: 502 }
      )
    }

    const headers = new Headers({
      'Content-Type':   mimeType ?? upstreamRes.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': 'inline',
      'Cache-Control':  'private, max-age=3600',
      'Accept-Ranges':  'bytes',   // tells the browser range requests are supported
    })
    const contentLength = upstreamRes.headers.get('content-length')
    if (contentLength) headers.set('Content-Length', contentLength)
    const contentRange = upstreamRes.headers.get('content-range')
    if (contentRange)  headers.set('Content-Range', contentRange)

    // Preserve 206 Partial Content so browsers can seek through video
    return new NextResponse(upstreamRes.body, { status: upstreamRes.status, headers })
  }

  // ── Path 2: file_name supplied (legacy) ──────────────────────────────────────
  // Include ALL rows regardless of drive sync status — the Slack URL is
  // still valid even if the Google Drive upload errored. Prefer done/pending
  // rows first, but fall back to error rows so previews still work.
  const { data: items } = await supabase
    .from('drive_queue')
    .select('id, url_private_download, mimetype, status')
    .eq('file_name', file!)
    .order('created_at', { ascending: false })
    .limit(5)

  const item = items?.find(r => r.status !== 'error') ?? items?.[0] ?? null

  if (!item) {
    if (metaOnly) return NextResponse.json({ available: false })
    return NextResponse.json({ error: 'File not found in queue' }, { status: 404 })
  }

  if (metaOnly) {
    return NextResponse.json({
      available:      true,
      mimetype:       item.mimetype ?? 'application/octet-stream',
      drive_queue_id: item.id,
    })
  }

  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  const rangeHeader2 = req.headers.get('range')
  const legacyFetchHeaders: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (rangeHeader2) legacyFetchHeaders['Range'] = rangeHeader2

  const slackRes = await fetch(item.url_private_download, { headers: legacyFetchHeaders })

  if (!slackRes.ok) {
    console.error(`[preview/legacy] Slack fetch failed: ${slackRes.status}`)
    return NextResponse.json(
      { error: `Slack fetch failed: ${slackRes.status}` },
      { status: 502 }
    )
  }

  const headers = new Headers({
    'Content-Type':        item.mimetype ?? 'application/octet-stream',
    'Content-Disposition': 'inline',
    'Cache-Control':       'private, max-age=3600',
    'Accept-Ranges':       'bytes',
  })
  const contentLength = slackRes.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)
  const contentRange = slackRes.headers.get('content-range')
  if (contentRange)  headers.set('Content-Range', contentRange)

  return new NextResponse(slackRes.body, { status: slackRes.status, headers })
}
