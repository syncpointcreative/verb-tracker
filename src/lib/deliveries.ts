/**
 * Shared delivery counter logic.
 *
 * refreshDeliveredCount(supabase, clientId)
 *   - Counts assets for the client in the current month
 *   - Caps delivered at quota
 *   - Rolls any overflow into next month's baseline_delivered
 */
import { SupabaseClient } from '@supabase/supabase-js'

function monthStr(year: number, month: number): string {
  // month is 1-indexed (1 = January)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function addMonths(base: { year: number; month: number }, n: number) {
  const d = new Date(base.year, base.month - 1 + n, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

async function countAssetsInMonth(
  supabase: SupabaseClient,
  clientId: string,
  start: string,
  end: string
): Promise<number> {
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('date_added', start)
    .lt('date_added', end)
  return count ?? 0
}

export async function refreshDeliveredCount(
  supabase: SupabaseClient,
  clientId: string
) {
  try {
    const now = new Date()
    const cur  = { year: now.getFullYear(), month: now.getMonth() + 1 }
    const next = addMonths(cur, 1)
    const after = addMonths(cur, 2)

    const curStart  = monthStr(cur.year,   cur.month)
    const nextStart = monthStr(next.year,  next.month)
    const afterStart = monthStr(after.year, after.month)

    // ── Current month ──────────────────────────────────────────────────────────
    const curAssets = await countAssetsInMonth(supabase, clientId, curStart, nextStart)

    const { data: curRow } = await supabase
      .from('monthly_deliveries')
      .select('quota, baseline_delivered')
      .eq('client_id', clientId)
      .eq('month', curStart)
      .single()

    const curBaseline = curRow?.baseline_delivered ?? 0
    const quota       = curRow?.quota ?? 30
    const raw         = curBaseline + curAssets
    const curDelivered = Math.min(raw, quota)
    const overflow     = Math.max(0, raw - quota)

    await supabase.from('monthly_deliveries').upsert({
      client_id:          clientId,
      month:              curStart,
      quota,
      baseline_delivered: curBaseline,
      delivered:          curDelivered,
    }, { onConflict: 'client_id,month' })

    // ── Next month: absorb overflow into baseline ──────────────────────────────
    if (overflow > 0) {
      const { data: nextRow } = await supabase
        .from('monthly_deliveries')
        .select('quota, baseline_delivered')
        .eq('client_id', clientId)
        .eq('month', nextStart)
        .single()

      const nextExistingBaseline = nextRow?.baseline_delivered ?? 0
      const nextBaseline = nextExistingBaseline + overflow
      const nextQuota    = nextRow?.quota ?? quota
      const nextAssets   = await countAssetsInMonth(supabase, clientId, nextStart, afterStart)
      const nextDelivered = Math.min(nextBaseline + nextAssets, nextQuota)

      await supabase.from('monthly_deliveries').upsert({
        client_id:          clientId,
        month:              nextStart,
        quota:              nextQuota,
        baseline_delivered: nextBaseline,
        delivered:          nextDelivered,
      }, { onConflict: 'client_id,month' })
    }
  } catch (err) {
    console.error('refreshDeliveredCount error:', err)
  }
}
