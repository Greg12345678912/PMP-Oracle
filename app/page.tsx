import type { Metadata } from 'next'
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

const COMING_SOON = ['Weekly Rankings', 'Mock Drafts', 'Trade Analyzer']

export default function HomePage() {
  return (
    <main className="min-h-screen bg-pmp-black">
      <div className="max-w-2xl mx-auto px-4 py-16">

        {/* Brand */}
        <div className="mb-16">
          <div className="text-pmp-red text-xs font-bold uppercase tracking-widest mb-3">
            Pretty Much Picks
          </div>
          <h1 className="font-display text-5xl font-black text-pmp-white leading-tight mb-4">
            Fantasy Football<br />Tier List Builder
          </h1>
          <p className="text-pmp-gray-500 text-lg">
            Build. Download. Share.{' '}
            <span className="text-pmp-white">No signup required.</span>
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-pmp-gray-800 mb-12" />

        {/* Position selector */}
        <section className="mb-16">
          <h2 className="text-pmp-gray-500 text-sm uppercase tracking-widest mb-6">
            Build a Tier List
          </h2>
          <div className="grid grid-cols-5 gap-3">
            {POSITIONS.map((pos) => (
              <Link key={pos.label} href={pos.href}>
                <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-pmp-gray-900 border border-pmp-gray-800 hover:border-pmp-red hover:bg-pmp-gray-800 transition-all duration-200 cursor-pointer group">
                  <span className="font-display font-bold text-xl text-pmp-white group-hover:text-pmp-red transition-colors duration-200">
                    {pos.label}
                  </span>
                  <span className="text-[10px] text-pmp-gray-600 text-center leading-tight">
                    {pos.description}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Ad slot */}
        <section className="mb-16">
          <div className="rounded-xl border border-pmp-gray-800 bg-pmp-gray-900 p-6 min-h-[120px] flex items-center justify-center">
            <p className="text-pmp-gray-600 text-sm">Latest Episode Coming Soon</p>
          </div>
        </section>

        {/* Official Rankings */}
        <section className="mb-16">
          <h2 className="text-pmp-gray-500 text-sm uppercase tracking-widest mb-6">
            Official PMP Rankings
          </h2>
          <div className="grid grid-cols-5 gap-3">
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
        <div className="h-px bg-pmp-gray-800 mb-12" />

        {/* Coming Soon */}
        <section className="mb-16">
          <h2 className="text-pmp-gray-500 text-sm uppercase tracking-widest mb-6">
            Coming Soon
          </h2>
          <div className="flex flex-wrap gap-3">
            {COMING_SOON.map((item) => (
              <div
                key={item}
                className="px-4 py-2 rounded-lg bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-gray-600 text-sm"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-pmp-gray-800 pt-8 flex justify-between items-center">
          <span className="text-pmp-red font-bold text-sm">Pretty Much Picks</span>
          <div className="flex gap-4 text-pmp-gray-600 text-sm">
            <a href="#" className="hover:text-pmp-white transition-colors">Instagram</a>
            <a href="#" className="hover:text-pmp-white transition-colors">TikTok</a>
            <a href="#" className="hover:text-pmp-white transition-colors">YouTube</a>
            <a href="#" className="hover:text-pmp-white transition-colors">X</a>
          </div>
        </footer>
      </div>
    </main>
  )
}
