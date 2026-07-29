'use client'
import { useState } from 'react'
import { DraftSetup } from '@/components/draft/DraftSetup'
import { DraftBoard } from '@/components/draft/DraftBoard'
import { buildInitialState } from '@/lib/draft/engine'
import { analytics } from '@/lib/analytics/events'
import type { DraftSettings, DraftState, Player } from '@/lib/draft/types'

type PickTrade = { roundA: number; slotA: number; roundB: number; slotB: number }

interface StartedDraft {
  settings: DraftSettings
  players: Player[]
  initialState: DraftState
  initialTrades: PickTrade[]
}

export default function MockDraftPage() {
  const [draftState, setDraftState] = useState<StartedDraft | null>(null)

  const handleStart = (settings: DraftSettings, players: Player[], trades: PickTrade[]) => {
    analytics.mockDraftStarted({
      numTeams: settings.numTeams,
      scoring: settings.scoring,
      speed: settings.speed,
    })
    setDraftState({
      settings,
      players,
      initialState: buildInitialState(settings, players),
      initialTrades: trades,
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
      initialTrades={draftState.initialTrades}
    />
  )
}
