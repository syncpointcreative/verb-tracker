/**
 * GET /api/admin/drive-ensure-folder?client=FlavCity&month=October 2026&sub=MAIN ACCOUNT
 *
 * One-off provisioning helper: find-or-creates {root}/{client}/{month}/{sub}
 * in Google Drive ahead of any asset actually landing there (e.g. setting up
 * FlavCity's MAIN ACCOUNT / MEME ACCOUNT split before the first REG/MEME
 * asset comes through the normal pipeline).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGoogleToken, ensureGoogleSubfolder } from '@/lib/storage'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const client = req.nextUrl.searchParams.get('client')?.trim()
  const month  = req.nextUrl.searchParams.get('month')?.trim()
  const sub    = req.nextUrl.searchParams.get('sub')?.trim()
  if (!client || !month) {
    return NextResponse.json({ ok: false, error: 'Missing ?client= or ?month=' }, { status: 400 })
  }

  try {
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (!rootFolderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not set')

    const token        = await getGoogleToken()
    const clientFolder = await ensureGoogleSubfolder(token, rootFolderId, client)
    const monthFolder  = await ensureGoogleSubfolder(token, clientFolder, month)
    const subFolderId  = sub ? await ensureGoogleSubfolder(token, monthFolder, sub) : null

    return NextResponse.json({ ok: true, clientFolder, monthFolder, subFolder: subFolderId })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
