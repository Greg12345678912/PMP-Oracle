'use client'
import { useState } from 'react'
import { DraftSetup } from '@/components/draft/DraftSetup'
import { DraftBoard } from '@/components/draft/DraftBoard'
import { buildInitialState } from '@/lib/draft/engine'
import { analytics } from '@/lib/analytics/events'
import type { DraftSettings, DraftState, Player } from '@/lib/draft/types'

interface StartedDraft {
  settings: DraftSettings
  players: Player[]
  initialState: DraftState
  ownershipMap: Map<string, number>
}

export default function MockDraftPage() {
  const [draftState, setDraftState] = useState<StartedDraft | null>(null)

  const handleStart = (settings: DraftSettings, players: Player[], ownershipMap: Map<string, number>) => {
    analytics.mockDraftStarted({
      numTeams: settings.numTeams,
      scoring: settings.scoring,
      speed: settings.speed,
    })
    setDraftState({
      settings,
      players,
      initialState: buildInitialState(settings, players),
      ownershipMap,
    })
  }

  if (!draftState) {
    return <DraftSetup onStart={handleStart} />
  }

  return (
    <DraftBoard
      settings={draftState.settings}
      players={draftState.players}
      initialState={draftState.initialState}
      ownershipMap={draftState.ownershipMap}
    />
  )
}
