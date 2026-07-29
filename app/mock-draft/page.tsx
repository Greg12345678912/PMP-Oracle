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
  ownershipMap: Map<string, number>
}

function buildOwnershipMap(
  settings: DraftSettings,
  trades: PickTrade[]
): Map<string, number> {
  // Start with identity ownership (each pick owned by its teamSlot)
  // Apply trades as slot swaps: trading pick A↔B means their currentOwnerTeamSlot values swap
  const map = new Map<string, number>()
  for (const trade of trades) {
    const keyA = `${trade.roundA}_${trade.slotA}`
    const keyB = `${trade.roundB}_${trade.slotB}`
    const ownerA = map.get(keyA) ?? trade.slotA
    const ownerB = map.get(keyB) ?? trade.slotB
    map.set(keyA, ownerB)
    map.set(keyB, ownerA)
  }
  // Include user slot so DraftBoard knows which slot belongs to the user
  void settings
  return map
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
      ownershipMap: buildOwnershipMap(settings, trades),
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
