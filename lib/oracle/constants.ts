export const ORACLE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type OraclePosition = typeof ORACLE_POSITIONS[number]

/** How many players users rank per position */
export const POSITION_LIST_SIZE: Record<OraclePosition, number> = {
  QB: 10,
  RB: 10,
  WR: 10,
  TE: 10,
}

export const SCORING_ALGORITHM_VERSION = 'v1' as const
export type ScoringAlgorithmVersion = typeof SCORING_ALGORITHM_VERSION
