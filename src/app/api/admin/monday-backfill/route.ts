// v2
/**
 * POST /api/admin/monday-backfill
 *
 * Backfill Monday.com items for assets that were ingested into the DB but never
 * got a Monday card — typically because the client's Monday board wasn't wired up
 * at submission time (e.g. Junkless, Jul 2026).
 *
 * Supports any client slug; defaults to "junkless".
 * Dry-run by default; pass ?apply=1 to commit.
 *
 * Query params:
 *   ?apply=1         — write Monday items + update DB (default: dry-run)
 *   ?client=junkless — client slug to backfill (default: junkless)
 *   ?since=2026-07-14 — only assets on or after this date (default: 30 days ago)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseFilename } from '@/lib/parser'
import {
  findBoardByName,
  findOrCreateIncomingGroup,
  findUserByName,
  createContentItem,
} from '@/lib/monday'

interface AssetRow {
  id:             string
  asset_name:     string | null
  file_name:      string | null
  posted_by:      string | null
  slack_message_ts: string | null
  drive_url:      string | null
  date_added:     string | null
  status:         string | null
  client:         { name: string; slug: string } | null
  product:        { name: string } | null
}

/** Format item name as "Creator — Title" to match new-submission convention. */
function itemName(asset: AssetRow): string {
  const parsed  = asset.file_name ? parseFilename(asset.file_name) : null
  const title   = parsed?.title ?? asset.asset_name ?? '(untitled)'
  const creator = asset.posted_by ?? parsed?.postedBy ?? null
  return creator ? `${creator} — ${title}` : title
}


export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }

  const apply      = req.nextUrl.searchParams.get('apply') === '1'
  const clientSlug = req.nextUrl.searchParams.get('client') ?? 'junkless'

  const defaultSince = new Date()
  defaultSince.setDate(defaultSince.getDate() - 30)
  const since = req.nextUrl.searchParams.get('since') ?? defaultSince.toISOString().slice(0, 10)

  const supabase = createServerClient()

  // Fetch assets missing a Monday card for the target client
  const { data: assets, error } = await supabase
    .from('assets')
    .select(`
      id, asset_name, file_name, posted_by, slack_message_ts, drive_url, date_added, status,
      client:clients(name, slug),
      product:products(name)
    `)
    .is('monday_item_id', null)
    .not('slack_message_ts', 'is', null)
    .gte('date_added', since)
    .order('date_added', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter to the target client (Supabase foreign-table filter doesn't support eq on joined tables easily)
  const rows = ((assets ?? []) as unknown as AssetRow[]).filter(
    a => a.client?.slug === clientSlug
  )

  if (!rows.length) {
    return NextResponse.json({ mode: apply ? 'apply' : 'dry-run', clientSlug, since, found: 0, message: 'No assets to backfill.' })
  }

  // Look up the Monday board once
  const board = await findBoardByName(clientSlug)
  if (!board) {
    return NextResponse.json({ error: `No Monday board found for client "${clientSlug}"` }, { status: 404 })
  }

  // Ensure "📥 Incoming Assets" group exists (fallback when no month group matches)
  const incomingGroupId = apply
    ? await findOrCreateIncomingGroup(board.id)
    : (board.groups.find(g => g.title === '📥 Incoming Assets')?.id ?? 'incoming-placeholder')

  // Find people (assignee) column
  const peopleCol = board.columns.find(c => c.type === 'people')

  // Look up Libby once for assignment
  const libby = await findUserByName('Libby Ragole')

  const plan: Array<{
    assetId: string
    name: string
    group: string
    dateAdded: string | null
    status: string | null
    mondayItemId?: string
    error?: string
  }> = []

  for (const asset of rows) {
    const name = itemName(asset)
    const groupId = incomingGroupId
    const groupTitle = '📥 Incoming Assets'

    if (!apply) {
      plan.push({ assetId: asset.id, name, group: groupTitle, dateAdded: asset.date_added, status: asset.status })
      continue
    }

    // Determine link (Drive URL preferred, fall back to nothing)
    const linkUrl = asset.drive_url ?? undefined

    try {
      const mondayItemId = await createContentItem({
        boardId:     board.id,
        groupId,
        itemName:    name,
        assigneeId:  libby?.id,
        peopleColId: peopleCol?.id,
        linkUrl,
        linkText:    linkUrl ? name : undefined,
        linkColId:   board.columns.find(c => c.type === 'link')?.id,
      })

      // Write monday_item_id back to the DB
      await supabase
        .from('assets')
        .update({ monday_item_id: mondayItemId })
        .eq('id', asset.id)

      plan.push({ assetId: asset.id, name, group: groupTitle, dateAdded: asset.date_added, status: asset.status, mondayItemId })
    } catch (err) {
      plan.push({ assetId: asset.id, name, group: groupTitle, dateAdded: asset.date_added, status: asset.status, error: String(err) })
    }
  }

  const created  = plan.filter(p => p.mondayItemId).length
  const errored  = plan.filter(p => p.error).length

  return NextResponse.json({
    mode:       apply ? 'apply' : 'dry-run',
    clientSlug,
    since,
    boardId:    board.id,
    boardName:  board.name,
    found:      rows.length,
    created:    apply ? created : undefined,
    errored:    apply ? errored : undefined,
    items:      plan,
  })
}
