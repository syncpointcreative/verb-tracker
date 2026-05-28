/**
 * GET /api/monday-setup
 *
 * Discovery endpoint — returns all boards, their groups/columns, and all users
 * from the connected Monday.com account (MONDAY_API_TOKEN).
 *
 * Open this in a browser after deploying to see board IDs, column IDs, and
 * user IDs needed to configure the content calendar integration.
 *
 * NOT intended for production use — diagnostic only.
 */

import { NextResponse } from 'next/server'
import { listBoards, listUsers } from '@/lib/monday'

export const runtime = 'edge'

export async function GET() {
  try {
    const [boards, users] = await Promise.all([listBoards(), listUsers()])

    return NextResponse.json({
      ok:     true,
      boards: boards.map(b => ({
        id:      b.id,
        name:    b.name,
        groups:  b.groups,
        columns: b.columns,
      })),
      users: users.map(u => ({
        id:    u.id,
        name:  u.name,
        email: u.email,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    )
  }
}
