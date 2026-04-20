import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { STAGES, EXPIRY_DAYS } from '@/lib/constants'
import type { Asset, Product, Stage } from '@/lib/supabase'
import ClientTabs from './ClientTabs'

interface Props {
  params: { client: string }
}

export const revalidate = 60

export default async function ClientPage({ params }: Props) {
  const supabase = createServerClient()

  // Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', params.client)
    .single()

  if (!client) notFound()

  // Fetch products, assets, and brief sections in parallel
  const [
    { data: products },
    { data: assets },
    { data: briefSectionsRaw },
  ] = await Promise.all([
    supabase.from('products').select('*').eq('client_id', client.id).order('sort_order'),
    supabase.from('assets').select('*, product:products(*)').eq('client_id', client.id).order('stage').order('date_added', { ascending: false }),
    supabase.from('brief_sections').select('id, title, content, sort_order').eq('client_id', client.id).order('sort_order'),
  ])

  const allAssets: Asset[] = assets ?? []
  const allProducts: Product[] = products ?? []
  const briefSections = briefSectionsRaw ?? []

  // Find missing product coverage
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)

  const coveredSet = new Set<string>()
  for (const asset of allAssets) {
    if (asset.status !== 'Needs Refresh / Missing' && asset.status !== 'Expired') {
      if (!asset.date_added || new Date(asset.date_added) >= cutoff) {
        coveredSet.add(`${asset.product_id}-${asset.stage}`)
      }
    }
  }

  const missingCoverage: { product: Product; stage: Stage }[] = []
  for (const product of allProducts) {
    for (const stage of STAGES) {
      if (!coveredSet.has(`${product.id}-${stage}`)) {
        missingCoverage.push({ product, stage })
      }
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{client.name}</span>
      </div>

      {/* Client header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
        </div>
        {client.drive_url && (
          <a
            href={client.drive_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline bg-blue-50 px-3 py-1.5 rounded-lg"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
            Open Drive Folder
          </a>
        )}
      </div>

      {/* Tabbed content: Assets + Creator Brief */}
      <ClientTabs
        assets={allAssets}
        products={allProducts}
        briefSections={briefSections}
        missingCoverage={missingCoverage}
      />
    </div>
  )
}
