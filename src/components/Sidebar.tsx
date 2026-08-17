import { createServerClient } from '@/lib/supabase'
import SidebarNav, { type ClientHealth } from './SidebarNav'

export default async function Sidebar() {
  const supabase = createServerClient()

  // FlavCity: relationship ended 2026-08-17. Hide from UI without deleting historical data/rows.
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .neq('slug', 'flavcity')
    .order('name')

  const { data: assets } = await supabase
    .from('assets')
    .select('client_id, status, freshness_state')
    .in('client_id', (clients ?? []).map(c => c.id))
    .not('status', 'in', '("Pulled","Removed by Request")')

  const healthByClient: Record<string, ClientHealth> = {}

  for (const client of (clients ?? [])) {
    const clientAssets = (assets ?? []).filter(a => a.client_id === client.id)

    if (clientAssets.length === 0) {
      healthByClient[client.id] = 'gray'
      continue
    }

    let hasRed = false
    let hasAmber = false

    for (const asset of clientAssets) {
      if (asset.status === 'Expired') { hasRed = true; break }
      if (asset.status === 'Needs Refresh / Missing') { hasAmber = true; continue }
      if (asset.status === 'Pending Review') { hasAmber = true; continue }

      if (asset.freshness_state === 'needs_replacing') { hasRed = true }
      else if (asset.freshness_state === 'underperforming') { hasAmber = true }
    }

    healthByClient[client.id] = hasRed ? 'red' : hasAmber ? 'amber' : 'green'
  }

  return <SidebarNav clients={clients ?? []} healthByClient={healthByClient} />
}
