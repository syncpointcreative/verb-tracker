import { NextResponse } from 'next/server'
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
