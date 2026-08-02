/**
 * GOLDEN FIXTURES — ALGORITHM v1
 *
 * These tests encode exact expected outputs for specific inputs.
 * They must NEVER be updated when "fixing" a bug — if they fail,
 * the algorithm changed. Add a new version instead.
 *
 * Changing these fixtures = changing the scoring contract for users.
 */
import { describe, it, expect } from 'vitest'
import { scorePosition, scoreEntry } from '../scoring'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Shared ground truth: top 10 QBs by cumulative PPR after Week 8 ──────────
const QB_GT: GroundTruthEntry[] = [
  { playerId: 'mahomes',   rank: 1,  pprPoints: 280 },
  { playerId: 'jallen',    rank: 2,  pprPoints: 265 },
  { playerId: 'lamar',     rank: 3,  pprPoints: 252 },
  { playerId: 'burrow',    rank: 4,  pprPoints: 240 },
  { playerId: 'hurts',     rank: 5,  pprPoints: 228 },
  { playerId: 'stroud',    rank: 6,  pprPoints: 215 },
  { playerId: 'lawrence',  rank: 7,  pprPoints: 203 },
  { playerId: 'love',      rank: 8,  pprPoints: 191 },
  { playerId: 'stafford',  rank: 9,  pprPoints: 178 },
  { playerId: 'cousins',   rank: 10, pprPoints: 165 },
]

// ─── Fixture 1: Perfect QB score ─────────────────────────────────────────────
describe('Fixture 1: Perfect QB ranking', () => {
  const userPicks: RankingRow[] = [
    { playerRank: 1,  playerId: 'mahomes',  playerName: 'Patrick Mahomes' },
    { playerRank: 2,  playerId: 'jallen',   playerName: 'Josh Allen' },
    { playerRank: 3,  playerId: 'lamar',    playerName: 'Lamar Jackson' },
    { playerRank: 4,  playerId: 'burrow',   playerName: 'Joe Burrow' },
    { playerRank: 5,  playerId: 'hurts',    playerName: 'Jalen Hurts' },
    { playerRank: 6,  playerId: 'stroud',   playerName: 'CJ Stroud' },
    { playerRank: 7,  playerId: 'lawrence', playerName: 'Trevor Lawrence' },
    { playerRank: 8,  playerId: 'love',     playerName: 'Jordan Love' },
    { playerRank: 9,  playerId: 'stafford', playerName: 'Matthew Stafford' },
    { playerRank: 10, playerId: 'cousins',  playerName: 'Kirk Cousins' },
  ]

  it('score = 100, top10Hits = 10, totalRankError = 0', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(100)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(0)
  })
})

// ─── Fixture 2: All misses (busted QB picks) ─────────────────────────────────
describe('Fixture 2: Complete QB miss', () => {
  const userPicks: RankingRow[] = [
    { playerRank: 1,  playerId: 'darnold', playerName: 'Sam Darnold' },
    { playerRank: 2,  playerId: 'flacco',  playerName: 'Joe Flacco' },
    { playerRank: 3,  playerId: 'minshew', playerName: 'Gardner Minshew' },
    { playerRank: 4,  playerId: 'jones',   playerName: 'Mac Jones' },
    { playerRank: 5,  playerId: 'pickett', playerName: 'Kenny Pickett' },
    { playerRank: 6,  playerId: 'ridder',  playerName: 'Desmond Ridder' },
    { playerRank: 7,  playerId: 'nix',     playerName: 'Bo Nix' },
    { playerRank: 8,  playerId: 'penix',   playerName: 'Michael Penix' },
    { playerRank: 9,  playerId: 'hooker',  playerName: 'Hendon Hooker' },
    { playerRank: 10, playerId: 'daniel',  playerName: 'Chase Daniel' },
  ]

  it('score = 0, top10Hits = 0, totalRankError = 0', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
    expect(result.totalRankError).toBe(0)
    result.details.forEach(d => expect(d.points).toBe(0))
  })
})

// ─── Fixture 3: 7 hits at various distances, 3 misses ────────────────────────
describe('Fixture 3: Mixed QB performance', () => {
  // User#1 → mahomes actual#1  → |1-1|=0 → 10 pts
  // User#2 → lamar   actual#3  → |2-3|=1 → 9 pts
  // User#3 → jallen  actual#2  → |3-2|=1 → 9 pts
  // User#4 → burrow  actual#4  → |4-4|=0 → 10 pts
  // User#5 → stroud  actual#6  → |5-6|=1 → 9 pts
  // User#6 → cousins actual#10 → |6-10|=4 → 6 pts
  // User#7 → love    actual#8  → |7-8|=1 → 9 pts
  // User#8 → darnold  (miss)   → 0 pts
  // User#9 → flacco   (miss)   → 0 pts
  // User#10→ minshew  (miss)   → 0 pts
  // score = 10+9+9+10+9+6+9 = 62, top10Hits=7, totalRankError=0+1+1+0+1+4+1=8
  const userPicks: RankingRow[] = [
    { playerRank: 1,  playerId: 'mahomes', playerName: 'Mahomes' },
    { playerRank: 2,  playerId: 'lamar',   playerName: 'Lamar' },
    { playerRank: 3,  playerId: 'jallen',  playerName: 'Allen' },
    { playerRank: 4,  playerId: 'burrow',  playerName: 'Burrow' },
    { playerRank: 5,  playerId: 'stroud',  playerName: 'Stroud' },
    { playerRank: 6,  playerId: 'cousins', playerName: 'Cousins' },
    { playerRank: 7,  playerId: 'love',    playerName: 'Love' },
    { playerRank: 8,  playerId: 'darnold', playerName: 'Darnold' },
    { playerRank: 9,  playerId: 'flacco',  playerName: 'Flacco' },
    { playerRank: 10, playerId: 'minshew', playerName: 'Minshew' },
  ]

  it('score = 62, top10Hits = 7, totalRankError = 8', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(62)
    expect(result.top10Hits).toBe(7)
    expect(result.totalRankError).toBe(8)
  })
})

