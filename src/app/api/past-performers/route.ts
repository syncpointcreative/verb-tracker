/**
 * /api/past-performers
 *
 * GET ?client_slug=chomps  — return all assets + spark ads that ever peaked
 *                            at still_performing for this client.
 *
 * Returns { items: PastPerformer[] }
 *
 * Items are sorted: reuse candidates (faded) first, then currently running,
 * then archived. Within each group, sorted by peak_metric_value desc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export interface PastPerformer {
  type: 'asset' | 'spark'
  id: string
  name: string
  stage: string | null
  status: string | null
  product_name: string | null
  freshness_state: string | null
  freshness_reason: string | null
  freshness_detail: string | null
  peak_metric_name: string | null
  peak_metric_value: number | null
  peak_at: string | null
  // Spark-only
  creator_name?: string | null
  video_url?: string | null
  tiktok_item_id?: string | null
  // Asset-only
  date_live?: string | null
  ad_only?: boolean | null
}

function sortOrder(item: PastPerformer): number {
  // Reuse candidates first (faded/needs_replacing but not currently still performing)
  if (item.freshness_state !== 'still_performing') return 0
  // Currently running
  return 1
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const clientSlug = searchParams.get('client_slug')
  const clientId   = searchParams.get('client_id')

  if (!clientSlug && !clientId) {
    return NextResponse.json({ error: 'client_slug or client_id required' }, { status: 400 })
  }

  const supabase = createServerClient()

  let resolvedClientId = clientId
  if (!resolvedClientId && clientSlug) {
    const { data: client, error } = await supabase
      .from('clients')
      .select('id')
      .eq('slug', clientSlug)
      .single()
    if (error || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    resolvedClientId = client.id
  }

  // Query regular assets that ever peaked at still_performing
  const { data: assets, error: assetError } = await supabase
    .from('assets')
    .select('id, asset_name, stage, status, date_live, ad_only, freshness_state, freshness_reason, freshness_detail, peak_metric_name, peak_metric_value, peak_at, product:products(name)')
    .eq('client_id', resolvedClientId!)
    .eq('peak_state', 'still_performing')
    .is('spark_item_id', null)
    .order('peak_metric_value', { ascending: false })

  if (assetError) {
    console.error('[past-performers] assets query error:', assetError)
    return NextResponse.json({ error: assetError.message }, { status: 500 })
  }

  // Query spark ads that ever peaked at still_performing
  const { data: sparks, error: sparkError } = await supabase
    .from('spark_ads')
    .select('id, ad_name, stage, ad_status, freshness_state, freshness_reason, peak_metric_name, peak_metric_value, peak_at, creator_name, video_url, tiktok_item_id')
    .eq('client_id', resolvedClientId!)
    .eq('peak_state', 'still_performing')
    .order('peak_metric_value', { ascending: false })

  if (sparkError) {
    console.error('[past-performers] sparks query error:', sparkError)
    return NextResponse.json({ error: sparkError.message }, { status: 500 })
  }

  const items: PastPerformer[] = [
    ...(assets ?? []).map(a => ({
      type:               'asset' as const,
      id:                 a.id,
      name:               a.asset_name,
      stage:              a.stage,
      status:             a.status,
      product_name:       (a.product as { name: string } | null)?.name ?? null,
      freshness_state:    a.freshness_state,
      freshness_reason:   a.freshness_reason,
      freshness_detail:   a.freshness_detail,
      peak_metric_name:   a.peak_metric_name,
      peak_metric_value:  a.peak_metric_value,
      peak_at:            a.peak_at,
      date_live:          a.date_live,
      ad_only:            a.ad_only,
    })),
    ...(sparks ?? []).map(s => ({
      type:               'spark' as const,
      id:                 s.id,
      name:               s.ad_name ?? '(Untitled)',
      stage:              s.stage,
      status:             s.ad_status,
      product_name:       null,
      freshness_state:    s.freshness_state,
      freshness_reason:   s.freshness_reason,
      freshness_detail:   null,
      peak_metric_name:   s.peak_metric_name,
      peak_metric_value:  s.peak_metric_value,
      peak_at:            s.peak_at,
      creator_name:       s.creator_name,
      video_url:          s.video_url,
      tiktok_item_id:     s.tiktok_item_id,
    })),
  ]

  // Sort: reuse candidates first, then currently running; within each group by peak desc
  items.sort((a, b) => {
    const oa = sortOrder(a)
    const ob = sortOrder(b)
    if (oa !== ob) return oa - ob
    return (b.peak_metric_value ?? 0) - (a.peak_metric_value ?? 0)
  })

  return NextResponse.json({ items })
}
