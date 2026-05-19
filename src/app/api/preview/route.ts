/**
 * GET /api/preview?file=<file_name>          — stream file inline (video/image player)
 * GET /api/preview?file=<file_name>&meta=1   — return JSON metadata only (no body stream)
 *
 * Looks up the file in drive_queue by file_name, then proxies it from
 * Slack's private URL with Content-Disposition: inline so the browser
 * renders it rather than downloading.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const file     = searchParams.get('file')
  const metaOnly = searchParams.get('meta') === '1'

  if (!file) return NextResponse.json({ error: 'Missing ?file=' }, { status: 400 })

  const supabase = createServerClient()
  // Include ALL rows regardless of drive sync status — the Slack URL is
  // still valid even if the Google Drive upload errored. Prefer done/pending
  // rows first, but fall back to error rows so previews still work.
  const { data: items } = await supabase
    .from('drive_queue')
    .select('id, url_private_download, mimetype, status')
    .eq('file_name', file)
    .order('created_at', { ascending: false })
    .limit(5)

  // Prefer a non-error row if one exists
  const item = items?.find(r => r.status !== 'error') ?? items?.[0] ?? null

  if (!item) {
    if (metaOnly) return NextResponse.json({ available: false })
    return NextResponse.json({ error: 'File not found in queue' }, { status: 404 })
  }

  // Meta-only mode: just return availability info + mimetype for the modal to decide
  if (metaOnly) {
    return NextResponse.json({
      available:      true,
      mimetype:       item.mimetype ?? 'application/octet-stream',
      drive_queue_id: item.id,
    })
  }

  // Stream mode: proxy from Slack
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  const slackRes = await fetch(item.url_private_download, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!slackRes.ok) {
    return NextResponse.json(
      { error: `Slack fetch failed: ${slackRes.status}` },
      { status: 502 }
    )
  }

  const headers = new Headers({
    'Content-Type':        item.mimetype ?? 'application/octet-stream',
    'Content-Disposition': 'inline',
    'Cache-Control':       'private, max-age=3600',
  })
  const contentLength = slackRes.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new NextResponse(slackRes.body, { status: 200, headers })
}
