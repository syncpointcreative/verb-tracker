import type { Metadata } from 'next'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import Link from 'next/link'
import { Suspense } from 'react'
import Sidebar from '@/components/Sidebar'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})

export const metadata: Metadata = {
  title: 'ELEVEN SIGNAL — Content Tracker',
  description: 'TikTok content asset tracker for SyncPoint Creative',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ELEVEN SIGNAL',
  },
  themeColor: '#3b2b52',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  },
}

async function isAuthed(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE)?.value
  return verifySessionToken(token, process.env.AUTH_SECRET || '')
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthed()
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.variable} ${cormorant.variable} font-sans bg-[#f4e7da] min-h-screen`}>
        {!authed ? children : (
        <div className="flex min-h-screen">

          {/* ── Desktop sidebar (md+) ── */}
          <aside className="hidden md:block flex-shrink-0">
            <Suspense fallback={
              <div className="w-56 bg-[#3b2b52] h-screen flex items-start p-4">
                <div className="w-full bg-[#f0d7c0] rounded-lg px-3 py-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/Eleven_Signal_FinalLOGO.png" alt="Eleven Signal" className="w-full h-auto" />
                </div>
              </div>
            }>
              <Sidebar />
            </Suspense>
          </aside>

          {/* ── Main area ── */}
          <div className="flex-1 min-w-0 flex flex-col">

            {/* Mobile top nav */}
            <header className="md:hidden bg-[#3b2b52] sticky top-0 z-50">
              <div className="flex items-center justify-between h-14 px-4">
                <Link href="/" className="flex items-center bg-[#f0d7c0] rounded-md px-2 py-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/Eleven_Signal_FinalLOGO.png" alt="Eleven Signal" className="h-6 w-auto" />
                </Link>
                <nav className="flex items-center gap-1">
                  {[
                    { href: '/',            label: 'Home'     },
                    { href: '/matrix',      label: 'Coverage' },
                    { href: '/how-to-use',  label: 'Guide'    },
                  ].map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className="px-2.5 py-1.5 text-xs text-[#A8A09A] hover:text-[#f0d7c0] transition-colors"
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
            </header>

            {/* Page content */}
            <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </main>
          </div>
        </div>
        )}
      </body>
    </html>
  )
}
