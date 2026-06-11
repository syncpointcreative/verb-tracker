/**
 * GET /api/cron/freshness-check
 *
 * Runs Monday and Thursday via Vercel cron.
 *
 * Monday — "This Week's Creative Asks"
 *   Every active slot ≥ REFRESH_SOON_DAYS live (plus undated gaps), scored by
 *   evidence via lib/assetNeeds: proven winners fading and idle bench winners
 *   lead; never-proven gaps are demoted; slots with a queued replacement are
 *   marked covered, not asked. Stamps refresh_notified_at for Thursday.
 *
 * Thursday — "Remaining Creative Asks"
 *   Takes Monday's batch, strikes through any client:product:stage that got
 *   new Slack-submitted creative this week, bolds what's still outstanding.
 *
 * Safety layer:
 *   ?dryrun=1       — compute + return the rendered blocks/text, post NOTHING,
 *                     stamp nothing. The review seam (and the test path).
 *   ASSET_NEEDS_ALERTS_ENABLED=false — global kill-switch; skips all posting
 *                     without a redeploy. Default on.
 *   Authorization: Bearer <CRON_SECRET> — required on every call.
 *
 * Manual testing:
 *   curl ".../api/cron/freshness-check?run=monday&dryrun=1" -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Required env vars:
 *   CRON_SECRET, SLACK_BOT_TOKEN, SLACK_ASSET_NEEDS_CHANNEL_ID, NEXT_PUBLIC_APP_URL
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { REFRESH_SOON_DAYS } from '@/lib/constants'
import {
  scoreNeeds,
  buildMondayBlocks,
  renderTextPreview,
  type NeedAsset,
} from '@/lib/assetNeeds'

// Fields lib/assetNeeds + the Thursday progress check need.
const ASSET_SELECT = `
  id, status, stage, content_type, date_added, date_live, first_live,
  client_id, product_id, performance, asset_name, notes,
  slack_message_ts, created_at,
  product:products(name, discontinued),
  client:clients(id, name, slug)
`

/** Compare whole UTC calendar days to avoid time-of-day drift. */
function daysSince(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  const then = Date.UTC(year, month - 1, day)
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - then) / (1000 * 60 * 60 * 24))
}

function getRelevantDate(asset: { status: string; date_live: string | null; date_added: string | null }): string | null {
  if (asset.status === 'Live / Running' && asset.date_live) return asset.date_live
  return asset.date_added
}

/** Returns the ISO timestamp for midnight UTC on the most recent Monday. */
function getMostRecentMonday(): string {
  const now = new Date()
  const dow = now.getUTCDay()
  const daysBack = dow === 0 ? 6 : dow - 1
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack)).toISOString()
}

async function postToSlack(token: string, message: object): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
  return res.json() as Promise<{ ok: boolean; error?: string }>
}

const STAGE_EMOJI: Record<string, string> = { Awareness: '👀', Consideration: '🤔', Conversion: '🎯' }
const STAGES = ['Awareness', 'Consideration', 'Conversion']

// ─── Monday: evidence-ranked creative asks ───────────────────────────────────

async function runMondayAlert(
  supabase: ReturnType<typeof createServerClient>,
  channelId: string,
  appUrl: string,
  token: string,
  opts: { dryRun: boolean; alertsEnabled: boolean },
) {
  // Pull ALL assets so the scorer can see the bench (Pulled High Performers)
  // and the pipeline (Ready/Pending replacements), not just aging slots.
  const { data: assets, error } = await supabase.from('assets').select(ASSET_SELECT)

  if (error) {
    console.error('[freshness/monday] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const clientNeeds = scoreNeeds((assets ?? []) as unknown as NeedAsset[], {
    refreshSoonDays: REFRESH_SOON_DAYS,
    now: new Date(),
  }).filter(cn => cn.actionable > 0)

  if (!clientNeeds.length) {
    return NextResponse.json({ ok: true, run: 'monday', alerted: 0, message: 'No actionable asks this week' })
  }

  // Dry run: render and return, post + stamp NOTHING.
  if (opts.dryRun) {
    return NextResponse.json({
      ok: true,
      run: 'monday',
      dryRun: true,
      clients: clientNeeds.map(cn => ({
        client: cn.client.name,
        actionable: cn.actionable,
        counts: cn.counts,
        text_preview: renderTextPreview(cn),
        blocks: buildMondayBlocks(cn, appUrl).blocks,
      })),
    })
  }

  if (!opts.alertsEnabled) {
    return NextResponse.json({ ok: true, run: 'monday', skipped: 'ASSET_NEEDS_ALERTS_ENABLED=false', clients: clientNeeds.length })
  }

  let totalAlerted = 0
  for (const cn of clientNeeds) {
    const msg = buildMondayBlocks(cn, appUrl)
    const result = await postToSlack(token, { channel: channelId, ...msg })
    if (!result.ok) {
      console.error(`[freshness/monday] Slack error for ${cn.client.name}:`, result.error)
      continue
    }
    // Stamp the actionable slots so Thursday knows this week's baseline.
    const ids = cn.needs.filter(n => n.bucket !== 'covered').map(n => n.asset.id)
    if (ids.length) {
      await supabase.from('assets').update({ refresh_notified_at: new Date().toISOString() }).in('id', ids)
    }
    totalAlerted += cn.actionable
  }

  return NextResponse.json({ ok: true, run: 'monday', alerted: totalAlerted, clients: clientNeeds.length })
}

