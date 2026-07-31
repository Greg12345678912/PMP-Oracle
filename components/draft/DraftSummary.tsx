'use client'
import { useRef } from 'react'
import type { DraftAnalytics, DraftSettings } from '@/lib/draft/types'

interface DraftSummaryProps {
  analytics: DraftAnalytics
  settings: DraftSettings
  onPlayAgain: () => void
  playAgainLabel?: string
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

function gradeColor(letter: string): string {
  if (letter.startsWith('A')) return '#ef4444'
  if (letter.startsWith('B')) return '#f97316'
  if (letter.startsWith('C')) return '#eab308'
  return '#6b7280'
}

export function DraftSummary({ analytics, settings, onPlayAgain, playAgainLabel }: DraftSummaryProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const positions = POSITION_ORDER.filter(p => analytics.positionBreakdown[p])
  const { letter, score } = analytics.grade
  const color = gradeColor(letter)

  const handleDownload = async () => {
    if (!cardRef.current) return
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#111111', scale: 2 })
      const link = document.createElement('a')
      link.download = 'draft-grade.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      // silent — user can screenshot manually
    }
  }

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col items-center justify-start px-4 py-8 gap-6">
      <div className="text-center">
        <h1 className="text-pmp-white text-2xl font-bold">Draft Complete</h1>
        <p className="text-pmp-gray-500 text-sm mt-1">
          {settings.numTeams} teams · {settings.numRounds} rounds · {settings.scoring.toUpperCase()}
        </p>
      </div>

      {/* Shareable card — also the html2canvas capture target */}
      <div
        ref={cardRef}
        className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{ backgroundColor: '#111111', border: '1px solid #1e1e1e' }}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between">
          <span className="text-pmp-red text-xs font-bold uppercase tracking-widest">Pretty Much Picks</span>
          <span className="text-pmp-gray-600 text-xs">{settings.scoring.toUpperCase()} · {settings.numTeams}T</span>
        </div>

        {/* Grade block */}
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 font-black text-4xl text-white"
            style={{ backgroundColor: color }}
          >
            {letter}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Draft Grade</p>
            <p className="text-pmp-white text-sm">
              Avg value: {score > 0 ? '+' : ''}{score.toFixed(1)} picks
            </p>
            <div className="flex gap-2 flex-wrap mt-1">
              {positions.map(pos => (
                <span key={pos} className="text-pmp-gray-500 text-xs">
                  {analytics.positionBreakdown[pos]}{pos}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Value pick */}
        {analytics.biggestValue && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#0d0d0d' }}>
            <span className="text-base">📈</span>
            <div>
              <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest">Best Value</p>
              <p className="text-pmp-white text-sm font-semibold">
                {analytics.biggestValue.player.firstName} {analytics.biggestValue.player.lastName}
              </p>
              <p className="text-pmp-gray-500 text-xs">
                Picked {analytics.biggestValue.actualPick} · ADP {analytics.biggestValue.expectedADP}
              </p>
            </div>
          </div>
        )}

        {/* Reach */}
        {analytics.earliestReach && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#0d0d0d' }}>
            <span className="text-base">⚠️</span>
            <div>
              <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest">Biggest Reach</p>
              <p className="text-pmp-white text-sm font-semibold">
                {analytics.earliestReach.player.firstName} {analytics.earliestReach.player.lastName}
              </p>
              <p className="text-pmp-gray-500 text-xs">
                Picked {analytics.earliestReach.actualPick} · ADP {analytics.earliestReach.expectedADP}
              </p>
            </div>
          </div>
        )}

        <p className="text-pmp-gray-800 text-[10px] text-center">prettymuchpicks.com</p>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <button
          onClick={handleDownload}
          className="w-full bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white font-semibold py-3 rounded-xl text-sm hover:border-pmp-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <span>⬇</span> Download Card
        </button>
        <button
          onClick={onPlayAgain}
          className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-base hover:opacity-90 transition-opacity"
        >
          {playAgainLabel ?? 'Draft Again'}
        </button>
      </div>
    </div>
  )
}
