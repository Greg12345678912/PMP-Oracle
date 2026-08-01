// lib/league/service.ts
import { buildInitialState } from '@/lib/draft/engine'
import type { DraftSettings, DraftState } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'
import type { LeagueMember, LeagueStatus } from '@/lib/league/types'

const INVITE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateInviteCode(): string {
  return Array.from({ length: 6 }, () =>
    INVITE_CHARSET[Math.floor(Math.random() * INVITE_CHARSET.length)]
  ).join('')
}

type ValidatePickParams = {
  state: DraftState
  playerId: string
  userId: string
  members: LeagueMember[]
  leagueStatus: LeagueStatus
}

type ValidateResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

type InitResult = {
  state: DraftState
  membersWithSlots: LeagueMember[]
}

export const DraftService = {
  validatePick(params: ValidatePickParams): ValidateResult {
    const { state, playerId, userId, members, leagueStatus } = params

    if (leagueStatus !== 'drafting') {
      return { ok: false, error: 'Draft is not active', status: 403 }
    }

    const currentPick = state.picks[state.currentPickIndex]
    if (!currentPick) {
      return { ok: false, error: 'Draft is complete', status: 400 }
    }

    const member = members.find(m => m.userId === userId)
    if (!member) {
      return { ok: false, error: 'Not a member of this league', status: 403 }
    }

    if (member.teamSlot !== currentPick.currentOwnerTeamSlot) {
      return { ok: false, error: 'Not your turn', status: 403 }
    }

    if (!state.availablePlayerIds.includes(playerId)) {
      return { ok: false, error: 'Player not available', status: 409 }
    }

    return { ok: true }
  },

  initializeDraft(params: {
    settings: DraftSettings
    players: Player[]
    members: LeagueMember[]
  }): InitResult {
    const numTeams = params.settings.numTeams

    // Respect pre-assigned slots; randomly assign only members with no slot
    const usedSlots = new Set(params.members.map(m => m.teamSlot).filter(Boolean) as number[])
    const freeSlots = Array.from({ length: numTeams }, (_, i) => i + 1).filter(s => !usedSlots.has(s))

    // Fisher-Yates shuffle free slots
    for (let i = freeSlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[freeSlots[i], freeSlots[j]] = [freeSlots[j], freeSlots[i]]
    }

    let freeIdx = 0
    const membersWithSlots: LeagueMember[] = params.members.map(m => ({
      ...m,
      teamSlot: m.teamSlot ?? freeSlots[freeIdx++],
    }))

    // Use settings directly — CPU auto-pick handles slots with no real member
    const state = buildInitialState(params.settings, params.players)

    return { state, membersWithSlots }
  },
}
