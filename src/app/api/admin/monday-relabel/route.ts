/**
 * POST /api/admin/monday-relabel
 *
 * One-time / on-demand maintenance: re-label existing Monday.com items to the
 * current "Creator — Title" convention. Use after the label logic changes so the
 * already-created cards match new pushes.
 *
 * Auth: gated by middleware via the x-api-key header (env AUTH_API_KEY) — same
 * server-to-server key the reconciler uses. No browser session required.
 *
 * Safety: DRY-RUN by default. It only mutates Monday when called with ?apply=1,
 * and even then only touches items whose current name differs from the desired
 * one. The response categorizes every planned change so the scope is visible
 * before anything is applied.
 *
 *   POST /api/admin/monday-relabel          → dry run (no writes)
 *   POST /api/admin/monday-relabel?apply=1   → apply the renames
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { parseFilename } from '@/lib/parser'
import { mondayQuery } from '@/lib/monday'

interface AssetRow {
  id:             string
  file_name:      string | null
  asset_name:     string | null
  posted_by:      string | null
  monday_item_id: string | null
}

/** Mirror of the label logic in /api/slack so backfill matches new pushes exactly. */
function desiredName(asset: AssetRow): string {
  const parsed  = asset.file_name ? parseFilename(asset.file_name) : null
  const title   = parsed?.title ?? asset.asset_name ?? ''
  const creator = asset.posted_by ?? parsed?.postedBy ?? null
  return creator ? `${creator} — ${title}` : title
}

interface MondayItem { name: string; boardId: string }

/** Fetch current name + board id from Monday in chunks (API caps ids per query). */
async function fetchItems(ids: string[]): Promise<Map<string, MondayItem>> {
  const items = new Map<string, MondayItem>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const data = await mondayQuery<{ items: Array<{ id: string; name: string; board: { id: string } | null }> }>(`
      query($ids: [ID!]) { items(ids: $ids) { id name board { id } } }
    `, { ids: chunk })
    for (const it of data.items ?? []) {
      if (it.board?.id) items.set(it.id, { name: it.name, boardId: it.board.id })
    }
  }
  return items
}

export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }
  const apply = req.nextUrl.searchParams.get('apply') === '1'

  const supabase = createServerClient()
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, file_name, asset_name, posted_by, monday_item_id')
    .not('monday_item_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (assets ?? []) as AssetRow[]
  const ids  = rows.map(r => r.monday_item_id!).filter(Boolean)
  const current = await fetchItems(ids)

  const DATE_ONLY = /^\d{4,8}$/  // broken cards currently named with just the date code

  const changes: Array<{ itemId: string; boardId: string; from: string; to: string; category: string }> = []
  for (const r of rows) {
    const itemId = r.monday_item_id!
    const it = current.get(itemId)
    if (it == null) continue              // item no longer exists on Monday
    const want = desiredName(r)
    if (!want || want === it.name) continue  // already correct (or nothing to set)
    const category = DATE_ONLY.test(it.name.trim()) ? 'date-only (broken)' : 'reorder/format'
    changes.push({ itemId, boardId: it.boardId, from: it.name, to: want, category })
  }

  const byCategory = changes.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1
    return acc
  }, {})

  let applied = 0
  if (apply) {
    for (const c of changes) {
      try {
        await mondayQuery(`
          mutation($boardId: ID!, $itemId: ID!, $cv: JSON!) {
            change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $cv) { id }
          }
        `, { boardId: c.boardId, itemId: c.itemId, cv: JSON.stringify({ name: c.to }) })
        applied++
      } catch (err) {
        console.error(`[monday-relabel] rename failed for item ${c.itemId}:`, err)
      }
    }
  }

  return NextResponse.json({
    mode: apply ? 'apply' : 'dry-run',
    itemsWithMondayCard: rows.length,
    plannedChanges: changes.length,
    byCategory,
    applied,
    changes,
  })
}
