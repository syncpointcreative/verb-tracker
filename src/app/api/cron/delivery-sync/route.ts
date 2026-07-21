/**
 * GET /api/cron/delivery-sync
 *
 * Runs daily via Vercel cron. Recomputes every client's monthly delivery
 * counter from the assets table, applying the quota cap and rolling surplus
 * forward cumulatively. This keeps rollover correct across month boundaries
 * without waiting for the next Slack approval to trigger a recompute.
 *
 * Manual testing:
 *   curl ".../api/cron/delivery-sync" -H "Authorization: Bearer <CRON_SECRET>"
 *
 * Required env vars:
 *   CRON_SECRET                 — must match Authorization: Bearer header
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshDeliveredCount } from '@/lib/deliveries'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const apiKey     = req.headers.get('x-api-key')
  const validCron  = authHeader === `Bearer ${process.env.CRON_SECRET}`
  const validApi   = apiKey === process.env.AUTH_API_KEY
  if (!validCron && !validApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, billing_day')
      .order('name')

    if (error) throw error
    if (!clients?.length) {
      return NextResponse.json({ synced: 0, message: 'No clients found.' })
    }

    const results: { name: string; ok: boolean; error?: string }[] = []
    for (const client of clients) {
      try {
        await refreshDeliveredCount(supabase, client.id, client.billing_day ?? 1)
        results.push({ name: client.name, ok: true })
      } catch (err) {
        results.push({ name: client.name, ok: false, error: String(err) })
      }
    }

    const synced = results.filter(r => r.ok).length
    return NextResponse.json({
      synced,
      failed: results.length - synced,
      message: `Synced ${synced} of ${clients.length} client(s)`,
      results,
    })
  } catch (err: unknown) {
    console.error('delivery-sync cron error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
