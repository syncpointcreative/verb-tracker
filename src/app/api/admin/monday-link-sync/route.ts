/**
 * POST /api/admin/monday-link-sync
 *
 * For assets that already have a monday_item_id AND a drive_url in the DB
 * but whose Monday card's link column is empty, push the drive URL to Monday.
 *
 * Query params:
 *   ?client=junkless  — client slug (default: junkless)
 *   ?apply=1          — write to Monday (default: dry-run)
 *   ?account=reg|meme — required when client=flavcity (two boards, see lib/monday.ts resolveBoardName)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getFlavCityAccountCode } from '@/lib/parser'
import { findBoardByName, updateItemLinkColumn, mondayQuery } from '@/lib/monday'

export const maxDuration = 300

interface AssetRow {
  id: string
  asset_name: string | null
  file_name: string | null
  monday_item_id: string
  drive_url: string
}

export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }

  const apply       = req.nextUrl.searchParams.get('apply') === '1'
  const clientSlug   = req.nextUrl.searchParams.get('client') ?? 'junkless'
  const accountParam = req.nextUrl.searchParams.get('account')?.trim().toUpperCase()

  if (clientSlug === 'flavcity' && accountParam !== 'REG' && accountParam !== 'MEME') {
    return NextResponse.json({ error: 'FlavCity is split across two boards — pass ?account=reg or ?account=meme' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: clientRow } = await supabase
    .from('clients').select('id').eq('slug', clientSlug).maybeSingle()
  const clientId = (clientRow as { id: string } | null)?.id
  if (!clientId) {
    return NextResponse.json({ error: `Client "${clientSlug}" not found` }, { status: 404 })
  }

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, asset_name, file_name, monday_item_id, drive_url')
    .eq('client_id', clientId)
    .not('monday_item_id', 'is', null)
    .not('drive_url', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (assets ?? []) as unknown as AssetRow[]
  if (clientSlug === 'flavcity') {
    rows = rows.filter(r => getFlavCityAccountCode(r.file_name) === accountParam)
  }

  if (!rows.length) {
    return NextResponse.json({ mode: apply ? 'apply' : 'dry-run', clientSlug, found: 0, message: 'No assets with both monday_item_id and drive_url.' })
  }

  const boardName = clientSlug === 'flavcity'
    ? (accountParam === 'MEME' ? 'FlavCity MEME' : 'FlavCity')
    : clientSlug
  const board = await findBoardByName(boardName)
  if (!board) {
    return NextResponse.json({ error: `No Monday board found for "${boardName}"` }, { status: 404 })
  }

  let linkCol = board.columns.find(c => c.type === 'link')
  if (!linkCol) {
    if (!apply) {
      return NextResponse.json({
        mode: 'dry-run', clientSlug, found: rows.length,
        warning: 'No link column on board — run with ?apply=1 to create it automatically',
      })
    }
    // Create the link column on the board
    const created = await mondayQuery<{ create_column: { id: string; title: string } }>(`
      mutation($boardId: ID!, $title: String!, $colType: ColumnType!) {
        create_column(board_id: $boardId, title: $title, column_type: $colType) { id title }
      }
    `, { boardId: board.id, title: 'Link', colType: 'link' })
    linkCol = { id: created.create_column.id, title: created.create_column.title, type: 'link' }
  }

  const results: Array<{ assetId: string; mondayItemId: string; assetName: string | null; updated: boolean; error?: string }> = []

  for (const row of rows) {
    if (!apply) {
      results.push({ assetId: row.id, mondayItemId: row.monday_item_id, assetName: row.asset_name, updated: false })
      continue
    }
    try {
      await updateItemLinkColumn(board.id, row.monday_item_id, linkCol.id, row.drive_url, row.asset_name ?? row.drive_url)
      results.push({ assetId: row.id, mondayItemId: row.monday_item_id, assetName: row.asset_name, updated: true })
    } catch (err) {
      results.push({ assetId: row.id, mondayItemId: row.monday_item_id, assetName: row.asset_name, updated: false, error: String(err) })
    }
  }

  return NextResponse.json({
    mode:    apply ? 'apply' : 'dry-run',
    clientSlug,
    board:   boardName,
    found:   rows.length,
    updated: results.filter(r => r.updated).length,
    errored: results.filter(r => r.error).length,
    items:   results,
  })
}
