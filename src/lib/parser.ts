/**
 * Parses a filename using the Asset Tracker naming convention:
 *
 * STANDARD (stage-aware, required going forward):
 *   CLIENT-PRODUCT-TYPE-STAGE-CREATOR-TITLE-DATE[.ext]  (7-part)
 *   e.g. CHOMPS-SMK-UGC-AWA-LR-SummerHook-050626.mp4
 *
 * LEGACY (still supported, no stage code):
 *   CLIENT-PRODUCT-TYPE-CREATOR-TITLE-DATE[.ext]        (6-part)
 *   CLIENT-PRODUCT-TYPE-CREATOR-DATE[.ext]              (5-part)
 *   e.g. BIOM-APW-UGC-DB-SpringReset-040726.mp4
 */
import { CLIENT_CODES, PRODUCT_CODES, TYPE_CODES, CREATOR_CODES, STAGE_CODES } from './constants'
import { Stage } from './supabase'

export interface ParsedFilename {
  clientName: string | null
  productName: string | null
  contentType: string | null
  stage: Stage | null        // explicitly coded (AWA/CON/CVR) — null means infer from content
  postedBy: string | null
  title: string | null
  dateAdded: Date | null
  hasCaption: boolean
  confidence: 'high' | 'low'
}

export function parseFilename(filename: string): ParsedFilename {
  // Strip ALL extensions (handles double extensions like .mp4.MOV)
  const base = filename.replace(/(\.[^.]+)+$/, '').toUpperCase()
  const hasCaption = base.includes('CAPTION')

  const parts = base.split('-')

  const clientName  = CLIENT_CODES[parts[0]] ?? null
  const productName = PRODUCT_CODES[parts[1]] ?? null
  const contentType = TYPE_CODES[parts[2]] ?? null

  if (clientName && productName) {
    // Detect whether part[3] is a STAGE code (new format) or CREATOR code (legacy)
    const stageFromCode = STAGE_CODES[parts[3]] as Stage | undefined

    if (stageFromCode) {
      // ── Standard format: CLIENT-PRODUCT-TYPE-STAGE-CREATOR-TITLE-DATE ─────
      const postedBy  = CREATOR_CODES[parts[4]] ?? null
      const title     = parts[5] ? toTitleCase(parts[5]) : null
      const dateAdded = parseDateCode(parts[6])
      return { clientName, productName, contentType, stage: stageFromCode, postedBy, title, dateAdded, hasCaption, confidence: 'high' }
    }

    // ── Legacy formats (no explicit stage code) ────────────────────────────
    // CLIENT-PRODUCT-TYPE-CREATOR-TITLE-DATE  (6-part)
    // CLIENT-PRODUCT-TYPE-CREATOR-DATE        (5-part)
    const postedBy = CREATOR_CODES[parts[3]] ?? null

    if (parts.length >= 6) {
      const title     = toTitleCase(parts[4])
      const dateAdded = parseDateCode(parts[5])
      return { clientName, productName, contentType, stage: null, postedBy, title, dateAdded, hasCaption, confidence: 'high' }
    }

    const dateAdded = parseDateCode(parts[4])
    return { clientName, productName, contentType, stage: null, postedBy, title: null, dateAdded, hasCaption, confidence: 'high' }
  }

  // Fallback: try to find a client code anywhere in the filename
  let fallbackClient: string | null = null
  for (const [code, name] of Object.entries(CLIENT_CODES)) {
    if (base.includes(code)) { fallbackClient = name; break }
  }

  return {
    clientName: fallbackClient,
    productName: null,
    contentType: null,
    stage: null,
    postedBy: null,
    title: null,
    dateAdded: extractDateFromFilename(base),
    hasCaption,
    confidence: 'low',
  }
}

function toTitleCase(slug: string): string {
  // Convert CamelCase or underscore slugs to readable title
  return slug
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function parseDateCode(code: string | undefined): Date | null {
  if (!code) return null
  // Trim whitespace and strip any non-digit trailing characters (e.g. ".MP4" residue)
  const clean = code.trim().replace(/\D.*$/, '')
  if (clean.length < 6) return null
  // Handle both MMDDYY (6 digits) and MMDDYYYY (8 digits)
  const mm = parseInt(clean.slice(0, 2), 10)
  const dd = parseInt(clean.slice(2, 4), 10)
  const yearStr = clean.slice(4, clean.length >= 8 ? 8 : 6)
  const yy = yearStr.length === 4
    ? parseInt(yearStr, 10)           // full 4-digit year: 2026
    : 2000 + parseInt(yearStr, 10)   // 2-digit year: 26 → 2026
  // Basic sanity check — avoid absurd roll-overs from corrupt codes
  if (isNaN(mm) || isNaN(dd) || isNaN(yy)) return null
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  if (yy < 2020 || yy > 2100) return null
  return new Date(yy, mm - 1, dd)
}

function extractDateFromFilename(base: string): Date | null {
  // Prefer 8-digit MMDDYYYY over 6-digit MMDDYY to avoid year truncation
  const m8 = base.match(/(\d{8})/)
  if (m8) {
    const parsed = parseDateCode(m8[1])
    if (parsed) return parsed
  }
  const m6 = base.match(/(\d{6})/)
  if (m6) return parseDateCode(m6[1])
  return null
}

/**
 * Infer funnel stage from filename and content type.
 *
 * Priority: Conversion > Consideration > Awareness (default).
 * Uses both the parsed content-type label and filename keywords so assets
 * land in the right column without manual touchpoints.
 */
export function inferStage(filename: string, contentType: string | null): Stage {
  const upper = filename.toUpperCase()

  // ── Conversion (drive the click, close the sale) ──────────────────────────
  if (
    contentType === 'Promotional' ||
    contentType === 'Affiliate Video' ||
    upper.includes('PROMO') ||
    upper.includes('CAPTION') ||   // captioned cut = conversion-optimised
    upper.includes('AFFILIATE') ||
    upper.includes('OFFER') ||
    upper.includes('DISCOUNT') ||
    upper.includes('SALE') ||
    upper.includes('CTA')
  ) return 'Conversion'

  // ── Consideration (educate, build desire, differentiate) ──────────────────
  if (
    contentType === 'Product Demo' ||
    contentType === 'Tutorial / How-To' ||
    contentType === 'Testimonial / Review' ||
    contentType === 'Static Imagery' ||   // product shots / info graphics
    upper.includes('REVIEW') ||
    upper.includes('DEMO') ||
    upper.includes('TUTORIAL') ||
    upper.includes('COMPARE') ||
    upper.includes('FEATURE') ||
    upper.includes('BENEFIT') ||
    upper.includes('EXPLAIN') ||
    upper.includes('HOWTO')
  ) return 'Consideration'

  // ── Awareness (stop the scroll, introduce the brand) ─────────────────────
  // UGC, Brand/Lifestyle, Creator-Led, Motion Graphics → top-of-funnel default
  return 'Awareness'
}
