/**
 * /api/spark-ads
 *
 * GET /api/spark-ads?client_slug=flavcity  — list spark ads for a client by slug
 * GET /api/spark-ads?client_id=UUID         — list spark ads for a client by ID
 *
 * Returns { items: SparkAd[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const clientSlug = searchParams.get('client_slug')
  const clientId   = searchParams.get('client_id')

  if (!clientSlug && !clientId) {
    return NextResponse.json({ error: 'client_slug or client_id required' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Resolve client_id from slug if needed
  let resolvedClientId = clientId
  if (!resolvedClientId && clientSlug) {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id')
      .eq('slug', clientSlug)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    resolvedClientId = client.id
  }

  const { data, error } = await supabase
    .from('spark_ads')
    .select('*')
    .eq('client_id', resolvedClientId!)
    .order('campaign_name', { ascending: true })
    .order('ad_name', { ascending: true })

  if (error) {
    console.error('[spark-ads] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}