// ─── Thursday: progress check on Monday's batch ──────────────────────────────

async function runThursdayAlert(
  supabase: ReturnType<typeof createServerClient>,
  channelId: string,
  appUrl: string,
  token: string,
  opts: { dryRun: boolean; alertsEnabled: boolean },
) {
  const lastMonday = getMostRecentMonday()

  const { data: mondayAssets, error } = await supabase
    .from('assets')
    .select(ASSET_SELECT)
    .gte('refresh_notified_at', lastMonday)

  if (error) {
    console.error('[freshness/thursday] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!mondayAssets?.length) {
    return NextResponse.json({ ok: true, run: 'thursday', message: 'No assets from Monday alert — run Monday first' })
  }

  const { data: newContent } = await supabase
    .from('assets')
    .select('client_id, product_id, stage')
    .not('slack_message_ts', 'is', null)
    .gte('created_at', lastMonday)

  const deliveredThisWeek = new Set((newContent ?? []).map(a => `${a.client_id}:${a.product_id}:${a.stage}`))

  type TAsset = (typeof mondayAssets)[number]
  const isCompleted = (a: TAsset) => deliveredThisWeek.has(`${a.client_id}:${a.product_id}:${a.stage}`)

  const activeAssets = mondayAssets.filter(
    a => !(a.product as unknown as { discontinued?: boolean } | null)?.discontinued,
  )

  const byClient = new Map<string, TAsset[]>()
  for (const a of activeAssets) {
    if (!byClient.has(a.client_id)) byClient.set(a.client_id, [])
    byClient.get(a.client_id)!.push(a)
  }

  const rendered: { client: string; outstanding: number; completed: number; blocks: object[] }[] = []

  for (const [, clientAssets] of byClient) {
    const client = clientAssets[0].client as unknown as { id: string; name: string; slug: string } | null
    if (!client) continue

    const remaining = clientAssets.filter(a => !isCompleted(a))
    const completed = clientAssets.filter(a => isCompleted(a))

    const stageBlocks = STAGES.flatMap(stage => {
      const stageAssets = clientAssets.filter(a => a.stage === stage)
      if (!stageAssets.length) return []
      const lines = stageAssets.map(a => {
        const product = (a.product as unknown as { name: string } | null)?.name ?? 'Unknown product'
        const type = a.content_type ?? 'Unknown type'
        const d = getRelevantDate(a)
        const days = d ? daysSince(d) : 0
        return isCompleted(a) ? `    ~› ${product} — ${type}~` : `    *› ${product} — ${type} — ${days} days live*`
      })
      return [{ type: 'section', text: { type: 'mrkdwn', text: `${STAGE_EMOJI[stage] ?? '•'} *${stage}*\n${lines.join('\n')}` } }]
    })

    const summaryText = remaining.length === 0
      ? `✅ All ${completed.length} asks addressed this week — great work!`
      : `*${remaining.length} still outstanding* · ${completed.length} completed this week`

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `📌 Remaining Creative Asks — ${client.name}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: summaryText } },
      ...stageBlocks,
      { type: 'divider' },
      {
        type: 'actions',
        elements: [{
          type: 'button', style: 'primary',
          text: { type: 'plain_text', text: `View ${client.name} Dashboard →`, emoji: true },
          url: `${appUrl}/${client.slug}`,
        }],
      },
    ]

    rendered.push({ client: client.name, outstanding: remaining.length, completed: completed.length, blocks })
  }

  if (opts.dryRun) return NextResponse.json({ ok: true, run: 'thursday', dryRun: true, clients: rendered })
  if (!opts.alertsEnabled) return NextResponse.json({ ok: true, run: 'thursday', skipped: 'ASSET_NEEDS_ALERTS_ENABLED=false', clients: rendered.length })

  let clientsPosted = 0
  for (const r of rendered) {
    const result = await postToSlack(token, { channel: channelId, text: `📌 Remaining Creative Asks — ${r.client}`, blocks: r.blocks })
    if (!result.ok) {
      console.error(`[freshness/thursday] Slack error for ${r.client}:`, result.error)
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

  const token = process.env.SLACK_BOT_TOKEN ?? ''
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')

  const dryRun = req.nextUrl.searchParams.get('dryrun') === '1'
  // Kill-switch: any value other than an explicit "false" leaves alerts on.
  const alertsEnabled = (process.env.ASSET_NEEDS_ALERTS_ENABLED ?? 'true').toLowerCase() !== 'false'

  const runOverride = req.nextUrl.searchParams.get('run')
  const dow = new Date().getUTCDay()
  const isMonday = runOverride === 'monday' || (!runOverride && dow === 1)
  const isThursday = runOverride === 'thursday' || (!runOverride && dow === 4)

  if (!isMonday && !isThursday) {
    return NextResponse.json({ ok: true, skipped: true, message: 'Only runs Monday and Thursday — use ?run=monday or ?run=thursday to test' })
  }

  const supabase = createServerClient()
  const opts = { dryRun, alertsEnabled }

  return isMonday
    ? runMondayAlert(supabase, channelId, appUrl, token, opts)
    : runThursdayAlert(supabase, channelId, appUrl, token, opts)
}
