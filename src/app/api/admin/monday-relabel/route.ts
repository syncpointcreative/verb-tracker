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

// Maintenance endpoint: dry-run/diagnostics/probe + scoped (category-filtered) apply.
export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }
  const apply = req.nextUrl.searchParams.get('apply') === '1'
  const debug = req.nextUrl.searchParams.get('debug') === '1'
  const probe = req.nextUrl.searchParams.get('probe') === '1'
  // Optional category filter so apply can target ONLY a subset (e.g. just the
  // date-broken cards) and leave everything else untouched.
  //   ?category=date-only  → only "date-only (broken)"
  //   ?category=reorder    → only "reorder/format"
  // Omitted → all categories.
  const categoryFilter = req.nextUrl.searchParams.get('category')

  const supabase = createServerClient()
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, file_name, asset_name, posted_by, monday_item_id')
    .not('monday_item_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (assets ?? []) as AssetRow[]
  const ids  = rows.map(r => r.monday_item_id!).filter(Boolean)
  const current = await fetchItems(ids)

  // "Broken" = the current Monday card name carries no real title — it's just the
  // date code (creator-less files used to mis-read the date as the title), possibly
  // with stray punctuation/extension residue. Widened from a strict ^\d{4,8}$ so it
  // also catches "061826.mp4", "06/18/26", "- 061826", etc.
  const DATE_ONLY = /^[\s\-—–_.\/]*\d{2}[\s\-—–_.\/]*\d{2}[\s\-—–_.\/]*\d{2,4}([\s.\-_].*)?$/

  // Diagnostics for every row so skipped cards are never silent: classify each as
  // changed / already-correct / not-found-on-monday / no-desired-title.
  const diagnostics: Array<{ itemId: string; file: string | null; current: string | null; want: string; status: string }> = []
  const changes: Array<{ itemId: string; boardId: string; from: string; to: string; category: string }> = []
  for (const r of rows) {
    const itemId = r.monday_item_id!
    const it = current.get(itemId)
    const want = desiredName(r)
    let status: string
    if (it == null) status = 'not-found-on-monday'
    else if (!want) status = 'no-desired-title'
    else if (want === it.name) status = 'already-correct'
    else status = 'change'
    diagnostics.push({ itemId, file: r.file_name, current: it?.name ?? null, want, status })
    if (status !== 'change') continue
    const category = DATE_ONLY.test(it!.name.trim()) ? 'date-only (broken)' : 'reorder/format'
    if (categoryFilter === 'date-only' && category !== 'date-only (broken)') continue
    if (categoryFilter === 'reorder'   && category !== 'reorder/format')     continue
    changes.push({ itemId, boardId: it!.boardId, from: it!.name, to: want, category })
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

  const statusCounts = diagnostics.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1
    return acc
  }, {})

  // Raw Monday probe: re-query the not-found IDs with extended fields (state,
  // board, parent_item) and return Monday's raw rows so we can see exactly why
  // items(ids:) drops them — archived/deleted state, null board, subitem, etc.
  let probeResult: unknown = undefined
  if (probe) {
    const missing = diagnostics.filter(d => d.status === 'not-found-on-monday').map(d => d.itemId)
    const raw: Array<{ id: string; name: string; state: string | null; boardId: string | null; parentId: string | null }> = []
    const returnedIds = new Set<string>()
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50)
      const data = await mondayQuery<{ items: Array<{ id: string; name: string; state: string | null; board: { id: string } | null; parent_item: { id: string } | null }> }>(`
        query($ids: [ID!]) { items(ids: $ids) { id name state board { id } parent_item { id } } }
      `, { ids: chunk })
      for (const it of data.items ?? []) {
        returnedIds.add(it.id)
        raw.push({ id: it.id, name: it.name, state: it.state ?? null, boardId: it.board?.id ?? null, parentId: it.parent_item?.id ?? null })
      }
    }
    probeResult = {
      missingCount: missing.length,
      returnedByMonday: raw.length,
      omittedEntirely: missing.filter(id => !returnedIds.has(id)),
      rows: raw,
    }
  }

  return NextResponse.json({
    mode: apply ? 'apply' : 'dry-run',
    categoryFilter: categoryFilter ?? null,
    itemsWithMondayCard: rows.length,
    plannedChanges: changes.length,
    byCategory,
    statusCounts,
    applied,
    changes,
    ...(debug ? { diagnostics } : {}),
    ...(probe ? { probe: probeResult } : {}),
  })
}
