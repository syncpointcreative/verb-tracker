/**
 * GET /api/admin/drive-move-file?client=FlavCity&to=November 2026&sub=MAIN ACCOUNT&ids=<fileId1,fileId2>
 * GET /api/admin/drive-move-file?client=FlavCity&from=October 2026&to=November 2026&sub=MAIN ACCOUNT&name=SonnyAngels,ThanksgivingParade
 *
 * One-off manual-rollover helper: moves already-uploaded file(s) to a
 * different month folder within a client's Drive tree (e.g. late-month
 * content that counts toward next month's quota — see storage.ts's
 * overrideMonthFolder for the automatic version of this at upload time).
 *
 * Two lookup modes:
 *   - `ids`: exact Drive file IDs — current parents are read directly from
 *     each file, sidestepping any ambiguity from duplicate folder names.
 *   - `name` + `from` (+ `sub`): comma-separated case-insensitive substrings
 *     matched against filenames directly inside {client}/{from}/{sub?}.
 * Either way, matches move to {client}/{to}/{sub?} (created if missing).
 * Read-only on no match — never creates or deletes files.
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
  const client    = req.nextUrl.searchParams.get('client')?.trim()
  const from      = req.nextUrl.searchParams.get('from')?.trim()
  const to        = req.nextUrl.searchParams.get('to')?.trim()
  const sub       = req.nextUrl.searchParams.get('sub')?.trim()
  const nameParam = req.nextUrl.searchParams.get('name')?.trim()
  const idsParam  = req.nextUrl.searchParams.get('ids')?.trim()
  if (!client || !to || (!nameParam && !idsParam) || (nameParam && !from)) {
    return NextResponse.json({ ok: false, error: 'Missing ?client=, ?to=, and either ?ids= or (?from= + ?name=)' }, { status: 400 })
  }

  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set')

    const token        = await getGoogleToken()
    const clientFolder = await findFolder(token, rootFolderId, client)
    if (!clientFolder) return NextResponse.json({ ok: false, error: `Client folder "${client}" not found` }, { status: 404 })

    let matched: Array<{ id: string; name: string; parents: string[] }> = []
    let unmatched: string[] = []

    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
      for (const id of ids) {
        const r = await fetch(
          `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,parents,trashed&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const j = await r.json() as { id?: string; name?: string; parents?: string[]; trashed?: boolean }
        if (j.id && !j.trashed) matched.push({ id: j.id, name: j.name ?? id, parents: j.parents ?? [] })
        else unmatched.push(id)
      }
    } else {
      const needles  = nameParam!.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      const fromMonth = await findFolder(token, clientFolder, from!)
      if (!fromMonth) return NextResponse.json({ ok: false, error: `Source month folder "${from}" not found` }, { status: 404 })
      const fromFolder = sub ? await findFolder(token, fromMonth, sub) : fromMonth
      if (!fromFolder) return NextResponse.json({ ok: false, error: `Source sub-folder "${sub}" not found` }, { status: 404 })

      const files = await listFiles(token, fromFolder)
      for (const needle of needles) {
        const hit = files.find(f => f.name.toLowerCase().includes(needle))
        if (hit) matched.push({ ...hit, parents: [fromFolder] })
        else unmatched.push(needle)
      }
      if (matched.length === 0) {
        return NextResponse.json({ ok: true, moved: [], unmatched, available: files.map(f => f.name) })
      }
    }

    if (matched.length === 0) {
      return NextResponse.json({ ok: true, moved: [], unmatched })
    }

    const toMonth  = await ensureGoogleSubfolder(token, clientFolder, to)
    const toFolder = sub ? await ensureGoogleSubfolder(token, toMonth, sub) : toMonth

    const moved: Array<{ name: string; id: string; fromParents: string[] }> = []
    for (const file of matched) {
      const removeParents = file.parents.filter(p => p !== toFolder).join(',')
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${toFolder}&removeParents=${removeParents}&fields=id&supportsAllDrives=true`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' }
      )
      const json = await res.json() as { id?: string; error?: unknown }
      if (!json.id) throw new Error(`Move failed for "${file.name}": ${JSON.stringify(json)}`)
      moved.push({ name: file.name, id: file.id, fromParents: file.parents })
    }

    return NextResponse.json({ ok: true, moved, unmatched })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
