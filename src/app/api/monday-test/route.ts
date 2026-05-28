/**
 * GET /api/monday-test
 *
 * Creates a single test item on Monday.com for the asset:
 *   FLAV-VL-CON-SB-MorningFuel-052726.m4v
 *
 * What it does:
 *   1. Finds the FlavCity board (by name match)
 *   2. Finds/creates the "📥 Incoming" group
 *   3. Finds Libby Ragole by name
 *   4. Finds the people + link columns on the board
 *   5. Creates item "Morning Fuel - Seth Baron" assigned to Libby,
 *      with the Slack message link in the Link column
 */

import { NextResponse } from 'next/server'
import { parseFilename } from '@/lib/parser'
import { SLACK_CHANNEL_ID, SLACK_WORKSPACE_URL } from '@/lib/constants'
import {
  findBoardByName,
  findOrCreateIncomingGroup,
  findUserByName,
  createContentItem,
} from '@/lib/monday'

export const runtime = 'edge'

const TEST_FILENAME  = 'FLAV-VL-CON-SB-MorningFuel-052726.m4v'
// Slack timestamp for this message — swap for the real ts if you want a live link
const TEST_SLACK_TS  = '1748380800.000000'

function buildSlackLink(ts: string): string {
  return `${SLACK_WORKSPACE_URL}/archives/${SLACK_CHANNEL_ID}/p${ts.replace('.', '')}`
}

export async function GET() {
  const steps: Record<string, unknown> = {}

  try {
    // 1. Parse filename
    const parsed = parseFilename(TEST_FILENAME)
    steps.parsed = { clientName: parsed.clientName, title: parsed.title, postedBy: parsed.postedBy, stage: parsed.stage }

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
      return NextResponse.json({ ok: false, steps, error: 'No board matching "flav" — check /api/monday-setup' }, { status: 404 })
    }
    steps.board = { id: board.id, name: board.name }

    // 3. Find/create the Incoming group
    const groupId = await findOrCreateIncomingGroup(board.id)
    steps.incomingGroup = { id: groupId }

    // 4. Find Libby
    const libby   = await findUserByName('libby')
    steps.libby   = libby ? { id: libby.id, name: libby.name } : null

    // 5. Find people + link columns
    const peopleCol = board.columns.find(c => c.type === 'multiple-person' || c.type === 'people')
    const linkCol   = board.columns.find(c => c.type === 'link')
    steps.columns = { people: peopleCol ?? null, link: linkCol ?? null }

    // 6. Build Slack link
    const slackLink = buildSlackLink(TEST_SLACK_TS)
    steps.slackLink = slackLink

    // 7. Create the item
    const itemId = await createContentItem({
      boardId:     board.id,
      groupId,
      itemName,
      assigneeId:  libby?.id,
      peopleColId: peopleCol?.id,
      linkUrl:     slackLink,
      linkText:    'View in Slack',
      linkColId:   linkCol?.id,
    })

    steps.created = { itemId }

    return NextResponse.json({ ok: true, steps })

  } catch (err) {
    return NextResponse.json({ ok: false, steps, error: String(err) }, { status: 500 })
  }
}
