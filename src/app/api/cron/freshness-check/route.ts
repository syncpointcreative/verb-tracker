/**
 * GET /api/cron/freshness-check
 *
 * Runs Monday and Thursday via Vercel cron.
 * Sends a single Slack message to #asset-needs covering all clients.
 *
 * Sections (performance-based only, no age/spend/ROAS):
 *   💀 Kill These        — needs_replacing + never_performed (don't repeat style)
 *   📉 Fading            — needs_replacing + faded (fresh variant OK)
 *   🔴 Non-Performing    — needs_replacing + other reason
 *   ⚠️  Watch List        — underperforming (may need replacing in ~2 weeks)
 *   📋 What We Need      — table: Client | Stage | Product (all needs_replacing, deduped by combo)
 *
 * Monday  → "This Week's Content Needs"
 * Thursday → "Remaining Content Needs" (same logic, same data)
 *
 * Manual testing:
 *   curl ".../api/cron/freshness-check?run=monday" -H "Authorization: Bearer <CRON_SECRET>"
 *   curl ".../api/cron/freshness-check?run=thursday" -H "Authorization: Bearer <CRON_SECRET>"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type AssetRow = {
  id: string
  asset_name: string
  stage: string
  client_id: string
  product_id: string
  freshness_reason: string | null
  product: { name: string; discontinued?: boolean } | null
  client: { name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function postToSlack(token: string, message: object): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
  return res.json() as Promise<{ ok: boolean; error?: string }>
}

/** Extract a readable concept name from the asset filename. */
function conceptName(assetName: string): string {
  // Convention: CLIENT-PRODUCT-STAGE-ConceptName-MMDDYY
  const parts = assetName.replace(/\.[^.]+$/, '').split('-')
  return parts
    .slice(3)                          // skip client, product, stage codes
    .filter(p => !/^\d{6}$/.test(p))  // strip trailing date
    .join('-')
    .trim()
}

function clientName(a: AssetRow): string {
  return a.client?.name ?? 'Unknown'
}
function productName(a: AssetRow): string {
  return a.product?.name ?? 'Unknown'
}
function isActive(a: AssetRow): boolean {
  return !(a.product as { discontinued?: boolean } | null)?.discontinued
}

// ─── Build and send the alert ─────────────────────────────────────────────────

