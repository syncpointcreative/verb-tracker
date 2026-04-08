import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/deliveries/sync
// Counts assets in the assets table for the given month (defaults to current month)
// and upserts monthly_deliveries.delivered for each client.
// Assets are counted by date_added falling within the month.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    // Default to current month if not specified
    const now = new Date()
    const year  = body.year  ?? now.getFullYear()
    const month = body.month ?? now.getMonth() + 1  // 1-indexed

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth  = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    // Count assets per client within the month
    const { data: assets, error: assetsErr } = await supabase
      .from('assets')
      .select('client_id, id')
      .gte('date_added', monthStart)
      .lt('date_added', nextMonth)

    if (assetsErr) throw assetsErr

    // Tally by client
    const counts: Record<string, number> = {}
    for (const asset of assets ?? []) {
      counts[asset.client_id] = (counts[asset.client_id] ?? 0) + 1
    }

    if (Object.keys(counts).length === 0) {
      return NextResponse.json({
        synced: [],
        message: `No assets found for ${monthStart.slice(0, 7)}`,
      })
    }

    // Fetch current quota values so we don't overwrite them
    const clientIds = Object.keys(counts)
    const { data: existing, error: existErr } = await supabase
      .from('monthly_deliveries')
      .select('id, client_id, quota')
      .eq('month', monthStart)
      .in('client_id', clientIds)

    if (existErr) throw existErr

    const quotaMap: Record<string, number> = {}
    for (const row of existing ?? []) {
      quotaMap[row.client_id] = row.quota
    }

    // Upsert one row per client — update delivered, keep existing quota (default 30)
    const upserts = clientIds.map(clientId => ({
      client_id:  clientId,
      month:      monthStart,
      delivered:  counts[clientId],
      quota:      quotaMap[clientId] ?? 30,
    }))

    const { data: upserted, error: upsertErr } = await supabase
      .from('monthly_deliveries')
      .upsert(upserts, { onConflict: 'client_id,month' })
      .select()

    if (upsertErr) throw upsertErr

    return NextResponse.json({
      synced: upserted,
      counts,
      month: monthStart.slice(0, 7),
      message: `Synced ${upserts.length} client(s) for ${monthStart.slice(0, 7)}`,
    })
  } catch (err: unknown) {
    console.error('Sync deliveries error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
