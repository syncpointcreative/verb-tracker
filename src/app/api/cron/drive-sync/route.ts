/**
 * GET /api/cron/drive-sync
 *
 * Runs every hour via Vercel cron.
 * Picks up pending rows from drive_queue, downloads each file from Slack,
 * and uploads it to the correct client subfolder in Google Drive.
 *
 * Manual testing:
 *   curl ".../api/cron/drive-sync" -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Required env vars:
 *   CRON_SECRET                 — must match Authorization: Bearer header
 *   SLACK_BOT_TOKEN             — to download files from Slack
 *   GOOGLE_SERVICE_ACCOUNT_JSON — full JSON key from GCP console
 *   GOOGLE_DRIVE_FOLDER_ID      — root Drive folder ID
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { uploadFileToDrive } from '@/lib/drive'

const BATCH_SIZE = 5 // process up to 5 files per run to stay within timeout

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Grab the oldest pending items (one batch at a time)
  const { data: items, error } = await supabase
    .from('drive_queue')
    .select('id, slack_file_id, file_name, url_private_download, mimetype, client_name')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[drive-sync] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!items?.length) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No pending items' })
  }

  let succeeded = 0
  let failed = 0

  for (const item of items) {
    // Mark as processing so parallel runs skip it
    await supabase
      .from('drive_queue')
      .update({ status: 'processing' })
      .eq('id', item.id)

    try {
      const driveUrl = await uploadFileToDrive({
        slackUrl:   item.url_private_download,
        fileName:   item.file_name,
        mimeType:   item.mimetype,
        clientName: item.client_name,
      })

      await supabase
        .from('drive_queue')
        .update({ status: 'done', drive_url: driveUrl, processed_at: new Date().toISOString() })
        .eq('id', item.id)

      console.log(`[drive-sync] ✅ ${item.file_name} → ${driveUrl}`)
      succeeded++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[drive-sync] ❌ ${item.file_name}:`, msg)

      await supabase
        .from('drive_queue')
        .update({ status: 'error', error: msg, processed_at: new Date().toISOString() })
        .eq('id', item.id)

      failed++
    }
  }

  return NextResponse.json({ ok: true, processed: items.length, succeeded, failed })
}
