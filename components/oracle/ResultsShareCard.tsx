'use client'

import { useRef } from 'react'

interface ResultsShareCardProps {
  overallScore: number
  percentile: number
}

export function ResultsShareCard({ overallScore, percentile }: ResultsShareCardProps) {
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
        className="bg-pmp-black w-[340px] p-8 flex flex-col items-center gap-4 rounded-2xl"
        style={{ backgroundColor: '#0d0d0d' }}
      >
        <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">
          Oracle Challenge
        </p>
        <p className="text-pmp-white text-[64px] font-black leading-none">
          {overallScore.toFixed(1)}
        </p>
        <p className="text-pmp-gray-500 text-sm">Accuracy</p>
        <p className="text-pmp-white font-bold">Top {percentile}%</p>
        <p className="text-pmp-gray-600 text-xs mt-4">Pretty Much Picks</p>
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
