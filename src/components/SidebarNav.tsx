'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { Client } from '@/lib/supabase'

export type ClientHealth = 'red' | 'amber' | 'green' | 'gray'

const DOT: Record<ClientHealth, string> = {
  red:   'bg-red-400',
  amber: 'bg-amber-400',
  green: 'bg-emerald-400',
  gray:  'bg-stone-600',
}

const NAV = [
  { href: '/',            label: 'Dashboard'  },
  { href: '/matrix',      label: 'Coverage'   },
  { href: '/how-to-use',  label: 'How to Use' },
  { href: '/admin',       label: 'Admin'      },
]

interface Props {
  clients: Client[]
  healthByClient: Record<string, ClientHealth>
}

export default function SidebarNav({ clients, healthByClient }: Props) {
  const pathname = usePathname()

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
      active
        ? 'bg-white/10 text-[#f0d7c0]'
        : 'text-[#A8A09A] hover:text-[#f0d7c0] hover:bg-white/5'
    }`

  return (
    <div className="w-56 bg-[#3b2b52] flex flex-col h-screen sticky top-0 overflow-y-auto">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10 flex-shrink-0">
        <Link href="/" className="block bg-[#f0d7c0] rounded-lg px-3 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Eleven_Signal_FinalLOGO.png" alt="Eleven Signal" className="w-full h-auto" />
        </Link>
      </div>

      {/* Nav links */}
      <nav className="px-3 py-3 border-b border-white/10 flex-shrink-0">
        {NAV.map(({ href, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link key={href} href={href} className={linkCls(isActive)}>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Client list */}
      <div className="px-3 py-4 flex-1 overflow-y-auto">
        <p className="text-[10px] tracking-[0.18em] text-[#d4865e] uppercase font-medium px-3 mb-3">
          Clients
        </p>
        {clients.map(client => {
          const slug = `/${client.slug}`
          const isActive = pathname === slug || pathname.startsWith(slug + '/')
          const health = healthByClient[client.id] ?? 'gray'
          return (
            <Link key={client.id} href={slug} className={linkCls(isActive)}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[health]}`} />
              <span className="truncate">{client.name}</span>
            </Link>
          )
        })}
      </div>

      {/* Drive link */}
      <div className="px-5 py-4 border-t border-white/10 flex-shrink-0">
        <a
          href="https://drive.google.com/drive/folders/1Kk6ZubDH3Jfw1TIVXkRj5w7ohn92M3Zm?usp=sharing"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[#d4865e] hover:text-[#e0a07d] tracking-[0.12em] uppercase flex items-center gap-1.5 transition-colors"
        >
          Drive
          <svg className="w-3 h-3 opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.5 9.5l7-7M9.5 2.5H4M9.5 2.5V8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  )
}
