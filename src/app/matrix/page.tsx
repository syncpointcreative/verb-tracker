import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import { STAGE_CONFIG, STAGES, TARGET_ASSETS_PER_STAGE, EXPIRY_DAYS } from '@/lib/constants'
import type { Client, Product, Asset, Stage } from '@/lib/supabase'

export const revalidate = 60

interface CellData {
  active: number
  total: number
}

export default async function MatrixPage() {
  const supabase = createServerClient()

  const [{ data: clients }, { data: products }, { data: assets }] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('products').select('*').order('sort_order'),
    supabase.from('assets').select('*'),
  ])

  const allClients: Client[] = clients ?? []
  const allProducts: Product[] = products ?? []
  const allAssets: Asset[] = assets ?? []

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS)

  // Build lookup: productId → stage → CellData
  const matrix: Record<string, Record<Stage, CellData>> = {}
  for (const product of allProducts) {
    matrix[product.id] = {
      Awareness:     { active: 0, total: 0 },
      Consideration: { active: 0, total: 0 },
      Conversion:    { active: 0, total: 0 },
    }
  }

  for (const asset of allAssets) {
    const cell = matrix[asset.product_id]?.[asset.stage as Stage]
    if (!cell) continue
    if (asset.status !== 'Needs Refresh / Missing') {
      cell.total++
      const expired = asset.date_added ? new Date(asset.date_added) < cutoff : false
      if (!expired && asset.status !== 'Expired') {
        cell.active++
      }
    }
  }

  // Build client→products map
  const clientProducts: Record<string, Product[]> = {}
  for (const p of allProducts) {
    if (!clientProducts[p.client_id]) clientProducts[p.client_id] = []
    clientProducts[p.client_id].push(p)
  }

  function cellStyle(cell: CellData) {
    if (cell.active === 0) return 'bg-red-50 text-red-700 border-red-200'
    if (cell.active < TARGET_ASSETS_PER_STAGE) return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-green-50 text-green-700 border-green-200'
  }

  function cellIcon(cell: CellData) {
    if (cell.active === 0) return '✗'
    if (cell.active < TARGET_ASSETS_PER_STAGE) return '↑'
    return '✓'
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Coverage Matrix</h1>
        <p className="text-gray-500 mt-1">Product × stage coverage across all clients</p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-6 text-xs">
        <div className="flex items-center gap-1.5 text-green-700">
          <span className="w-4 h-4 bg-green-100 border border-green-200 rounded flex items-center justify-center font-bold">✓</span>
          On target ({TARGET_ASSETS_PER_STAGE}+ active)
        </div>
        <div className="flex items-center gap-1.5 text-amber-700">
          <span className="w-4 h-4 bg-amber-100 border border-amber-200 rounded flex items-center justify-center font-bold">↑</span>
          Needs more (1–{TARGET_ASSETS_PER_STAGE - 1} active)
        </div>
        <div className="flex items-center gap-1.5 text-red-700">
          <span className="w-4 h-4 bg-red-100 border border-red-200 rounded flex items-center justify-center font-bold">✗</span>
          Missing (0 active)
        </div>
      </div>

      {/* Per-client tables */}
      {allClients.map(client => {
        const prods = clientProducts[client.id] ?? []
        if (!prods.length) return null
        return (
          <div key={client.id} className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: client.color_hex }}
              />
              <Link
                href={`/${client.slug}`}
                className="font-semibold text-gray-900 hover:underline"
              >
                {client.name}
              </Link>
              <span className="text-xs text-gray-400">{prods.length} product{prods.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">
                      Product
                    </th>
                    {STAGES.map(stage => {
                      const cfg = STAGE_CONFIG[stage]
                      return (
                        <th
                          key={stage}
                          className={`text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${cfg.text} w-36`}
                        >
                          {stage}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prods.map((product, i) => (
                    <tr key={product.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2 text-gray-700 font-medium text-xs">{product.name}</td>
                      {STAGES.map(stage => {
                        const cell = matrix[product.id]?.[stage] ?? { active: 0, total: 0 }
                        const style = cellStyle(cell)
                        return (
                          <td key={stage} className="px-4 py-2 text-center">
                            <span className={`inline-flex items-center justify-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border ${style}`}>
                              {cell.active > 0 ? `${cell.active} ` : ''}{cellIcon(cell)}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
