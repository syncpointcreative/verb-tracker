import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/deliveries/sync
// Counts assets with date_added in the given month, then sets:
//   delivered = baseline_delivered + asset_count
// This preserves any manual baseline numbers and stacks new assets on top.
// Defaults to current month if year/month not provided.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))

    const now   = new Date()
    const year  = body.year  ?? now.getFullYear()
    const month = body.month ?? now.getMonth() + 1  // 1-indexed

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth  = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`

    // Count assets per client within the month
    const { data: assets, error: assetsErr } = await supabase
      .from('assets')
      .select('client_id')
      .gte('date_added', monthStart)
      .lt('date_added', nextMonth)

    if (assetsErr) throw assetsErr

    const assetCounts: Record<string, number> = {}
    for (const asset of assets ?? []) {
      assetCounts[asset.client_id] = (assetCounts[asset.client_id] ?? 0) + 1
    }

    // Fetch existing delivery rows for this month (all clients, not just ones with assets)
    const { data: existing, error: existErr } = await supabase
      .from('monthly_deliveries')
      .select('id, client_id, quota, baseline_delivered')
      .eq('month', monthStart)

    if (existErr) throw existErr

    if (!existing || existing.length === 0) {
      return NextResponse.json({
        synced: [],
        message: `No delivery rows found for ${monthStart.slice(0, 7)} — add clients first via Admin.`,
      })
    }

    // Update each existing row: delivered = baseline + asset count for that client
    const updates = existing.map(row => ({
      id:                 row.id,
      client_id:          row.client_id,
      month:              monthStart,
      quota:              row.quota,
      baseline_delivered: row.baseline_delivered,
      delivered:          row.baseline_delivered + (assetCounts[row.client_id] ?? 0),
    }))

    const { data: upserted, error: upsertErr } = await supabase
      .from('monthly_deliveries')
      .upsert(updates, { onConflict: 'client_id,month' })
      .select()

    if (upsertErr) throw upsertErr

    const summary = updates.map(u => ({
      client_id: u.client_id,
      baseline:  u.baseline_delivered,
      new_assets: assetCounts[u.client_id] ?? 0,
      total:     u.delivered,
    }))

    return NextResponse.json({
      synced: upserted,
      summary,
      month: monthStart.slice(0, 7),
      message: `Synced ${updates.length} client(s) for ${monthStart.slice(0, 7)}`,
    })
  } catch (err: unknown) {
    console.error('Sync deliveries error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
