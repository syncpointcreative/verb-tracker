import { createClient } from '@supabase/supabase-js'

export type Stage = 'Awareness' | 'Consideration' | 'Conversion'
export type AssetStatus = 'Pending Review' | 'Ready to Upload' | 'Live / Running' | 'Paused' | 'Expired' | 'Needs Refresh / Missing' | 'Pulled' | 'Removed by Request'

export interface Client {
  id: string
  name: string
  slug: string
  color_hex: string
  drive_url: string | null
  billing_day: number  // day-of-month the billing period starts; default 1
  tracks_deliveries: boolean  // false = hide the monthly delivery counter (e.g. non-social clients)
}

export interface Product {
  id: string
  client_id: string
  name: string
  sort_order: number
  discontinued: boolean
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
  first_live: string | null  // original go-live date — set when asset is reactivated from Pulled
  posted_by: string | null
  notes: string | null
  slack_message_ts: string | null
  slack_channel_id: string | null
  slack_file_url:   string | null   // url_private_download stored at ingest — enables preview before ✅ approval
  slack_mimetype:   string | null
  ad_only:          boolean         // true = approved for ads but excluded from monthly asset counter (✔️ reaction)
  campaigns:        string[]        // campaign tag names this asset is assigned to
  status_changed_at: string | null
  drive_url:        string | null   // Google Drive webViewLink — set after ✅ approval + cron upload
  monday_item_id:   string | null   // Monday.com item ID — set on ✅ approval (not ✔️)
  performance: 'High Performer' | 'Average Performer' | 'Poor Performer' | null
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
