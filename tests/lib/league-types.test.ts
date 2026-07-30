import { describe, it, expect } from 'vitest'
import type { DraftEvent, PickMadePayload } from '@/lib/league/types'

describe('DraftEvent types', () => {
  it('compiles with typed payload', () => {
    const _event: DraftEvent<PickMadePayload> = {
      id: 'uuid',
      leagueId: 'uuid',
      version: 1,
      timestamp: new Date().toISOString(),
      type: 'pick_made',
      payload: {
        overallPick: 1, playerId: 'p1', playerName: 'Alpha',
        teamSlot: 1, requestId: 'req-1', state: {} as never,
      },
      userId: 'user-1',
    }
    expect(_event.type).toBe('pick_made')
  })
})
