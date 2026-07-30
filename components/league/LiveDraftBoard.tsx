'use client'
// Stub — implemented in Task 8
import type { LeagueMember, LeagueDraft } from '@/lib/league/types'
import type { DraftSettings } from '@/lib/draft/types'

interface LiveDraftBoardProps {
  leagueId: string
  draft: LeagueDraft
  members: LeagueMember[]
  myTeamSlot: number | null
  isPicking: boolean
  onPickPlayer: (playerId: string, playerName: string) => Promise<void>
  settings: DraftSettings
}

export function LiveDraftBoard(_props: LiveDraftBoardProps) {
  return (
    <div className="min-h-screen bg-pmp-black flex items-center justify-center">
      <p className="text-pmp-gray-500 text-sm">Draft board coming soon...</p>
    </div>
  )
}
