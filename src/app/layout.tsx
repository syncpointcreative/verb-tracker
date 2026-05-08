import type { Metadata } from 'next'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import Link from 'next/link'
import { Suspense } from 'react'
import Sidebar from '@/components/Sidebar'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
})

export const metadata: Metadata = {
  title: 'VERB — Content Tracker',
  description: 'TikTok content asset tracker for SyncPoint Creative',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VERB',
  },
  themeColor: '#2B3428',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.variable} ${cormorant.variable} font-sans bg-[#F2EDE7] min-h-screen`}>
        <div className="flex min-h-screen">

          {/* ── Desktop sidebar (md+) ── */}
          <aside className="hidden md:block flex-shrink-0">
            <Suspense fallback={
              <div className="w-56 bg-[#2B3428] h-screen flex items-start px-5 py-5">
                <span className="font-serif text-[#F5F1EB] text-xl tracking-[0.25em] font-light">VERB</span>
              </div>
            }>
              <Sidebar />
            </Suspense>
          </aside>

          {/* ── Main area ── */}
          <div className="flex-1 min-w-0 flex flex-col">

            {/* Mobile top nav */}
            <header className="md:hidden bg-[#2B3428] sticky top-0 z-50">
              <div className="flex items-center justify-between h-14 px-4">
                <Link href="/" className="font-serif text-[#F5F1EB] text-xl tracking-[0.25em] font-light">
                  VERB
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
                      className="px-2.5 py-1.5 text-xs text-[#A8A09A] hover:text-[#F5F1EB] transition-colors"
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
      </body>
    </html>
  )
}
