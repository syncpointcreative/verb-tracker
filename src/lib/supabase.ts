import { createClient } from '@supabase/supabase-js'

export type Stage = 'Awareness' | 'Consideration' | 'Conversion'
export type AssetStatus = 'Ready to Upload' | 'Live / Running' | 'Expired' | 'Needs Refresh / Missing'

export interface Client {
  id: string
  name: string
  slug: string
  color_hex: string
  drive_url: string | null
  billing_day: number  // day-of-month the billing period starts; default 1
}

export interface Product {
  id: string
  client_id: string
  name: string
  sort_order: number
}

export interface Asset {
  id: string
  client_id: string
  product_id: string
  stage: Stage
  asset_name: string
  content_type: string | null
  file_name: string | null
  status: AssetStatus
  date_added: string | null
  date_live: string | null
  posted_by: string | null
  notes: string | null
  slack_message_ts: string | null
  slack_channel_id: string | null
  created_at: string
  updated_at: string
  // joined
  product?: Product
  client?: Client
}

// Browser client (uses anon key — respects RLS)
export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Server client (uses service role — bypasses RLS for API routes)
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
