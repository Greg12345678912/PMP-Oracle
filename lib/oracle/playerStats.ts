import { getServiceClient } from '@/lib/league/db'
import type { RankingRow } from '@/lib/oracle/rankings'

export interface PlayerStats {
  playerName: string
  total: number
  communityAvgRank: number
  mostCommonRank: number | null
  userRank: number | null
  confidenceBreakdown: {
    low: number
    medium: number
    high: number
  }
}

export async function getPlayerStats(
  playerId: string,
  seasonId: string,
  userId: string | null,
): Promise<PlayerStats | null> {
  const db = getServiceClient()

  const { data: rows, error } = await db
    .from('challenge_rankings')
    .select('rankings, user_id')
    .eq('season_id', seasonId)
    .eq('is_submitted', true)

  if (error || !rows) return null

  type Entry = { userId: string; playerRank: number; playerName: string; confidence: 'low' | 'medium' | 'high' }

  const playerEntries: Entry[] = []

  for (const row of rows) {
    const rankings = row.rankings as RankingRow[] | null
    if (!Array.isArray(rankings)) continue
    const entry = rankings.find((r) => r.playerId === playerId)
    if (entry) {
      playerEntries.push({
        userId: row.user_id as string,
        playerRank: entry.playerRank,
        playerName: entry.playerName,
        confidence: entry.confidence,
      })
    }
  }

  if (playerEntries.length === 0) return null

  const playerName = playerEntries[0].playerName
  const total = playerEntries.length
  const ranks = playerEntries.map((e) => e.playerRank)
  const communityAvgRank = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length)

  const rankFreq = new Map<number, number>()
  ranks.forEach((r) => rankFreq.set(r, (rankFreq.get(r) ?? 0) + 1))
  const mostCommonRank = [...rankFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const confidenceCounts = { low: 0, medium: 0, high: 0 }
  playerEntries.forEach((e) => { confidenceCounts[e.confidence]++ })

  const userRank = userId
    ? (playerEntries.find((e) => e.userId === userId)?.playerRank ?? null)
    : null

  return {
    playerName,
    total,
    communityAvgRank,
    mostCommonRank,
    userRank,
    confidenceBreakdown: {
      low: Math.round((confidenceCounts.low / total) * 100),
      medium: Math.round((confidenceCounts.medium / total) * 100),
      high: Math.round((confidenceCounts.high / total) * 100),
    },
  }
}
