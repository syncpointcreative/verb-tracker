/**
 * POST /api/slack
 *
 * Slack Event API webhook — receives file_shared and message events
 * from the #creative-asset-submissions-only channel and upserts assets.
 *
 * Slack setup:
 *   1. Enable "Event Subscriptions" in your Slack app config
 *   2. Subscribe to: message.channels (or files:read)
 *   3. Set the Request URL to: https://<your-domain>/api/slack
 *   4. Add SLACK_SIGNING_SECRET + SLACK_BOT_TOKEN to your Vercel env vars
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseFilename, inferStage } from '@/lib/parser'
import { SLACK_CHANNEL_ID } from '@/lib/constants'
import { refreshDeliveredCount } from '@/lib/deliveries'

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

  // Collect file names from the event
  const fileNames: string[] = []

  if (event.type === 'message' && event.files) {
    for (const f of event.files as Array<{ name?: string }>) {
      if (f.name) fileNames.push(f.name)
    }
  } else if (event.type === 'file_shared' && event.file_id) {
    // For file_shared events we only have the file ID; name must be in event.file
    const file = event.file as Record<string, unknown> | undefined
    if (file?.name) fileNames.push(file.name as string)
  }

  if (!fileNames.length) return NextResponse.json({ ok: true })

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

  for (const fileName of fileNames) {
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

    const stage = inferStage(fileName, parsed.contentType)

    const asset = {
      client_id: clientId,
      product_id: productId,
      stage,
      asset_name: fileName.replace(/\.[^.]+$/, ''), // strip extension for display
      content_type: parsed.contentType,
      file_name: fileName,
      status: 'Ready to Upload' as const,
      date_added: parsed.dateAdded
        ? parsed.dateAdded.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      posted_by: parsed.postedBy,
      notes: parsed.confidence === 'low' ? 'Auto-detected (low confidence — please verify)' : null,
      slack_message_ts: slackTs ?? null,
      slack_channel_id: SLACK_CHANNEL_ID,
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
    assets_found: fileNames.length,
    assets_added: added,
    notes: `Webhook ingest — ${fileNames.join(', ')}`,
  })

  return NextResponse.json({ ok: true, added })
}
