import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { STAGES, EXPIRY_DAYS } from '@/lib/constants'
import type { Asset, Product, Stage } from '@/lib/supabase'
import ClientTabs from './ClientTabs'

interface Props {
  params: { client: string }
  searchParams: { status?: string }
}

export const revalidate = 0

export default async function ClientPage({ params, searchParams }: Props) {
  const supabase = createServerClient()

  // Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', params.client)
    .single()

  if (!client) notFound()

  // Fetch products, assets, campaigns, and brief sections in parallel
  const [
    { data: products },
    { data: assets },
    { data: campaignsRaw },
    { data: briefSectionsRaw },
  ] = await Promise.all([
    supabase.from('products').select('*').eq('client_id', client.id).order('sort_order'),
    supabase.from('assets').select('*, product:products(*)').eq('client_id', client.id).order('stage').order('date_added', { ascending: false }),
    supabase.from('client_campaigns').select('id, name').eq('client_id', client.id).order('name'),
    supabase.from('brief_sections').select('id, title, content, sort_order').eq('client_id', client.id).order('sort_order'),
  ])

  const allAssets: Asset[] = assets ?? []
  const allProducts: Product[] = products ?? []
  const allCampaigns: { id: string; name: string }[] = campaignsRaw ?? []
  const briefSections = briefSectionsRaw ?? []

  // Find missing product coverage
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)

  const NON_COVERING_STATUSES = ['Pending Review', 'Needs Refresh / Missing', 'Expired', 'Pulled', 'Removed by Request']

  const coveredSet = new Set<string>()
  for (const asset of allAssets) {
    // Skip statuses that never provide coverage
    if (NON_COVERING_STATUSES.includes(asset.status)) continue
    // Use date_live for live assets (measures ad fatigue); fall back to date_added
    const relevantDateStr = (asset.status === 'Live / Running' && asset.date_live)
      ? asset.date_live
      : asset.date_added
    // Covered = Fresh or Monitor (≤ EXPIRY_DAYS). Refresh Soon and beyond = needs new creative.
    if (!relevantDateStr || new Date(relevantDateStr + 'T12:00:00') >= cutoff) {
      coveredSet.add(`${asset.product_id}-${asset.stage}`)
    }
  }

  // Check which product+stage combos have ANY live/uploading asset (even if aging)
  const hasAnyAsset = new Set<string>()
  for (const asset of allAssets) {
    if (!NON_COVERING_STATUSES.includes(asset.status)) {
      hasAnyAsset.add(`${asset.product_id}-${asset.stage}`)
    }
  }

  const missingCoverage: { product: Product; stage: Stage; reason: 'aging' | 'missing' }[] = []
  for (const product of allProducts) {
    if (product.discontinued) continue  // skip discontinued products — existing assets stay visible
    for (const stage of STAGES) {
      if (!coveredSet.has(`${product.id}-${stage}`)) {
        const reason = hasAnyAsset.has(`${product.id}-${stage}`) ? 'aging' : 'missing'
        missingCoverage.push({ product, stage, reason })
      }
    }
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-stone-400 mb-5 tracking-wide">
        <Link href="/" className="hover:text-[#3b2b52] transition-colors">Dashboard</Link>
        <span className="text-stone-300">/</span>
        <span className="text-stone-600">{client.name}</span>
      </div>

      {/* Client header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <p className="text-[10px] tracking-[0.18em] text-[#d4865e] uppercase font-medium mb-1">Client</p>
          <h1
            className="font-serif text-4xl font-light tracking-wide"
            style={{ color: client.color_hex ?? '#3b2b52' }}
          >
            {client.name}
          </h1>
        </div>
        {client.drive_url && (
          <a
            href={client.drive_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#d4865e] hover:text-[#e0a07d] tracking-[0.12em] uppercase transition-colors border border-[#d4865e]/30 hover:border-[#d4865e] rounded-lg px-3 py-2"
          >
            Open Drive
            <svg className="w-3 h-3 opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.5 9.5l7-7M9.5 2.5H4M9.5 2.5V8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}
      </div>

      {/* Tabbed content: Board, Table, Archive, Brief */}
      <ClientTabs
        assets={allAssets}
        products={allProducts}
        campaigns={allCampaigns}
        clientId={client.id}
        clientSlug={client.slug}
        briefSections={briefSections}
        missingCoverage={missingCoverage}
        initialStatus={searchParams.status ?? null}
      />
    </div>
  )
}
