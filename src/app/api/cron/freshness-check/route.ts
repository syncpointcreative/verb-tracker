/**
 * GET /api/cron/freshness-check
 *
 * Runs Monday and Thursday via Vercel cron.
 *
 * Monday — "This Week's Content Needs"
 *   All assets ≥15 days live, grouped by client/stage.
 *   Stamps refresh_notified_at so Thursday can track the week's baseline.
 *
 * Thursday — "Remaining Content Needs"
 *   Takes Monday's list, checks which product+stage combos got new
 *   Slack-submitted creative this week. Shows strikethrough for completed,
 *   bold for still outstanding.
 *
 * Manual testing:
 *   curl ".../api/cron/freshness-check?run=monday" -H "Authorization: Bearer <CRON_SECRET>"
 *   curl ".../api/cron/freshness-check?run=thursday" -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Required env vars:
 *   CRON_SECRET                  — must match Authorization: Bearer header
 *   SLACK_BOT_TOKEN              — bot token with chat:write scope
 *   SLACK_ASSET_NEEDS_CHANNEL_ID — channel ID for #asset-needs
 *   NEXT_PUBLIC_APP_URL          — e.g. https://verb-tracker.vercel.app
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { REFRESH_SOON_DAYS } from '@/lib/constants'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRelevantDate(asset: {
  status: string
  date_live: string | null
  date_added: string | null
}): string | null {
  if (asset.status === 'Live / Running' && asset.date_live) return asset.date_live
  return asset.date_added
}

/** Compare whole UTC calendar days to avoid time-of-day drift. */
function daysSince(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  const then = Date.UTC(year, month - 1, day)
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - then) / (1000 * 60 * 60 * 24))
}

/** Returns the ISO timestamp for midnight UTC on the most recent Monday. */
function getMostRecentMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay() // 0=Sun, 1=Mon … 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)
  ).toISOString()
}

async function postToSlack(token: string, message: object): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
  return res.json() as Promise<{ ok: boolean; error?: string }>
}

const STAGE_EMOJI: Record<string, string> = {
  Awareness:     '👀',
  Consideration: '🤔',
  Conversion:    '🎯',
}

const STAGE_SUGGESTION: Record<string, string> = {
  Awareness:     'New hook video — stop the scroll, introduce product',
  Consideration: 'Fresh demo, tutorial, or testimonial showing value',
  Conversion:    'New promo/offer-led video with clear CTA',
  'Community Interaction': 'New community/engagement-led video (follows, likes, comments, shares)',
}

const STAGES = ['Awareness', 'Community Interaction', 'Consideration', 'Conversion']

// ─── Monday: Full weekly alert ───────────────────────────────────────────────

async function runMondayAlert(
  supabase: ReturnType<typeof createServerClient>,
  channelId: string,
  appUrl: string,
  token: string
) {
  // Paused assets are intentionally offline (e.g. out of stock) — skip them
  const { data: assets, error } = await supabase
    .from('assets')
    .select(`
      id, status, stage, content_type, date_added, date_live, client_id, product_id,
      product:products(name, discontinued),
      client:clients(id, name, slug)
    `)
    .in('status', ['Live / Running', 'Needs Refresh / Missing'])

  if (error) {
    console.error('[freshness/monday] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const needsAlert = (assets ?? []).filter(a => {
    if ((a.product as unknown as { discontinued?: boolean } | null)?.discontinued) return false
    const d = getRelevantDate(a)
    return d ? daysSince(d) >= REFRESH_SOON_DAYS : false
  })

  if (!needsAlert.length) {
    return NextResponse.json({ ok: true, run: 'monday', alerted: 0, message: 'Nothing in Refresh Soon range' })
  }

  // Group by client
  const byClient = new Map<string, typeof needsAlert>()
  for (const a of needsAlert) {
    if (!byClient.has(a.client_id)) byClient.set(a.client_id, [])
    byClient.get(a.client_id)!.push(a)
  }

  let totalAlerted = 0

  for (const [, clientAssets] of byClient) {
    const client = clientAssets[0].client as unknown as { id: string; name: string; slug: string } | null
    if (!client) continue

    const count = clientAssets.length
    const sorted = [...clientAssets].sort((a, b) =>
      daysSince(getRelevantDate(b) ?? '') - daysSince(getRelevantDate(a) ?? '')
    )

    // One section block per stage (avoids Slack's 3000-char section limit)
    const stageBlocks = STAGES.flatMap(stage => {
      const stageAssets = sorted.filter(a => a.stage === stage)
      if (!stageAssets.length) return []

      const lines = stageAssets.map(a => {
        const days    = daysSince(getRelevantDate(a) ?? '')
        const product = (a.product as unknown as { name: string } | null)?.name ?? 'Unknown product'
        const type    = a.content_type ?? 'Unknown type'
        return `    › ${product} — ${type} — *${days} days* live`
      })

      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${STAGE_EMOJI[stage] ?? '•'} *${stage}*\n${lines.join('\n')}\n    _Ask: ${STAGE_SUGGESTION[stage] ?? ''}_`,
          },
        },
      ]
    })

    const message = {
      channel: channelId,
      text: `📋 This Week's Content Needs — ${client.name}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📋 This Week's Content Needs — ${client.name}`, emoji: true },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${count} asset${count !== 1 ? 's' : ''}* hitting Refresh Soon (${REFRESH_SOON_DAYS}+ days live). Get new creative in the pipeline this week.`,
          },
        },
        ...stageBlocks,
        { type: 'divider' },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: `View ${client.name} Dashboard →`, emoji: true },
            url: `${appUrl}/${client.slug}`,
          }],
        },
      ],
    }

    const result = await postToSlack(token, message)
    if (!result.ok) {
      console.error(`[freshness/monday] Slack error for ${client.name}:`, result.error)
      continue
    }

    // Stamp so Thursday knows this week's baseline
    await supabase
      .from('assets')
      .update({ refresh_notified_at: new Date().toISOString() })
      .in('id', clientAssets.map(a => a.id))

    totalAlerted += count
  }

  return NextResponse.json({ ok: true, run: 'monday', alerted: totalAlerted })
}

