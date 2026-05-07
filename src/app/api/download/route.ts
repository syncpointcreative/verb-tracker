/**
 * GET /api/download?id=<drive_queue_id>
 *
 * Streams a Slack file from drive_queue through the server to the browser.
 * This allows Seth to download approved assets directly from the admin panel
 * without needing Google Drive.
 *
 * Required env vars: SLACK_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServerClient()
  const { data: item, error } = await supabase
    .from('drive_queue')
    .select('file_name, url_private_download, mimetype, client_name, status')
    .eq('id', id)
    .single()

  if (error || !item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  const slackRes = await fetch(item.url_private_download, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!slackRes.ok) {
    return NextResponse.json({ error: `Slack download failed: ${slackRes.status}` }, { status: 502 })
  }

  const headers = new Headers({
    'Content-Type': item.mimetype || 'video/mp4',
    'Content-Disposition': `attachment; filename="${item.file_name}"`,
  })
  const contentLength = slackRes.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new NextResponse(slackRes.body, { status: 200, headers })
}
