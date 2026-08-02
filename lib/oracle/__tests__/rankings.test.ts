import { validateRankings } from '../rankings'
import { POSITION_LIST_SIZE } from '../constants'

describe('validateRankings', () => {
  const makeRow = (rank: number) => ({
    playerRank: rank, playerId: `p${rank}`, playerName: `Player ${rank}`,
  })

  it('rejects if too many entries', () => {
    const rows = Array.from({ length: POSITION_LIST_SIZE.QB + 1 }, (_, i) => makeRow(i + 1))
    expect(validateRankings('QB', rows).ok).toBe(false)
  })
  it('rejects duplicate ranks', () => {
    const rows = [makeRow(1), makeRow(1)]
    expect(validateRankings('QB', rows).ok).toBe(false)
  })
  it('accepts a valid QB list', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(i + 1))
    expect(validateRankings('QB', rows).ok).toBe(true)
  })
  it('allows partial list (save draft)', () => {
    const rows = [makeRow(1), makeRow(2)]
    expect(validateRankings('QB', rows).ok).toBe(true)
  })
})
