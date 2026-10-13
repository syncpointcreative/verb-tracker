/**
 * GET /api/admin/monday-new-client?name=QCLS
 * GET /api/admin/monday-new-client?name=FlavCity%20MEME&source=FlavCity
 *
 * One-off onboarding helper: duplicates a board (structure only — columns and
 * groups, no items or automations) and renames the copy to the given name.
 * Defaults to duplicating the shared "TTS All Inclusive Template" board; pass
 * ?source=<existing board name> to duplicate a different board instead (e.g.
 * splitting FlavCity into two identically-structured boards — see
 * resolveBoardName in lib/monday.ts). The "📥 Incoming Assets" + month groups
 * get created automatically the first time an asset for this client is
 * approved (see findOrCreateIncomingGroup / findOrCreateMonthGroup in
 * lib/monday.ts) — no manual group setup needed here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { findBoardByName, duplicateBoard, getBoardById } from '@/lib/monday'

export const runtime = 'edge'

const TEMPLATE_BOARD_NAME = 'TTS All Inclusive Template'

export async function GET(req: NextRequest) {
  const checkId = req.nextUrl.searchParams.get('check')?.trim()
  if (checkId) {
    const board = await getBoardById(checkId)
    return NextResponse.json({ ok: true, board })
  }

  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ ok: false, error: 'Missing ?name=' }, { status: 400 })
  }

  const sourceBoardName = req.nextUrl.searchParams.get('source')?.trim() || TEMPLATE_BOARD_NAME

  try {
    const source = await findBoardByName(sourceBoardName)
    if (!source) {
      return NextResponse.json({ ok: false, error: `Source board "${sourceBoardName}" not found` }, { status: 404 })
    }

    const boardId = await duplicateBoard(source.id, name)
    return NextResponse.json({ ok: true, boardId, boardUrl: `https://elevensignal.monday.com/boards/${boardId}`, duplicatedFrom: source.name })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
