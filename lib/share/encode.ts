import type { Tier } from '@/lib/data/types'
import { v4 as uuid } from 'uuid'

// Format: label~id1,id2,id3~tier-uuid|label~id4,id5~tier-uuid
// Tiers separated by |, fields separated by ~, playerIds comma-separated

export function encodeTierState(tiers: Tier[]): string {
  return tiers
    .map(t => `${encodeURIComponent(t.label)}~${t.playerIds.join(',')}~${t.id}`)
    .join('|')
}

export function decodeTierState(encoded: string): Tier[] | null {
  if (!encoded || encoded.length === 0) return null
  try {
    return encoded.split('|').map(part => {
      const segments = part.split('~')
      if (segments.length < 2) throw new Error('Invalid')
      const [label, playerIdStr, id] = segments
      if (!label) throw new Error('Invalid')
      return {
        id: id ?? uuid(),
        label: decodeURIComponent(label),
        playerIds: playerIdStr ? playerIdStr.split(',').filter(Boolean) : [],
      }
    })
  } catch {
    return null
  }
}
