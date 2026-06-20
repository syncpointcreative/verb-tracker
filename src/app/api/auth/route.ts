/**
 * POST   /api/auth   { password }  — verify the shared site password, set session cookie
 * DELETE /api/auth                 — log out (clear the cookie)
 *
 * Env: SITE_PASSWORD (the shared password) + AUTH_SECRET (cookie-signing key).
 * This route is exempt from the middleware gate (see middleware.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
}

export async function POST(req: NextRequest) {
  const expected = process.env.SITE_PASSWORD
  const secret = process.env.AUTH_SECRET
  if (!expected || !secret) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }
  let body: { password?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  if (!body.password || body.password !== expected) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const token = await createSessionToken(secret)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: 30 * 24 * 60 * 60 })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 })
  return res
}
