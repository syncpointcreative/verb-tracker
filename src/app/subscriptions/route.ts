import { NextResponse } from 'next/server'
import { dashboardHtml } from './dashboard-html'

// Internal-only subscriptions analytics dashboard. Served as raw HTML (built
// separately by subscriptions/build_dashboard.py in the ElevenSignalBot repo,
// then copied into dashboard-html.ts) rather than a React page, since the
// dashboard is a self-contained static document with its own <head>/<style>.
// Sits behind the app's normal password-gated middleware like every other
// route here — this path has no file extension, so it is NOT covered by the
// middleware's static-asset bypass.
export const dynamic = 'force-dynamic'

export async function GET() {
  return new NextResponse(dashboardHtml, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
