const CURSES: readonly string[] = [
  'The Oracle Burden',
  'Last Place Laureate',
  'The Prophecy Misser',
  'Certified Bad Take',
  'The Accidental Contrarian',
  'Draft Room Disaster',
  'The Cursed Oracle',
  'Bottom of the Leaderboard',
  'The Humbled Analyst',
  'Chief Overthinking Officer',
  'The Reverse Oracle',
  'Fantasy GM Emeritus (Retired)',
]

/** Returns a rotating funny title for the last-place user. Deterministic per week. */
export function getLastPlaceCurse(week: number): string {
  return CURSES[week % CURSES.length]
}
