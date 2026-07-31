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

    // Shuffle all slots [1..numTeams] (Fisher-Yates), assign first members.length to real members
    const allSlots = Array.from({ length: numTeams }, (_, i) => i + 1)
    for (let i = allSlots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[allSlots[i], allSlots[j]] = [allSlots[j], allSlots[i]]
    }

    const membersWithSlots: LeagueMember[] = params.members.map((m, i) => ({
      ...m,
      teamSlot: allSlots[i],
    }))

    // Use settings directly — CPU auto-pick handles slots with no real member
    const state = buildInitialState(params.settings, params.players)

    return { state, membersWithSlots }
  },
}
