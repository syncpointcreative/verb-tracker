/**
 * GET /api/admin/drive-meta?ids=<fileId1,fileId2,...>
 *
 * READ-ONLY. Returns each Drive file's size/name/mimeType/trashed flag.
 * Used to detect truncated/broken uploads (a cut-off upload leaves a file
 * far smaller than expected). Gated by the shared-password middleware
 * (x-api-key for automation). Touches nothing — Drive files.get only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getGoogleToken } from '@/lib/storage'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids')
  if (!idsParam) return NextResponse.json({ error: 'Missing ?ids=' }, { status: 400 })
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200)

  let token: string
  try {
    token = await getGoogleToken()
  } catch (e) {
    return NextResponse.json({ error: `token: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  const files: Record<string, unknown> = {}
  for (const id of ids) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,size,mimeType,trashed&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const j = await r.json() as { size?: string; name?: string; mimeType?: string; trashed?: boolean; error?: { message?: string } }
      files[id] = r.ok
        ? { size: j.size ?? null, name: j.name ?? null, mimeType: j.mimeType ?? null, trashed: j.trashed ?? null }
        : { error: j.error?.message ?? `HTTP ${r.status}` }
    } catch (e) {
      files[id] = { error: e instanceof Error ? e.message : String(e) }
    }
  }
  return NextResponse.json({ files })
}
