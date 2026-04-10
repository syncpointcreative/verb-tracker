import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshDeliveredCount } from '@/lib/deliveries'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/deliveries/sync
// Re-counts assets for every client this month, applies quota cap, and rolls
// any overflow into next month's baseline_delivered automatically.
// Defaults to current month if year/month not provided.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    const now   = new Date()
    const year  = body.year  ?? now.getFullYear()
    const month = body.month ?? now.getMonth() + 1  // 1-indexed

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`

    // Get all clients that have a delivery row for this month
    const { data: existing, error: existErr } = await supabase
      .from('monthly_deliveries')
      .select('client_id')
      .eq('month', monthStart)

    if (existErr) throw existErr

    if (!existing || existing.length === 0) {
      return NextResponse.json({
        synced: 0,
        message: `No delivery rows found for ${monthStart.slice(0, 7)} — add clients first via Admin.`,
      })
    }

    // Refresh each client using shared logic (includes quota cap + rollover)
    const clientIds = [...new Set(existing.map(r => r.client_id))]
    await Promise.all(clientIds.map(id => refreshDeliveredCount(supabase, id)))

    // Return updated rows for confirmation
    const { data: updated } = await supabase
      .from('monthly_deliveries')
      .select('client_id, month, delivered, quota, baseline_delivered')
      .eq('month', monthStart)

    return NextResponse.json({
      synced: clientIds.length,
      month: monthStart.slice(0, 7),
      message: `Synced ${clientIds.length} client(s) for ${monthStart.slice(0, 7)}`,
      results: updated,
    })
  } catch (err: unknown) {
    console.error('Sync deliveries error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
