import type { DraftSettings, DraftState } from '@/lib/draft/types'

export type LeagueStatus = 'lobby' | 'drafting' | 'paused' | 'complete'

export interface League {
  id: string
  inviteCode: string
  name: string
  hostUserId: string
  settings: DraftSettings
  status: LeagueStatus
  createdAt: string
  updatedAt: string
}

export interface LeagueMember {
  id: string
  leagueId: string
  userId: string
  displayName: string
  teamSlot: number | null   // null until host starts draft
  isReady: boolean
  joinedAt: string
}

export interface LeagueDraft {
  leagueId: string
  version: number
  state: DraftState
  pickDeadline: string | null
  updatedAt: string
}

export type DraftEventType =
  | 'draft_started'
  | 'pick_made'
  | 'pick_undone'
  | 'draft_paused'
  | 'draft_resumed'
  | 'draft_complete'
  | 'host_transferred'
  | 'member_joined'
  | 'member_left'
  | 'slot_claimed'
  | 'chat'
  | 'reaction'

export interface DraftEvent<T = unknown> {
  id: string
  leagueId: string
  version: number        // version of DraftState AFTER this event was applied
  timestamp: string      // ISO 8601
  type: DraftEventType
  payload: T
  userId: string         // who triggered it
}

// Specific payload shapes
export interface PickMadePayload {
  overallPick: number
  playerId: string
  playerName: string     // for display without needing full player fetch
  teamSlot: number
  requestId: string      // echoed back for idempotency confirmation
  state: DraftState      // full updated state so clients can replace in one step
}

export interface DraftStartedPayload {
  state: DraftState
  members: LeagueMember[]
}

export interface MemberJoinedPayload {
  userId: string
  displayName: string
}

export interface DraftCompletePayload {
  replayId: string | null
}
