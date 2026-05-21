import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshDeliveredCount } from '@/lib/deliveries'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/deliveries/sync
// Re-counts assets for ALL clients, respecting each client's billing_day.
// Applies quota cap and rolls overflow forward through as many months as needed.
// Accepts no body — always syncs every client as of now.
export async function POST() {
  try {
    // Fetch all clients with their billing_day so each is calculated correctly.
    // FaceTub (billing_day=19) and calendar-month clients (billing_day=1) both work.
    const { data: clients, error: clientErr } = await supabase
      .from('clients')
      .select('id, name, billing_day')
      .order('name')

    if (clientErr) throw clientErr
    if (!clients || clients.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No clients found.' })
    }

    // Run each client's refresh sequentially to avoid DB contention on upserts.
    const results: { name: string; id: string; billingDay: number; ok: boolean; error?: string }[] = []
    for (const client of clients) {
      try {
        await refreshDeliveredCount(supabase, client.id, client.billing_day ?? 1)
        results.push({ name: client.name, id: client.id, billingDay: client.billing_day ?? 1, ok: true })
      } catch (err) {
        results.push({ name: client.name, id: client.id, billingDay: client.billing_day ?? 1, ok: false, error: String(err) })
      }
    }

    return NextResponse.json({
      synced:  results.filter(r => r.ok).length,
      failed:  results.filter(r => !r.ok).length,
      message: `Synced ${results.filter(r => r.ok).length} of ${clients.length} client(s)`,
      results,
    })
  } catch (err: unknown) {
    console.error('Sync deliveries error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
