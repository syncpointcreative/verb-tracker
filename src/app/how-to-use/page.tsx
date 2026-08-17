'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'

const FUNNEL_STAGES = [
  {
    stage: 'Awareness',
    color: 'bg-red-900',
    lightBg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-900',
    goal: 'Stop the scroll. Introduce the brand to someone who has never heard of it.',
    tone: 'Energetic, surprising, entertaining. Lead with the hook — not the product.',
    hook: 'Pattern interrupt: unexpected visual, bold claim, relatable problem, or trending audio.',
    brandIntegration: 'Light. Product appears naturally — don\'t open with a logo or name.',
    cta: 'Soft: "Follow for more", "Learn more", or no CTA at all.',
    formats: ['Hook-driven UGC', 'Trend-led video', 'Problem/solution opener', 'Creator lifestyle'],
    duration: '7–15 seconds',
    required: [
      'Strong visual hook in first 2 seconds',
      'No price or discount mention',
      'Authentic, non-salesy feel',
      'Captions on screen',
    ],
    avoid: [
      'Opening with brand name or logo',
      'Product features as the lead',
      'Hard sell language',
    ],
    ask: 'Film a 10-sec hook showing [problem] without revealing the product until second 8.',
  },
  {
    stage: 'Consideration',
    color: 'bg-amber-800',
    lightBg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-900',
    goal: 'Educate. Build desire. Give the viewer a reason to choose this over alternatives.',
    tone: 'Informative but still entertaining. Trust-building. Confident.',
    hook: 'Lead with the benefit or the transformation: "I switched to X and here\'s what happened..."',
    brandIntegration: 'Medium. Product is front and center but through the lens of value/results.',
    cta: 'Medium: "Link in bio", "Check it out", "Shop now" — but after value is delivered.',
    formats: ['Product demo', 'Tutorial / how-to', 'Testimonial / review', 'Before & after', 'Creator-led comparison'],
    duration: '15–45 seconds',
    required: [
      'Clear product benefit stated within first 5 seconds',
      'Demonstration or proof point',
      'Authentic testimonial language (not scripted-sounding)',
      'Captions on screen',
    ],
    avoid: [
      'Vague claims without proof',
      'Reading off a script',
      'Hiding the price (if competitive)',
    ],
    ask: 'Walk me through how you use [product] in your daily routine — show the before/after or the moment it made a difference.',
  },
  {
    stage: 'Conversion',
    color: 'bg-emerald-800',
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-900',
    goal: 'Drive the click. Close the sale. Remove objections and create urgency.',
    tone: 'Direct, confident, urgent. Viewer already knows the brand — give them the final push.',
    hook: 'Lead with the offer or the outcome: "Get 20% off today only" or "Here\'s why I finally bought..."',
    brandIntegration: 'Heavy. Product, price, offer, and CTA are all prominent.',
    cta: 'Hard: "Shop now", "Use code X", "Limited time offer", "Click the link below."',
    formats: ['Promotional / offer-led', 'Affiliate / discount code', 'Urgency-driven UGC', 'Cart abandonment style'],
    duration: '10–30 seconds',
    required: [
      'Offer or discount clearly stated',
      'Urgency or scarcity if applicable',
      'Clear CTA with specific action',
      'Caption file (.txt) submitted with video',
      'Affiliate link or promo code included in brief',
    ],
    avoid: [
      'Burying the offer',
      'Soft CTAs',
      'Long build-ups before the offer',
    ],
    ask: 'Create a 15-sec video leading with the [X% off / promo code] offer and ending with a direct CTA to shop.',
  },
]

