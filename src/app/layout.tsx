import type { Metadata } from 'next'
import { Inter, Cormorant_Garamond } from 'next/font/google'
import Link from 'next/link'
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

        {/* Top nav */}
        <header className="bg-[#2B3428] sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">

            {/* Left: logo + nav */}
            <div className="flex items-center gap-8">
              <Link href="/" className="font-serif text-[#F5F1EB] text-xl tracking-[0.25em] font-light">
                VERB
              </Link>
              <nav className="hidden sm:flex items-center gap-0.5">
                {[
                  { href: '/',          label: 'Dashboard'  },
                  { href: '/matrix',    label: 'Coverage'   },
                  { href: '/how-to-use',label: 'How to Use' },
                  { href: '/admin',     label: 'Admin'      },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="px-3 py-1.5 text-sm text-[#A8A09A] hover:text-[#F5F1EB] transition-colors tracking-wide rounded"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Right: Drive link */}
            <a
              href="https://drive.google.com/drive/folders/1Kk6ZubDH3Jfw1TIVXkRj5w7ohn92M3Zm?usp=sharing"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#C4A263] hover:text-[#D4B373] tracking-[0.12em] uppercase flex items-center gap-1.5 transition-colors"
            >
              Drive
              <svg className="w-3 h-3 opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 9.5l7-7M9.5 2.5H4M9.5 2.5V8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
