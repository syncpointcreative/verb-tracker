/**
 * preview-asset-needs.mjs — render the upgraded creative-ask alert WITHOUT posting.
 *
 * Reads the live Supabase DB read-only, runs the real lib/assetNeeds scoring
 * (transpiled on the fly via the installed `typescript`), and prints a faithful
 * text preview of what Monday's #asset-needs alert would say. Posts nothing.
 *
 * Usage:  node scripts/preview-asset-needs.mjs
 */
import { readFileSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// ── Load env from .env.local (read-only credentials) ──────────────────────────
const env = {}
for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Missing Supabase env in .env.local'); process.exit(1) }

// ── Transpile lib/assetNeeds.ts → temp .mjs and import it ─────────────────────
const ts = (await import(pathToFileURL(join(root, 'node_modules/typescript/lib/typescript.js')))).default
const src = readFileSync(join(root, 'src/lib/assetNeeds.ts'), 'utf8')
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText
const tmp = join(tmpdir(), 'assetNeeds.preview.mjs')
writeFileSync(tmp, js)
const { scoreNeeds, renderTextPreview } = await import(pathToFileURL(tmp))

// ── Fetch all assets (READ ONLY) ──────────────────────────────────────────────
const { createRequire } = await import('node:module')
const require = createRequire(join(root, 'package.json'))
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(URL, KEY)
const { data, error } = await supabase.from('assets').select(`
  id, status, stage, content_type, date_added, date_live, first_live,
  client_id, product_id, performance, asset_name, notes,
  product:products(name, discontinued),
  client:clients(id, name, slug)
`)
if (error) { console.error('Query error:', error.message); process.exit(1) }

const REFRESH_SOON_DAYS = 15
const all = scoreNeeds(data ?? [], { refreshSoonDays: REFRESH_SOON_DAYS, now: new Date() })
const actionable = all.filter(cn => cn.actionable > 0)

console.log(`\n===== ASSET-NEEDS DRY-RUN PREVIEW (${(data ?? []).length} assets scanned) =====`)
console.log(`Clients with actionable asks: ${actionable.length} / ${all.length}\n`)

// Bench/pipeline diagnostics — how populated is the data driving the new logic?
const benchHigh = (data ?? []).filter(a => a.status === 'Pulled' && a.performance === 'High Performer').length
const gradedLive = (data ?? []).filter(a => a.status === 'Live / Running' && a.performance).length
const liveTotal = (data ?? []).filter(a => a.status === 'Live / Running').length
console.log(`[data signals] bench (Pulled High Performers): ${benchHigh} · live assets graded: ${gradedLive}/${liveTotal}\n`)

for (const cn of actionable) {
  console.log('────────────────────────────────────────────────────────')
  console.log(renderTextPreview(cn))
  console.log('')
}
if (!actionable.length) console.log('(no actionable asks at current thresholds)')
