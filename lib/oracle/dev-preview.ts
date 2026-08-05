/**
 * Developer-only Oracle preview mode.
 * Active only in development (NODE_ENV=development).
 *
 * Set state via the /admin/preview page (sets cookie __oracle_preview).
 * Valid states: 'locked' | 'week1' | 'midseason' | 'scored'
 */
import { cookies } from 'next/headers'
import type { Season } from './season'

export type PreviewState = 'locked' | 'week1' | 'midseason' | 'scored'

const VALID_STATES: PreviewState[] = ['locked', 'week1', 'midseason', 'scored']

export async function getPreviewState(): Promise<PreviewState | null> {
  if (process.env.NODE_ENV !== 'development') return null
  try {
    const cookieStore = await cookies()
    const value = cookieStore.get('__oracle_preview')?.value ?? ''
    return VALID_STATES.includes(value as PreviewState) ? (value as PreviewState) : null
  } catch {
    return null
  }
}

// ── Time helpers ──────────────────────────────────────────────────────────────

function ago(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

// ── Mock season ────────────────────────────────────────────────────────────────

export const PREVIEW_SEASON_ID = 'preview-2026'

export function mockSeason(state: PreviewState): Season {
  return {
    id: PREVIEW_SEASON_ID,
    year: 2026,
    name: '2026 Oracle Challenge',
    lock_at: ago(7), // locked 7 days ago in all preview states
    scored_at: state === 'scored' ? ago(3) : null,
    status: state === 'scored' ? 'scored' : state === 'locked' ? 'locked' : 'scoring',
  }
}

// ── Mock accuracy scores ───────────────────────────────────────────────────────

export interface MockAccuracyScore {
  overall_score: number
  score_qb: number
  score_rb: number
  score_wr: number
  score_te: number
  global_rank: number | null
  rank_change: number | null
  current_week: number
  computed_at: string | null
}

export function mockAccuracyScore(state: PreviewState): MockAccuracyScore | null {
  if (state === 'locked') return null

  const configs = {
    week1:     { score: 71.4, qb: 75.5, rb: 63.2, wr: 74.1, te: 72.8, rank: 47,  change: null as null, week: 1  },
    midseason: { score: 68.2, qb: 72.1, rb: 59.4, wr: 70.8, te: 70.5, rank: 312, change: -15,          week: 9  },
    scored:    { score: 73.8, qb: 80.2, rb: 62.1, wr: 76.4, te: 76.5, rank: 89,  change: 8,            week: 18 },
  }

  const c = configs[state as keyof typeof configs]
  return {
    overall_score: c.score,
    score_qb: c.qb,
    score_rb: c.rb,
    score_wr: c.wr,
    score_te: c.te,
    global_rank: c.rank,
    rank_change: c.change,
    current_week: c.week,
    computed_at: ago(2),
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MOCK_TOTAL_PARTICIPANTS = 247

// ── Mock ranking score detail ─────────────────────────────────────────────────

export interface MockDetailRow {
  position: string
  player_id: string
  player_name: string
  user_rank: number
  actual_rank: number | null
  distance: number | null
  final_score: number
}

// User's predicted rankings vs actual finish — crafted to show a variety of outcomes
const MOCK_PICKS: Record<string, Array<{ id: string; name: string; actual: number | null }>> = {
  QB: [
    { id: 'qb1',  name: 'Josh Allen',          actual: 1  },  // Perfect
    { id: 'qb2',  name: 'Lamar Jackson',       actual: 2  },  // Perfect
    { id: 'qb3',  name: 'Jalen Hurts',         actual: 4  },
    { id: 'qb4',  name: 'Patrick Mahomes',     actual: 3  },
    { id: 'qb5',  name: 'Joe Burrow',          actual: 6  },
    { id: 'qb6',  name: 'C.J. Stroud',         actual: 5  },
    { id: 'qb7',  name: 'Dak Prescott',        actual: 8  },
    { id: 'qb8',  name: 'Anthony Richardson',  actual: 7  },
    { id: 'qb9',  name: 'Brock Purdy',         actual: 10 },
    { id: 'qb10', name: 'Sam Darnold',         actual: 9  },
  ],
  RB: [
    { id: 'rb1',  name: 'Christian McCaffrey', actual: 4  },  // Big miss
    { id: 'rb2',  name: 'Saquon Barkley',      actual: 1  },  // Great pick
    { id: 'rb3',  name: 'Breece Hall',         actual: 2  },
    { id: 'rb4',  name: 'Bijan Robinson',      actual: 3  },
    { id: 'rb5',  name: "De'Von Achane",       actual: 6  },
    { id: 'rb6',  name: 'Jonathan Taylor',     actual: 8  },
    { id: 'rb7',  name: 'Derrick Henry',       actual: 5  },
    { id: 'rb8',  name: 'Travis Etienne',      actual: 9  },
    { id: 'rb9',  name: 'Isiah Pacheco',       actual: 7  },
    { id: 'rb10', name: 'Tony Pollard',        actual: null }, // Didn't crack top 10
  ],
  WR: [
    { id: 'wr1',  name: 'CeeDee Lamb',         actual: 1  },
    { id: 'wr2',  name: 'Justin Jefferson',    actual: 2  },
    { id: 'wr3',  name: 'Tyreek Hill',         actual: 3  },
    { id: 'wr4',  name: 'A.J. Brown',          actual: 5  },
    { id: 'wr5',  name: 'Amon-Ra St. Brown',   actual: 4  },
    { id: 'wr6',  name: 'Davante Adams',       actual: 6  },
    { id: 'wr7',  name: 'Stefon Diggs',        actual: 8  },
    { id: 'wr8',  name: 'Deebo Samuel',        actual: 7  },
    { id: 'wr9',  name: 'Keenan Allen',        actual: 9  },
    { id: 'wr10', name: 'Tee Higgins',         actual: 10 },
  ],
  TE: [
    { id: 'te1',  name: 'Travis Kelce',        actual: 1  },  // Perfect
    { id: 'te2',  name: 'Sam LaPorta',         actual: 2  },
    { id: 'te3',  name: 'T.J. Hockenson',      actual: 5  },
    { id: 'te4',  name: 'Mark Andrews',        actual: 3  },
    { id: 'te5',  name: 'Dallas Goedert',      actual: 4  },
    { id: 'te6',  name: 'Evan Engram',         actual: 7  },
    { id: 'te7',  name: 'Jake Ferguson',       actual: 6  },
    { id: 'te8',  name: 'Cole Kmet',           actual: 9  },
    { id: 'te9',  name: 'David Njoku',         actual: 8  },
    { id: 'te10', name: 'Kyle Pitts',          actual: 10 },
  ],
}

export function mockDetailRows(): MockDetailRow[] {
  const rows: MockDetailRow[] = []
  for (const [pos, players] of Object.entries(MOCK_PICKS)) {
    players.forEach((p, i) => {
      const userRank = i + 1
      const distance = p.actual !== null ? Math.abs(userRank - p.actual) : null
      rows.push({
        position: pos,
        player_id: p.id,
        player_name: p.name,
        user_rank: userRank,
        actual_rank: p.actual,
        distance,
        final_score: distance !== null ? Math.max(0, 10 - distance) : 0,
      })
    })
  }
  return rows
}

// ── Mock raw rankings (for profile ranking preview) ───────────────────────────

export function mockRawRankings(): Array<{ position: string; rankings: unknown }> {
  return Object.entries(MOCK_PICKS).map(([pos, players]) => ({
    position: pos,
    rankings: players.map((p, i) => ({
      playerRank: i + 1,
      playerId: p.id,
      playerName: p.name,
    })),
  }))
}

// ── Mock leaderboard data ─────────────────────────────────────────────────────

export interface MockLeaderboardScore {
  user_id: string
  overall_score: number
  global_rank: number
  rank_change: number | null
  current_week: number
  computed_at: string
}

export interface MockLeaderboardProfile {
  user_id: string
  display_name: string
  username: string
  avatar_url: null
}

const MOCK_USERS = [
  { name: 'Jordan Williams',  username: 'jwilliams'  },
  { name: 'Alex Chen',        username: 'achen'      },
  { name: 'Sam Rodriguez',    username: 'srodriguez' },
  { name: 'Casey Davis',      username: 'cdavis'     },
  { name: 'Morgan Lee',       username: 'mlee'       },
  { name: 'Riley Brown',      username: 'rbrown'     },
  { name: 'Drew Kim',         username: 'dkim'       },
  { name: 'Jamie Park',       username: 'jpark'      },
  { name: 'Taylor Singh',     username: 'tsingh'     },
  { name: 'Dana Wilson',      username: 'dwilson'    },
]

export function mockLeaderboardScores(state: PreviewState): MockLeaderboardScore[] {
  const week = state === 'week1' ? 1 : state === 'midseason' ? 9 : 18
  return MOCK_USERS.map((_, i) => ({
    user_id: `preview-user-${i}`,
    overall_score: parseFloat((82 - i * 2.3).toFixed(1)),
    global_rank: i + 1,
    rank_change: state === 'week1' ? null : (i % 3 === 0 ? 3 : i % 3 === 1 ? -2 : 0),
    current_week: week,
    computed_at: ago(2),
  }))
}

export function mockLeaderboardProfiles(): MockLeaderboardProfile[] {
  return MOCK_USERS.map((u, i) => ({
    user_id: `preview-user-${i}`,
    display_name: u.name,
    username: u.username,
    avatar_url: null,
  }))
}

// ── Mock recent entrants (pre-scoring leaderboard) ────────────────────────────

export interface MockRecentEntrant {
  user_id: string
  updated_at: string
}

export function mockRecentEntrants(): MockRecentEntrant[] {
  return MOCK_USERS.map((_, i) => ({
    user_id: `preview-user-${i}`,
    updated_at: ago(i * 0.3 + 0.1),
  }))
}
