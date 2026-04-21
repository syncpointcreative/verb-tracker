'use client'

import { useState } from 'react'
import type { Asset, Product } from '@/lib/supabase'
import AssetTable from './AssetTable'
import BriefPanel from './BriefPanel'
import { STAGE_CONFIG } from '@/lib/constants'
import type { Stage } from '@/lib/supabase'

interface BriefSection {
  id: string
  title: string
  content: string
  sort_order: number
}

interface MissingItem {
  product: Product
  stage: Stage
  reason: 'aging' | 'missing'
}

interface Props {
  assets: Asset[]
  products: Product[]
  briefSections: BriefSection[]
  missingCoverage: MissingItem[]
}

export default function ClientTabs({ assets, products, briefSections, missingCoverage }: Props) {
  const [tab, setTab] = useState<'assets' | 'brief'>('assets')

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
      active
        ? 'bg-gray-900 text-white'
        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
    }`

  const freshSuggestions: Record<Stage, string> = {
    Awareness:     'Hook video — stop the scroll, introduce product',
    Consideration: 'Demo, tutorial, or testimonial showing value',
    Conversion:    'Promo/offer-led video with clear CTA',
  }
  const agingSuggestions: Record<Stage, string> = {
    Awareness:     'Existing creative hitting Refresh Soon — start new hook video',
    Consideration: 'Existing creative aging out — prep fresh demo or testimonial',
    Conversion:    'Existing creative aging out — prep new promo or offer video',
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-3">
        <button className={tabCls(tab === 'assets')} onClick={() => setTab('assets')}>
          Assets
        </button>
        {briefSections.length > 0 && (
          <button className={tabCls(tab === 'brief')} onClick={() => setTab('brief')}>
            Creator Brief
          </button>
        )}
      </div>

      {/* Assets tab */}
      {tab === 'assets' && (
        <>
          <AssetTable assets={assets} products={products} />

          {missingCoverage.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-amber-800 mb-3">⚠ Missing Coverage</h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-100 border-b border-amber-200 text-xs text-amber-800 uppercase tracking-wide">
                      <th className="text-left px-4 py-2">Product</th>
                      <th className="text-left px-4 py-2">Missing Stage</th>
                      <th className="text-left px-4 py-2">Suggested Ask</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {missingCoverage.map(({ product, stage, reason }) => (
                      <tr key={`${product.id}-${stage}`} className="hover:bg-amber-100/50">
                        <td className="px-4 py-2 font-medium text-gray-800">{product.name}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_CONFIG[stage].badge}`}>
                            {stage}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600 text-xs">
                          {reason === 'aging'
                            ? agingSuggestions[stage]
                            : freshSuggestions[stage]
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Brief tab */}
      {tab === 'brief' && (
        <BriefPanel sections={briefSections} />
      )}
    </div>
  )
}
