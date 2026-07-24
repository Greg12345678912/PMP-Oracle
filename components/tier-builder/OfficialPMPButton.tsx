'use client'
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Button } from '@/components/ui/Button'
import { loadPMPRankings, formatLastUpdated } from '@/lib/data/pmp-rankings'
import { analytics } from '@/lib/analytics/events'
import type { Position, Tier } from '@/lib/data/types'

interface OfficialPMPButtonProps {
  position: Position
  onLoad: (tiers: Tier[]) => void
}

export function OfficialPMPButton({ position, onLoad }: OfficialPMPButtonProps) {
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const handleLoad = async () => {
    setLoading(true)
    setError(false)
    try {
      const rankings = await loadPMPRankings(position)
      const tiers: Tier[] = Object.entries(rankings.tiers).map(([label, playerIds]) => ({
        id: uuid(),
        label,
        playerIds,
      }))
      setLastUpdated(formatLastUpdated(rankings.lastUpdated))
      onLoad(tiers)
      analytics.officialRankingsLoaded(position)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLoad}
        disabled={loading}
        aria-label="Load official Pretty Much Picks rankings"
      >
        {loading ? 'Loading...' : '🏆 Official PMP Rankings'}
      </Button>
      {lastUpdated && (
        <p className="text-[10px] text-pmp-gray-500 text-center">
          Updated {lastUpdated}
        </p>
      )}
      {error && (
        <p className="text-[10px] text-pmp-red text-center">
          Failed to load — try again
        </p>
      )}
    </div>
  )
}
