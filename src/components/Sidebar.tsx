import { createServerClient } from '@/lib/supabase'
import SidebarNav, { type ClientHealth } from './SidebarNav'

export default async function Sidebar() {
  const supabase = createServerClient()

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('name')

  const { data: assets } = await supabase
    .from('assets')
    .select('client_id, status, date_live, date_added')
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
      // Paused is intentional — don't penalise health dot for it
      if (asset.status === 'Paused') { continue }

      // Check freshness for live/ready assets (only date_live counts)
      if (asset.date_live) {
        const days = Math.floor(
          (Date.now() - new Date(asset.date_live + 'T12:00:00').getTime()) / 86_400_000
        )
        if (days > 21) hasRed = true
      }
    }

    healthByClient[client.id] = hasRed ? 'red' : hasAmber ? 'amber' : 'green'
  }

  return <SidebarNav clients={clients ?? []} healthByClient={healthByClient} />
}