// ─── Fixture 4: Correct players, reversed order (max rank error within top 10) ─
describe('Fixture 4: Reversed QB order (all hits, max rank error)', () => {
  // User#1 → cousins  actual#10 → |1-10|=9 → 1 pt
  // User#2 → stafford actual#9  → |2-9|=7  → 3 pts
  // User#3 → love     actual#8  → |3-8|=5  → 5 pts
  // User#4 → lawrence actual#7  → |4-7|=3  → 7 pts
  // User#5 → stroud   actual#6  → |5-6|=1  → 9 pts
  // User#6 → hurts    actual#5  → |6-5|=1  → 9 pts
  // User#7 → burrow   actual#4  → |7-4|=3  → 7 pts
  // User#8 → lamar    actual#3  → |8-3|=5  → 5 pts
  // User#9 → jallen   actual#2  → |9-2|=7  → 3 pts
  // User#10→ mahomes  actual#1  → |10-1|=9 → 1 pt
  // score = 1+3+5+7+9+9+7+5+3+1 = 50, totalRankError = 9+7+5+3+1+1+3+5+7+9 = 50
  const userPicks: RankingRow[] = [
    { playerRank: 1,  playerId: 'cousins',  playerName: 'Cousins' },
    { playerRank: 2,  playerId: 'stafford', playerName: 'Stafford' },
    { playerRank: 3,  playerId: 'love',     playerName: 'Love' },
    { playerRank: 4,  playerId: 'lawrence', playerName: 'Lawrence' },
    { playerRank: 5,  playerId: 'stroud',   playerName: 'Stroud' },
    { playerRank: 6,  playerId: 'hurts',    playerName: 'Hurts' },
    { playerRank: 7,  playerId: 'burrow',   playerName: 'Burrow' },
    { playerRank: 8,  playerId: 'lamar',    playerName: 'Lamar' },
    { playerRank: 9,  playerId: 'jallen',   playerName: 'Allen' },
    { playerRank: 10, playerId: 'mahomes',  playerName: 'Mahomes' },
  ]

  it('score = 50, top10Hits = 10, totalRankError = 50', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(50)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(50)
  })
})

// ─── Fixture 5: Full entry — all 4 positions with known scores ───────────────
describe('Fixture 5: Full entry overallScore', () => {
  const perfectRows: RankingRow[] = QB_GT.map(g => ({
    playerRank: g.rank,
    playerId: g.playerId,
    playerName: g.playerId,
  }))
  const allMissRows: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
    playerRank: i + 1,
    playerId: `miss${i}`,
    playerName: `Miss ${i}`,
  }))
  const halfHitRows: RankingRow[] = [
    ...QB_GT.slice(0, 5).map(g => ({ playerRank: g.rank, playerId: g.playerId, playerName: g.playerId })),
    ...Array.from({ length: 5 }, (_, i) => ({ playerRank: 6 + i, playerId: `miss${i}`, playerName: `Miss ${i}` })),
  ]
  // All adjacent-pair swaps → every player off by exactly 1 → 9 pts each → score = 90
  const offBy1Rows: RankingRow[] = [
    { playerRank: 1,  playerId: 'jallen',   playerName: 'Allen' },    // actual 2, dist=1, 9pt
    { playerRank: 2,  playerId: 'mahomes',  playerName: 'Mahomes' },  // actual 1, dist=1, 9pt
    { playerRank: 3,  playerId: 'burrow',   playerName: 'Burrow' },   // actual 4, dist=1, 9pt
    { playerRank: 4,  playerId: 'lamar',    playerName: 'Lamar' },    // actual 3, dist=1, 9pt
    { playerRank: 5,  playerId: 'stroud',   playerName: 'Stroud' },   // actual 6, dist=1, 9pt
    { playerRank: 6,  playerId: 'hurts',    playerName: 'Hurts' },    // actual 5, dist=1, 9pt
    { playerRank: 7,  playerId: 'love',     playerName: 'Love' },     // actual 8, dist=1, 9pt
    { playerRank: 8,  playerId: 'lawrence', playerName: 'Lawrence' }, // actual 7, dist=1, 9pt
    { playerRank: 9,  playerId: 'cousins',  playerName: 'Cousins' },  // actual 10, dist=1, 9pt
    { playerRank: 10, playerId: 'stafford', playerName: 'Stafford' }, // actual 9, dist=1, 9pt
  ]

  // QB: perfect=100, RB: all miss=0, WR: half hit=50, TE: all off by 1=90
  // overallScore = (100+0+50+90)/4 = 60
  it('overallScore = 60 for mixed positions', () => {
    const entry = scoreEntry(
      { QB: perfectRows, RB: allMissRows, WR: halfHitRows, TE: offBy1Rows },
      { QB: QB_GT, RB: QB_GT, WR: QB_GT, TE: QB_GT },
    )
    expect(entry.positions.QB.score).toBe(100)
    expect(entry.positions.RB.score).toBe(0)
    expect(entry.positions.WR.score).toBe(50)
    expect(entry.positions.TE.score).toBe(90)
    expect(entry.overallScore).toBe(60)
  })
})
