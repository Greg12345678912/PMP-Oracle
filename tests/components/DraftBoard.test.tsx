import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftBoard } from '@/components/draft/DraftBoard'
import { buildInitialState } from '@/lib/draft/engine'
import type { DraftSettings, Player } from '@/lib/draft/types'

vi.mock('@/lib/draft/supabase', () => ({
  saveDraft: vi.fn().mockResolvedValue('SAVE01'),
}))

vi.useFakeTimers()

const SETTINGS: DraftSettings = {
  numTeams: 2, numRounds: 15, userSlot: 2, scoring: 'ppr', speed: 'instant',
}

const PLAYERS: Player[] = Array.from({ length: 40 }, (_, i) => ({
  id: String(i + 1),
  name: `Player ${i + 1}`,
  position: ['QB', 'RB', 'WR', 'TE'][i % 4] as Player['position'],
  team: 'KC',
  searchRank: i + 1,
  byeWeek: 7,
}))

describe('DraftBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('renders without crashing', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    render(<DraftBoard settings={SETTINGS} players={PLAYERS} initialState={state} />)
    // DraftControls always renders Undo/Redo/Reset/Share buttons
    expect(screen.getByText(/undo/i)).toBeDefined()
  })

  it('CPU auto-picks for slot 1 (not user) and pauses at user slot 2', async () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    render(<DraftBoard settings={SETTINGS} players={PLAYERS} initialState={state} />)
    // With speed=instant (0ms), CPU should pick immediately and then pause at user turn
    await act(async () => { vi.advanceTimersByTime(100) })
    // After CPU picks slot 1, it's now user's turn (slot 2) — banner shows "Your pick"
    expect(screen.getByText(/your pick/i)).toBeDefined()
  })
})
