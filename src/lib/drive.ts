/**
 * Google Drive upload utility using a service-account JWT.
 *
 * No external dependencies — signs the JWT with Node's built-in `crypto`
 * and uses raw `fetch` for all API calls.
 *
 * Required env var:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON key downloaded from GCP console
 *   GOOGLE_DRIVE_FOLDER_ID       — root folder ID (e.g. 1Kk6ZubDH3Jfw1TIVXkRj5w7ohn92M3Zm)
 */

import { createSign } from 'crypto'

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const b = typeof input === 'string' ? Buffer.from(input) : input
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')

  const sa: {
    client_email: string
    private_key: string
    token_uri?: string
  } = JSON.parse(raw)

  const now    = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim  = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))

  const toSign  = `${header}.${claim}`
  const signer  = createSign('RSA-SHA256')
  signer.update(toSign)
  const sig     = b64url(signer.sign(sa.private_key.replace(/\\n/g, '\n')))
  const jwt     = `${toSign}.${sig}`

  const tokenRes = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenJson = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenJson.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenJson)}`)
  }
  return tokenJson.access_token
}

// ─── Folder helpers ───────────────────────────────────────────────────────────

/** Find a subfolder by name under parentId, or create it. Returns folder ID. */
async function ensureSubfolder(
  token: string,
  parentId: string,
  name: string
): Promise<string> {
  // Search for existing folder
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  )
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const listJson = await listRes.json() as { files?: Array<{ id: string }> }
  if (listJson.files?.length) return listJson.files[0].id

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  const created = await createRes.json() as { id?: string; error?: unknown }
  if (!created.id) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(created)}`)
  return created.id
}

// ─── Public upload function ───────────────────────────────────────────────────

/**
 * Download a file from Slack (url_private_download) then upload to Drive.
 * Returns the Drive file URL on success.
 */
export async function uploadFileToDrive({
  slackUrl,
  fileName,
  mimeType,
  clientName,
}: {
  slackUrl: string
  fileName: string
  mimeType: string
  clientName: string
}): Promise<string> {
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set')

  // 1. Get Google access token
  const token = await getAccessToken()

  // 2. Download file from Slack (requires the bot token)
  const slackToken = process.env.SLACK_BOT_TOKEN
  if (!slackToken) throw new Error('SLACK_BOT_TOKEN not set')

  const fileRes = await fetch(slackUrl, {
    headers: { Authorization: `Bearer ${slackToken}` },
  })
  if (!fileRes.ok) {
    throw new Error(`Slack file download failed: ${fileRes.status} ${fileRes.statusText}`)
  }
  const fileBuffer = Buffer.from(await fileRes.arrayBuffer())

  // 3. Ensure client subfolder exists under root
  const clientFolderId = await ensureSubfolder(token, rootFolderId, clientName)

  // 4. Upload to Drive via multipart
  const boundary = '-------driveupload'
  const metadata = JSON.stringify({ name: fileName, parents: [clientFolderId] })

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ])

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
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

  const uploaded = await uploadRes.json() as { id?: string; webViewLink?: string; error?: unknown }
  if (!uploaded.id) {
    throw new Error(`Drive upload failed: ${JSON.stringify(uploaded)}`)
  }

  return uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`
}
