import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Capture broadcast callback so tests can fire events
let broadcastCallback: ((payload: { payload: unknown }) => void) | null = null

vi.mock('@supabase/supabase-js', () => {
  const mockChannel = {
    on: vi.fn().mockImplementation((_type: string, _filter: unknown, cb: (p: { payload: unknown }) => void) => {
      broadcastCallback = cb
      return mockChannel
    }),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
  }
  const mockClient = {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  }
  return { createClient: vi.fn(() => mockClient) }
})

vi.mock('@/lib/league/identity', () => ({
  getUserId: vi.fn(() => 'test-user'),
}))

// Mock fetch so the hook's initial fetchState doesn't error
beforeEach(() => {
  broadcastCallback = null
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: vi.fn().mockResolvedValue({}),
  })
})

describe('useLeagueDraft', () => {
  it('initializes with null draft state', async () => {
    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))
    expect(result.current.draft).toBeNull()
    expect(result.current.isPicking).toBe(false)
  })

  it('exposes myTeamSlot as null when not a member', async () => {
    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))
    expect(result.current.myTeamSlot).toBeNull()
  })

  it('exposes submitPick as a function', async () => {
    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))
    expect(typeof result.current.submitPick).toBe('function')
  })

  it('sets league and members from fetchState when API returns data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        league: { id: 'league-1', name: 'Test', status: 'lobby', inviteCode: 'ABC123', hostUserId: 'host', settings: {}, createdAt: '', updatedAt: '' },
        members: [
          { id: 'm1', leagueId: 'league-1', userId: 'test-user', displayName: 'Greg', teamSlot: 3, isReady: true, joinedAt: '' },
        ],
        draft: null,
      }),
    })
    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))

    // Wait for fetchState to resolve
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.league?.id).toBe('league-1')
    expect(result.current.members).toHaveLength(1)
    expect(result.current.myTeamSlot).toBe(3)
  })

  it('updates draft state on pick_made broadcast', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        league: { id: 'league-1', name: 'Test', status: 'drafting', inviteCode: 'ABC123', hostUserId: 'host', settings: {}, createdAt: '', updatedAt: '' },
        members: [],
        draft: {
          leagueId: 'league-1',
          version: 0,
          state: { schemaVersion: 1, version: 0, status: 'drafting' },
          pickDeadline: null,
          updatedAt: '',
        },
      }),
    })

    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.draft?.version).toBe(0)

    // Fire a pick_made broadcast
    await act(async () => {
      broadcastCallback?.({
        payload: {
          id: 'evt-1',
          leagueId: 'league-1',
          version: 1,
          timestamp: new Date().toISOString(),
          type: 'pick_made',
          userId: 'test-user',
          payload: {
            overallPick: 1,
            playerId: 'p1',
            playerName: 'Josh Allen',
            teamSlot: 1,
            requestId: 'req-1',
            state: { schemaVersion: 1, version: 1, status: 'drafting' },
          },
        },
      })
    })

    expect(result.current.draft?.version).toBe(1)
  })

  it('updates league status and sets draft on draft_started broadcast', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        league: { id: 'league-1', name: 'Test', status: 'lobby', inviteCode: 'ABC123', hostUserId: 'host', settings: {}, createdAt: '', updatedAt: '' },
        members: [
          { id: 'm1', leagueId: 'league-1', userId: 'test-user', displayName: 'Greg', teamSlot: null, isReady: true, joinedAt: '' },
        ],
        draft: null,
      }),
    })

    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.league?.status).toBe('lobby')
    expect(result.current.draft).toBeNull()

    await act(async () => {
      broadcastCallback?.({
        payload: {
          id: 'evt-2',
          leagueId: 'league-1',
          version: 1,
          timestamp: new Date().toISOString(),
          type: 'draft_started',
          userId: 'host',
          payload: {
            state: { schemaVersion: 1, version: 1, status: 'drafting' },
            members: [
              { id: 'm1', leagueId: 'league-1', userId: 'test-user', displayName: 'Greg', teamSlot: 2, isReady: true, joinedAt: '' },
            ],
          },
        },
      })
    })

    expect(result.current.league?.status).toBe('drafting')
    expect(result.current.draft).not.toBeNull()
    expect(result.current.myTeamSlot).toBe(2)
  })

  it('deduplicates members on member_joined broadcast', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        league: { id: 'league-1', name: 'Test', status: 'lobby', inviteCode: 'ABC123', hostUserId: 'host', settings: {}, createdAt: '', updatedAt: '' },
        members: [
          { id: 'm1', leagueId: 'league-1', userId: 'existing-user', displayName: 'Alice', teamSlot: null, isReady: false, joinedAt: '' },
        ],
        draft: null,
      }),
    })

    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.members).toHaveLength(1)

    // Fire member_joined for a NEW user
    await act(async () => {
      broadcastCallback?.({
        payload: {
          id: 'evt-3',
          leagueId: 'league-1',
          version: 1,
          timestamp: new Date().toISOString(),
          type: 'member_joined',
          userId: 'new-user',
          payload: { userId: 'new-user', displayName: 'Bob' },
        },
      })
    })

    expect(result.current.members).toHaveLength(2)

    // Fire member_joined again for SAME user (reconnect dedup)
    await act(async () => {
      broadcastCallback?.({
        payload: {
          id: 'evt-4',
          leagueId: 'league-1',
          version: 1,
          timestamp: new Date().toISOString(),
          type: 'member_joined',
          userId: 'new-user',
          payload: { userId: 'new-user', displayName: 'Bob' },
        },
      })
    })

    // Should still be 2 — duplicate not appended
    expect(result.current.members).toHaveLength(2)
  })

  it('re-fetches state on draft_complete broadcast', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          league: { id: 'league-1', name: 'Test', status: 'drafting', inviteCode: 'ABC123', hostUserId: 'host', settings: {}, createdAt: '', updatedAt: '' },
          members: [],
          draft: { leagueId: 'league-1', version: 5, state: { schemaVersion: 1, version: 5, status: 'drafting' }, pickDeadline: null, updatedAt: '' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          league: { id: 'league-1', name: 'Test', status: 'complete', inviteCode: 'ABC123', hostUserId: 'host', settings: {}, createdAt: '', updatedAt: '' },
          members: [],
          draft: { leagueId: 'league-1', version: 6, state: { schemaVersion: 1, version: 6, status: 'complete' }, pickDeadline: null, updatedAt: '' },
        }),
      })
    global.fetch = mockFetch

    const { useLeagueDraft } = await import('@/lib/league/useLeagueDraft')
    const { result } = renderHook(() => useLeagueDraft('league-1'))

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(result.current.league?.status).toBe('drafting')

    await act(async () => {
      broadcastCallback?.({
        payload: {
          id: 'evt-5',
          leagueId: 'league-1',
          version: 6,
          timestamp: new Date().toISOString(),
          type: 'draft_complete',
          userId: 'system',
          payload: { replayId: null },
        },
      })
    })

    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.current.league?.status).toBe('complete')
  })
})
