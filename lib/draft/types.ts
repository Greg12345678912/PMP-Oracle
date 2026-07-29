// lib/draft/types.ts
import type { Player } from '@/lib/data/types'

export type { Player }

export interface DraftSettings {
  numTeams: number            // 8, 10, or 12
  numRounds: 15               // only supported value
  userSlot: number            // 1-indexed
  scoring: 'ppr' | 'half_ppr' | 'standard'
  speed: 'instant' | 'fast' | 'normal'
}

export interface PickSlot {
  overallPick: number   // 1-indexed
  round: number         // 1-indexed
  pickInRound: number   // 1-indexed
  teamSlot: number      // 1-indexed
  isUser: boolean
  playerId: string | null
}

export interface DraftState {
  schemaVersion: 1
  shareId: string | null
  settings: DraftSettings
  picks: PickSlot[]
  currentPickIndex: number        // index into picks[]
  availablePlayerIds: string[]    // ADP-sorted available players
  allPlayerIds: string[]          // immutable ADP-sorted reference for re-sorting
  lockedPlayerIds: string[]       // players CPU cannot auto-pick
  status: 'drafting' | 'paused' | 'complete'
}

export interface DraftAnalytics {
  positionBreakdown: Record<string, number>
  averageADPReached: number
  earliestReach: { player: Player; expectedADP: number; actualPick: number } | null
  biggestValue: { player: Player; expectedADP: number; actualPick: number } | null
}

export const DRAFT_SPEED_MS: Record<DraftSettings['speed'], number> = {
  instant: 0,
  fast: 500,
  normal: 1000,
}

export const DRAFT_TEAM_OPTIONS = [8, 10, 12] as const
