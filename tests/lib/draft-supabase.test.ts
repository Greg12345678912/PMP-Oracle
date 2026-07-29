// tests/lib/draft-supabase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase before importing the module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              share_id: 'ABC123',
              state: JSON.stringify({ schemaVersion: 1, shareId: 'ABC123', status: 'drafting' }),
            },
            error: null,
          }),
        })),
      })),
    })),
  })),
}))

beforeEach(() => {
  vi.resetModules()
})

describe('saveDraft', () => {
  it('returns the shareId', async () => {
    const { saveDraft } = await import('@/lib/draft/supabase')
    const fakeState = {
      schemaVersion: 1 as const,
      shareId: null,
      settings: { numTeams: 10, numRounds: 15 as const, userSlot: 3, scoring: 'ppr' as const, speed: 'normal' as const },
      picks: [],
      currentPickIndex: 0,
      availablePlayerIds: [],
      allPlayerIds: [],
      lockedPlayerIds: [],
      status: 'drafting' as const,
    }
    const id = await saveDraft(fakeState)
    expect(id).toHaveLength(6)
    expect(id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

describe('loadDraft', () => {
  it('returns DraftState when found', async () => {
    const { loadDraft } = await import('@/lib/draft/supabase')
    const result = await loadDraft('ABC123')
    expect(result).not.toBeNull()
    expect(result?.schemaVersion).toBe(1)
    expect(result?.shareId).toBe('ABC123')
  })

  it('returns null when not found', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValueOnce({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          })),
        })),
      })),
    } as ReturnType<typeof createClient>)
    const { loadDraft } = await import('@/lib/draft/supabase')
    const result = await loadDraft('XXXXXX')
    expect(result).toBeNull()
  })
})
