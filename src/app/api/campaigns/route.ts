/**
 * /api/campaigns
 *
 * GET  /api/campaigns?client_id=...   — list campaigns for a client
 * POST /api/campaigns                 — create a campaign { client_id, name }
 * DELETE /api/campaigns?id=...        — delete a campaign by id
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id')
  if (!clientId) return NextResponse.json({ error: 'Missing ?client_id=' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('client_campaigns')
    .select('id, name')
    .eq('client_id', clientId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  let body: { client_id?: string; name?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const { client_id, name } = body
  if (!client_id || !name?.trim()) {
    return NextResponse.json({ error: 'Missing client_id or name' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('client_campaigns')
    .insert({ client_id, name: name.trim() })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Campaign already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing ?id=' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase.from('client_campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
