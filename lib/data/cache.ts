import type { Player, Position } from './types'

const cache = new Map<Position, { players: Player[]; fetchedAt: number }>()
const TTL_MS = 1000 * 60 * 60 // 1 hour

export function getCached(position: Position): Player[] | null {
  const entry = cache.get(position)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > TTL_MS) return null
  return entry.players
}

export function setCached(position: Position, players: Player[]): void {
  cache.set(position, { players, fetchedAt: Date.now() })
}
