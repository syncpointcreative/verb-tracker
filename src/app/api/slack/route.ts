/**
 * POST /api/slack
 *
 * Slack Event API webhook — handles three event types:
 *
 * 1. message / file_shared  — ingest new assets from #creative-asset-submissions-only
 * 2. message (subtype: message_deleted) — mark assets as "Removed by Request"
 * 3. reaction_added
 *      ✅ from Libby → queue file for Drive upload + create Monday item
 *      ✔️ from Libby → queue file for Drive upload only (ad_only, no Monday item)
 *      ❌ from Libby → mark asset "Removed by Request" + cancel any pending Drive queue entry
 *
 * Slack setup:
 *   1. Enable "Event Subscriptions" in your Slack app config
 *   2. Subscribe to bot events: message.channels, reaction_added
 *   3. Set the Request URL to: https://<your-domain>/api/slack
 *   4. Add SLACK_SIGNING_SECRET + SLACK_BOT_TOKEN to your Vercel env vars
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseFilename, inferStage } from '@/lib/parser'
import { SLACK_CHANNEL_ID, SLACK_WORKSPACE_URL } from '@/lib/constants'
import { refreshDeliveredCount } from '@/lib/deliveries'
import {
  findBoardByName,
  findOrCreateIncomingGroup,
  findUserByName,
  createContentItem,
  type MondayBoard,
  type MondayUser,
} from '@/lib/monday'

// Libby's Slack user ID — only her ✅ reactions trigger Drive upload
const LIBBY_USER_ID = 'U0B608MGUPJ'

// ─── Slack signature verification ────────────────────────────────────────────

async function verifySlackSignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return false

  const timestamp = req.headers.get('x-slack-request-timestamp')
  const signature = req.headers.get('x-slack-signature')
  if (!timestamp || !signature) return false

  // Reject requests older than 5 minutes (replay attack prevention)
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) return false

  const sigBase = `v0:${timestamp}:${rawBody}`
  const computed = 'v0=' + createHmac('sha256', secret).update(sigBase).digest('hex')

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}

// ─── Slack message helpers ────────────────────────────────────────────────────

/** Return all Slack file IDs attached to a message (used to cancel Drive queue entries). */
async function getFileIdsForMessage(messageTs: string): Promise<string[]> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return []

  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL_ID}&latest=${messageTs}&limit=1&inclusive=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const json = await res.json() as {
    ok: boolean
    messages?: Array<{ files?: Array<{ id: string }> }>
  }
  return json.messages?.[0]?.files?.map(f => f.id) ?? []
}

/**
 * Fetch the message at `messageTs` from the submissions channel,
 * resolve each attached file's client name, and insert pending rows
 * into drive_queue for the hourly cron to process.
 */