// ─── Thursday: Progress check ────────────────────────────────────────────────

async function runThursdayAlert(
  supabase: ReturnType<typeof createServerClient>,
  channelId: string,
  appUrl: string,
  token: string
) {
  const lastMonday = getMostRecentMonday()

  // All assets from Monday's batch (by refresh_notified_at, regardless of current status)
  const { data: mondayAssets, error } = await supabase
    .from('assets')
    .select(`
      id, status, stage, content_type, date_added, date_live, client_id, product_id,
      product:products(name, discontinued),
      client:clients(id, name, slug)
    `)
    .gte('refresh_notified_at', lastMonday)

  if (error) {
    console.error('[freshness/thursday] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!mondayAssets?.length) {
    return NextResponse.json({ ok: true, run: 'thursday', message: 'No assets from Monday alert — run Monday first' })
  }

  // New Slack-submitted content delivered since Monday (client:product:stage combos)
  const { data: newContent } = await supabase
    .from('assets')
    .select('client_id, product_id, stage')
    .not('slack_message_ts', 'is', null)
    .gte('created_at', lastMonday)

  const deliveredThisWeek = new Set(
    (newContent ?? []).map(a => `${a.client_id}:${a.product_id}:${a.stage}`)
  )

  // A need is completed only when new creative matching that client:product:stage
  // combo has been submitted to #creative-assets-only this week (has a slack_message_ts).
  // A pulled/removed asset does NOT count — that makes the need more urgent, not less.
  const isCompleted = (a: typeof mondayAssets[0]) =>
    deliveredThisWeek.has(`${a.client_id}:${a.product_id}:${a.stage}`)

  // Filter out discontinued products before building the report
  const activeAssets = mondayAssets.filter(
    a => !(a.product as unknown as { discontinued?: boolean } | null)?.discontinued
  )

  // Group by client
  const byClient = new Map<string, typeof activeAssets>()
  for (const a of activeAssets) {
    if (!byClient.has(a.client_id)) byClient.set(a.client_id, [])
    byClient.get(a.client_id)!.push(a)
  }

  let clientsPosted = 0

  for (const [, clientAssets] of byClient) {
    const client = clientAssets[0].client as unknown as { id: string; name: string; slug: string } | null
    if (!client) continue

    const remaining  = clientAssets.filter(a => !isCompleted(a))
    const completed  = clientAssets.filter(a => isCompleted(a))

    const stageBlocks = STAGES.flatMap(stage => {
      const stageAssets = clientAssets.filter(a => a.stage === stage)
      if (!stageAssets.length) return []

      const lines = stageAssets.map(a => {
        const product = (a.product as unknown as { name: string } | null)?.name ?? 'Unknown product'
        const type    = a.content_type ?? 'Unknown type'
        const days    = daysSince(getRelevantDate(a) ?? '')
        return isCompleted(a)
          ? `    ~› ${product} — ${type}~`
          : `    *› ${product} — ${type} — ${days} days live*`
      })

      return [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `${STAGE_EMOJI[stage] ?? '•'} *${stage}*\n${lines.join('\n')}` },
        },
      ]
    })

    const summaryText = remaining.length === 0
      ? `✅ All ${completed.length} assets addressed this week — great work!`
      : `*${remaining.length} still outstanding* · ${completed.length} completed this week`

    const message = {
      channel: channelId,
      text: `📌 Remaining Content Needs — ${client.name}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📌 Remaining Content Needs — ${client.name}`, emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: summaryText },
        },
        ...stageBlocks,
        { type: 'divider' },
        {
          type: 'actions',
          elements: [{
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: `View ${client.name} Dashboard →`, emoji: true },
            url: `${appUrl}/${client.slug}`,
          }],
        },
      ],
    }

    const result = await postToSlack(token, message)
    if (!result.ok) {
      console.error(`[freshness/thursday] Slack error for ${client.name}:`, result.error)
      continue
    }

    clientsPosted++
  }

  return NextResponse.json({ ok: true, run: 'thursday', clients_posted: clientsPosted })
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = process.env.SLACK_ASSET_NEEDS_CHANNEL_ID
  if (!channelId) {
    return NextResponse.json({ error: 'SLACK_ASSET_NEEDS_CHANNEL_ID not configured' }, { status: 500 })
  }

  const token  = process.env.SLACK_BOT_TOKEN ?? ''
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')

  // ?run=monday or ?run=thursday overrides day detection for manual testing
  const runOverride = req.nextUrl.searchParams.get('run')
  const dow         = new Date().getUTCDay() // 0=Sun 1=Mon … 4=Thu
  const isMonday    = runOverride === 'monday'   || (!runOverride && dow === 1)
  const isThursday  = runOverride === 'thursday' || (!runOverride && dow === 4)

  if (!isMonday && !isThursday) {
    return NextResponse.json({ ok: true, skipped: true, message: 'Only runs Monday and Thursday — use ?run=monday or ?run=thursday to test' })
  }

  const supabase = createServerClient()

  return isMonday
    ? runMondayAlert(supabase, channelId, appUrl, token)
    : runThursdayAlert(supabase, channelId, appUrl, token)
}
