/**
 * POST /api/admin/monday-move-to-board
 *
 * One-time migration helper: for a client+account, finds assets whose Monday
 * item already exists but is sitting on the WRONG board (e.g. MEME-coded
 * FlavCity assets that were synced before the REG/MEME board split shipped),
 * and moves them to the correct board's "📥 Incoming Assets" group.
 *
 * Column values are carried over via an explicit title-matched mapping
 * (see buildColumnsMapping in lib/monday.ts) since the target board's
 * column IDs differ from the source board even though it was duplicated
 * from it.
 *
 * Query params:
 *   ?client=flavcity   — client slug
 *   ?account=meme      — required when client=flavcity (reg|meme)
 *   ?apply=1           — write to Monday (default: dry-run)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getFlavCityAccountCode } from '@/lib/parser'
import {
  findBoardByName,
  findOrCreateIncomingGroup,
  getBoardsByIds,
  buildColumnsMapping,
  moveItemToBoard,
  mondayQuery,
  MondayBoard,
} from '@/lib/monday'

export const maxDuration = 300

interface AssetRow {
  id: string
  asset_name: string | null
  file_name: string | null
  monday_item_id: string
}

async function fetchItemBoardIds(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const data = await mondayQuery<{ items: Array<{ id: string; board: { id: string } | null }> }>(`
      query($ids: [ID!]!) { items(ids: $ids) { id board { id } } }
    `, { ids: chunk })
    for (const it of data.items ?? []) {
      if (it.board?.id) result.set(it.id, it.board.id)
    }
  }
  return result
}

export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }

  const apply        = req.nextUrl.searchParams.get('apply') === '1'
  const clientSlug    = req.nextUrl.searchParams.get('client') ?? ''
  const accountParam  = req.nextUrl.searchParams.get('account')?.trim().toUpperCase()

  if (!clientSlug) {
    return NextResponse.json({ error: 'Missing ?client=' }, { status: 400 })
  }
  if (clientSlug === 'flavcity' && accountParam !== 'REG' && accountParam !== 'MEME') {
    return NextResponse.json({ error: 'FlavCity requires ?account=reg or ?account=meme' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: clientRow } = await supabase.from('clients').select('id').eq('slug', clientSlug).maybeSingle()
  const clientId = (clientRow as { id: string } | null)?.id
  if (!clientId) {
    return NextResponse.json({ error: `Client "${clientSlug}" not found` }, { status: 404 })
  }

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, asset_name, file_name, monday_item_id')
    .eq('client_id', clientId)
    .not('monday_item_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (assets ?? []) as unknown as AssetRow[]
  if (clientSlug === 'flavcity') {
    rows = rows.filter(r => getFlavCityAccountCode(r.file_name) === accountParam)
  }

  if (!rows.length) {
    return NextResponse.json({ mode: apply ? 'apply' : 'dry-run', clientSlug, found: 0, message: 'No Monday items found for this client/account.' })
  }

  const targetBoardName = clientSlug === 'flavcity' ? (accountParam === 'MEME' ? 'FlavCity MEME' : 'FlavCity') : clientSlug
  const targetBoard = await findBoardByName(targetBoardName)
  if (!targetBoard) {
    return NextResponse.json({ error: `Target board "${targetBoardName}" not found` }, { status: 404 })
  }

  const itemIds = rows.map(r => r.monday_item_id)
  const currentBoardIds = await fetchItemBoardIds(itemIds)

  const needsMove = rows.filter(r => {
    const current = currentBoardIds.get(r.monday_item_id)
    return current && current !== targetBoard.id
  })

  if (!needsMove.length) {
    return NextResponse.json({
      mode: apply ? 'apply' : 'dry-run', clientSlug, targetBoard: targetBoard.name,
      found: rows.length, needsMove: 0, message: 'All items already on the target board.',
    })
  }

  const sourceBoardIds = [...new Set(needsMove.map(r => currentBoardIds.get(r.monday_item_id)!))]

  if (req.nextUrl.searchParams.get('debug') === 'mapping') {
    const sourceBoards = await getBoardsByIds(sourceBoardIds)
    const mapping = sourceBoards.map(src => ({
      sourceBoard: { id: src.id, name: src.name, columns: src.columns },
      targetBoard: { id: targetBoard.id, name: targetBoard.name, columns: targetBoard.columns },
      computedMapping: buildColumnsMapping(src, targetBoard as MondayBoard),
    }))
    return NextResponse.json({ mode: 'debug-mapping', mapping })
  }

  if (!apply) {
    const plan = needsMove.map(r => ({
      assetId: r.id,
      assetName: r.asset_name,
      mondayItemId: r.monday_item_id,
      fromBoardId: currentBoardIds.get(r.monday_item_id),
    }))
    return NextResponse.json({
      mode: 'dry-run', clientSlug, targetBoard: targetBoard.name,
      found: rows.length, needsMove: needsMove.length, sourceBoardIds, items: plan,
    })
  }

  const incomingGroupId = await findOrCreateIncomingGroup(targetBoard.id)

  const sourceBoards = await getBoardsByIds(sourceBoardIds)
  const mappingByBoard = new Map<string, ReturnType<typeof buildColumnsMapping>>()
  for (const src of sourceBoards) {
    mappingByBoard.set(src.id, buildColumnsMapping(src, targetBoard as MondayBoard))
  }

  const results: Array<{ assetId: string; assetName: string | null; mondayItemId: string; fromBoardId: string; moved: boolean; error?: string }> = []

  for (const r of needsMove) {
    const fromBoardId = currentBoardIds.get(r.monday_item_id)!
    const mapping = mappingByBoard.get(fromBoardId) ?? []
    try {
      await moveItemToBoard(r.monday_item_id, targetBoard.id, incomingGroupId, mapping)
      results.push({ assetId: r.id, assetName: r.asset_name, mondayItemId: r.monday_item_id, fromBoardId, moved: true })
    } catch (err) {
      results.push({ assetId: r.id, assetName: r.asset_name, mondayItemId: r.monday_item_id, fromBoardId, moved: false, error: String(err) })
    }
  }

  return NextResponse.json({
    mode: 'apply', clientSlug, targetBoard: targetBoard.name,
    found: rows.length, needsMove: needsMove.length,
    moved: results.filter(r => r.moved).length,
    errored: results.filter(r => r.error).length,
    items: results,
  })
}