async function queueApprovedFiles(messageTs: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return

  // Fetch the specific message
  const historyRes = await fetch(
    `https://slack.com/api/conversations.history?channel=${SLACK_CHANNEL_ID}&latest=${messageTs}&limit=1&inclusive=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const history = await historyRes.json() as {
    ok: boolean
    messages?: Array<{
      files?: Array<{
        id: string
        name: string
        url_private_download: string
        mimetype: string
      }>
    }>
  }

  const message = history.messages?.[0]
  if (!message?.files?.length) return

  const supabase = createServerClient()
  const { data: clients } = await supabase.from('clients').select('id, name')
  const clientByName = new Map((clients ?? []).map(c => [c.name, c.id]))

  for (const file of message.files) {
    const parsed = parseFilename(file.name)
    if (!parsed.clientName) continue
    if (!clientByName.has(parsed.clientName)) continue

    // Avoid re-queuing the same file if reacted again
    const { data: existing } = await supabase
      .from('drive_queue')
      .select('id')
      .eq('slack_file_id', file.id)
      .in('status', ['pending', 'processing', 'done'])
      .limit(1)

    if (existing?.length) continue

    await supabase.from('drive_queue').insert({
      slack_file_id:        file.id,
      file_name:            file.name,
      url_private_download: file.url_private_download,
      mimetype:             file.mimetype || 'video/mp4',
      client_name:          parsed.clientName,
      status:               'pending',
    })
  }
}

// ─── Monday.com: create items on ✅ approval ──────────────────────────────────

/**
 * For each asset tied to this Slack message, create a Monday.com item in the
 * client's "📥 Incoming Assets" group. Stores the returned item ID on the asset
 * row so the drive-sync cron can later update the link column with the Drive URL.
 *
 * Non-fatal: any Monday failure is logged but does not break the approval flow.
 * Only called on ✅ (white_check_mark) — not on ✔️ (heavy_check_mark / ad_only).
 */
async function createMondayItemsForApproval(
  messageTs: string,
  supabase:  ReturnType<typeof createServerClient>,
): Promise<void> {
  if (!process.env.MONDAY_API_TOKEN) return // silently skip if not configured

  // Fetch the approved assets with their product + client info
  const { data: assets } = await supabase
    .from('assets')
    .select(`
      id, asset_name, file_name, posted_by, content_type, monday_item_id,
      product:products(name),
      client:clients(id, name)
    `)
    .eq('slack_message_ts', messageTs)
    .eq('slack_channel_id', SLACK_CHANNEL_ID)

  if (!assets?.length) return

  // Build Slack message deep-link
  const slackLink = `${SLACK_WORKSPACE_URL}/archives/${SLACK_CHANNEL_ID}/p${messageTs.replace('.', '')}`

  // Look up Libby once — shared assignee across all items
  let libby: MondayUser | null = null
  try { libby = await findUserByName('libby') } catch { /* unassigned is fine */ }

  // Group by client to minimise board lookups (one listBoards() call per client)
  const byClientId = new Map<string, typeof assets>()
  for (const asset of assets) {
    // Skip assets that already have a Monday item — prevents duplicates on double-reaction
    if (asset.monday_item_id) continue
    const clientId = (asset.client as unknown as { id: string } | null)?.id
    if (!clientId) continue
    if (!byClientId.has(clientId)) byClientId.set(clientId, [])
    byClientId.get(clientId)!.push(asset)
  }

  for (const [, clientAssets] of byClientId) {
    const client = clientAssets[0].client as unknown as { id: string; name: string } | null
    if (!client) continue

    let board: MondayBoard | null = null
    try {
      board = await findBoardByName(client.name)
    } catch (err) {
      console.error(`[slack/monday] board lookup failed for ${client.name}:`, err)
      continue
    }
    if (!board) {
      console.warn(`[slack/monday] no board found for client "${client.name}" — skipping`)
      continue
    }

    let groupId: string
    try {
      groupId = await findOrCreateIncomingGroup(board.id)
    } catch (err) {
      console.error(`[slack/monday] group create failed for board ${board.id}:`, err)
      continue
    }

    const peopleCol = board.columns.find(c => c.type === 'multiple-person' || c.type === 'people')
    const linkCol   = board.columns.find(c => c.type === 'link')

    for (const asset of clientAssets) {
      // Parse a clean title from the filename (e.g. "MorningFuel" → "Morning Fuel")
      // Fall back to asset_name if parsing yields nothing useful
      const parsed    = asset.file_name ? parseFilename(asset.file_name) : null
      const title     = parsed?.title ?? asset.asset_name
      const creator   = asset.posted_by ?? parsed?.postedBy ?? null
      const itemName  = creator ? `${title} — ${creator}` : title

      try {
        const itemId = await createContentItem({
          boardId:     board.id,
          groupId,
          itemName,
          assigneeId:  libby?.id,
          peopleColId: peopleCol?.id,
          linkUrl:     slackLink,
          linkText:    'View in Slack',
          linkColId:   linkCol?.id,
        })

        await supabase
          .from('assets')
          .update({ monday_item_id: itemId })
          .eq('id', asset.id)

        console.log(`[slack/monday] created item ${itemId} for asset ${asset.id} (${itemName})`)
      } catch (err) {
        console.error(`[slack/monday] item creation failed for asset ${asset.id}:`, err)
      }
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  // Slack URL verification challenge — must respond before signature check
  // because the signing secret isn't known yet during initial setup
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  // Verify signature for all other requests
  const valid = await verifySlackSignature(req, rawBody)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Only handle events from our channel
  const event = payload.event as Record<string, unknown> | undefined
  if (!event) return NextResponse.json({ ok: true })

  // ─── reaction_added ───────────────────────────────────────────────────────
  if (event.type === 'reaction_added') {
    const reaction    = event.reaction as string | undefined
    const userId      = event.user as string | undefined
    const item        = event.item as Record<string, unknown> | undefined
    const itemChannel = item?.channel as string | undefined
    const messageTs   = item?.ts as string | undefined

    if (userId === LIBBY_USER_ID && itemChannel === SLACK_CHANNEL_ID && messageTs) {
      if (reaction === 'white_check_mark') {
        // ✅ — approve for ads + counts toward monthly asset counter + Monday item
        await queueApprovedFiles(messageTs)

        const supabase = createServerClient()
        await supabase
          .from('assets')
          .update({ status: 'Ready to Upload', ad_only: false })
          .eq('slack_message_ts', messageTs)
          .eq('slack_channel_id', SLACK_CHANNEL_ID)
          .eq('status', 'Pending Review')

        // Create Monday.com items for ✅-approved assets (non-fatal if Monday is down)
        await createMondayItemsForApproval(messageTs, supabase).catch(err =>
          console.error('[slack/monday] createMondayItemsForApproval failed:', err)
        )

        // Refresh delivered count (ad_only=false so this asset counts)
        const { data: affected } = await supabase
          .from('assets')
          .select('client_id')
          .eq('slack_message_ts', messageTs)
          .eq('slack_channel_id', SLACK_CHANNEL_ID)
          .limit(1)
        if (affected?.[0]) {
          const { data: clientRow } = await supabase
            .from('clients')
            .select('billing_day')
            .eq('id', affected[0].client_id)
            .single()
          await refreshDeliveredCount(supabase, affected[0].client_id, clientRow?.billing_day ?? 1)
        }

      } else if (reaction === 'heavy_check_mark') {
        // ✔️ — approve for ads ONLY (does not count toward monthly asset counter)
        await queueApprovedFiles(messageTs)

        const supabase = createServerClient()
        await supabase
          .from('assets')
          .update({ status: 'Ready to Upload', ad_only: true })
          .eq('slack_message_ts', messageTs)
          .eq('slack_channel_id', SLACK_CHANNEL_ID)
          .eq('status', 'Pending Review')

        // No refreshDeliveredCount — ad_only assets are excluded from the counter

      } else if (reaction === 'x') {
        // ❌ — reject: mark assets removed + cancel any pending Drive queue entries
        const supabase = createServerClient()

        await supabase
          .from('assets')
          .update({ status: 'Removed by Request' })
          .eq('slack_message_ts', messageTs)
          .eq('slack_channel_id', SLACK_CHANNEL_ID)

        // Cancel pending Drive uploads so rejected files don't get synced
        await supabase
          .from('drive_queue')
          .update({ status: 'error', error: 'Rejected by Libby (❌ reaction)' })
          .eq('status', 'pending')
          .in(
            'slack_file_id',
            // sub-select file IDs via a raw match isn't available, so we fetch them first
            await getFileIdsForMessage(messageTs)
          )
      }
    }
    return NextResponse.json({ ok: true })
  }

  const channelId = (event.channel ?? event.channel_id) as string | undefined
  if (channelId && channelId !== SLACK_CHANNEL_ID) {
    return NextResponse.json({ ok: true }) // ignore other channels
  }

  // Skip thread replies — only process original top-level posts
  const slackTs       = event.ts as string | undefined
  const slackThreadTs = event.thread_ts as string | undefined
  if (slackThreadTs && slackThreadTs !== slackTs) {
    return NextResponse.json({ ok: true }) // reply in a thread — ignore
  }

  // ─── message_deleted: mark any assets from that message as Removed ────────
  if (event.type === 'message' && event.subtype === 'message_deleted') {
    const deletedTs = event.deleted_ts as string | undefined
    if (deletedTs) {
      const supabase = createServerClient()
      await supabase
        .from('assets')
        .update({ status: 'Removed by Request' })
        .eq('slack_message_ts', deletedTs)
        .eq('slack_channel_id', SLACK_CHANNEL_ID)

      // Also cancel any pending Drive queue entries for this message
      await supabase
        .from('drive_queue')
        .update({ status: 'error', error: 'Source message deleted from Slack' })
        .eq('status', 'pending')
        .in('slack_file_id', await getFileIdsForMessage(deletedTs))
    }
    return NextResponse.json({ ok: true })
  }

  // Collect files from the event (name + Slack URL + mimetype)
  interface SlackFile { name: string; url: string | null; mimetype: string | null }
  const slackFiles: SlackFile[] = []

  if (event.type === 'message' && event.files) {
    for (const f of event.files as Array<{ name?: string; url_private_download?: string; mimetype?: string }>) {
      if (f.name) slackFiles.push({
        name:     f.name,
        url:      f.url_private_download ?? null,
        mimetype: f.mimetype ?? null,
      })
    }
  } else if (event.type === 'file_shared' && event.file_id) {
    const file = event.file as Record<string, unknown> | undefined
    if (file?.name) slackFiles.push({
      name:     file.name as string,
      url:      (file.url_private_download as string) ?? null,
      mimetype: (file.mimetype as string) ?? null,
    })
  }

  if (!slackFiles.length) return NextResponse.json({ ok: true })

  const supabase = createServerClient()

  // Resolve client/product IDs from our Supabase tables
  const { data: clients } = await supabase.from('clients').select('id, name, billing_day')
  const { data: products } = await supabase.from('products').select('id, name, client_id')

  const clientByName = new Map((clients ?? []).map(c => [c.name, c.id]))
  const billingDayByClient = new Map((clients ?? []).map(c => [c.id, c.billing_day ?? 1]))
  const productByNameClient = new Map(
    (products ?? []).map(p => [`${p.client_id}:${p.name}`, p.id])
  )

  let added = 0

  for (const slackFile of slackFiles) {
    const { name: fileName, url: slackFileUrl, mimetype: slackMimetype } = slackFile

    const parsed = parseFilename(fileName)
    if (!parsed.clientName) continue // can't assign without a client

    const clientId = clientByName.get(parsed.clientName)
    if (!clientId) continue

    // Find best-matching product, or skip if none
    let productId: string | undefined
    if (parsed.productName) {
      productId = productByNameClient.get(`${clientId}:${parsed.productName}`)
    }
    if (!productId) {
      // Fall back to first product for this client
      const fallback = (products ?? []).find(p => p.client_id === clientId)
      if (!fallback) continue
      productId = fallback.id
    }

    // Use explicit stage code from filename (AWA/CON/CVR) if present; otherwise infer from content
    const stage = parsed.stage ?? inferStage(fileName, parsed.contentType)

    const asset = {
      client_id: clientId,
      product_id: productId,
      stage,
      asset_name: fileName.replace(/\.[^.]+$/, ''), // strip extension for display
      content_type: parsed.contentType,
      file_name: fileName,
      status: 'Pending Review' as const,
      date_added: parsed.dateAdded
        ? parsed.dateAdded.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      posted_by: parsed.postedBy,
      notes: parsed.confidence === 'low' ? 'Auto-detected (low confidence — please verify)' : null,
      slack_message_ts: slackTs ?? null,
      slack_channel_id: SLACK_CHANNEL_ID,
      // Store Slack file URL at ingest so we can preview before ✅ approval
      slack_file_url:  slackFileUrl,
      slack_mimetype:  slackMimetype,
    }

    // Upsert by file_name + client to avoid duplicates on re-delivery
    const { error } = await supabase
      .from('assets')
      .upsert(asset, { onConflict: 'file_name,client_id' })
      .select()

    if (!error) {
      added++
      // Auto-update delivered count for this client: baseline + asset count for current period
      await refreshDeliveredCount(supabase, clientId, billingDayByClient.get(clientId) ?? 1)
    }
  }

  // Log the pull
  await supabase.from('slack_pulls').insert({
    assets_found: slackFiles.length,
    assets_added: added,
    notes: `Webhook ingest — ${slackFiles.map(f => f.name).join(', ')}`,
  })

  return NextResponse.json({ ok: true, added })
}
