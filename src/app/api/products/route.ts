import { NextResponse } from 'next/server'
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
