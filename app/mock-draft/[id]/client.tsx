'use client'
import { DraftBoard } from '@/components/draft/DraftBoard'
import type { DraftState } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface Props {
  initialState: DraftState
  players: Player[]
}

export default function MockDraftClientPage({ initialState, players }: Props) {
  return (
    <DraftBoard
      settings={initialState.settings}
      players={players}
      initialState={initialState}
    />
  )
}
