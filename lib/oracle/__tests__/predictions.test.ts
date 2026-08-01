import { predictionsLocked } from '../predictions'

describe('predictionsLocked', () => {
  it('returns false before lock date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    expect(predictionsLocked()).toBe(false)
    vi.useRealTimers()
  })
  it('returns true after lock date', () => {
    vi.useFakeTimers()
    // Lock is 2026-09-09T20:20:00-04:00 = 2026-09-10T00:20:00Z; use a time well past it
    vi.setSystemTime(new Date('2026-09-10T02:00:00Z'))
    expect(predictionsLocked()).toBe(true)
    vi.useRealTimers()
  })
})
