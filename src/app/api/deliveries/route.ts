/**
 * PATCH /api/deliveries?client_id=...&month=YYYY-MM-DD
 * Body: { delivered: number }
 *
 * POST /api/deliveries
 * Body: { client_id, month, delivered, quota }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('monthly_deliveries')
    .select('*, client:clients(id, name, slug, color_hex)')
    .order('month', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const { data, error } = await supabase
    .from('monthly_deliveries')
    .upsert({
      client_id: body.client_id,
      month: body.month,
      delivered: body.delivered ?? 0,
      quota: body.quota ?? 30,
    }, { onConflict: 'client_id,month' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing ?id=' }, { status: 400 })

  const supabase = createServerClient()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}
  if ('delivered' in body) updates.delivered = Number(body.delivered)
  if ('quota' in body)     updates.quota     = Number(body.quota)

  const { data, error } = await supabase
    .from('monthly_deliveries')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
