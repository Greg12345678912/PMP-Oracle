import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Pretty Much Picks',
  description: 'PMP Fantasy Platform — Oracle Challenge, Tier Builder, and more by Pretty Much Picks.',
}

const SOCIAL_LINKS = [
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@prettymuchpicks',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
    color: '#FF0000',
    hoverBorder: 'hover:border-[#FF0000]',
    hoverText: 'group-hover:text-[#FF0000]',
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/prettymuchpickss',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
      </svg>
    ),
    color: '#E1306C',
    hoverBorder: 'hover:border-[#E1306C]',
    hoverText: 'group-hover:text-[#E1306C]',
  },
  {
    name: 'TikTok',
    href: 'https://www.tiktok.com/@prettymuchpickss',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
    color: '#ffffff',
    hoverBorder: 'hover:border-white',
    hoverText: 'group-hover:text-white',
  },
]

export default function LinksPage() {
  return (
    <main className="min-h-screen bg-pmp-black flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-xs flex flex-col items-center gap-8">

        {/* Logo + Brand */}
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo.png"
            alt="Pretty Much Picks"
            width={120}
            height={120}
            className="rounded-2xl"
            priority
          />
          <div className="text-center">
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">
              Pretty Much Picks
            </p>
            <p className="text-pmp-gray-500 text-sm mt-0.5">PMP Fantasy Football Platform</p>
          </div>
        </div>

        {/* Social Links */}
        <div className="w-full flex flex-col gap-3">
          {SOCIAL_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`group flex items-center gap-4 px-5 py-4 rounded-xl bg-pmp-gray-900 border border-pmp-gray-800 ${link.hoverBorder} transition-all duration-200`}
            >
              <span className={`text-pmp-gray-500 transition-colors duration-200 ${link.hoverText}`}>
                {link.icon}
              </span>
              <span className="flex-1 text-pmp-white font-semibold text-sm tracking-wide">
                {link.name}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-pmp-gray-700 group-hover:text-pmp-gray-500 transition-colors">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          ))}
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-pmp-gray-800" />

        {/* Tier List Builder featured card */}
        <Link href="/" className="w-full group">
          <div className="flex items-center gap-4 px-5 py-4 rounded-xl bg-pmp-gray-900 border border-pmp-gray-800 hover:border-pmp-red transition-all duration-200">
            <Image
              src="/logo-tier.png"
              alt="PMP Fantasy Platform"
              width={44}
              height={44}
              className="rounded-lg shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-pmp-white font-semibold text-sm group-hover:text-pmp-red transition-colors duration-200">
                PMP Fantasy Football Platform
              </p>
              <p className="text-pmp-gray-600 text-xs mt-0.5">
                Build &amp; share your fantasy rankings
              </p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-pmp-gray-700 group-hover:text-pmp-red transition-colors shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

      </div>
    </main>
  )
}
