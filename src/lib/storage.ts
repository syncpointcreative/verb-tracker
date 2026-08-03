/**
 * Pluggable file storage — swap providers via STORAGE_PROVIDER env var.
 *
 * Supported providers:
 *   google   — Google Drive (default)
 *   dropbox  — Dropbox
 *   s3       — AWS S3 or any S3-compatible store (Cloudflare R2, Backblaze B2, etc.)
 *
 * Set STORAGE_PROVIDER to the value above, then set the matching env vars:
 *
 *   google:
 *     GOOGLE_SERVICE_ACCOUNT_JSON  Full JSON key downloaded from GCP console
 *     GOOGLE_DRIVE_FOLDER_ID       Root folder ID (files land in {root}/{clientName}/)
 *
 *   dropbox:
 *     DROPBOX_ACCESS_TOKEN         Long-lived access token (or refresh token flow)
 *     DROPBOX_ROOT_PATH            Root path, e.g. /Assets  (files land in {root}/{clientName}/)
 *
 *   s3:
 *     AWS_ACCESS_KEY_ID            IAM key with s3:PutObject permission
 *     AWS_SECRET_ACCESS_KEY        IAM secret
 *     AWS_S3_BUCKET                Bucket name
 *     AWS_REGION                   e.g. us-east-1
 *     AWS_S3_ENDPOINT              (optional) Override for R2/B2, e.g. https://<accountId>.r2.cloudflarestorage.com
 *
 * All providers use the same function signature. Zero external dependencies —
 * auth/signing uses Node's built-in `crypto`.
 */

import { createHmac, createSign } from 'crypto'

// ─── Shared interface ─────────────────────────────────────────────────────────

export interface UploadInput {
  slackUrl:   string  // Slack url_private_download
  fileName:   string  // e.g. CHOMPS-SMK-UGC-LR-050626.mp4
  mimeType:   string  // e.g. video/mp4
  clientName: string  // e.g. Chomps  (used as subfolder name)
}

/** Upload a file from Slack to the configured storage provider. Returns a public/shareable URL. */
export async function uploadFile(input: UploadInput): Promise<string> {
  const provider = (process.env.STORAGE_PROVIDER ?? 'google').toLowerCase()

  switch (provider) {
    case 'google':  return uploadToGoogle(input)
    case 'dropbox': return uploadToDropbox(input)
    case 's3':      return uploadToS3(input)
    default:
      throw new Error(`Unknown STORAGE_PROVIDER "${provider}". Must be google, dropbox, or s3.`)
  }
}

// ─── Shared: download from Slack ─────────────────────────────────────────────

async function downloadFromSlack(slackUrl: string): Promise<Buffer> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN not set')

  const res = await fetch(slackUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Slack download failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  // Slack serves an HTML auth/redirect page with HTTP 200 (not a 404) for expired
  // or unauthorized url_private_download links. Without this guard that ~60KB HTML
  // gets uploaded as the "video". Treat it as a refreshable failure.
  const ct   = (res.headers.get('content-type') || '').toLowerCase()
  const head = buf.subarray(0, 32).toString('utf8').trim().toLowerCase()
  if (ct.includes('text/html') || head.startsWith('<!doctype') || head.startsWith('<html')) {
    throw new Error('Slack returned HTML not file bytes (expired/unauthorized url_private_download)')
  }
  return buf
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const b = typeof input === 'string' ? Buffer.from(input) : input
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export async function getGoogleToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')

  const sa: { client_email: string; private_key: string; token_uri?: string } = JSON.parse(raw)
  const now    = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim  = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))

  const toSign = `${header}.${claim}`
  const signer = createSign('RSA-SHA256')
  signer.update(toSign)
  const sig  = b64url(signer.sign(sa.private_key.replace(/\\n/g, '\n')))
  const jwt  = `${toSign}.${sig}`

  const res  = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const json = await res.json() as { access_token?: string; error?: string }
  if (!json.access_token) throw new Error(`Google token exchange failed: ${JSON.stringify(json)}`)
  return json.access_token
}

