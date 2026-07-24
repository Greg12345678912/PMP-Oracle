'use client'
import { useState } from 'react'
import { TierBuilder } from './TierBuilder'
import { Button } from '@/components/ui/Button'
import type { Player, Position, Tier } from '@/lib/data/types'

interface TierBuilderPageProps {
  players: Player[]
  position: Position
}

const POSITION_LABELS: Record<Position, string> = {
  RB: 'Running Backs',
  QB: 'Quarterbacks',
  WR: 'Wide Receivers',
  TE: 'Tight Ends',
  FLEX: 'Flex',
}

export function TierBuilderPage({ players, position }: TierBuilderPageProps) {
  const [currentTiers] = useState<Tier[]>([])

  const handleDownload = () => {
    // DownloadModal (Task 15) not yet implemented — stub
    console.log('Download coming soon', currentTiers)
  }

  if (players.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-pmp-gray-500 mb-4">Unable to load players right now.</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-pmp-black">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <a href="/" className="text-pmp-red text-sm font-medium hover:underline">
            ← Pretty Much Picks
          </a>
          <h1 className="font-display text-3xl font-bold text-pmp-white mt-2">
            {POSITION_LABELS[position]} Tier List
          </h1>
          <p className="text-pmp-gray-500 text-sm mt-1">
            Drag players into tiers. Download your rankings.
          </p>
        </div>

        <TierBuilder players={players} position={position} />

        {/* Download CTA */}
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={handleDownload}>
            Download (Coming Soon)
          </Button>
        </div>
      </div>
    </main>
  )
}
