import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Always query live — same caching gotcha as the clients route: a build-time
// cached response hides products added after the last deploy.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('products').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** POST /api/products — add a product to a client. Gated by x-api-key. */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.AUTH_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const { client_id, name, sort_order } = body ?? {}
  if (!client_id || !name) {
    return NextResponse.json({ error: 'client_id and name are required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('products')
    .insert({ client_id, name, sort_order: sort_order ?? 99 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
