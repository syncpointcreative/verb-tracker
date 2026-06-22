/**
 * Parses a filename using the Asset Tracker naming convention:
 *
 * STANDARD (current, no TYPE):
 *   CLIENT-PRODUCT-STAGE-CREATOR-TITLE-DATE[.ext]       (6-part)
 *   e.g. CHOMPS-SMK-AWA-LR-SummerHook-050626.mp4
 *
 * LEGACY (still supported):
 *   CLIENT-PRODUCT-TYPE-STAGE-CREATOR-TITLE-DATE[.ext]  (7-part, with TYPE)
 *   CLIENT-PRODUCT-TYPE-CREATOR-TITLE-DATE[.ext]        (6-part, no stage)
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

  const parts     = base.split('-')
  // Preserve original case so toTitleCase() can detect CamelCase word boundaries
  // (e.g. "MorningFuel" → "Morning Fuel" instead of "M O R N I N G F U E L")
  const origParts = filename.replace(/(\.[^.]+)+$/, '').split('-')

  const clientName  = CLIENT_CODES[parts[0]] ?? null
  const productName = PRODUCT_CODES[parts[1]] ?? null

  // As long as the CLIENT code (parts[0]) is recognized, parse normally — even if
  // the PRODUCT code isn't yet known. This keeps a file on the correct client when
  // a new product code (e.g. a new flavor) hasn't been added yet; the unknown
  // product resolves to the client's fallback product downstream.
  if (clientName) {
    // ── Standard format: CLIENT-PRODUCT-STAGE-CREATOR-TITLE-DATE ─────────
    // Detected when parts[2] is a STAGE code (AWA/CON/CVR)
    const stageAtPos2 = STAGE_CODES[parts[2]] as Stage | undefined
    if (stageAtPos2) {
      // CREATOR is optional in the current convention:
      //   with creator: CLIENT-PRODUCT-STAGE-CREATOR-TITLE-DATE
      //   without:      CLIENT-PRODUCT-STAGE-TITLE-DATE
      // Detect by checking whether parts[3] is a known creator code; if it isn't,
      // parts[3] is the TITLE (and parts[4] the date). Without this, a creator-less
      // filename mis-reads the DATE as the title — which is how Monday items ended
      // up named with just a date.
      const hasCreator = CREATOR_CODES[parts[3]] !== undefined
      const postedBy   = hasCreator ? CREATOR_CODES[parts[3]] : null
      const titleIdx   = hasCreator ? 4 : 3
      const title      = origParts[titleIdx] ? toTitleCase(origParts[titleIdx]) : null
      const dateAdded  = parseDateCode(parts[titleIdx + 1]) ?? extractDateFromFilename(base)
      return { clientName, productName, contentType: null, stage: stageAtPos2, postedBy, title, dateAdded, hasCaption, confidence: 'high' }
    }

    // ── Legacy formats (parts[2] is a TYPE code) ───────────────────────────
    const contentType = TYPE_CODES[parts[2]] ?? null

    // Legacy 7-part: CLIENT-PRODUCT-TYPE-STAGE-CREATOR-TITLE-DATE
    const stageAtPos3 = STAGE_CODES[parts[3]] as Stage | undefined
    if (stageAtPos3) {
      const postedBy  = CREATOR_CODES[parts[4]] ?? null
      const title     = origParts[5] ? toTitleCase(origParts[5]) : null
      const dateAdded = parseDateCode(parts[6])
      return { clientName, productName, contentType, stage: stageAtPos3, postedBy, title, dateAdded, hasCaption, confidence: 'high' }
    }

    // Legacy 6-part: CLIENT-PRODUCT-TYPE-CREATOR-TITLE-DATE
    if (parts.length >= 6) {
      const postedBy  = CREATOR_CODES[parts[3]] ?? null
      const title     = toTitleCase(origParts[4] ?? parts[4])
      const dateAdded = parseDateCode(parts[5])
      return { clientName, productName, contentType, stage: null, postedBy, title, dateAdded, hasCaption, confidence: 'high' }
    }

    // Legacy 5-part: CLIENT-PRODUCT-TYPE-CREATOR-DATE
    const postedBy  = CREATOR_CODES[parts[3]] ?? null
    const dateAdded = parseDateCode(parts[4])
    return { clientName, productName, contentType, stage: null, postedBy, title: null, dateAdded, hasCaption, confidence: 'high' }
  }

  // Fallback (parts[0] wasn't a known client code). Match a whole hyphen-delimited
  // part exactly — never a substring — so a title like "AnotherFlavor" can't be
  // mistaken for the "FLAV" client code and misrouted.
  let fallbackClient: string | null = null
  for (const part of parts) {
    if (CLIENT_CODES[part]) { fallbackClient = CLIENT_CODES[part]; break }
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

export interface FilenameValidation {
  valid:   boolean
  reason?: string   // human-readable, posted back to Slack when invalid
}

/**
 * Conservative naming-convention gate for Slack submissions.
 *
 * Deliberately HIGH-PRECISION: it only rejects filenames that genuinely can't be
 * routed, so we never block a legitimately-formatted asset. Measured against the
 * full live asset set (427 files), this passes every real variant — the legacy
 * TYPE format, CAPTIONS/V2 suffixes, and the ESW "EXT" external-creator format —
 * and rejects only truly malformed names (client-code typos, missing/garbled
 * dates, and em/en dashes used in place of hyphens).
 *
 * Note: Slack's Events API fires AFTER a file is posted, so this can't prevent the
 * upload itself — the caller uses it to refuse ingestion and flag the message.
 */
export function validateFilename(filename: string): FilenameValidation {
  // Segments must be separated by a plain hyphen. An em/en dash (— –) is almost
  // always an autocorrect artifact that silently breaks every downstream split.
  if (/[—–]/.test(filename)) {
    return { valid: false, reason: 'uses an em/en dash (— or –) — separate every segment with a plain hyphen (-)' }
  }

  const parsed = parseFilename(filename)

  if (!parsed.clientName) {
    return { valid: false, reason: 'no recognized client code at the start (e.g. CHOMPS, FLAV, ESW, JOO, BIOM)' }
  }

  // Date check scans the whole name (not just the parsed position) so legitimate
  // legacy-format files — where the date may sit after an extra segment or an
  // underscore — still pass. Only a genuinely absent/truncated date is rejected.
  const base = filename.replace(/(\.[^.]+)+$/, '').toUpperCase()
  if (!extractDateFromFilename(base)) {
    return { valid: false, reason: 'no valid date found — end the name with the date as MMDDYY (e.g. 061826)' }
  }

  return { valid: true }
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
