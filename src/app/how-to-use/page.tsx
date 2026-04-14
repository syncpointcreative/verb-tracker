import Link from 'next/link'

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
      { code: 'CC',  name: 'Cookies & Cream' },
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
    ],
  },
  {
    client: 'FaceTub', code: 'FT',
    products: [
      { code: 'FT', name: 'FaceTub' },
    ],
  },
]

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

const CREATOR_CODES = [
  { code: 'DB', name: 'David Butler' },
  { code: 'MA', name: 'Mitchell Allen' },
  { code: 'MP', name: 'Mia Pistilli' },
  { code: 'DY', name: 'Dylan Nelson' },
  { code: 'JM', name: 'Jayden Mejia' },
  { code: 'LR', name: 'Libby Ragole' },
  { code: 'BS', name: 'Becca Seifert' },
  { code: 'AO', name: 'Anthony Oshea' },
  { code: 'BG', name: 'Brielle Galekovic' },
  { code: 'MX', name: 'Max Gomas' },
  { code: 'ID', name: 'Isabella Donoso' },
]

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
          CLIENT-PRODUCT-TYPE-CREATOR-TITLE-DATE.mp4
        </div>
        <p className="text-sm text-gray-500 mb-2">Example: <code className="bg-gray-100 px-1.5 py-0.5 rounded">BIOM-APW-UGC-DB-SpringReset-040726.mp4</code> = Biom · All Purpose Wipes · UGC · David Butler · Spring Reset · April 7, 2026</p>
        <p className="text-xs text-gray-400 mb-1">Date format: MMDDYY &nbsp;·&nbsp; Add <code className="bg-gray-100 px-1">-CAPTIONS</code> before the extension if a caption file is included</p>
        <p className="text-xs text-gray-400">Title should be a short descriptive slug with no spaces — use camel case or underscores (e.g. <code className="bg-gray-100 px-1">SpringReset</code>, <code className="bg-gray-100 px-1">BBQ_Snack</code>)</p>
      </section>

      {/* Product Code Key */}
      <section className="mb-10">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Product Code Key — by Client</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PRODUCT_CODES_BY_CLIENT.map(({ client, code, products }) => (
            <div key={client} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between">
                <span className="font-semibold">{client}</span>
                <code className="text-xs text-gray-400">{code}</code>
              </div>
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
            </div>
          ))}
        </div>
      </section>

      {/* Content Type + Creator Codes */}
      <section className="mb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2.5 font-semibold">Content Type Codes</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {TYPE_CODES.map(t => (
                  <tr key={t.code} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-500 w-16">{t.code}</td>
                    <td className="px-4 py-2 text-gray-700">{t.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2.5 font-semibold">Creator Codes</div>
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
          </div>
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
