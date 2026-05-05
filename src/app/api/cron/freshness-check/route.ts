/**
 * GET /api/cron/freshness-check
 *
 * Runs daily (via Vercel Cron at 0 9 * * *).
 * Finds all Live/Running and Needs Refresh assets that have crossed the
 * REFRESH_SOON_DAYS threshold and haven't been alerted yet, then:
 *   1. Posts a grouped alert to #asset-needs in Slack
 *   2. Stamps refresh_notified_at on each asset so it won't alert again
 *
 * Required env vars:
 *   CRON_SECRET                  — must match Authorization: Bearer header
 *   SLACK_BOT_TOKEN              — bot token with chat:write scope
 *   SLACK_ASSET_NEEDS_CHANNEL_ID — channel ID for #asset-needs
 *   NEXT_PUBLIC_APP_URL          — e.g. https://verb.vercel.app (for deep links)
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

function daysSince(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24)
  )
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
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify caller (Vercel cron sets Authorization: Bearer <CRON_SECRET>)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const channelId = process.env.SLACK_ASSET_NEEDS_CHANNEL_ID
  if (!channelId) {
    return NextResponse.json({ error: 'SLACK_ASSET_NEEDS_CHANNEL_ID not configured' }, { status: 500 })
  }

  const supabase = createServerClient()

  // Fetch assets not yet notified, in eligible statuses, with product + client data
  const { data: assets, error } = await supabase
    .from('assets')
    .select(`
      id, status, stage, content_type, date_added, date_live, client_id,
      product:products(name),
      client:clients(id, name, slug)
    `)
    .in('status', ['Live / Running', 'Needs Refresh / Missing'])
    .is('refresh_notified_at', null)

  if (error) {
    console.error('[freshness-check] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter to assets that have crossed the Refresh Soon threshold
  const needsAlert = (assets ?? []).filter(asset => {
    const dateStr = getRelevantDate(asset)
    return dateStr ? daysSince(dateStr) >= REFRESH_SOON_DAYS : false
  })

  if (!needsAlert.length) {
    return NextResponse.json({ ok: true, alerted: 0, message: 'Nothing new in Refresh Soon' })
  }

  // Group by client
  const byClient = new Map<string, typeof needsAlert>()
  for (const asset of needsAlert) {
    const key = asset.client_id
    if (!byClient.has(key)) byClient.set(key, [])
    byClient.get(key)!.push(asset)
  }

  const token = process.env.SLACK_BOT_TOKEN
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  let totalAlerted = 0

  for (const [, clientAssets] of byClient) {
    const client = clientAssets[0].client as { id: string; name: string; slug: string } | null
    if (!client) continue

    // Sort by days live descending (most urgent first)
    const sorted = [...clientAssets].sort((a, b) => {
      const da = getRelevantDate(a) ?? ''
      const db = getRelevantDate(b) ?? ''
      return daysSince(db) - daysSince(da)
    })

    // Build asset lines grouped by stage
    const stages = ['Awareness', 'Consideration', 'Conversion']
    const stageBlocks: string[] = []

    for (const stage of stages) {
      const stageAssets = sorted.filter(a => a.stage === stage)
      if (!stageAssets.length) continue

      const emoji = STAGE_EMOJI[stage] ?? '•'
      const suggestion = STAGE_SUGGESTION[stage] ?? ''
      const lines = stageAssets.map(a => {
        const days = daysSince(getRelevantDate(a) ?? '')
        const type = a.content_type ?? 'Unknown type'
        return `    › ${type} — *${days} days* live`
      })

      stageBlocks.push(
        `${emoji} *${stage}*\n${lines.join('\n')}\n    _Ask: ${suggestion}_`
      )
    }

    const bodyText = stageBlocks.join('\n\n')

    const message = {
      channel: channelId,
      text: `🔄 Refresh alert for ${client.name} — creative needed`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🔄 Refresh Alert — ${client.name}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `These assets have hit *Refresh Soon* (${REFRESH_SOON_DAYS}+ days live). New creative should be in the pipeline *now* to avoid fatigue.`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: bodyText,
          },
        },
        { type: 'divider' },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              style: 'primary',
              text: { type: 'plain_text', text: `View ${client.name} Missing Coverage →`, emoji: true },
              url: `${appUrl}/${client.slug}`,
            },
          ],
        },
      ],
    }

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    const slackData = await res.json() as { ok: boolean; error?: string }
    if (!slackData.ok) {
      console.error(`[freshness-check] Slack error for ${client.name}:`, slackData.error)
      continue
    }

    // Mark assets as notified so they don't alert again
    const ids = clientAssets.map(a => a.id)
    await supabase
      .from('assets')
      .update({ refresh_notified_at: new Date().toISOString() })
      .in('id', ids)

    totalAlerted += ids.length
  }

  return NextResponse.json({ ok: true, alerted: totalAlerted })
}
