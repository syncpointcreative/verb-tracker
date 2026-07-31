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
 * Slack URL expiry handling:
 *   url_private_download links expire after ~7 days. On a 404 the cron
 *   automatically tries to get a fresh URL:
 *     - Real Slack file IDs  → files.info API
 *     - Backfill entries     → conversations.history via the asset's slack_message_ts
 *
 * Manual testing:
 *   curl ".../api/cron/drive-sync" -H "Authorization: Bearer <CRON_SECRET>"
 *   curl ".../api/cron/drive-sync" -H "x-api-key: <AUTH_API_KEY>"
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
import { findBoardByName, updateItemLinkColumn, mondayQuery } from '@/lib/monday'
import { SLACK_CHANNEL_ID } from '@/lib/constants'

// 300s requires Vercel Pro; Hobby plan caps at 60s regardless of this value.
// Set to 300 so large video uploads don't time out on Pro.
export const maxDuration = 300
const BATCH_SIZE = 3 // small batch so a run reliably finishes within maxDuration

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const apiKey     = req.headers.get('x-api-key')
  const validCron  = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const validAdmin = apiKey !== null && apiKey === process.env.AUTH_API_KEY
  if (!validCron && !validAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Reclaim anything a prior run left mid-flight: if the function was killed
  // (timeout) while uploading, that item stays "processing" and would jam the
  // front of the queue forever. Mark such items "error" so the queue moves on.
  await supabase
    .from('drive_queue')
    .update({ status: 'error', error: 'Upload interrupted (run timed out) — re-queue to retry' })
    .eq('status', 'processing')

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
      let slackUrl = item.url_private_download

      // First attempt
      let driveUrl: string
      try {
        driveUrl = await uploadFile({
          slackUrl,
          fileName:   item.file_name,
          mimeType:   item.mimetype,
          clientName: item.client_name,
        })
      } catch (firstErr) {
        // Refresh the stored URL when it's expired: Slack signals this either as a
        // 404 OR as an HTTP-200 HTML auth page (caught in downloadFromSlack).
        if (!/404|returned HTML/i.test(String(firstErr))) throw firstErr

        console.warn(`[drive-sync] stale/HTML URL on ${item.file_name} — refreshing Slack URL...`)
        const freshUrl = await getFreshSlackUrl(item.slack_file_id, item.file_name, supabase)
        if (!freshUrl) throw new Error(`Slack download failed: stale URL and could not refresh`)

        // Persist the fresh URL so future retries don't need to refresh again
        slackUrl = freshUrl
        await supabase
          .from('drive_queue')
          .update({ url_private_download: freshUrl })
          .eq('id', item.id)

        // Retry upload with fresh URL
        driveUrl = await uploadFile({
          slackUrl:   freshUrl,
          fileName:   item.file_name,
          mimeType:   item.mimetype,
          clientName: item.client_name,
        })
      }

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

// ── Slack URL refresh ─────────────────────────────────────────────────────────

/**
 * When a stored url_private_download has expired (404), fetch a fresh one.
 *
 * Two strategies:
 *  1. Real Slack file ID  → files.info returns current download URL directly
 *  2. Backfill entry      → slack_file_id starts with "backfill-", so look up
 *     the asset's slack_message_ts and call conversations.history to find
 *     the file by name in the original message
 */
async function getFreshSlackUrl(
  slackFileId: string,
  fileName:    string,
  supabase:    ReturnType<typeof createServerClient>,
): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return null

  // Strategy 1: real Slack file ID
  if (!slackFileId.startsWith('backfill-')) {
    try {
      const res  = await fetch(`https://slack.com/api/files.info?file=${slackFileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json() as { ok: boolean; file?: { url_private_download?: string } }
      if (json.ok && json.file?.url_private_download) {
        console.log(`[drive-sync] refreshed URL via files.info for ${fileName}`)
        return json.file.url_private_download
      }
    } catch { /* fall through to strategy 2 */ }
  }

  // Strategy 2: look up the asset's message TS and re-fetch from conversations.history
  const { data: asset } = await supabase
    .from('assets')
    .select('slack_message_ts, slack_channel_id')
    .eq('file_name', fileName)
    .not('slack_message_ts', 'is', null)
    .limit(1)
    .maybeSingle()

  if (!asset?.slack_message_ts) return null

  const channelId = asset.slack_channel_id ?? SLACK_CHANNEL_ID
  try {
    const res  = await fetch(
      `https://slack.com/api/conversations.history?channel=${channelId}&latest=${asset.slack_message_ts}&limit=1&inclusive=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const json = await res.json() as {
      ok: boolean
      messages?: Array<{ files?: Array<{ name?: string; url_private_download?: string }> }>
    }
    const file = json.messages?.[0]?.files?.find(f => f.name === fileName)
    if (file?.url_private_download) {
      console.log(`[drive-sync] refreshed URL via conversations.history for ${fileName}`)
      return file.url_private_download
    }
  } catch { /* give up */ }

  return null
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

    let linkCol = board.columns.find(c => c.type === 'link')
    if (!linkCol) {
      // Auto-create link column if the board doesn't have one yet
      const created = await mondayQuery<{ create_column: { id: string; title: string } }>(`
        mutation($boardId: ID!, $title: String!, $colType: ColumnType!) {
          create_column(board_id: $boardId, title: $title, column_type: $colType) { id title }
        }
      `, { boardId: board.id, title: 'Link', colType: 'link' }).catch(() => null)
      if (!created) return
      linkCol = { id: created.create_column.id, title: created.create_column.title, type: 'link' }
    }

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
