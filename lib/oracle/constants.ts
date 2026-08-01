/** Lock date for The Oracle Challenge 2026.
 *  Wednesday September 9, 2026 — NFL Week 1 opening kickoff (8:20 PM ET). */
export const ORACLE_LOCK_DATE = new Date('2026-09-09T20:20:00-04:00')

export const ORACLE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type OraclePosition = typeof ORACLE_POSITIONS[number]

/** How many players users rank per position */
export const POSITION_LIST_SIZE: Record<OraclePosition, number> = {
  QB: 10,
  RB: 10,
  WR: 10,
  TE: 10,
}
