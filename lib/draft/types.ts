// lib/draft/types.ts
import type { Player } from '@/lib/data/types'

export type { Player }

export interface LineupConfig {
  QB: number
  RB: number
  WR: number
  TE: number
  FLEX: number   // RB/WR/TE eligible
  K: number
  DEF: number
  BN: number     // bench — any position
}

export const DEFAULT_LINEUP: LineupConfig = {
  QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 0, DEF: 1, BN: 6,
}

export interface DraftSettings {
  numTeams: number            // 8, 10, or 12
  numRounds: 15               // only supported value
  userSlot: number            // 1-indexed
  scoring: 'ppr' | 'half_ppr' | 'standard'
  speed: 'instant' | 'fast' | 'normal'
  lineup?: LineupConfig
}

export interface PickSlot {
  overallPick: number          // 1-indexed
  round: number                // 1-indexed
  pickInRound: number          // 1-indexed
  teamSlot: number             // original draft position (NEVER changes)
  currentOwnerTeamSlot: number // who owns this pick — starts equal to teamSlot
  playerId: string | null
}

export interface TradeRecord {
  id: string           // crypto.randomUUID() or `trade-${Date.now()}`
  opponentSlot: number // which team you traded with
  youGive: { round: number; teamSlot: number }[]    // picks going to opponent
  youReceive: { round: number; teamSlot: number }[] // picks coming to you
}

export interface DraftState {
  schemaVersion: 1
  version: number          // 0 for solo drafts; monotonic counter for multiplayer
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