const PRODUCT_CODES_BY_CLIENT: {
  client: string
  code: string
  products: { code: string; name: string }[]
}[] = [
  {
    client: 'Biom', code: 'BIOM',
    products: [
      { code: 'APW', name: 'All Purpose Wipes' },
      { code: 'DW',  name: 'Disinfecting Wipes' },
      { code: 'BW',  name: 'Baby Wipes' },
      { code: 'FW',  name: 'Flushable Wipes' },
    ],
  },
  {
    client: 'Chomps', code: 'CHOMPS',
    products: [
      { code: 'OBB', name: 'Original Beef' },
      { code: 'SMK', name: 'Smokey BBQ Beef' },
      { code: 'SSB', name: 'Sea Salt Beef' },
      { code: 'SPV', name: 'Salt & Pepper Venison' },
      { code: 'JAL', name: 'Jalapeño Beef' },
      { code: 'TAC', name: 'Taco Seasoned Beef' },
      { code: 'OTK', name: 'Original Turkey' },
      { code: 'VAR', name: 'Variety Pack' },
      { code: 'OGC', name: 'Original Chicken' },
      { code: 'NHC', name: 'Nashville Hot Chicken' },
      { code: 'SBC', name: 'Savory Breakfast Chicken' },
      { code: 'CTP', name: 'Chicken Trial Pack' },
      { code: 'CC',   name: 'Chicken Chomplings' },
      { code: 'TC',   name: 'Turkey Chomplings' },
      { code: 'OBC',  name: 'Original Beef Chomplings' },
      { code: 'SSC',  name: 'Sea Salt Beef Chomplings' },
      { code: 'BBC',  name: 'Smokey BBQ Chomplings' },
      { code: 'SBCC', name: 'Savory Breakfast Chomplings' },
    ],
  },
  {
    client: 'FlavCity', code: 'FLAV',
    products: [
      { code: 'VC',  name: 'Vanilla Cream' },
      { code: 'CH',  name: 'Chocolate' },
      { code: 'CPB', name: 'Chocolate Peanut Butter' },
      { code: 'BC',  name: 'Berries & Cream' },
      { code: 'BUC', name: 'Butter Coffee' },
      { code: 'BB',  name: 'Brownie Batter' },
      { code: 'xCC', name: 'Cookies & Cream' },
      { code: 'MC',  name: 'Mint Chocolate' },
      { code: 'CR',  name: 'Cinnamon Roll' },
      { code: 'PC',  name: 'Pineapple Coconut' },
      { code: 'BAN', name: 'Banana Bread' },
      { code: 'BLU', name: 'Blueberry Muffin' },
      { code: 'SC',  name: 'Salted Caramel' },
      { code: 'SHK', name: 'Shaker Bottles' },
      { code: 'EP',  name: 'Electrolyte Packs' },
      { code: 'FVP', name: 'Variety Pack' },
      { code: 'AF',  name: 'Any Flavor' },
      { code: 'AT',  name: 'Any Tea' },
      { code: 'ISO',  name: 'Immune Support Orange' },
      { code: 'MVOM', name: 'Multi-Vitamin Orange-Mango' },
      { code: 'JHCG', name: 'Joint Health Citrus Ginger' },
      { code: 'SSVM', name: 'Sleep Support Vanilla Mint' },
      { code: 'LEM',  name: 'Lemonade' },
      { code: 'GLEM', name: 'Grapefruit Lemonade' },
      { code: 'VL',   name: 'Vanilla Latte Protein' },
      { code: 'CWB',  name: 'Coffee With Benefits' },
      { code: 'WWL',  name: 'WW Whipped Lemonade' },
    ],
  },
  {
    client: 'FaceTub', code: 'FT',
    products: [
      { code: 'FT', name: 'FaceTub' },
    ],
  },
  {
    client: 'Momofuku', code: 'MOMO',
    products: [
      { code: 'CCSD', name: 'Chili Crunch Sushi Dip' },
    ],
  },
  {
    client: 'Joolies', code: 'JOO',
    products: [
      { code: 'ADF',   name: 'All Date Flavors' },
      { code: 'DSBR',  name: 'Date Sours Blue Raspberry' },
      { code: 'DSPCH', name: 'Date Sours Peachy' },
      { code: 'DSWM',  name: 'Date Sours Watermelon' },
      { code: 'DSCHC', name: 'Date Sours Cherry Cola' },
    ],
  },
  {
    client: 'ESW Beauty', code: 'ESW',
    products: [
      { code: 'MBP',  name: 'Multiple Beauty Products' },
      { code: 'SMLE', name: 'Strawberry Matcha Latte Eye Patch' },
      { code: 'SCM',  name: 'Strawberry & Cream Mask' },
      { code: 'MIST', name: 'Mist' },
      { code: 'GLP',  name: 'Gloss Lip Treatments' },
      { code: 'SCR',  name: 'Strawberry Coco Rose' },
      { code: 'BSK',  name: 'Beauty Sleep Kit' },
      { code: 'RSK',  name: 'Rise and Shine Kit' },
      { code: 'ASK',  name: 'Awaken Skin Kit' },
      { code: 'GHK',  name: 'Get Hydrated Kit' },
      { code: 'PDRN', name: 'PDRN' },
      { code: 'AFF',  name: 'Affiliate' },
      { code: 'PMS',  name: 'Papaya Milk Serum' },
    ],
  },
  {
    client: 'E-Patrol', code: 'EPAT',
    products: [
      { code: 'LC', name: 'Longevity Coffee' },
      { code: 'AC', name: 'Alpenglow Cocoa' },
      { code: 'FF', name: 'Farmstand Fruit' },
    ],
  },
  {
    client: 'Junkless', code: 'JUNK',
    products: [
      { code: 'PBVP', name: 'Protein Bar Variety Pack' },
    ],
  },
  {
    client: 'Shameless', code: 'SHAME',
    products: [
      { code: 'SSVP',  name: 'Shameless Snacks Variety Pack' },
      { code: 'SSMM',  name: 'Sour Mango Madness' },
      { code: 'SSCC',  name: 'So Cool Cola' },
      { code: 'SSBR',  name: 'Super Sour Blue Raspberry' },
      { code: 'SSSP',  name: 'Sour Pineapple' },
      { code: 'SSBC',  name: 'So Beary Cherry' },
      { code: 'SSWW',  name: 'Wassup Watermelon' },
      { code: 'SSCB',  name: 'Sour Cherry Bomb' },
      { code: 'SSWRM', name: 'Super Wild Worms' },
      { code: 'SSOB',  name: 'Orange Blossom' },
      { code: 'SSGA',  name: 'Green Apple Blast' },
      { code: 'SSOMG', name: 'OMG Sour Peach' },
      { code: 'SSRS',  name: 'Rasberry Sour Scouts' },
      { code: 'SSSS',  name: 'Strawberry Sour' },
      { code: 'SSSG',  name: 'Sour Gooey Fruit' },
    ],
  },
]

