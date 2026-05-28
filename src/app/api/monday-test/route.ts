/**
 * GET /api/monday-test
 *
 * Creates a single test item on Monday.com for the asset:
 *   FLAV-VL-CON-SB-MorningFuel-052726.m4v
 *
 * What it does:
 *   1. Finds the FlavCity board (by name match)
 *   2. Finds/creates the current-month group ("MAY 2026" etc.)
 *   3. Finds Libby Ragole by name
 *   4. Finds the first "people" column on the board
 *   5. Creates item "Morning Fuel - Seth Baron" assigned to Libby
 *
 * Returns JSON describing every step so you can verify before enabling
 * the integration in the Slack webhook.
 */

import { NextResponse } from 'next/server'
import { parseFilename } from '@/lib/parser'
import {
  findBoardByName,
  findOrCreateMonthGroup,
  findUserByName,
  createContentItem,
  currentMonthGroupTitle,
} from '@/lib/monday'

export const runtime = 'edge'

const TEST_FILENAME = 'FLAV-VL-CON-SB-MorningFuel-052726.m4v'

export async function GET() {
  const steps: Record<string, unknown> = {}

  try {
    // 1. Parse the filename
    const parsed = parseFilename(TEST_FILENAME)
    steps.parsed = {
      clientName: parsed.clientName,
      title:      parsed.title,
      postedBy:   parsed.postedBy,
      stage:      parsed.stage,
    }

    if (!parsed.clientName) {
      return NextResponse.json({ ok: false, steps, error: 'Could not parse client from filename' }, { status: 400 })
    }

    const itemName = parsed.title && parsed.postedBy
      ? `${parsed.title} - ${parsed.postedBy}`
      : parsed.title ?? TEST_FILENAME

    steps.itemName = itemName

    // 2. Find the FlavCity board
    const board = await findBoardByName('flav')
    if (!board) {
      return NextResponse.json({
        ok:    false,
        steps,
        error: 'No board found matching "flav" — check /api/monday-setup to see available boards',
      }, { status: 404 })
    }
    steps.board = { id: board.id, name: board.name }

    // 3. Find or create the current-month group
    const groupId    = await findOrCreateMonthGroup(board.id)
    steps.monthGroup = { title: currentMonthGroupTitle(), id: groupId }

    // 4. Find Libby
    const libby      = await findUserByName('libby')
    steps.libby      = libby ? { id: libby.id, name: libby.name, email: libby.email } : null

    // 5. Find the first "people" column on the board
    const peopleCol  = board.columns.find(c => c.type === 'multiple-person' || c.type === 'people')
    steps.peopleCol  = peopleCol ?? null

    // 6. Create the item
    const itemId = await createContentItem({
      boardId:      board.id,
      groupId,
      itemName,
      assigneeId:   libby?.id,
      peopleColId:  peopleCol?.id,
    })

    steps.created = { itemId }

    return NextResponse.json({ ok: true, steps })

  } catch (err) {
    return NextResponse.json({ ok: false, steps, error: String(err) }, { status: 500 })
  }
}