async function ensureGoogleSubfolder(token: string, parentId: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  )
  // supportsAllDrives + includeItemsFromAllDrives required for Shared Drive folders
  const listRes  = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const listJson = await listRes.json() as { files?: Array<{ id: string }> }
  if (listJson.files?.length) return listJson.files[0].id

  const createRes  = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  const created = await createRes.json() as { id?: string; error?: unknown }
  if (!created.id) throw new Error(`Google: failed to create folder "${name}": ${JSON.stringify(created)}`)
  return created.id
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Month folder name from a filename's MMDDYY date suffix — "Month YYYY"
// (e.g. "July 2026"), matching the Shared Drive convention. Date code
// "07…26" → "July 2026", "08…26" → "August 2026". Falls back to the current
// month + year when no date code is present.
function monthFolderName(filename: string): string {
  // Parse MMDDYY date suffix from filename (e.g. CHOMPS-SMK-AWA-LR-Hook-050626.mp4)
  const m = filename.match(/[-_](\d{2})\d{2}(\d{2})(?:\.[^.]+)*$/)
  if (m) {
    const mm = parseInt(m[1], 10)
    const yy = parseInt(m[2], 10)
    if (mm >= 1 && mm <= 12) return `${MONTHS[mm - 1]} ${2000 + yy}`
  }
  const now = new Date()
  return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

async function uploadToGoogle({ slackUrl, fileName, mimeType, clientName }: UploadInput): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set')

  const token        = await getGoogleToken()
  const fileBuffer   = await downloadFromSlack(slackUrl)
  const clientFolder = await ensureGoogleSubfolder(token, rootFolderId, clientName)
  const monthFolder  = await ensureGoogleSubfolder(token, clientFolder, monthFolderName(fileName))

  // Joolies splits each month into two folders: "11S-Content" (agency-produced,
  // i.e. everything ingested from Slack — this pipeline) and "Joolies Content"
  // (brand-supplied, placed manually). All Slack files land in 11S-Content; we
  // also ensure the brand folder exists so it's ready alongside it.
  let destFolder = monthFolder
  if (clientName.trim().toLowerCase() === 'joolies') {
    await ensureGoogleSubfolder(token, monthFolder, 'Joolies Content')
    destFolder = await ensureGoogleSubfolder(token, monthFolder, '11S-Content')
  }

  const boundary = '-------storageupload'
  const metadata = JSON.stringify({ name: fileName, parents: [destFolder] })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  // supportsAllDrives=true required for Shared Drive uploads
  const res  = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.byteLength),
      },
      body,
    }
  )
  const json = await res.json() as { id?: string; webViewLink?: string; error?: unknown }
  if (!json.id) throw new Error(`Google upload failed: ${JSON.stringify(json)}`)
  return json.webViewLink ?? `https://drive.google.com/file/d/${json.id}/view`
}

// ─── Dropbox ──────────────────────────────────────────────────────────────────

async function uploadToDropbox({ slackUrl, fileName, mimeType, clientName }: UploadInput): Promise<string> {
  const token    = process.env.DROPBOX_ACCESS_TOKEN
  const rootPath = (process.env.DROPBOX_ROOT_PATH ?? '/Assets').replace(/\/$/, '')
  if (!token) throw new Error('DROPBOX_ACCESS_TOKEN not set')

  const fileBuffer = await downloadFromSlack(slackUrl)
  const destPath   = `${rootPath}/${clientName}/${fileName}`

  const res  = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
      'Dropbox-API-Arg': JSON.stringify({
        path:       destPath,
        mode:       'add',
        autorename: true,  // avoids collision if file already exists
      }),
    },
    body: new Uint8Array(fileBuffer),
  })
  const json = await res.json() as { id?: string; path_display?: string; error_summary?: string }
  if (!json.id) throw new Error(`Dropbox upload failed: ${json.error_summary ?? JSON.stringify(json)}`)

  // Get a shared link
  const linkRes  = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: json.path_display }),
  })
  const linkJson = await linkRes.json() as { url?: string; error_summary?: string }
  return linkJson.url ?? `dropbox://${json.path_display}`
}

// ─── S3 / R2 / B2 ────────────────────────────────────────────────────────────
// Signs with AWS Signature V4 using Node's built-in crypto (no SDK needed).

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function hex(b: Buffer): string {
  return b.toString('hex')
}

async function uploadToS3({ slackUrl, fileName, mimeType, clientName }: UploadInput): Promise<string> {
  const accessKey = process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY
  const bucket    = process.env.AWS_S3_BUCKET
  const region    = process.env.AWS_REGION ?? 'us-east-1'
  const endpoint  = process.env.AWS_S3_ENDPOINT  // optional override for R2/B2

  if (!accessKey) throw new Error('AWS_ACCESS_KEY_ID not set')
  if (!secretKey) throw new Error('AWS_SECRET_ACCESS_KEY not set')
  if (!bucket)    throw new Error('AWS_S3_BUCKET not set')

  const fileBuffer = await downloadFromSlack(slackUrl)
  const objectKey  = `${clientName}/${fileName}`

  // Build host + URL
  const host = endpoint
    ? new URL(endpoint).host + '/' + bucket
    : `${bucket}.s3.${region}.amazonaws.com`
  const url  = endpoint
    ? `${endpoint.replace(/\/$/, '')}/${bucket}/${objectKey}`
    : `https://${host}/${objectKey}`

  // AWS Signature V4
  const now     = new Date()
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 8)    // YYYYMMDD
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '') // exact ISO for header

  const { createHash } = await import('crypto')
  const bodyHash = createHash('sha256').update(fileBuffer).digest('hex')

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders    = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'PUT',
    `/${objectKey}`,
    '',
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n')

  const credentialScope = `${dateStr}/${region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretKey}`, dateStr), region), 's3'),
    'aws4_request'
  )
  const signature = hex(hmac(signingKey, stringToSign))

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ')

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Host:                    host,
      'Content-Type':          mimeType,
      'Content-Length':        String(fileBuffer.byteLength),
      'x-amz-date':            amzDate,
      'x-amz-content-sha256': bodyHash,
      Authorization:           authorization,
    },
    body: new Uint8Array(fileBuffer),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`S3 upload failed (${res.status}): ${text}`)
  }

  // Return the object URL (bucket must be public, or use a pre-signed URL for private)
  return endpoint
    ? `${endpoint.replace(/\/$/, '')}/${bucket}/${objectKey}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`
}
