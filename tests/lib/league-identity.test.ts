import { describe, it, expect, vi, beforeEach } from 'vitest'

// jsdom provides localStorage in vitest
describe('getUserId', () => {
  beforeEach(() => localStorage.clear())

  it('generates a UUID on first call', async () => {
    const { getUserId } = await import('@/lib/league/identity')
    const id = getUserId()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns the same UUID on subsequent calls', async () => {
    const { getUserId } = await import('@/lib/league/identity')
    expect(getUserId()).toBe(getUserId())
  })
})

describe('getDisplayName / setDisplayName', () => {
  beforeEach(() => localStorage.clear())

  it('returns null before being set', async () => {
    const { getDisplayName } = await import('@/lib/league/identity')
    expect(getDisplayName()).toBeNull()
  })

  it('returns the stored name after setDisplayName', async () => {
    const { getDisplayName, setDisplayName } = await import('@/lib/league/identity')
    setDisplayName('Greg')
    expect(getDisplayName()).toBe('Greg')
  })
})
