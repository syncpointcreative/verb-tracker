/**
 * POST /api/admin/monday-cleanup
 *
 * Delete Monday.com items for a client and null out monday_item_id in the DB.
 * Use before re-running monday-backfill when items were placed in the wrong group.
 *
 * Dry-run by default; pass ?apply=1 to delete.
 *   ?client=junkless  — client slug (default: junkless)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { mondayQuery } from '@/lib/monday'

async function deleteItem(itemId: string): Promise<void> {
  await mondayQuery<{ delete_item: { id: string } }>(`
    mutation($itemId: ID!) { delete_item(item_id: $itemId) { id } }
  `, { itemId })
}

export async function POST(req: NextRequest) {
  if (!process.env.MONDAY_API_TOKEN) {
    return NextResponse.json({ error: 'MONDAY_API_TOKEN not configured' }, { status: 500 })
  }

  const apply      = req.nextUrl.searchParams.get('apply') === '1'
  const clientSlug = req.nextUrl.searchParams.get('client') ?? 'junkless'

  const supabase = createServerClient()

  const { data: assets, error } = await supabase
    .from('assets')
    .select(`
      id, asset_name, monday_item_id,
      client:clients(slug)
    `)
    .not('monday_item_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = { id: string; asset_name: string | null; monday_item_id: string; client: { slug: string } | null }
  const rows = ((assets ?? []) as unknown as Row[]).filter(a => a.client?.slug === clientSlug)

  const results: Array<{ assetId: string; mondayItemId: string; name: string | null; deleted?: boolean; error?: string }> = []

  for (const r of rows) {
    if (!apply) {
      results.push({ assetId: r.id, mondayItemId: r.monday_item_id, name: r.asset_name })
      continue
    }
    try {
      await deleteItem(r.monday_item_id)
      await supabase.from('assets').update({ monday_item_id: null }).eq('id', r.id)
      results.push({ assetId: r.id, mondayItemId: r.monday_item_id, name: r.asset_name, deleted: true })
    } catch (err) {
      results.push({ assetId: r.id, mondayItemId: r.monday_item_id, name: r.asset_name, error: String(err) })
    }
  }

  return NextResponse.json({
    mode:    apply ? 'apply' : 'dry-run',
    client:  clientSlug,
    found:   rows.length,
    deleted: apply ? results.filter(r => r.deleted).length : undefined,
    errored: apply ? results.filter(r => r.error).length : undefined,
    items:   results,
  })
}
