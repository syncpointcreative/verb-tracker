// v3
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
 *   ?apply=1           — write Monday items + update DB (default: dry-run)
 *   ?client=junkless   — client slug to backfill (default: junkless)
 *   ?since=2026-07-14  — only assets on or after this date (default: 30 days ago)
 *   ?move-groups=1     — move existing items out of month groups into "📥 Incoming Assets"
 *                        (applies to assets that already have a monday_item_id)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseFilename } from '@/lib/parser'
import {
  findBoardByName,
  findOrCreateIncomingGroup,
  findUserByName,
  createContentItem,
  moveItemToGroup,
  mondayQuery,
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

interface AssetWithMonday {
  id:             string
  monday_item_id: string
}

/** Format item name as "Creator — Title" to match new-submission convention. */
function itemName(asset: AssetRow): string {
  const parsed  = asset.file_name ? parseFilename(asset.file_name) : null
  const title   = parsed?.title ?? asset.asset_name ?? '(untitled)'
  const creator = asset.posted_by ?? parsed?.postedBy ?? null
  return creator ? `${creator} — ${title}` : title
}

/** Fetch current group ids for a list of Monday item ids (in chunks of 100). */
async function fetchItemGroups(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const data = await mondayQuery<{ items: Array<{ id: string; group: { id: string } | null }> }>(`
      query($ids: [ID!], $limit: Int!) { items(ids: $ids, limit: $limit) { id group { id } } }
    `, { ids: chunk, limit: chunk.length })
    for (const it of data.items ?? []) {
      if (it.group?.id) result.set(it.id, it.group.id)
    }
  }
  return result
}

export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }

  const apply      = req.nextUrl.searchParams.get('apply') === '1'
  const clientSlug = req.nextUrl.searchParams.get('client') ?? 'junkless'
  const moveGroups = req.nextUrl.searchParams.get('move-groups') === '1'

  const defaultSince = new Date()
  defaultSince.setDate(defaultSince.getDate() - 30)
  const since = req.nextUrl.searchParams.get('since') ?? defaultSince.toISOString().slice(0, 10)

  const supabase = createServerClient()

  // Look up the Monday board once (needed for both modes)
  const board = await findBoardByName(clientSlug)
  if (!board) {
    return NextResponse.json({ error: `No Monday board found for client "${clientSlug}"` }, { status: 404 })
  }

  const incomingGroupId = apply || moveGroups
    ? await findOrCreateIncomingGroup(board.id)
    : (board.groups.find(g => g.title === '📥 Incoming Assets')?.id ?? 'incoming-placeholder')

  // ── Move-groups mode: fix items already on Monday that landed in a month group ──
  if (moveGroups) {
    const { data: existing } = await supabase
      .from('assets')
      .select('id, monday_item_id')
      .not('monday_item_id', 'is', null)

    const rows = ((existing ?? []) as unknown as AssetWithMonday[])
    // We need to filter to this client — fetch client_id for the slug first
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id')
      .eq('slug', clientSlug)
      .maybeSingle()

    const clientId = (clientRow as { id: string } | null)?.id
    const { data: clientAssets } = clientId
      ? await supabase.from('assets').select('id, monday_item_id').eq('client_id', clientId).not('monday_item_id', 'is', null)
      : { data: [] }

    const clientRows = ((clientAssets ?? []) as unknown as AssetWithMonday[])
    const itemIds    = clientRows.map(r => r.monday_item_id)

    if (!itemIds.length) {
      return NextResponse.json({ mode: 'move-groups', clientSlug, found: 0, message: 'No Monday items found for client.' })
    }

    const currentGroups = await fetchItemGroups(itemIds)

    const toMove = clientRows.filter(r => {
      const gid = currentGroups.get(r.monday_item_id)
      return gid && gid !== incomingGroupId
    })

    const moveResult: Array<{ mondayItemId: string; fromGroup: string; moved: boolean; error?: string }> = []

    for (const row of toMove) {
      const fromGroup = currentGroups.get(row.monday_item_id) ?? 'unknown'
      if (!apply) {
        moveResult.push({ mondayItemId: row.monday_item_id, fromGroup, moved: false })
        continue
      }
      try {
        await moveItemToGroup(row.monday_item_id, incomingGroupId)
        moveResult.push({ mondayItemId: row.monday_item_id, fromGroup, moved: true })
      } catch (err) {
        moveResult.push({ mondayItemId: row.monday_item_id, fromGroup, moved: false, error: String(err) })
      }
    }

    return NextResponse.json({
      mode:          apply ? 'move-groups:apply' : 'move-groups:dry-run',
      clientSlug,
      totalItems:    itemIds.length,
      needsMove:     toMove.length,
      moved:         moveResult.filter(r => r.moved).length,
      items:         moveResult,
    })
  }

  // ── Standard backfill mode ────────────────────────────────────────────────────

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

  const rows = ((assets ?? []) as unknown as AssetRow[]).filter(
    a => a.client?.slug === clientSlug
  )

  if (!rows.length) {
    return NextResponse.json({ mode: apply ? 'apply' : 'dry-run', clientSlug, since, found: 0, message: 'No assets to backfill.' })
  }

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

    if (!apply) {
      plan.push({ assetId: asset.id, name, group: '📥 Incoming Assets', dateAdded: asset.date_added, status: asset.status })
      continue
    }

    const linkUrl = asset.drive_url ?? undefined

    try {
      const mondayItemId = await createContentItem({
        boardId:     board.id,
        groupId:     incomingGroupId,
        itemName:    name,
        assigneeId:  libby?.id,
        peopleColId: peopleCol?.id,
        linkUrl,
        linkText:    linkUrl ? name : undefined,
        linkColId:   board.columns.find(c => c.type === 'link')?.id,
      })

      await supabase
        .from('assets')
        .update({ monday_item_id: mondayItemId })
        .eq('id', asset.id)

      plan.push({ assetId: asset.id, name, group: '📥 Incoming Assets', dateAdded: asset.date_added, status: asset.status, mondayItemId })
    } catch (err) {
      plan.push({ assetId: asset.id, name, group: '📥 Incoming Assets', dateAdded: asset.date_added, status: asset.status, error: String(err) })
    }
  }

  const created = plan.filter(p => p.mondayItemId).length
  const errored = plan.filter(p => p.error).length

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