// Legacy content-type codes — retained for filename back-compat only.
// Intentionally NOT rendered on this page (newer naming uses the funnel stage instead).
const TYPE_CODES = [
  { code: 'UGC',   name: 'User-Generated Content' },
  { code: 'BLS',   name: 'Brand / Lifestyle' },
  { code: 'PD',    name: 'Product Demo' },
  { code: 'CRL',   name: 'Creator-Led' },
  { code: 'TREV',  name: 'Testimonial / Review' },
  { code: 'TUT',   name: 'Tutorial / How-To' },
  { code: 'PROMO', name: 'Promotional' },
  { code: 'SI',    name: 'Static Imagery' },
  { code: 'MG',    name: 'Motion Graphics' },
  { code: 'AFF',   name: 'Affiliate Video' },
]
void TYPE_CODES // kept for reference; not shown on the page

const CREATOR_CODES = [
  { code: 'DB', name: 'David Butler' },
  { code: 'MA', name: 'Mitchell Allen' },
  { code: 'MP', name: 'Mia Pistilli' },
  { code: 'DN', name: 'Dylan Nelson' },
  { code: 'JM', name: 'Jayden Mejia' },
  { code: 'LR', name: 'Libby Ragole' },
  { code: 'BS', name: 'Becca Siefert' },
  { code: 'AO', name: 'Anthony Oshea' },
  { code: 'BG', name: 'Brielle Galekovic' },
  { code: 'MX', name: 'Max Gomas' },
  { code: 'ID', name: 'Isabella Donoso' },
  { code: 'SB', name: 'Seth Baron' },
  { code: 'LS', name: 'Liz Snyder' },
  { code: 'MD', name: 'Mike Dobson' },
]

