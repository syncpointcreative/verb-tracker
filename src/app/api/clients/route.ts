import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Always query live — without this, Next.js statically caches this GET at build
// time, so clients added after the last deploy (e.g. ESW Beauty) never appear in
// the admin "Add an Asset" dropdown until a rebuild.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const name = typeof body.name === 'string' ? body.name.trim() : null
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const slug = typeof body.slug === 'string' ? body.slug.trim()
    : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const { data, error } = await supabase
    .from('clients')
    .upsert({
      name,
      slug,
      color_hex: typeof body.color_hex === 'string' ? body.color_hex : '#374151',
      tracks_deliveries: body.tracks_deliveries !== false,
    }, { onConflict: 'slug' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
