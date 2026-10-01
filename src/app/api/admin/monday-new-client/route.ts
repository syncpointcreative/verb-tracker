/**
 * GET /api/admin/monday-new-client?name=QCLS
 *
 * One-off onboarding helper: duplicates the "TTS All Inclusive Template" board
 * (structure only — columns, no items) and renames the copy to the given client
 * name. The "📥 Incoming Assets" + month groups get created automatically the
 * first time an asset for this client is approved (see findOrCreateIncomingGroup
 * / findOrCreateMonthGroup in lib/monday.ts) — no manual group setup needed here.
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

  try {
    const template = await findBoardByName(TEMPLATE_BOARD_NAME)
    if (!template) {
      return NextResponse.json({ ok: false, error: `Template board "${TEMPLATE_BOARD_NAME}" not found — check /api/monday-setup` }, { status: 404 })
    }

    const boardId = await duplicateBoard(template.id, name)
    return NextResponse.json({ ok: true, boardId, boardUrl: `https://elevensignal.monday.com/boards/${boardId}` })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
