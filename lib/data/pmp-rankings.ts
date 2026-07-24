import type { Position } from './types'

export interface PMPRankings {
  lastUpdated: string
  tiers: Record<string, string[]>  // tier label → player IDs
}

const POSITION_FILE: Record<Position, string> = {
  QB: 'qb',
  RB: 'rb',
  WR: 'wr',
  TE: 'te',
  FLEX: 'flex',
}

export async function loadPMPRankings(position: Position): Promise<PMPRankings> {
  const file = POSITION_FILE[position]
  const res = await fetch(`/rankings/${file}.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to load PMP rankings for ${position}`)
  return res.json()
}

export function formatLastUpdated(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}
