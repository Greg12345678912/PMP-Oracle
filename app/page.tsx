import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pretty Much Picks',
  description:
    'Pretty Much Picks is a fantasy football prediction platform. Sign in with Google to rank NFL players before Week 1 and compete in the Oracle Challenge. The best ranker wins $500.',
}

const POSITIONS = [
  { label: 'QB', href: '/qb-tier-list', description: 'Quarterbacks' },
  { label: 'RB', href: '/rb-tier-list', description: 'Running Backs' },
  { label: 'WR', href: '/wr-tier-list', description: 'Wide Receivers' },
  { label: 'TE', href: '/te-tier-list', description: 'Tight Ends' },
  { label: 'FLEX', href: '/flex-tier-list', description: 'Flex' },
]

export default async function HomePage() {
  // Live entry count for social proof
  const season = await getCurrentSeason()
  let entryCount = 0
  if (season) {
    const db = getServiceClient()
    const { data } = await db
      .from('challenge_rankings')
      .select('user_id')
      .eq('season_id', season.id)
      .eq('is_submitted', true)
    entryCount = new Set((data ?? []).map((r: { user_id: string }) => r.user_id)).size
  }

  return (
    <main className="min-h-screen bg-pmp-black">
      <div className="max-w-2xl mx-auto px-4">

        {/* ── Oracle Hero ──────────────────────────────────────────────── */}
        <section className="pt-10 pb-8 sm:pt-16 sm:pb-12 flex flex-col gap-6">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em]">
            2026 Oracle Challenge
          </p>

          <div className="flex flex-col gap-3">
            <h1 className="font-display font-black text-4xl sm:text-5xl text-pmp-white leading-[1.1]">
              Rank every<br />NFL player.<br />
              <span className="text-pmp-red">Win $500.</span>
            </h1>
            <p className="text-pmp-gray-400 text-base leading-snug max-w-sm">
              Lock in your predictions before Week 1. We score every pick after the season. Best ranker wins.
            </p>
          </div>

          {/* Flow */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-pmp-gray-400">Rank Players</span>
            <span className="text-pmp-gray-700">→</span>
            <span className="text-pmp-gray-400">Lock Sep 9</span>
            <span className="text-pmp-gray-700">→</span>
            <span className="text-pmp-gray-400">Scored All Season</span>
            <span className="text-pmp-gray-700">→</span>
            <span className="text-pmp-white font-bold">$500 Winner</span>
          </div>

          {/* Social proof */}
          {entryCount > 0 ? (
            <p className="text-pmp-gray-500 text-sm">
              <span className="text-pmp-white font-bold">{entryCount.toLocaleString()}</span>
              {' '}competitor{entryCount === 1 ? '' : 's'} already entered
            </p>
          ) : (
            <p className="text-pmp-gray-600 text-sm">Be Entry #1 · Free to enter</p>
          )}

          <Link
            href="/challenge"
            className="inline-flex items-center justify-center bg-pmp-red text-pmp-white font-bold py-4 px-8 rounded-xl text-base hover:opacity-90 transition-opacity active:scale-[0.98] w-full sm:w-auto sm:self-start"
          >
            Enter for Free →
          </Link>

          <p className="text-pmp-gray-700 text-xs">
            PPR · Top 10 QB · Top 10 RB · Top 10 WR · Top 10 TE · One entry per season
          </p>
        </section>

        <div className="h-px bg-pmp-gray-800" />

        {/* ── Brand ────────────────────────────────────────────────────── */}
        <div className="py-8 sm:py-12">
          <div className="flex items-center gap-3 sm:gap-4 mb-8 sm:mb-12">
            <Image
              src="/logo.png"
              alt="Pretty Much Picks"
              width={64}
              height={64}
              className="rounded-xl w-12 h-12 sm:w-16 sm:h-16 shrink-0"
            />
            <div>
              <div className="text-pmp-red text-[10px] font-bold uppercase tracking-widest mb-0.5">
                Pretty Much Picks
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-black text-pmp-white leading-tight">
                PMP Fantasy Platform
              </h2>
            </div>
          </div>

          {/* Position selector */}
          <section className="mb-8 sm:mb-12">
            <h3 className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-4">
              Build a Tier List
            </h3>
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
          <section className="mb-8 sm:mb-12">
            <h3 className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-4">
              Official PMP Rankings (PPR)
            </h3>
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

          {/* Coming soon */}
          <div className="flex gap-2 flex-wrap">
            {['Mock Draft', 'Weekly Rankings', 'Trade Analyzer'].map(label => (
              <span key={label} className="text-pmp-gray-700 text-xs px-3 py-1 rounded-full border border-pmp-gray-800">
                {label} — coming soon
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-pmp-gray-800 py-6 sm:py-8 flex justify-between items-center">
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
