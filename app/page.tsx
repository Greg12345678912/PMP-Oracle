import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Fantasy Football Tier List Builder | Pretty Much Picks',
  description:
    'Build, download, and share your fantasy football tier list in under two minutes. No signup required.',
}

const POSITIONS = [
  { label: 'QB', href: '/qb-tier-list', description: 'Quarterbacks' },
  { label: 'RB', href: '/rb-tier-list', description: 'Running Backs' },
  { label: 'WR', href: '/wr-tier-list', description: 'Wide Receivers' },
  { label: 'TE', href: '/te-tier-list', description: 'Tight Ends' },
  { label: 'FLEX', href: '/flex-tier-list', description: 'Flex' },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-pmp-black">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-16">

        {/* Brand */}
        <div className="mb-8 sm:mb-16">
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
            <Image
              src="/logo.png"
              alt="Pretty Much Picks"
              width={80}
              height={80}
              className="rounded-xl w-14 h-14 sm:w-20 sm:h-20 shrink-0"
            />
            <div>
              <div className="text-pmp-red text-xs font-bold uppercase tracking-widest mb-1">
                Pretty Much Picks
              </div>
              <h1 className="font-display text-3xl sm:text-5xl font-black text-pmp-white leading-tight">
                Fantasy Football<br />Tier List Builder
              </h1>
            </div>
          </div>
          <p className="text-pmp-gray-500 text-base sm:text-lg">
            Build. Download. Share.{' '}
            <span className="text-pmp-white">No signup required.</span>
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-pmp-gray-800 mb-8 sm:mb-12" />

        {/* Position selector */}
        <section className="mb-8 sm:mb-16">
          <h2 className="text-pmp-gray-500 text-sm uppercase tracking-widest mb-4 sm:mb-6">
            Build a Tier List
          </h2>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {POSITIONS.map((pos) => (
              <Link key={pos.label} href={pos.href}>
                <div className="flex flex-col items-center gap-1 sm:gap-2 p-2 sm:p-4 rounded-xl bg-pmp-gray-900 border border-pmp-gray-800 hover:border-pmp-red hover:bg-pmp-gray-800 transition-all duration-200 cursor-pointer group">
                  <span className="font-display font-bold text-sm sm:text-xl text-pmp-white group-hover:text-pmp-red transition-colors duration-200">
                    {pos.label}
                  </span>
                  <span className="text-[10px] text-pmp-gray-600 text-center leading-tight hidden sm:block">
                    {pos.description}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Official Rankings */}
        <section className="mb-8 sm:mb-16">
          <h2 className="text-pmp-gray-500 text-sm uppercase tracking-widest mb-4 sm:mb-6">
            Official PMP Rankings (PPR)
          </h2>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
            {POSITIONS.map((pos) => (
              <Link key={pos.label} href={`${pos.href}?loadOfficial=true`}>
                <div className="flex items-center justify-center p-3 rounded-xl bg-pmp-gray-900 border border-pmp-gray-800 hover:border-pmp-gray-600 transition-all duration-200 cursor-pointer">
                  <span className="font-display font-bold text-sm text-pmp-white">
                    {pos.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Divider */}
        <div className="h-px bg-pmp-gray-800 mb-8 sm:mb-12" />

        {/* Tools */}
        <section className="mb-8 sm:mb-16">
          <h2 className="text-pmp-gray-500 text-sm uppercase tracking-widest mb-4 sm:mb-6">
            Tools
          </h2>
          <div className="flex flex-col gap-3 w-full">
            <Link
              href="/challenge"
              className="group flex items-center gap-4 px-5 py-4 rounded-xl bg-pmp-gray-900 border border-pmp-red transition-all duration-200 hover:bg-pmp-gray-800"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-pmp-white font-semibold text-sm group-hover:text-pmp-red transition-colors">
                    Oracle Challenge
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-pmp-red bg-pmp-red/10 px-2 py-0.5 rounded-full">
                    New
                  </span>
                </div>
                <p className="text-pmp-gray-600 text-xs">Rank your top players. Lock in before Sep 9. Win bragging rights.</p>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-pmp-red shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <div className="flex gap-2 flex-wrap justify-center">
              {['Mock Draft', 'Weekly Rankings', 'Trade Analyzer'].map(label => (
                <span key={label} className="text-pmp-gray-700 text-xs px-3 py-1 rounded-full border border-pmp-gray-800">
                  {label} — coming soon
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-pmp-gray-800 pt-6 sm:pt-8 flex justify-between items-center">
          <span className="text-pmp-red font-bold text-sm">Pretty Much Picks</span>
          <div className="flex gap-3 sm:gap-4 text-pmp-gray-600 text-sm">
            <a href="https://www.instagram.com/prettymuchpickss" target="_blank" rel="noopener noreferrer" className="hover:text-pmp-white transition-colors">Instagram</a>
            <a href="https://www.tiktok.com/@prettymuchpickss" target="_blank" rel="noopener noreferrer" className="hover:text-pmp-white transition-colors">TikTok</a>
            <a href="https://www.youtube.com/@prettymuchpicks" target="_blank" rel="noopener noreferrer" className="hover:text-pmp-white transition-colors">YouTube</a>
          </div>
        </footer>
      </div>
    </main>
  )
}