// Collapsible card — header is a clickable button; body shows only when expanded. Default collapsed.
function Collapsible({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden self-start">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-gray-800 transition-colors text-left"
      >
        <span className="font-semibold flex items-center gap-2">
          <span className={`inline-block text-[10px] text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          {title}
        </span>
        {badge && <code className="text-xs text-gray-400 font-normal">{badge}</code>}
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

export default function HowToUsePage() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">How to Use</h1>
        <p className="text-gray-500 mt-1">Content guidelines, funnel definitions, and naming conventions</p>
      </div>

      {/* Naming Convention */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-gray-900 mb-3">File Naming Convention</h2>
        <div className="bg-gray-900 text-green-400 font-mono text-sm rounded-lg px-5 py-4 mb-3">
          CLIENT-PRODUCT-STAGE-CREATOR-TITLE-DATE.mp4
        </div>
        <p className="text-sm text-gray-500 mb-2">Example: <code className="bg-gray-100 px-1.5 py-0.5 rounded">CHOMPS-SMK-AWA-LR-SummerHook-050626.mp4</code> = Chomps · Smokey BBQ Beef · Awareness · Libby Ragole · Summer Hook · May 6, 2026</p>
        <p className="text-xs text-gray-400 mb-1">Date format: MMDDYY &nbsp;·&nbsp; Add <code className="bg-gray-100 px-1">-CAPTIONS</code> before the extension if a caption file is included</p>
        <p className="text-xs text-gray-400">Title should be a short descriptive slug with no spaces — use camel case or underscores (e.g. <code className="bg-gray-100 px-1">SummerHook</code>, <code className="bg-gray-100 px-1">BBQ_Snack</code>)</p>
      </section>

      {/* Product Code Key — collapsible per client */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Product Code Key — by Client</h2>
          <span className="text-xs text-gray-400">Click a client to view its codes</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {PRODUCT_CODES_BY_CLIENT.map(({ client, code, products }) => (
            <Collapsible key={client} title={client} badge={code}>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {products.map(p => (
                    <tr key={p.code} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500 w-16">{p.code}</td>
                      <td className="px-4 py-2 text-gray-700">{p.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Collapsible>
          ))}
        </div>
      </section>

      {/* Creator + Funnel Stage Codes — collapsible */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Naming Codes</h2>
          <span className="text-xs text-gray-400">Click to expand</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          <Collapsible title="Creator Codes" badge={`${CREATOR_CODES.length} creators`}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {CREATOR_CODES.map(c => (
                  <tr key={c.code} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500 w-16">{c.code}</td>
                    <td className="px-4 py-2 text-gray-700">{c.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Collapsible>
          <Collapsible title="Funnel Stage Codes" badge="AWA · CON · CVR · INT">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500 w-16">AWA</td>
                  <td className="px-4 py-2 text-gray-700 font-medium">Awareness</td>
                  <td className="px-4 py-2 text-gray-500">Stop the scroll. Hook-driven, brand intro.</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500 w-16">CON</td>
                  <td className="px-4 py-2 text-gray-700 font-medium">Consideration</td>
                  <td className="px-4 py-2 text-gray-500">Educate and build desire. Demo, tutorial, testimonial.</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500 w-16">CVR</td>
                  <td className="px-4 py-2 text-gray-700 font-medium">Conversion</td>
                  <td className="px-4 py-2 text-gray-500">Drive the click. Promo, offer-led, affiliate.</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500 w-16">INT</td>
                  <td className="px-4 py-2 text-gray-700 font-medium">Community Interaction</td>
                  <td className="px-4 py-2 text-gray-500">Spark conversation. Community-led, engagement-driven (follows, likes, comments, shares).</td>
                </tr>
              </tbody>
            </table>
            <div className="bg-gray-50 border-t border-gray-200 px-4 py-2.5 text-xs text-gray-400">
              Target split: 50% Awareness · 30% Consideration · 20% Conversion
            </div>
          </Collapsible>
        </div>
      </section>

      {/* Funnel Stage Criteria */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-gray-900 mb-5">Funnel Stage Criteria</h2>
        <div className="space-y-6">
          {FUNNEL_STAGES.map(s => (
            <div key={s.stage} className={`border ${s.border} rounded-xl overflow-hidden`}>
              <div className={`${s.color} text-white px-5 py-3`}>
                <h3 className="font-bold text-lg">{s.stage}</h3>
                <p className="text-sm opacity-80 mt-0.5">{s.goal}</p>
              </div>
              <div className={`${s.lightBg} px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm`}>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">Tone</p>
                  <p className="text-gray-600">{s.tone}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">Hook Approach</p>
                  <p className="text-gray-600">{s.hook}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">Brand Integration</p>
                  <p className="text-gray-600">{s.brandIntegration}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">CTA Style</p>
                  <p className="text-gray-600">{s.cta}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">Formats</p>
                  <p className="text-gray-600">{s.formats.join(' · ')}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">Duration</p>
                  <p className="text-gray-600">{s.duration}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">✓ Required Elements</p>
                  <ul className="text-gray-600 space-y-0.5">
                    {s.required.map(r => <li key={r}>· {r}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-gray-700 mb-1">✗ Avoid</p>
                  <ul className="text-gray-600 space-y-0.5">
                    {s.avoid.map(a => <li key={a}>· {a}</li>)}
                  </ul>
                </div>
                <div className="md:col-span-2">
                  <p className="font-semibold text-gray-700 mb-1">Example Creator Ask</p>
                  <p className={`${s.lightBg} border ${s.border} rounded-lg px-3 py-2 text-gray-700 italic`}>&ldquo;{s.ask}&rdquo;</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Refresh Cadence */}
      <section className="mb-10 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
        <h2 className="text-base font-bold text-blue-900 mb-2">Refresh Cadence</h2>
        <div className="text-sm text-blue-800 space-y-1">
          <p>· <strong>TikTok rewards new creative every 2–3 weeks.</strong> Assets older than 90 days are flagged as expired in this tracker.</p>
          <p>· Each client requires a minimum of <strong>3 active assets per funnel stage</strong> at any time.</p>
          <p>· Monthly delivery quota is <strong>30 pieces per client</strong> unless otherwise noted.</p>
          <p>· If the monthly quota is met, additional pieces roll forward to the next month automatically.</p>
        </div>
      </section>

      <div className="text-center pb-8">
        <Link href="/" className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
      </div>
    </div>
  )
}
