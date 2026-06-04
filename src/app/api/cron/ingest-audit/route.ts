/**
 * GET /api/cron/ingest-audit
 *
 * Safety net for the real-time Slack webhook (/api/slack). If the webhook
 * ever misses events — e.g. the submissions channel goes private, the app
 * is mid-deploy, or Slack disables the subscription — this audit reads the
 * channel directly via conversations.history and self-heals:
 *
 *   1. Inserts any posted asset that isn't in the tracker yet.
 *   2. Reconciles missed approvals: a Pending Review asset whose Slack
 *      message now carries Libby's ✅ / ✔️ / ❌ is advanced accordingly.
 *   3. Refreshes the delivery counters for any client it touched.
 *   4. Posts a Slack alert (to the asset-needs channel) ONLY when it had to
 *      heal something, so a silent webhook failure becomes visible.
 *
 * It never downgrades or clobbers assets that have moved past Pending Review,
 * so it's safe to run often.
 *
 * Manual run:
 *   curl ".../api/cron/ingest-audit" -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Required env: CRON_SECRET, SLACK_BOT_TOKEN, NEXT_PUBLIC_SUPABASE_URL,
 *               SUPABASE_SERVICE_ROLE_KEY, (optional) SLACK_ASSET_NEEDS_CHANNEL_ID
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseFilename, inferStage } from '@/lib/parser'
import { SLACK_CHANNEL_ID, ASSET_NEEDS_CHANNEL_ID } from '@/lib/constants'
import { refreshDeliveredCount } from '@/lib/deliveries'

// Libby's Slack user ID — only her reactions count as approvals (matches /api/slack)
const LIBBY_USER_ID = 'U0B608MGUPJ'
const LOOKBACK_HOURS = 72

interface SlackReaction { name: string; users?: string[]; count: number }
interface SlackFile { name?: string; mimetype?: string; url_private_download?: string }
interface SlackMessage { ts: string; files?: SlackFile[]; reactions?: SlackReaction[] }

type Approval =
  | { kind: 'approve'; status: 'Ready to Upload'; ad_only: boolean }
  | { kind: 'remove' }
  | null

function approvalFromReactions(reactions: SlackReaction[] | undefined): Approval {
  const byLibby = (name: string) =>
    reactions?.some(r => r.name === name && (r.users?.includes(LIBBY_USER_ID) ?? false)) ?? false
  if (byLibby('x')) return { kind: 'remove' }
  if (byLibby('white_check_mark')) return { kind: 'approve', status: 'Ready to Upload', ad_only: false }
  if (byLibby('heavy_check_mark')) return { kind: 'approve', status: 'Ready to Upload', ad_only: true }
  return null
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'SLACK_BOT_TOKEN not set' }, { status: 500 })

  const supabase = createServerClient()
  const oldest = Math.floor((Date.now() - LOOKBACK_HOURS * 3600 * 1000) / 1000).toString()

  // ── Pull recent channel history ──────────────────────────────────────────────
  const messages: SlackMessage[] = []
  let cursor: string | undefined
  try {
    do {
      const url = new URL('https://slack.com/api/conversations.history')
      url.searchParams.set('channel', SLACK_CHANNEL_ID)
      url.searchParams.set('oldest', oldest)
      url.searchParams.set('limit', '200')
      if (cursor) url.searchParams.set('cursor', cursor)
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json() as { ok: boolean; error?: string; messages?: SlackMessage[]; response_metadata?: { next_cursor?: string } }
      if (!data.ok) return NextResponse.json({ error: `Slack: ${data.error}` }, { status: 502 })
      for (const m of (data.messages ?? [])) messages.push(m)
      cursor = data.response_metadata?.next_cursor || undefined
    } while (cursor)
  } catch (err) {
    return NextResponse.json({ error: `history fetch failed: ${String(err)}` }, { status: 502 })
  }

  // ── Resolve client / product lookups ─────────────────────────────────────────
  const { data: clients } = await supabase.from('clients').select('id, name, billing_day')
  const { data: products } = await supabase.from('products').select('id, name, client_id')
  const clientByName = new Map((clients ?? []).map(c => [c.name, c.id]))
  const billingDayByClient = new Map((clients ?? []).map(c => [c.id, c.billing_day ?? 1]))
  const productByNameClient = new Map((products ?? []).map(p => [`${p.client_id}:${p.name}`, p.id]))

  const healedInserts: string[] = []
  const healedApprovals: string[] = []
  const affectedClients = new Set<string>()

  for (const msg of messages) {
    if (!msg.files?.length) continue
    const approval = approvalFromReactions(msg.reactions)

    for (const f of msg.files) {
      if (!f.name) continue
      const parsed = parseFilename(f.name)
      if (!parsed.clientName) continue
      const clientId = clientByName.get(parsed.clientName)
      if (!clientId) continue

      const { data: existing } = await supabase
        .from('assets')
        .select('id, status')
        .eq('file_name', f.name)
        .eq('client_id', clientId)
        .maybeSingle()

      if (!existing) {
        // ── Gap fill: asset was never ingested ──
        let productId = parsed.productName
          ? productByNameClient.get(`${clientId}:${parsed.productName}`)
          : undefined
        if (!productId) {
          const fallback = (products ?? []).find(p => p.client_id === clientId)
          if (!fallback) continue
          productId = fallback.id
        }
        const stage = parsed.stage ?? inferStage(f.name, parsed.contentType)

        let status: 'Pending Review' | 'Ready to Upload' | 'Removed by Request' = 'Pending Review'
        let adOnly = false
        if (approval?.kind === 'remove') status = 'Removed by Request'
        else if (approval?.kind === 'approve') { status = approval.status; adOnly = approval.ad_only }

        const { error } = await supabase.from('assets').upsert({
          client_id: clientId,
          product_id: productId,
          stage,
          asset_name: f.name.replace(/\.[^.]+$/, ''),
          content_type: parsed.contentType,
          file_name: f.name,
          status,
          ad_only: adOnly,
          date_added: parsed.dateAdded
            ? parsed.dateAdded.toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
          posted_by: parsed.postedBy,
          notes: parsed.confidence === 'low' ? 'Auto-detected by ingest audit (low confidence — verify)' : 'Recovered by ingest audit',
          slack_message_ts: msg.ts,
          slack_channel_id: SLACK_CHANNEL_ID,
        }, { onConflict: 'file_name,client_id' })

        if (!error) { healedInserts.push(f.name); affectedClients.add(clientId) }
      } else if (existing.status === 'Pending Review' && approval) {
        // ── Reconcile an approval/removal the webhook missed ──
        if (approval.kind === 'remove') {
          await supabase.from('assets').update({ status: 'Removed by Request' }).eq('id', existing.id)
        } else {
          await supabase.from('assets').update({ status: approval.status, ad_only: approval.ad_only }).eq('id', existing.id)
        }
        healedApprovals.push(f.name); affectedClients.add(clientId)
      }
    }
  }

  // ── Refresh counters for touched clients ─────────────────────────────────────
  for (const cid of affectedClients) {
    await refreshDeliveredCount(supabase, cid, billingDayByClient.get(cid) ?? 1)
  }

  // ── Log + alert only when something was actually healed ──────────────────────
  const healed = healedInserts.length + healedApprovals.length
  if (healed > 0) {
    await supabase.from('slack_pulls').insert({
      assets_found: healed,
      assets_added: healedInserts.length,
      notes: `Ingest audit healed gaps — added: ${healedInserts.join(', ') || 'none'}; approvals: ${healedApprovals.join(', ') || 'none'}`,
    })

    if (ASSET_NEEDS_CHANNEL_ID) {
      const text =
        `:wrench: *Ingest audit recovered ${healed} item(s) the live webhook missed.*\n` +
        (healedInserts.length ? `• Added to tracker: ${healedInserts.join(', ')}\n` : '') +
        (healedApprovals.length ? `• Approvals synced: ${healedApprovals.join(', ')}\n` : '') +
        `Heads up: real-time ingestion may have a gap — check the Event Subscription for the submissions channel.`
      try {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: ASSET_NEEDS_CHANNEL_ID, text }),
        })
      } catch { /* alert is best-effort */ }
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: messages.length,
    healed_inserts: healedInserts,
    healed_approvals: healedApprovals,
  })
}