async function sendAlert(
  supabase: ReturnType<typeof createServerClient>,
  channelId: string,
  token: string,
  headerLabel: string,
) {
  const SELECT = `
    id, asset_name, stage, client_id, product_id, freshness_reason,
    product:products(name, discontinued),
    client:clients(name)
  `

  const [replacingResult, underperformingResult] = await Promise.all([
    supabase
      .from('assets')
      .select(SELECT)
      .eq('status', 'Live / Running')
      .eq('freshness_state', 'needs_replacing'),
    supabase
      .from('assets')
      .select(SELECT)
      .eq('status', 'Live / Running')
      .eq('freshness_state', 'underperforming'),
  ])

  if (replacingResult.error || underperformingResult.error) {
    const err = replacingResult.error ?? underperformingResult.error
    console.error('[freshness-check] query error:', err)
    return NextResponse.json({ error: err!.message }, { status: 500 })
  }

  const replacing     = ((replacingResult.data ?? []) as unknown as AssetRow[]).filter(isActive)
  const underperforming = ((underperformingResult.data ?? []) as unknown as AssetRow[]).filter(isActive)

  const killed   = replacing.filter(a => a.freshness_reason === 'never_performed')
  const fading   = replacing.filter(a => a.freshness_reason === 'faded')
  const nonPerf  = replacing.filter(a => a.freshness_reason !== 'never_performed' && a.freshness_reason !== 'faded')

  if (!replacing.length && !underperforming.length) {
    return NextResponse.json({ ok: true, skipped: true, message: 'Nothing flagged' })
  }

  const blocks: object[] = []

  // ── Header ────────────────────────────────────────────────────────────────
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: `📋 ${headerLabel}`, emoji: true },
  })

  // ── 💀 Kill These ─────────────────────────────────────────────────────────
  if (killed.length) {
    const lines = killed.map(a => {
      const concept = conceptName(a.asset_name)
      return `    💀 *${clientName(a)}* — ${a.stage} — ${productName(a)}${concept ? `: _"${concept}"_` : ''}`
    })
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*💀 Kill These — don't repeat this style*\n${lines.join('\n')}`,
      },
    })
  }

  // ── 📉 Fading ─────────────────────────────────────────────────────────────
  if (fading.length) {
    const lines = fading.map(a => {
      const concept = conceptName(a.asset_name)
      return `    📉 *${clientName(a)}* — ${a.stage} — ${productName(a)}${concept ? `: _"${concept}"_ (fresh variant OK)` : ''}`
    })
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📉 Fading — make a fresh variant*\n${lines.join('\n')}`,
      },
    })
  }

  // ── 🔴 Non-Performing ─────────────────────────────────────────────────────
  if (nonPerf.length) {
    const lines = nonPerf.map(a =>
      `    🔴 *${clientName(a)}* — ${a.stage} — ${productName(a)}`
    )
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔴 Non-Performing — needs replacing*\n${lines.join('\n')}`,
      },
    })
  }

  // ── ⚠️ Underperforming watch list ─────────────────────────────────────────
  if (underperforming.length) {
    const lines = underperforming.map(a =>
      `    ⚠️ *${clientName(a)}* — ${a.stage} — ${productName(a)}`
    )
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ On Deck — watch list (may need replacing in ~2 weeks)*\n${lines.join('\n')}`,
      },
    })
  }

  // ── Table: What We Need to Create ─────────────────────────────────────────
  // Dedupe by client+stage+product — one row per unique combo
  const seen = new Set<string>()
  const tableRows: { client: string; stage: string; product: string }[] = []
  for (const a of [...killed, ...fading, ...nonPerf]) {
    const key = `${clientName(a)}|${a.stage}|${productName(a)}`
    if (seen.has(key)) continue
    seen.add(key)
    tableRows.push({ client: clientName(a), stage: a.stage, product: productName(a) })
  }
  tableRows.sort((a, b) =>
    a.client.localeCompare(b.client) || a.stage.localeCompare(b.stage)
  )

  if (tableRows.length) {
    const colW = {
      client:  Math.max(6, ...tableRows.map(r => r.client.length)),
      stage:   Math.max(5, ...tableRows.map(r => r.stage.length)),
      product: Math.max(7, ...tableRows.map(r => r.product.length)),
    }
    const pad = (s: string, w: number) => s.padEnd(w)
    const sep = `${'-'.repeat(colW.client)}-+-${'-'.repeat(colW.stage)}-+-${'-'.repeat(colW.product)}`
    const header = `${pad('Client', colW.client)} | ${pad('Stage', colW.stage)} | Product`
    const rows = tableRows.map(r =>
      `${pad(r.client, colW.client)} | ${pad(r.stage, colW.stage)} | ${r.product}`
    )
    const table = [header, sep, ...rows].join('\n')

    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📋 What We Need to Create*\n\`\`\`${table}\`\`\``,
      },
    })
  }

  const result = await postToSlack(token, {
    channel: channelId,
    text: `📋 ${headerLabel}`,
    blocks,
  })

  if (!result.ok) {
    console.error('[freshness-check] Slack error:', result.error)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    killed: killed.length,
    fading: fading.length,
    nonPerforming: nonPerf.length,
    underperforming: underperforming.length,
    tableRows: tableRows.length,
  })
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

  const runOverride = req.nextUrl.searchParams.get('run')
  const dow         = new Date().getUTCDay() // 0=Sun 1=Mon … 4=Thu
  const isMonday    = runOverride === 'monday'   || (!runOverride && dow === 1)
  const isThursday  = runOverride === 'thursday' || (!runOverride && dow === 4)

  if (!isMonday && !isThursday) {
    return NextResponse.json({
      ok: true, skipped: true,
      message: 'Only runs Monday and Thursday — use ?run=monday or ?run=thursday to test',
    })
  }

  const supabase    = createServerClient()
  const headerLabel = isMonday
    ? "This Week's Content Needs"
    : "Remaining Content Needs"

  return sendAlert(supabase, channelId, token, headerLabel)
}
