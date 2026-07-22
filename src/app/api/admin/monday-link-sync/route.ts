/**
 * POST /api/admin/monday-link-sync
 *
 * For assets that already have a monday_item_id AND a drive_url in the DB
 * but whose Monday card's link column is empty, push the drive URL to Monday.
 *
 * Query params:
 *   ?client=junkless  — client slug (default: junkless)
 *   ?apply=1          — write to Monday (default: dry-run)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { findBoardByName, updateItemLinkColumn } from '@/lib/monday'

export const maxDuration = 300

interface AssetRow {
  id: string
  asset_name: string | null
  monday_item_id: string
  drive_url: string
}

export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }

  const apply      = req.nextUrl.searchParams.get('apply') === '1'
  const clientSlug = req.nextUrl.searchParams.get('client') ?? 'junkless'

  const supabase = createServerClient()

  const { data: clientRow } = await supabase
    .from('clients').select('id').eq('slug', clientSlug).maybeSingle()
  const clientId = (clientRow as { id: string } | null)?.id
  if (!clientId) {
    return NextResponse.json({ error: `Client "${clientSlug}" not found` }, { status: 404 })
  }

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, asset_name, monday_item_id, drive_url')
    .eq('client_id', clientId)
    .not('monday_item_id', 'is', null)
    .not('drive_url', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (assets ?? []) as unknown as AssetRow[]
  if (!rows.length) {
    return NextResponse.json({ mode: apply ? 'apply' : 'dry-run', clientSlug, found: 0, message: 'No assets with both monday_item_id and drive_url.' })
  }

  const board = await findBoardByName(clientSlug)
  if (!board) {
    return NextResponse.json({ error: `No Monday board found for "${clientSlug}"` }, { status: 404 })
  }

  const linkCol = board.columns.find(c => c.type === 'link')
  if (!linkCol) {
    return NextResponse.json({ error: 'No link column found on board' }, { status: 404 })
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
    found:   rows.length,
    updated: results.filter(r => r.updated).length,
    errored: results.filter(r => r.error).length,
    items:   results,
  })
}
