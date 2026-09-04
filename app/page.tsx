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
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Pretty Much Picks"
                width={48}
                height={48}
                className="rounded-xl w-10 h-10 shrink-0"
              />
              <span className="text-pmp-white font-bold text-sm tracking-wide">PrettyMuchPicks</span>
            </div>
            <span className="text-pmp-gray-700">×</span>
            <div className="flex items-center gap-2">
              <Image
                src="/oracle-logo.jpeg"
                alt="Oracle Challenge"
                width={48}
                height={48}
                className="w-10 h-10 shrink-0 object-contain"
              />
              <span className="text-pmp-white font-bold text-sm tracking-wide">The Oracle Challenge</span>
            </div>
          </div>

          <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em]">
            2026 Oracle Challenge
          </p>

          <div className="flex flex-col gap-3">
            <h1 className="font-display font-black text-4xl sm:text-5xl text-pmp-white leading-[1.1]">
              Top 10 QBs.<br />Top 10 RBs.<br />Top 10 WRs.<br />Top 10 TEs.<br />
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
