import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DraftSetup } from '@/components/draft/DraftSetup'

vi.mock('@/lib/data/sleeper', () => ({
  SleeperProvider: class {
    getDraftPlayers = vi.fn().mockResolvedValue([
      { id: '1', name: 'Alpha', position: 'QB', team: 'KC', searchRank: 1, byeWeek: 7 },
    ])
  },
}))

describe('DraftSetup', () => {
  it('renders team count, pick slot, scoring, and speed selects', () => {
    const onStart = vi.fn()
    render(<DraftSetup onStart={onStart} />)
    expect(screen.getByLabelText(/teams/i)).toBeDefined()
    expect(screen.getByLabelText(/your pick/i)).toBeDefined()
    expect(screen.getByLabelText(/scoring/i)).toBeDefined()
    expect(screen.getByLabelText(/draft speed/i)).toBeDefined()
  })

  it('does not show rounds select (15 rounds fixed)', () => {
    render(<DraftSetup onStart={vi.fn()} />)
    expect(screen.queryByLabelText(/rounds/i)).toBeNull()
  })

  it('updates pick slot options when team count changes', () => {
    render(<DraftSetup onStart={vi.fn()} />)
    const teamsSelect = screen.getByLabelText(/teams/i) as HTMLSelectElement
    fireEvent.change(teamsSelect, { target: { value: '8' } })
    const slotSelect = screen.getByLabelText(/your pick/i) as HTMLSelectElement
    expect(slotSelect.options).toHaveLength(8)
  })

  it('calls onStart with correct settings when Start Draft clicked', async () => {
    const onStart = vi.fn()
    render(<DraftSetup onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /start draft/i }))
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledOnce())
    const [settings] = onStart.mock.calls[0]
    expect(settings.numRounds).toBe(15)
    expect(settings.scoring).toBeDefined()
    expect(settings.speed).toBeDefined()
  })
})
