/**
 * GET /api/slack-check
 *
 * Calls Slack auth.test with the current SLACK_BOT_TOKEN and returns
 * the workspace + bot info. Use this to confirm the token in Vercel
 * belongs to the Eleven Signal workspace.
 *
 * Expected: team = "Eleven Signal", team_id = "T0B4R18N9AP"
 */

import { NextResponse } from 'next/server'

export async function GET() {
  const token = process.env.SLACK_BOT_TOKEN

  if (!token) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN is not set in environment' }, { status: 500 })
  }

  const res = await fetch('https://slack.com/api/auth.test', {
    headers: { Authorization: `Bearer ${token}` },
  })

  const data = await res.json() as {
    ok: boolean
    team?: string
    team_id?: string
    user?: string
    bot_id?: string
    url?: string
    error?: string
  }

  return NextResponse.json({
    ok:            data.ok,
    team:          data.team,
    team_id:       data.team_id,
    bot:           data.user,
    workspace_url: data.url,
    token_prefix:  token.substring(0, 14) + '…',
    error:         data.error ?? null,
    expected_team_id: 'T0B4R18N9AP',
    token_correct: data.team_id === 'T0B4R18N9AP',
  })
}
