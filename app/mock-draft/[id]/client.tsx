'use client'
import { DraftBoard } from '@/components/draft/DraftBoard'
import type { DraftState } from '@/lib/draft/types'

interface Props {
  initialState: DraftState
}

export default function MockDraftClientPage({ initialState }: Props) {
  // Reconstruct players list from allPlayerIds — in a real implementation,
  // re-fetch from DataProvider. For now, DraftBoard receives an empty players
  // array and uses initialState directly (players already embedded in picks).
  // TODO: store players in DraftState or re-fetch by ID on share load.
  return (
    <DraftBoard
      settings={initialState.settings}
      players={[]}
      initialState={initialState}
    />
  )
}
