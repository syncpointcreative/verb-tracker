/**
 * GET /api/admin/drive-move-file?client=FlavCity&from=October 2026&to=November 2026&sub=MAIN ACCOUNT&name=SonnyAngels,ThanksgivingParade,ProteinBalloon
 *
 * One-off manual-rollover helper: moves already-uploaded file(s) from one
 * month folder to another within a client's Drive tree (e.g. late-month
 * content that counts toward next month's quota — see storage.ts's
 * overrideMonthFolder for the automatic version of this at upload time).
 *
 * `name` is a comma-separated list of case-insensitive substrings matched
 * against filenames directly inside {client}/{from}/{sub?}. Every file whose
 * name contains at least one of the substrings is moved to {client}/{to}/{sub?}
 * (created if missing). Read-only on no match — never creates or deletes files.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getGoogleToken, ensureGoogleSubfolder } from '@/lib/storage'

export const maxDuration = 60

async function findFolder(token: string, parentId: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  )
  const res  = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const json = await res.json() as { files?: Array<{ id: string }> }
  return json.files?.[0]?.id ?? null
}

async function listFiles(token: string, parentId: string): Promise<Array<{ id: string; name: string }>> {
  const q = encodeURIComponent(`'${parentId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`)
  const res  = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const json = await res.json() as { files?: Array<{ id: string; name: string }> }
  return json.files ?? []
}

export async function GET(req: NextRequest) {
  const client   = req.nextUrl.searchParams.get('client')?.trim()
  const from     = req.nextUrl.searchParams.get('from')?.trim()
  const to       = req.nextUrl.searchParams.get('to')?.trim()
  const sub      = req.nextUrl.searchParams.get('sub')?.trim()
  const nameParam = req.nextUrl.searchParams.get('name')?.trim()
  if (!client || !from || !to || !nameParam) {
    return NextResponse.json({ ok: false, error: 'Missing ?client=, ?from=, ?to=, or ?name=' }, { status: 400 })
  }
  const needles = nameParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set')

    const token        = await getGoogleToken()
    const clientFolder = await findFolder(token, rootFolderId, client)
    if (!clientFolder) return NextResponse.json({ ok: false, error: `Client folder "${client}" not found` }, { status: 404 })

    const fromMonth = await findFolder(token, clientFolder, from)
    if (!fromMonth) return NextResponse.json({ ok: false, error: `Source month folder "${from}" not found` }, { status: 404 })
    const fromFolder = sub ? await findFolder(token, fromMonth, sub) : fromMonth
    if (!fromFolder) return NextResponse.json({ ok: false, error: `Source sub-folder "${sub}" not found` }, { status: 404 })

    const files = await listFiles(token, fromFolder)

    const matched: Array<{ id: string; name: string; matchedNeedle: string }> = []
    for (const needle of needles) {
      const hit = files.find(f => f.name.toLowerCase().includes(needle))
      if (hit) matched.push({ ...hit, matchedNeedle: needle })
    }
    const unmatched = needles.filter(n => !matched.some(m => m.matchedNeedle === n))

    if (matched.length === 0) {
      return NextResponse.json({ ok: true, moved: [], unmatched, available: files.map(f => f.name) })
    }

    const toMonth  = await ensureGoogleSubfolder(token, clientFolder, to)
    const toFolder = sub ? await ensureGoogleSubfolder(token, toMonth, sub) : toMonth

    const moved: Array<{ name: string; id: string }> = []
    for (const file of matched) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${toFolder}&removeParents=${fromFolder}&fields=id&supportsAllDrives=true`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' }
      )
      const json = await res.json() as { id?: string; error?: unknown }
      if (!json.id) throw new Error(`Move failed for "${file.name}": ${JSON.stringify(json)}`)
      moved.push({ name: file.name, id: file.id })
    }

    return NextResponse.json({ ok: true, moved, unmatched })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
