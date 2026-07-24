'use client'
import { useState, useCallback } from 'react'
import { TierBuilder } from './TierBuilder'
import { DownloadModal } from './DownloadModal'
import { Button } from '@/components/ui/Button'
import { encodeTierState } from '@/lib/share/encode'
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
  const [currentTiers, setCurrentTiers] = useState<Tier[]>([])
  const [showDownload, setShowDownload] = useState(false)

  const handleTiersChange = useCallback((tiers: Tier[]) => {
    setCurrentTiers(tiers)
  }, [])

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?share=${encodeTierState(currentTiers)}`
    : ''

  const handleDownload = () => {
    setShowDownload(true)
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
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Header */}
        <div className="mb-5 sm:mb-8">
          <a href="/" className="text-pmp-red text-sm font-medium hover:underline">
            ← Pretty Much Picks
          </a>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-pmp-white mt-2">
            {POSITION_LABELS[position]} Tier List
          </h1>
          <p className="text-pmp-gray-500 text-sm mt-1">
            Drag players into tiers. Download your rankings.
          </p>
        </div>

        <TierBuilder players={players} position={position} onTiersChange={handleTiersChange} />

        {/* Download CTA */}
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={handleDownload}>
            Download PNG
          </Button>
        </div>
      </div>

      <DownloadModal
        open={showDownload}
        onClose={() => setShowDownload(false)}
        tiers={currentTiers}
        players={players}
        position={position}
        shareUrl={shareUrl}
      />
    </main>
  )
}
