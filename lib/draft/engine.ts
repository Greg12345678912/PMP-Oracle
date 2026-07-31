// lib/draft/engine.ts
// No React imports. No imports from lib/data/sleeper.ts.
import type { DraftState, DraftSettings, PickSlot, DraftAnalytics } from './types'
import type { Player } from '@/lib/data/types'

/** Build the pick grid for a snake draft */
function buildPickSlots(numTeams: number, numRounds: number): PickSlot[] {
  const picks: PickSlot[] = []
  let overall = 1
  for (let round = 1; round <= numRounds; round++) {
    const isOdd = round % 2 === 1
    for (let pick = 1; pick <= numTeams; pick++) {
      const teamSlot = isOdd ? pick : numTeams - pick + 1
      picks.push({
        overallPick: overall++,
        round,
        pickInRound: pick,
        teamSlot,
        currentOwnerTeamSlot: teamSlot,
        playerId: null,
      })
    }
  }
  return picks
}

export function buildInitialState(settings: DraftSettings, players: Player[]): DraftState {
  const allPlayerIds = players.map(p => p.id)
  return {
    schemaVersion: 1,
    version: 0,            // added
    shareId: null,
    settings,
    picks: buildPickSlots(settings.numTeams, settings.numRounds),
    currentPickIndex: 0,
    availablePlayerIds: [...allPlayerIds],
    allPlayerIds,
    lockedPlayerIds: [],
    status: 'drafting',
  }
}

export function makePick(state: DraftState, playerId: string): DraftState {
  const { currentPickIndex, picks, availablePlayerIds } = state
  if (currentPickIndex >= picks.length) return state

  const newPicks = picks.map((p, i) =>
    i === currentPickIndex ? { ...p, playerId } : p
  )
  const newAvailable = availablePlayerIds.filter(id => id !== playerId)
  const newIndex = currentPickIndex + 1
  const isComplete = newIndex >= picks.length

  return {
    ...state,
    picks: newPicks,
    availablePlayerIds: newAvailable,
    currentPickIndex: newIndex,
    status: isComplete ? 'complete' : state.status,
  }
}

/** Undo the most recently completed pick. No-op if no picks have been made. */
export function undoPick(state: DraftState): DraftState {
  if (state.currentPickIndex === 0) return state
  const prevIndex = state.currentPickIndex - 1
  const displaced = state.picks[prevIndex].playerId
  const newPicks = state.picks.map((p, i) =>
    i === prevIndex ? { ...p, playerId: null } : p
  )
  let newAvailable = state.availablePlayerIds
  if (displaced) {
    newAvailable = [displaced, ...state.availablePlayerIds]
    const orderMap = new Map(state.allPlayerIds.map((id, i) => [id, i]))
    newAvailable.sort((a, b) => (orderMap.get(a) ?? 9999) - (orderMap.get(b) ?? 9999))
  }
  return {
    ...state,
    picks: newPicks,
    currentPickIndex: prevIndex,
    availablePlayerIds: newAvailable,
    status: 'drafting',
  }
}

/** Only completed picks (index < currentPickIndex) may be edited. */
export function assignPlayerToSlot(
  state: DraftState,
  pickIndex: number,
  playerId: string
): DraftState {
  if (pickIndex >= state.currentPickIndex) return state

  const displaced = state.picks[pickIndex].playerId
  const newPicks = state.picks.map((p, i) =>
    i === pickIndex ? { ...p, playerId } : p
  )

  // Remove new player from available, add displaced player back
  let newAvailable = state.availablePlayerIds.filter(id => id !== playerId)
  if (displaced && displaced !== playerId) {
    newAvailable = [...newAvailable, displaced]
    // Re-sort by allPlayerIds order
    const orderMap = new Map(state.allPlayerIds.map((id, i) => [id, i]))
    newAvailable.sort((a, b) => (orderMap.get(a) ?? 9999) - (orderMap.get(b) ?? 9999))
  }

  return { ...state, picks: newPicks, availablePlayerIds: newAvailable }
}


export function resetToADP(state: DraftState): DraftState {
  return {
    ...state,
    picks: state.picks.map(p => ({ ...p, playerId: null })),
    currentPickIndex: 0,
    availablePlayerIds: [...state.allPlayerIds],
    status: 'drafting',
  }
}

/** Select best available player for CPU (top available, skip locked) */
export function selectBestAvailable(state: DraftState): string | null {
  for (const id of state.availablePlayerIds) {
    if (!state.lockedPlayerIds.includes(id)) return id
  }
  return state.availablePlayerIds[0] ?? null
}

const SHARE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateShareId(): string {
  return Array.from({ length: 6 }, () =>
    SHARE_CHARSET[Math.floor(Math.random() * SHARE_CHARSET.length)]
  ).join('')
}

export function computeDraftAnalytics(
  state: DraftState,
  playerMap: Map<string, Player>
): DraftAnalytics {
  const userPicks = state.picks.filter(
    p => p.currentOwnerTeamSlot === state.settings.userSlot && p.playerId !== null
  )
  const positionBreakdown: Record<string, number> = {}
  let totalADP = 0
  let totalDelta = 0
  let earliestReach: DraftAnalytics['earliestReach'] = null
  let biggestValue: DraftAnalytics['biggestValue'] = null

  for (const pick of userPicks) {
    const player = playerMap.get(pick.playerId!)
    if (!player) continue

    positionBreakdown[player.position] = (positionBreakdown[player.position] ?? 0) + 1
    totalADP += player.searchRank ?? 0

    const expectedADP = player.searchRank ?? 0
    const actualPick = pick.overallPick
    const diff = actualPick - expectedADP  // positive = value, negative = reach
    totalDelta += diff

    if (diff < 0) {
      if (!earliestReach || diff < (earliestReach.actualPick - earliestReach.expectedADP)) {
        earliestReach = { player, expectedADP, actualPick }
      }
    }
    if (diff > 0) {
      if (!biggestValue || diff > (biggestValue.actualPick - biggestValue.expectedADP)) {
        biggestValue = { player, expectedADP, actualPick }
      }
    }
  }

  const avgDelta = userPicks.length > 0 ? totalDelta / userPicks.length : 0
  const gradeLetter =
    avgDelta > 20  ? 'A+' :
    avgDelta > 15  ? 'A'  :
    avgDelta > 10  ? 'A-' :
    avgDelta > 5   ? 'B+' :
    avgDelta > 0   ? 'B'  :
    avgDelta > -5  ? 'B-' :
    avgDelta > -10 ? 'C+' :
    avgDelta > -20 ? 'C'  : 'D'

  return {
    positionBreakdown,
    averageADPReached: userPicks.length > 0 ? totalADP / userPicks.length : 0,
    earliestReach,
    biggestValue,
    grade: { letter: gradeLetter, score: avgDelta },
  }
}
