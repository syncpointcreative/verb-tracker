/**
 * /api/assets
 *
 * GET  /api/assets?client_id=...&stage=...   — list assets (with filters)
 * POST /api/assets                            — create an asset
 * PATCH /api/assets?id=...                   — update an asset field(s)
 * DELETE /api/assets?id=...                  — delete an asset
 *
 * All mutations use the service-role client (bypasses RLS).
 * Reads use the same server client; add auth middleware if you want user-level gating.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import type { AssetStatus, Stage } from '@/lib/supabase'

const VALID_STAGES = new Set<Stage>(['Awareness', 'Consideration', 'Conversion'])
const VALID_STATUSES = new Set<AssetStatus>([
  'Ready to Upload', 'Live / Running', 'Expired', 'Needs Refresh / Missing',
])

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const supabase = createServerClient()

  let query = supabase
    .from('assets')
    .select('*, product:products(id, name, sort_order), client:clients(id, name, slug, color_hex, drive_url)')
    .order('stage')
    .order('date_added', { ascending: false })

  const clientId = searchParams.get('client_id')
  const stage = searchParams.get('stage')
  const status = searchParams.get('status')

  if (clientId) query = query.eq('client_id', clientId)
  if (stage && VALID_STAGES.has(stage as Stage)) query = query.eq('stage', stage)
  if (status && VALID_STATUSES.has(status as AssetStatus)) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  // Required fields
  const { client_id, product_id, stage, asset_name } = body
  if (!client_id || !product_id || !stage || !asset_name) {
    return NextResponse.json({ error: 'Missing required fields: client_id, product_id, stage, asset_name' }, { status: 400 })
  }
  if (!VALID_STAGES.has(stage as Stage)) {
    return NextResponse.json({ error: `Invalid stage. Must be one of: ${[...VALID_STAGES].join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      client_id,
      product_id,
      stage,
      asset_name,
      content_type:     body.content_type ?? null,
      file_name:        body.file_name ?? null,
      status:           (body.status as AssetStatus) ?? 'Needs Refresh / Missing',
      date_added:       body.date_added ?? null,
      posted_by:        body.posted_by ?? null,
      notes:            body.notes ?? null,
      slack_message_ts: body.slack_message_ts ?? null,
      slack_channel_id: body.slack_channel_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing ?id=' }, { status: 400 })

  const supabase = createServerClient()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  // Whitelist updatable fields
  const allowed = ['stage', 'asset_name', 'content_type', 'file_name', 'status', 'date_added', 'posted_by', 'notes', 'product_id']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  if (updates.stage && !VALID_STAGES.has(updates.stage as Stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
  }
  if (updates.status && !VALID_STATUSES.has(updates.status as AssetStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('assets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing ?id=' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase.from('assets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
