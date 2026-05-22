/**
 * migrate-slack-to-drive.mjs
 *
 * One-time migration: downloads all assets ingested from the OLD Slack workspace
 * (April 9, 2026 onwards) and uploads them to Google Drive as publicly readable files.
 * Updates assets.slack_file_url to the permanent Drive direct-download URL so the
 * app's preview route continues to work after the old Slack bot token is retired.
 *
 * Usage:
 *   OLD_SLACK_BOT_TOKEN=xoxb-old-... \
 *   SUPABASE_URL=https://... \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
 *   GOOGLE_DRIVE_FOLDER_ID=1Kk6Zu... \
 *   node scripts/migrate-slack-to-drive.mjs
 *
 * Optional:
 *   DRY_RUN=1   — list assets without uploading or updating the DB
 *   START_DATE=2026-04-09  — override the cutoff date (default 2026-04-09)
 */

import { createSign, createHmac } from 'crypto'

// ─── Config ──────────────────────────────────────────────────────────────────

const OLD_TOKEN    = process.env.OLD_SLACK_BOT_TOKEN
const SUPA_URL     = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const SA_JSON      = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
const FOLDER_ID    = process.env.GOOGLE_DRIVE_FOLDER_ID
const DRY_RUN      = process.env.DRY_RUN === '1'
const START_DATE   = process.env.START_DATE ?? '2026-04-09'

function assertEnv() {
  const missing = []
  if (!OLD_TOKEN)  missing.push('OLD_SLACK_BOT_TOKEN')
  if (!SUPA_URL)   missing.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL')
  if (!SUPA_KEY)   missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!SA_JSON)    missing.push('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!FOLDER_ID)  missing.push('GOOGLE_DRIVE_FOLDER_ID')
  if (missing.length) {
    console.error('❌ Missing env vars:', missing.join(', '))
    process.exit(1)
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer ?? 'return=representation',
      ...options.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function getAffectedAssets() {
  // Only fetch assets whose slack_file_url still points to Slack (not already migrated to Drive)
  const params = new URLSearchParams({
    select: 'id,file_name,slack_file_url,slack_mimetype,client_id',
    'slack_file_url': 'not.is.null',
    'slack_file_url': 'like.*files.slack.com*',
    date_added: `gte.${START_DATE}`,
    order: 'date_added.asc',
  })
  // URLSearchParams deduplicates keys — use raw string for dual filter
  const qs = `select=id,file_name,slack_file_url,slack_mimetype,client_id&slack_file_url=like.*files.slack.com*&date_added=gte.${START_DATE}&order=date_added.asc`
  return supabaseQuery(`/assets?${qs}`)
}

async function getClientName(clientId) {
  const rows = await supabaseQuery(`/clients?id=eq.${clientId}&select=name`)
  return rows?.[0]?.name ?? 'Unknown'
}

async function updateAssetUrl(assetId, driveUrl) {
  return supabaseQuery(`/assets?id=eq.${assetId}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: JSON.stringify({ slack_file_url: driveUrl }),
  })
}

// ─── Google Drive helpers ─────────────────────────────────────────────────────

function b64url(input) {
  const b = typeof input === 'string' ? Buffer.from(input) : input
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getGoogleToken() {
  const sa = JSON.parse(SA_JSON)
  const now    = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim  = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }))

  const toSign = `${header}.${claim}`
  const signer = createSign('RSA-SHA256')
  signer.update(toSign)
  const sig = b64url(signer.sign(sa.private_key.replace(/\\n/g, '\n')))
  const jwt = `${toSign}.${sig}`

  const res  = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Google token exchange failed: ${JSON.stringify(json)}`)
  return json.access_token
}

async function ensureSubfolder(token, parentId, name) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  )
  const listRes  = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const listJson = await listRes.json()
  if (listJson.files?.length) return listJson.files[0].id

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  const created = await createRes.json()
  if (!created.id) throw new Error(`Google: failed to create folder "${name}": ${JSON.stringify(created)}`)
  return created.id
}

async function makeFilePublic(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to make file public: ${res.status} ${text}`)
  }
}

async function uploadToDrive(token, fileBuffer, fileName, mimeType, clientName) {
  const clientFolder = await ensureSubfolder(token, FOLDER_ID, clientName)

  const boundary = '-------elevenSignalMigration'
  const metadata = JSON.stringify({ name: fileName, parents: [clientFolder] })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const res  = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.byteLength),
      },
      body,
    }
  )
  const json = await res.json()
  if (!json.id) throw new Error(`Google upload failed: ${JSON.stringify(json)}`)

  // Make the file publicly readable so the preview route can fetch it without auth
  await makeFilePublic(token, json.id)

  // Return a direct download URL — works for publicly shared files
  return `https://drive.google.com/uc?export=download&id=${json.id}`
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  assertEnv()

  if (DRY_RUN) console.log('🔍 DRY RUN — no uploads or DB updates will happen\n')

  console.log(`📋 Fetching assets with slack_file_url since ${START_DATE}...`)
  const assets = await getAffectedAssets()
  console.log(`   Found ${assets.length} asset(s)\n`)

  if (!assets.length) {
    console.log('Nothing to migrate.')
    return
  }

  // Print summary table
  console.log('Assets to migrate:')
  for (const a of assets) {
    console.log(`  ${a.file_name} (${a.id.slice(0, 8)}...)`)
  }
  console.log()

  if (DRY_RUN) {
    console.log('✅ Dry run complete — rerun without DRY_RUN=1 to perform the migration.')
    return
  }

  // Get a Google token (lasts 1 hour — enough for 21 files)
  console.log('🔑 Obtaining Google service-account token...')
  const gToken = await getGoogleToken()
  console.log('   ✅ Token obtained\n')

  // Build a cache of clientId → clientName to avoid repeated lookups
  const clientNameCache = new Map()

  let succeeded = 0
  let failed    = 0

  for (const asset of assets) {
    process.stdout.write(`⬇️  ${asset.file_name} ... `)

    try {
      // 1. Download from old Slack workspace
      const dlRes = await fetch(asset.slack_file_url, {
        headers: { Authorization: `Bearer ${OLD_TOKEN}` },
      })
      if (!dlRes.ok) throw new Error(`Slack download: ${dlRes.status} ${dlRes.statusText}`)
      const fileBuffer = Buffer.from(await dlRes.arrayBuffer())

      // 2. Look up client name for subfolder
      if (!clientNameCache.has(asset.client_id)) {
        clientNameCache.set(asset.client_id, await getClientName(asset.client_id))
      }
      const clientName = clientNameCache.get(asset.client_id)

      // 3. Upload to Google Drive (public)
      const mimeType = asset.slack_mimetype ?? 'video/mp4'
      const driveUrl = await uploadToDrive(gToken, fileBuffer, asset.file_name, mimeType, clientName)

      // 4. Update assets.slack_file_url in Supabase
      await updateAssetUrl(asset.id, driveUrl)

      process.stdout.write(`✅ ${driveUrl}\n`)
      succeeded++

      // Small delay to avoid hammering Drive API
      await new Promise(r => setTimeout(r, 500))

    } catch (err) {
      process.stdout.write(`❌ ${err.message}\n`)
      failed++
    }
  }

  console.log(`\n🎉 Done — ${succeeded} migrated, ${failed} failed`)
  if (failed > 0) {
    console.log('Re-run the script to retry failed files — it skips already-migrated assets automatically.')
    console.log('(Migrated assets have drive.google.com URLs; only slack.com URLs will be attempted.)')
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
