import { isLocked } from '../season'

const future = new Date(Date.now() + 60_000).toISOString()
const past   = new Date(Date.now() - 60_000).toISOString()

describe('isLocked', () => {
  it('returns false when status is open and lock_at is future', () => {
    expect(isLocked({ status: 'open', lock_at: future } as any)).toBe(false)
  })
  it('returns true when lock_at is in the past', () => {
    expect(isLocked({ status: 'open', lock_at: past } as any)).toBe(true)
  })
  it('returns true when status is locked', () => {
    expect(isLocked({ status: 'locked', lock_at: future } as any)).toBe(true)
  })
})
