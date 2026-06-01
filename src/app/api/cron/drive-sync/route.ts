/**
 * GET /api/cron/drive-sync
 *
 * Runs every hour via Vercel cron.
 * Picks up pending rows from drive_queue, downloads each file from Slack,
 * uploads it to the configured storage provider, then:
 *   1. Writes drive_url back to the matching assets row (enables preview in the app)
 *   2. If the asset has a monday_item_id, updates that item's link column
 *      from the Slack URL → the permanent Drive URL
 *
 * Manual testing:
 *   curl ".../api/cron/drive-sync" -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Required env vars:
 *   CRON_SECRET       — must match Authorization: Bearer header
 *   SLACK_BOT_TOKEN   — to download files from Slack
 *   STORAGE_PROVIDER  — google (default) | dropbox | s3
 *   + provider-specific vars (see src/lib/storage.ts)
 *   MONDAY_API_TOKEN  — optional; Monday link updates are skipped if not set
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { uploadFile } from '@/lib/storage'
import { findBoardByName, updateItemLinkColumn } from '@/lib/monday'

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
      const driveUrl = await uploadFile({
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

      // ── Back-link Drive URL to assets + update Monday ─────────────────────
      await backLinkDriveUrl(item.file_name, item.client_name, driveUrl, supabase)

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

// ── Back-link helper ──────────────────────────────────────────────────────────

/**
 * After a successful Drive upload:
 *  1. Write drive_url to all matching asset rows
 *  2. If any of those assets have a monday_item_id, update the Monday link column
 *     from the Slack message URL → the permanent Drive URL
 *
 * Entirely non-fatal — Drive upload already succeeded, this is best-effort sync.
 */
async function backLinkDriveUrl(
  fileName:   string,
  clientName: string,
  driveUrl:   string,
  supabase:   ReturnType<typeof createServerClient>,
): Promise<void> {
  try {
    const { data: matchedAssets } = await supabase
      .from('assets')
      .select('id, monday_item_id')
      .eq('file_name', fileName)

    if (!matchedAssets?.length) return

    // Write Drive URL to every matched asset
    await supabase
      .from('assets')
      .update({ drive_url: driveUrl })
      .in('id', matchedAssets.map(a => a.id))

    // Update Monday link column for assets that have an item ID
    const withMonday = matchedAssets.filter(
      (a): a is typeof a & { monday_item_id: string } => !!a.monday_item_id
    )
    if (!withMonday.length || !process.env.MONDAY_API_TOKEN) return

    const board = await findBoardByName(clientName).catch(() => null)
    if (!board) return

    const linkCol = board.columns.find(c => c.type === 'link')
    if (!linkCol) return

    for (const asset of withMonday) {
      await updateItemLinkColumn(
        board.id,
        asset.monday_item_id,
        linkCol.id,
        driveUrl,
        'View in Drive',
      ).catch(err =>
        console.error(`[drive-sync] Monday link update failed for item ${asset.monday_item_id}:`, err)
      )
    }
  } catch (err) {
    console.error(`[drive-sync] backLinkDriveUrl failed for ${fileName}:`, err)
  }
}
