/**
 * Shared-password session auth (edge-safe).
 *
 * One shared site password (env SITE_PASSWORD) gates the whole app. On a correct
 * password the /api/auth route issues a signed, expiring session cookie; the
 * middleware verifies it on every protected request. Uses Web Crypto (HMAC-SHA256)
 * so the same helpers run in both the Edge middleware and Node route handlers.
 *
 * Token format:  "<expiryEpochMs>.<hexHMAC(expiryEpochMs, AUTH_SECRET)>"
 */

const enc = new TextEncoder()
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export const SESSION_COOKIE = 'vt_session'

export async function createSessionToken(secret: string, ttlMs = DEFAULT_TTL_MS): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  return `${exp}.${await hmacHex(exp, secret)}`
}

export async function verifySessionToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || !secret) return false
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = await hmacHex(payload, secret)
  if (!timingSafeEqual(sig, expected)) return false
  const exp = Number(payload)
  return Number.isFinite(exp) && exp > Date.now()
}
