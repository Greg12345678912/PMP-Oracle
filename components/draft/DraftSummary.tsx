'use client'
import type { DraftAnalytics, DraftSettings } from '@/lib/draft/types'

interface DraftSummaryProps {
  analytics: DraftAnalytics
  settings: DraftSettings
  onPlayAgain: () => void
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export function DraftSummary({ analytics, settings, onPlayAgain }: DraftSummaryProps) {
  const positions = POSITION_ORDER.filter(p => analytics.positionBreakdown[p])

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col items-center justify-start px-4 py-8 gap-6">
      <div className="text-center">
        <h1 className="text-pmp-white text-2xl font-bold">Draft Complete</h1>
        <p className="text-pmp-gray-500 text-sm mt-1">
          {settings.numTeams} teams · {settings.numRounds} rounds · {settings.scoring.toUpperCase()}
        </p>
      </div>

      {/* Positional Breakdown */}
      <div className="w-full max-w-sm bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
        <h2 className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-3">My Roster</h2>
        <div className="grid grid-cols-3 gap-2">
          {positions.map(pos => (
            <div key={pos} className="text-center">
              <p className="text-pmp-red text-lg font-bold">{analytics.positionBreakdown[pos]}</p>
              <p className="text-pmp-gray-500 text-xs">{pos}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
          <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Avg ADP Reached</p>
          <p className="text-pmp-white text-xl font-bold mt-1">
            {analytics.averageADPReached.toFixed(1)}
          </p>
        </div>

        {analytics.earliestReach && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
            <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Earliest Reach</p>
            <p className="text-pmp-white font-semibold mt-1">
              {analytics.earliestReach.player.firstName} {analytics.earliestReach.player.lastName}
            </p>
            <p className="text-pmp-gray-500 text-xs">
              Picked {analytics.earliestReach.actualPick} · ADP {analytics.earliestReach.expectedADP}
            </p>
          </div>
        )}

        {analytics.biggestValue && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
            <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Biggest Value</p>
            <p className="text-pmp-white font-semibold mt-1">
              {analytics.biggestValue.player.firstName} {analytics.biggestValue.player.lastName}
            </p>
            <p className="text-pmp-gray-500 text-xs">
              Picked {analytics.biggestValue.actualPick} · ADP {analytics.biggestValue.expectedADP}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={onPlayAgain}
        className="w-full max-w-sm bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-base hover:opacity-90 transition-opacity"
      >
        Draft Again
      </button>
    </div>
  )
}
