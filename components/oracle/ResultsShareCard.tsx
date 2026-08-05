'use client'

import { useRef } from 'react'

interface ResultsShareCardProps {
  overallScore: number
  percentile: number
  rank?: number | null
  totalParticipants?: number
  username?: string
}

export function ResultsShareCard({ overallScore, percentile, rank, totalParticipants, username }: ResultsShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  async function handleDownload() {
    if (!cardRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(cardRef.current, { scale: 2 })
    const link = document.createElement('a')
    link.download = 'oracle-results.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={cardRef}
        className="w-[340px] p-8 flex flex-col items-center gap-3 rounded-2xl border border-[#222]"
        style={{ backgroundColor: '#0d0d0d' }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-[#e11d48] text-[10px] font-bold uppercase tracking-[0.4em]">
            Pretty Much Picks
          </p>
          <p className="text-[#888] text-[10px] font-bold uppercase tracking-widest">
            2026 Oracle Challenge · Final Results
          </p>
        </div>

        {/* Score */}
        <p className="text-white text-[72px] font-black leading-none mt-2">
          {overallScore.toFixed(1)}
        </p>
        <p className="text-[#666] text-sm">Overall Accuracy</p>

        {/* Rank */}
        <div className="flex flex-col items-center gap-1 mt-1">
          {rank != null && totalParticipants != null && totalParticipants > 0 && (
            <div className="flex flex-col items-center gap-0.5">
              <p className="text-[#555] text-[10px] font-bold uppercase tracking-widest">Final Rank</p>
              <p className="text-white text-2xl font-black">#{rank.toLocaleString()} of {totalParticipants.toLocaleString()}</p>
            </div>
          )}
          <p className="text-[#888] text-sm">Top {percentile}%</p>
          {username && (
            <p className="text-[#555] text-xs">@{username}</p>
          )}
        </div>

        {/* Footer */}
        <p className="text-[#333] text-[10px] mt-3 tracking-wide">prettymuchpicks.com</p>
      </div>

      <button
        onClick={handleDownload}
        className="bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white font-semibold py-3 px-6 rounded-xl text-sm hover:border-pmp-gray-500 transition-colors"
      >
        Download Share Card
      </button>
    </div>
  )
}
