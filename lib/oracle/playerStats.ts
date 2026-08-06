import { getServiceClient } from '@/lib/league/db'
import type { RankingRow } from '@/lib/oracle/rankings'

const TOP_N = 10 // Oracle Challenge is top 10 per position

export interface PlayerStats {
  playerName: string
  position: string | null
  total: number
  totalSubmissions: number
  communityAvgRank: number
  mostCommonRank: number | null
  rankDistribution: number[] // index 0 = rank #1 count, index 9 = rank #10 count
  userRank: number | null
}

export async function getPlayerStats(
  playerId: string,
  seasonId: string,
  userId: string | null,
): Promise<PlayerStats | null> {
  const db = getServiceClient()

  const { data: rows, error } = await db
    .from('challenge_rankings')
    .select('rankings, user_id, position')
    .eq('season_id', seasonId)
    .eq('is_submitted', true)

  if (error || !rows) return null

  type Entry = { userId: string; playerRank: number; playerName: string }

  const playerEntries: Entry[] = []
  let position: string | null = null

  for (const row of rows) {
    const rankings = row.rankings as RankingRow[] | null
    if (!Array.isArray(rankings)) continue
    const entry = rankings.find((r) => r.playerId === playerId && r.playerRank <= TOP_N)
    if (entry) {
      if (!position) position = row.position as string
      playerEntries.push({
        userId: row.user_id as string,
        playerRank: entry.playerRank,
        playerName: entry.playerName,
      })
    }
  }

  if (playerEntries.length === 0) return null

  // Count only submissions for this player's position — each user submits one row
  // per position, so rows.length would be up to 4× the actual participant count.
  const totalSubmissions = position
    ? rows.filter(r => (r.position as string) === position).length
    : rows.length

  const playerName = playerEntries[0].playerName
  const total = playerEntries.length
  const ranks = playerEntries.map((e) => e.playerRank)
  const communityAvgRank = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length)

  const rankFreq = new Map<number, number>()
  ranks.forEach((r) => rankFreq.set(r, (rankFreq.get(r) ?? 0) + 1))
  const mostCommonRank = [...rankFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const rankDistribution = Array.from({ length: TOP_N }, (_, i) => rankFreq.get(i + 1) ?? 0)

  const userRank = userId
    ? (playerEntries.find((e) => e.userId === userId)?.playerRank ?? null)
    : null

  return {
    playerName,
    position,
    total,
    totalSubmissions,
    communityAvgRank,
    mostCommonRank,
    rankDistribution,
    userRank,
  }
}
