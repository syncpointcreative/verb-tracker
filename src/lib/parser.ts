/**
 * Parses a filename using the VERB naming convention:
 * CLIENT-PRODUCT-TYPE-CREATOR-DATE[.ext]
 * e.g. BIOM-APW-UGC-DB-040726.mp4
 */
import { CLIENT_CODES, PRODUCT_CODES, TYPE_CODES, CREATOR_CODES } from './constants'
import { Stage } from './supabase'

export interface ParsedFilename {
  clientName: string | null
  productName: string | null
  contentType: string | null
  postedBy: string | null
  dateAdded: Date | null
  hasCaption: boolean
  confidence: 'high' | 'low'  // high = matched naming convention, low = guessed from context
}

export function parseFilename(filename: string): ParsedFilename {
  // Strip extension
  const base = filename.replace(/\.[^.]+$/, '').toUpperCase()
  const hasCaption = base.includes('CAPTION')

  // Try structured format: CLIENT-PRODUCT-TYPE-CREATOR-DATE
  const parts = base.split('-')
  if (parts.length >= 4) {
    const clientName  = CLIENT_CODES[parts[0]] ?? null
    const productName = PRODUCT_CODES[parts[1]] ?? null
    const contentType = TYPE_CODES[parts[2]] ?? null
    const postedBy    = CREATOR_CODES[parts[3]] ?? null
    const dateAdded   = parseDateCode(parts[4])

    if (clientName && productName) {
      return { clientName, productName, contentType, postedBy, dateAdded, hasCaption, confidence: 'high' }
    }
  }

  // Fallback: try to find a client code anywhere in the filename
  let clientName: string | null = null
  for (const [code, name] of Object.entries(CLIENT_CODES)) {
    if (base.includes(code)) { clientName = name; break }
  }

  return {
    clientName,
    productName: null,
    contentType: null,
    postedBy: null,
    dateAdded: extractDateFromFilename(base),
    hasCaption,
    confidence: 'low',
  }
}

function parseDateCode(code: string | undefined): Date | null {
  if (!code || code.length < 6) return null
  // MMDDYY
  const mm = parseInt(code.slice(0, 2))
  const dd = parseInt(code.slice(2, 4))
  const yy = parseInt(code.slice(4, 6))
  if (isNaN(mm) || isNaN(dd) || isNaN(yy)) return null
  return new Date(2000 + yy, mm - 1, dd)
}

function extractDateFromFilename(base: string): Date | null {
  // Try to find a 6-digit date pattern (MMDDYY or YYYYMMDD)
  const m6 = base.match(/(\d{6})/)
  if (m6) return parseDateCode(m6[1])
  return null
}

/**
 * Infer funnel stage from filename and content type
 */
export function inferStage(filename: string, contentType: string | null): Stage {
  const upper = filename.toUpperCase()
  if (upper.includes('CAPTION') || upper.includes('AFFILIATE') || upper.includes('PROMO')) {
    return 'Conversion'
  }
  if (contentType === 'Product Demo' || contentType === 'Tutorial / How-To' ||
      contentType === 'Testimonial / Review') {
    return 'Consideration'
  }
  return 'Awareness'
}
