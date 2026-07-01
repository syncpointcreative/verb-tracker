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

  // Parallel: fetch Ready-to-Upload assets (replacement already queued), all live
  // assets with tiktok_adgroup (for per-ad-group deck coverage), and all live assets
  // the scorer has flagged needs_replacing (performance-based creative replacements).
  const [rtuResult, liveResult, needsReplacingResult] = await Promise.all([
    supabase.from('assets').select('client_id, product_id, stage').eq('status', 'Ready to Upload'),
    supabase.from('assets').select('client_id, tiktok_adgroup').eq('status', 'Live / Running').not('tiktok_adgroup', 'is', null),
    supabase.from('assets')
      .select(`
        id, asset_name, stage, client_id, product_id, freshness_reason,
        product:products(name, discontinued),
        client:clients(id, name, slug)
      `)
      .eq('status', 'Live / Running')
      .eq('freshness_state', 'needs_replacing'),
  ])

  // client_id:product_id:stage combos that already have a replacement queued
  const coveredByRTU = new Set(
    (rtuResult.data ?? []).map(a => `${a.client_id}:${a.product_id}:${a.stage}`)
  )

  // Per-client adgroup live-creative counts (from scorer-matched assets only)
  const adgroupCounts = new Map<string, Map<string, number>>()
  for (const a of (liveResult.data ?? [])) {
    if (!a.tiktok_adgroup) continue
    if (!adgroupCounts.has(a.client_id)) adgroupCounts.set(a.client_id, new Map())
    const clientMap = adgroupCounts.get(a.client_id)!
    for (const ag of a.tiktok_adgroup.split(' · ').map((s: string) => s.trim()).filter(Boolean)) {
      clientMap.set(ag, (clientMap.get(ag) ?? 0) + 1)
    }
  }

  // Group needs by client
  const byClient = new Map<string, typeof needsAlert>()
  for (const a of needsAlert) {
    if (!byClient.has(a.client_id)) byClient.set(a.client_id, [])
    byClient.get(a.client_id)!.push(a)
  }

  let totalAlerted = 0

  for (const [, clientAssets] of byClient) {
    const client = clientAssets[0].client as unknown as { id: string; name: string; slug: string } | null
    if (!client) continue

    const isCovered = (a: typeof clientAssets[0]) =>
      coveredByRTU.has(`${a.client_id}:${a.product_id}:${a.stage}`)

    const uncoveredCount = clientAssets.filter(a => !isCovered(a)).length
    const coveredCount   = clientAssets.filter(a => isCovered(a)).length
    const count          = clientAssets.length

    const sorted = [...clientAssets].sort((a, b) =>
      daysSince(getRelevantDate(b) ?? '') - daysSince(getRelevantDate(a) ?? '')
    )

    // One section block per stage. Covered assets (RTU replacement queued) get a ✅
    // strikethrough; uncovered assets show the normal ask.
    const stageBlocks = STAGES.flatMap(stage => {
      const stageAssets = sorted.filter(a => a.stage === stage)
      if (!stageAssets.length) return []

      const needed  = stageAssets.filter(a => !isCovered(a))
      const covered = stageAssets.filter(a => isCovered(a))

      const lines: string[] = [
        ...needed.map(a => {
          const days    = daysSince(getRelevantDate(a) ?? '')
          const product = (a.product as unknown as { name: string } | null)?.name ?? 'Unknown product'
          const type    = a.content_type ?? 'Unknown type'
          return `    › ${product} — ${type} — *${days} days* live`
        }),
        ...covered.map(a => {
          const product = (a.product as unknown as { name: string } | null)?.name ?? 'Unknown product'
          const type    = a.content_type ?? 'Unknown type'
          return `    ✅ ~${product} — ${type}~ _(replacement in queue)_`
        }),
      ]

      const askLine = needed.length > 0 ? `\n    _Ask: ${STAGE_SUGGESTION[stage] ?? ''}_` : ''

      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${STAGE_EMOJI[stage] ?? '•'} *${stage}*\n${lines.join('\n')}${askLine}`,
          },
        },
      ]
    })

    // Performance-based replacements — assets the scorer flagged needs_replacing,
    // grouped by product+stage. Only mention the specific creative when the reason
    // is informative: never_performed (kill the concept) or faded (repeat the concept).
    // aged_out just needs fresh content — no creative context required.
    type NeedsReplacingRow = {
      id: string; asset_name: string; stage: string; client_id: string; product_id: string
      freshness_reason: string | null
      product: { name: string; discontinued?: boolean } | null
      client: { id: string; name: string; slug: string } | null
    }
    const perfReplacements = ((needsReplacingResult.data ?? []) as unknown as NeedsReplacingRow[])
      .filter(a => a.client_id === client.id)
      .filter(a => !(a.product as { discontinued?: boolean } | null)?.discontinued)
      // exclude any already surfaced by the time-based section or covered by RTU
      .filter(a => !coveredByRTU.has(`${a.client_id}:${a.product_id}:${a.stage}`))
      .filter(a => !needsAlert.some(n => n.id === a.id))

    const perfLines: string[] = []
    // de-dupe by product+stage; keep the most informative reason per combo
    const perfSeen = new Map<string, NeedsReplacingRow>()
    for (const a of perfReplacements) {
      const key = `${a.product_id}:${a.stage}`
      const existing = perfSeen.get(key)
      // prefer never_performed > faded > aged_out for the creative callout
      if (!existing || a.freshness_reason === 'never_performed') perfSeen.set(key, a)
    }
    for (const [, a] of perfSeen) {
      const product = a.product?.name ?? 'Unknown product'
      const stageEmoji = STAGE_EMOJI[a.stage] ?? '•'
      const reason = a.freshness_reason
      // strip filename cruft for a readable concept name
      const concept = a.asset_name.replace(/\.[^.]+$/, '').split('-').slice(4).join('-').replace(/\d{6}$/, '').replace(/-$/, '').trim()
      let line = `    › ${stageEmoji} *${product}* — ${a.stage} needs new creative`
      if (reason === 'never_performed' && concept) {
        line += `\n      💀 _Kill concept: "${concept}" — underperformed from day one_`
      } else if (reason === 'faded' && concept) {
        line += `\n      📉 _Concept worked early — make a fresh variant of "${concept}"_`
      }
      perfLines.push(line)
    }

    const perfBlock = perfLines.length > 0 ? [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔴 *Performance-Based Replacements*\n${perfLines.join('\n')}`,
        },
      },
    ] : []

    // Ad group deck coverage — flag groups with < 3 live scorer-matched creatives
    const clientAdgroups = adgroupCounts.get(client.id)
    const thinAdgroups: { name: string; count: number }[] = []
    if (clientAdgroups) {
      for (const [ag, cnt] of clientAdgroups) {
        if (cnt < 3) thinAdgroups.push({ name: ag, count: cnt })
      }
      thinAdgroups.sort((a, b) => a.count - b.count)
    }

    const coverageBlocks = thinAdgroups.length > 0 ? [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `💡 *Ad Group Coverage* _(thin groups — target 3+ live creatives)_\n${thinAdgroups.map(ag =>
            `    ${ag.count === 1 ? '🚨' : '⚠️'} ${ag.name}: *${ag.count}* live`
          ).join('\n')}`,
        },
      },
    ] : []

    const summaryParts = [`*${count} asset${count !== 1 ? 's' : ''}* hitting Refresh Soon (${REFRESH_SOON_DAYS}+ days live)`]
    if (coveredCount > 0) summaryParts.push(`*${coveredCount}* replacement${coveredCount !== 1 ? 's' : ''} already in queue`)
    if (uncoveredCount > 0) summaryParts.push(`*${uncoveredCount}* still need new creative`)
    if (perfSeen.size > 0) summaryParts.push(`*${perfSeen.size}* flagged by performance scorer`)

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
          text: { type: 'mrkdwn', text: summaryParts.join(' · ') },
        },
        ...stageBlocks,
        ...perfBlock,
        ...coverageBlocks,
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

    // Stamp all assets (covered + uncovered) so Thursday has the full week's baseline
    await supabase
      .from('assets')
      .update({ refresh_notified_at: new Date().toISOString() })
      .in('id', clientAssets.map(a => a.id))

    totalAlerted += uncoveredCount
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
