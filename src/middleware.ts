/**
 * Single chokepoint that gates the whole app behind the shared-password session.
 *
 * Allowed WITHOUT a session:
 *   - /login and /api/auth        (the login flow itself)
 *   - /api/slack                  (already authenticated by Slack HMAC signature)
 *   - /api/cron/*                 (already authenticated by CRON_SECRET + Vercel Cron)
 *   - framework/static assets     (excluded by the matcher below)
 *
 * Server-to-server automation (Ishmael's reconciler / auto-pause) authenticates
 * with the x-api-key header (env AUTH_API_KEY) instead of a browser cookie.
 *
 * Everything else — the Kanban pages AND the browser-called CRUD routes
 * (/api/assets, /api/campaigns, /api/products, …) — requires a valid session:
 * unauthenticated pages redirect to /login, unauthenticated API calls get 401.
 */
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'

const PUBLIC_PREFIXES = ['/login', '/api/auth', '/api/slack', '/api/cron']

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  // Server-to-server automation bypass.
  const apiKey = process.env.AUTH_API_KEY
  if (apiKey && req.headers.get('x-api-key') === apiKey) return NextResponse.next()

  // Browser session.
  const secret = process.env.AUTH_SECRET || ''
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (await verifySessionToken(token, secret)) return NextResponse.next()

  // Not authenticated.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname + req.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = {
  // Run on everything except Next internals and files with an extension (static assets).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
