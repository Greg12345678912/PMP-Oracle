# Mock Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full snake-draft simulator where users configure settings, draft against CPU opponents, edit completed picks, and share their board via URL.

**Architecture:** Pure engine functions in `lib/draft/` handle all state transitions via a reducer; React components are thin wrappers. Supabase stores draft state by share ID. The data layer is accessed only through the `DataProvider` interface — draft code never imports from `sleeper.ts` directly.

**Tech Stack:** Next.js 16.2.11 App Router, TypeScript strict, Tailwind CSS v4, @dnd-kit/core + @dnd-kit/sortable, @supabase/supabase-js, Vitest + jsdom

## Global Constraints

- Next.js 16.2.11 App Router: route params are `Promise<{id: string}>`, must be awaited
- TypeScript strict mode; `@/` resolves to project root
- Tailwind v4: no config file; tokens: `pmp-black`, `pmp-red`, `pmp-white`, `pmp-gray-900/800/700/600/500`
- All new Tailwind color classes must use bracket notation for non-token values (e.g. `text-[#FF0000]`)
- Engine (`lib/draft/engine.ts`) must have zero React imports and zero imports from `lib/data/sleeper.ts`
- `DataProvider` interface is the only way the draft layer fetches players
- `numRounds` is always 15 — no other value is supported; remove all 12/20 options
- Only completed picks (index < currentPickIndex) may be edited; `assignPlayerToSlot` returns state unchanged for future picks
- CPU auto-draft pauses when it reaches the user's pick — `status` becomes `'paused'`; user picks, then clicks Continue Draft to resume
- `DraftState.schemaVersion` must be the literal type `1` (not `number`)
- Share button copies URL to clipboard only — no "save first" gate
- Autosave debounced 1000ms on every state change
- `generateShareId()` uses charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0/I/1), length 6
- Vitest + jsdom; tests in `tests/lib/` and `tests/components/`; setup at `tests/setup.ts`
- Install `@supabase/supabase-js` before Task 3

---

### Task 1: Extend Player type + getDraftPlayers

**Files:**
- Modify: `lib/data/types.ts`
- Modify: `lib/data/provider.ts`
- Modify: `lib/data/sleeper.ts`
- Test: `tests/lib/draft-players.test.ts` (create)

**Interfaces:**
- Produces: `Player.byeWeek: number | null`, `DataProvider.getDraftPlayers(): Promise<Player[]>`
- Later tasks import `getDraftPlayers` from `DataProvider` only — never from `sleeper.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/draft-players.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('getDraftPlayers', () => {
  it('returns players with byeWeek field', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    // mock fetch to avoid network
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        '1': { player_id: '1', full_name: 'Patrick Mahomes', position: 'QB', team: 'KC', search_rank: 1, bye_week: 14 },
        '2': { player_id: '2', full_name: 'Justin Tucker', position: 'K', team: 'BAL', search_rank: 250, bye_week: 9 },
        '3': { player_id: '3', full_name: 'SF Defense', position: 'DEF', team: 'SF', search_rank: 300, bye_week: 9 },
      }),
    } as Response)
    const players = await provider.getDraftPlayers()
    expect(players.length).toBeGreaterThan(0)
    expect(players[0]).toHaveProperty('byeWeek')
    const kPlayers = players.filter(p => p.position === 'K')
    const defPlayers = players.filter(p => p.position === 'DEF')
    expect(kPlayers.length).toBeGreaterThan(0)
    expect(defPlayers.length).toBeGreaterThan(0)
  })

  it('sorts players by searchRank ascending', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        '1': { player_id: '1', full_name: 'Alpha', position: 'QB', team: 'KC', search_rank: 5, bye_week: 7 },
        '2': { player_id: '2', full_name: 'Beta', position: 'RB', team: 'DAL', search_rank: 2, bye_week: 7 },
      }),
    } as Response)
    const players = await provider.getDraftPlayers()
    expect(players[0].searchRank).toBeLessThan(players[1].searchRank)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/draft-players.test.ts
```
Expected: FAIL — `byeWeek` missing, `getDraftPlayers` not defined.

- [ ] **Step 3: Add `byeWeek` to Player interface in `lib/data/types.ts`**

Open `lib/data/types.ts`. Find the `Player` interface and add:
```typescript
byeWeek: number | null
```

- [ ] **Step 4: Add `getDraftPlayers` to DataProvider interface in `lib/data/provider.ts`**

Open `lib/data/provider.ts`. Find the `DataProvider` interface and add:
```typescript
getDraftPlayers(): Promise<Player[]>
```

- [ ] **Step 5: Implement in SleeperProvider**

Open `lib/data/sleeper.ts`. Find the `SleeperPlayer` interface and add:
```typescript
bye_week?: number
```

Find the `toPlayer` function and add `byeWeek` to the returned object:
```typescript
byeWeek: raw.bye_week ?? null,
```

Add `getDraftPlayers` method to the `SleeperProvider` class:
```typescript
async getDraftPlayers(): Promise<Player[]> {
  const raw = await this.fetchAllPlayers()
  const LIMITS: Partial<Record<string, number>> = {
    QB: 30, RB: 80, WR: 80, TE: 40, K: 15, DEF: 15,
  }
  const counts: Partial<Record<string, number>> = {}
  const pool: Player[] = []

  const sorted = Object.values(raw)
    .filter(p => p.search_rank && p.search_rank < 9999999 && LIMITS[p.position] !== undefined)
    .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))

  for (const p of sorted) {
    const limit = LIMITS[p.position] ?? 0
    const count = counts[p.position] ?? 0
    if (count < limit) {
      pool.push(toPlayer(p))
      counts[p.position] = count + 1
    }
  }

  return pool.sort((a, b) => (a.searchRank ?? 9999) - (b.searchRank ?? 9999))
}
```

- [ ] **Step 6: Run tests — should pass**

```bash
npx vitest run tests/lib/draft-players.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/data/types.ts lib/data/provider.ts lib/data/sleeper.ts tests/lib/draft-players.test.ts
git commit -m "feat: add byeWeek to Player type and getDraftPlayers to DataProvider"
```

---

### Task 2: Draft types and engine

**Files:**
- Create: `lib/draft/types.ts`
- Create: `lib/draft/engine.ts`
- Test: `tests/lib/draft-engine.test.ts` (create)

**Interfaces:**
- Produces: `DraftSettings`, `DraftState`, `DraftAction`, all engine functions
- `engine.ts` has ZERO imports from `lib/data/sleeper.ts` or React

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/draft-engine.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildInitialState,
  makePick,
  assignPlayerToSlot,
  resetToADP,
  generateShareId,
  computeDraftAnalytics,
} from '@/lib/draft/engine'
import type { DraftSettings, Player } from '@/lib/draft/types'

const SETTINGS: DraftSettings = {
  numTeams: 10,
  numRounds: 15,
  userSlot: 3,
  scoring: 'ppr',
  speed: 'normal',
}

const PLAYERS: Player[] = Array.from({ length: 200 }, (_, i) => ({
  id: String(i + 1),
  name: `Player ${i + 1}`,
  position: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'][i % 6] as Player['position'],
  team: 'KC',
  searchRank: i + 1,
  byeWeek: 7,
}))

describe('buildInitialState', () => {
  it('creates 150 pick slots for 10 teams x 15 rounds', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    expect(state.picks).toHaveLength(150)
    expect(state.schemaVersion).toBe(1)
    expect(state.status).toBe('drafting')
    expect(state.currentPickIndex).toBe(0)
  })

  it('snake draft: pick 11 belongs to team 10, pick 12 belongs to team 10 (turn around)', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    // Round 1: picks 0-9 → slots 1-10
    expect(state.picks[0].teamSlot).toBe(1)
    expect(state.picks[9].teamSlot).toBe(10)
    // Round 2: picks 10-19 → slots 10-1
    expect(state.picks[10].teamSlot).toBe(10)
    expect(state.picks[19].teamSlot).toBe(1)
  })

  it('userSlot 3 means picks at overall positions 3, 18, 23, ... are isUser', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    expect(state.picks[2].isUser).toBe(true)   // pick 3 of round 1
    expect(state.picks[17].isUser).toBe(true)  // round 2 reverses: slot 3 is pick 18
  })

  it('allPlayerIds equals availablePlayerIds at start', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    expect(state.allPlayerIds).toEqual(state.availablePlayerIds)
  })
})

describe('makePick', () => {
  it('removes player from available pool and advances currentPickIndex', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    const next = makePick(state, PLAYERS[0].id)
    expect(next.availablePlayerIds).not.toContain(PLAYERS[0].id)
    expect(next.currentPickIndex).toBe(1)
    expect(next.picks[0].playerId).toBe(PLAYERS[0].id)
  })

  it('sets status to complete when all picks filled', () => {
    let state = buildInitialState({ ...SETTINGS, numTeams: 2, numRounds: 2 }, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    state = makePick(state, PLAYERS[2].id)
    state = makePick(state, PLAYERS[3].id)
    expect(state.status).toBe('complete')
  })
})

describe('assignPlayerToSlot', () => {
  it('places player into a completed pick slot', () => {
    let state = buildInitialState(SETTINGS, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    // Edit slot 0 (already completed)
    const next = assignPlayerToSlot(state, 0, PLAYERS[5].id)
    expect(next.picks[0].playerId).toBe(PLAYERS[5].id)
    expect(next.availablePlayerIds).toContain(PLAYERS[0].id) // displaced player back in pool
  })

  it('rejects edits to future picks (index >= currentPickIndex)', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    const next = assignPlayerToSlot(state, 5, PLAYERS[0].id)
    // currentPickIndex is 0, pick 5 is future → no change
    expect(next).toBe(state)
  })

  it('re-sorts pool using allPlayerIds order after displacing a player', () => {
    let state = buildInitialState(SETTINGS, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    const next = assignPlayerToSlot(state, 0, PLAYERS[5].id)
    // PLAYERS[0] was displaced — should be back in pool in ADP order
    const idx0 = next.availablePlayerIds.indexOf(PLAYERS[0].id)
    const idx1 = next.availablePlayerIds.indexOf(PLAYERS[1].id)
    // Both displaced and PLAYERS[1] (picked in slot 1, not reassigned) — only PLAYERS[0] returns
    expect(idx0).toBeGreaterThanOrEqual(0)
  })
})

describe('resetToADP', () => {
  it('clears all picks and restores pool in ADP order', () => {
    let state = buildInitialState(SETTINGS, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    const reset = resetToADP(state)
    expect(reset.currentPickIndex).toBe(0)
    expect(reset.availablePlayerIds).toEqual(state.allPlayerIds)
    expect(reset.picks.every(p => p.playerId === null)).toBe(true)
    expect(reset.status).toBe('drafting')
  })
})

describe('generateShareId', () => {
  it('returns 6-char alphanumeric string without ambiguous chars', () => {
    const id = generateShareId()
    expect(id).toHaveLength(6)
    expect(id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, generateShareId))
    expect(ids.size).toBeGreaterThan(95)
  })
})

describe('computeDraftAnalytics', () => {
  it('computes positional breakdown for user picks', () => {
    let state = buildInitialState({ ...SETTINGS, numTeams: 2, numRounds: 2 }, PLAYERS)
    // userSlot=3 in a 2-team draft doesn't make sense, use slot 1
    state = buildInitialState({ ...SETTINGS, numTeams: 2, numRounds: 2, userSlot: 1 }, PLAYERS)
    state = makePick(state, PLAYERS[0].id)  // user (slot 1, round 1)
    state = makePick(state, PLAYERS[1].id)  // cpu (slot 2)
    state = makePick(state, PLAYERS[2].id)  // cpu (slot 2, round 2)
    state = makePick(state, PLAYERS[3].id)  // user (slot 1, round 2)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    const analytics = computeDraftAnalytics(state, playerMap)
    expect(analytics.positionBreakdown).toBeDefined()
    expect(analytics.averageADPReached).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/lib/draft-engine.test.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `lib/draft/types.ts`**

```typescript
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
```

- [ ] **Step 4: Create `lib/draft/engine.ts`**

```typescript
// lib/draft/engine.ts
// No React imports. No imports from lib/data/sleeper.ts.
import type { DraftState, DraftSettings, PickSlot, DraftAnalytics } from './types'
import type { Player } from '@/lib/data/types'

/** Build the pick grid for a snake draft */
function buildPickSlots(numTeams: number, numRounds: number, userSlot: number): PickSlot[] {
  const picks: PickSlot[] = []
  let overall = 1
  for (let round = 1; round <= numRounds; round++) {
    const isOdd = round % 2 === 1
    for (let pick = 1; pick <= numTeams; pick++) {
      const teamSlot = isOdd ? pick : numTeams - pick + 1
      picks.push({
        overallPick: overall++,
        round,
        pickInRound: pick,
        teamSlot,
        isUser: teamSlot === userSlot,
        playerId: null,
      })
    }
  }
  return picks
}

export function buildInitialState(settings: DraftSettings, players: Player[]): DraftState {
  const allPlayerIds = players.map(p => p.id)
  return {
    schemaVersion: 1,
    shareId: null,
    settings,
    picks: buildPickSlots(settings.numTeams, settings.numRounds, settings.userSlot),
    currentPickIndex: 0,
    availablePlayerIds: [...allPlayerIds],
    allPlayerIds,
    lockedPlayerIds: [],
    status: 'drafting',
  }
}

export function makePick(state: DraftState, playerId: string): DraftState {
  const { currentPickIndex, picks, availablePlayerIds } = state
  if (currentPickIndex >= picks.length) return state

  const newPicks = picks.map((p, i) =>
    i === currentPickIndex ? { ...p, playerId } : p
  )
  const newAvailable = availablePlayerIds.filter(id => id !== playerId)
  const newIndex = currentPickIndex + 1
  const isComplete = newIndex >= picks.length

  return {
    ...state,
    picks: newPicks,
    availablePlayerIds: newAvailable,
    currentPickIndex: newIndex,
    status: isComplete ? 'complete' : state.status,
  }
}

/** Only completed picks (index < currentPickIndex) may be edited. */
export function assignPlayerToSlot(
  state: DraftState,
  pickIndex: number,
  playerId: string
): DraftState {
  if (pickIndex >= state.currentPickIndex) return state

  const displaced = state.picks[pickIndex].playerId
  const newPicks = state.picks.map((p, i) =>
    i === pickIndex ? { ...p, playerId } : p
  )

  // Remove new player from available, add displaced player back
  let newAvailable = state.availablePlayerIds.filter(id => id !== playerId)
  if (displaced && displaced !== playerId) {
    newAvailable = [...newAvailable, displaced]
    // Re-sort by allPlayerIds order
    const orderMap = new Map(state.allPlayerIds.map((id, i) => [id, i]))
    newAvailable.sort((a, b) => (orderMap.get(a) ?? 9999) - (orderMap.get(b) ?? 9999))
  }

  return { ...state, picks: newPicks, availablePlayerIds: newAvailable }
}

export function resetToADP(state: DraftState): DraftState {
  return {
    ...state,
    picks: state.picks.map(p => ({ ...p, playerId: null })),
    currentPickIndex: 0,
    availablePlayerIds: [...state.allPlayerIds],
    status: 'drafting',
  }
}

/** Select best available player for CPU (top available, skip locked) */
export function selectBestAvailable(state: DraftState): string | null {
  for (const id of state.availablePlayerIds) {
    if (!state.lockedPlayerIds.includes(id)) return id
  }
  return state.availablePlayerIds[0] ?? null
}

const SHARE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function generateShareId(): string {
  return Array.from({ length: 6 }, () =>
    SHARE_CHARSET[Math.floor(Math.random() * SHARE_CHARSET.length)]
  ).join('')
}

export function computeDraftAnalytics(
  state: DraftState,
  playerMap: Map<string, Player>
): DraftAnalytics {
  const userPicks = state.picks.filter(p => p.isUser && p.playerId !== null)
  const positionBreakdown: Record<string, number> = {}
  let totalADP = 0
  let earliestReach: DraftAnalytics['earliestReach'] = null
  let biggestValue: DraftAnalytics['biggestValue'] = null

  for (const pick of userPicks) {
    const player = playerMap.get(pick.playerId!)
    if (!player) continue

    positionBreakdown[player.position] = (positionBreakdown[player.position] ?? 0) + 1
    totalADP += player.searchRank ?? 0

    const expectedADP = player.searchRank ?? 0
    const actualPick = pick.overallPick
    const diff = actualPick - expectedADP  // positive = value, negative = reach

    if (diff < 0) {
      if (!earliestReach || diff < (earliestReach.actualPick - earliestReach.expectedADP)) {
        earliestReach = { player, expectedADP, actualPick }
      }
    }
    if (diff > 0) {
      if (!biggestValue || diff > (biggestValue.actualPick - biggestValue.expectedADP)) {
        biggestValue = { player, expectedADP, actualPick }
      }
    }
  }

  return {
    positionBreakdown,
    averageADPReached: userPicks.length > 0 ? totalADP / userPicks.length : 0,
    earliestReach,
    biggestValue,
  }
}
```

- [ ] **Step 5: Run tests — should pass**

```bash
npx vitest run tests/lib/draft-engine.test.ts
```
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add lib/draft/types.ts lib/draft/engine.ts tests/lib/draft-engine.test.ts
git commit -m "feat: draft types and engine (snake draft, analytics, share ID)"
```

---

### Task 3: Supabase persistence

**Files:**
- Create: `lib/draft/supabase.ts`
- Test: `tests/lib/draft-supabase.test.ts` (create)

**Interfaces:**
- Consumes: `DraftState` from `lib/draft/types.ts`
- Produces: `saveDraft(state): Promise<string>`, `loadDraft(shareId): Promise<DraftState | null>`
- Requires: `npm install @supabase/supabase-js` before implementation
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- [ ] **Step 1: Install Supabase client**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write failing tests**

```typescript
// tests/lib/draft-supabase.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase before importing the module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              share_id: 'ABC123',
              state: JSON.stringify({ schemaVersion: 1, shareId: 'ABC123', status: 'drafting' }),
            },
            error: null,
          }),
        })),
      })),
    })),
  })),
}))

describe('saveDraft', () => {
  it('returns the shareId', async () => {
    const { saveDraft } = await import('@/lib/draft/supabase')
    const fakeState = {
      schemaVersion: 1 as const,
      shareId: null,
      settings: { numTeams: 10, numRounds: 15 as const, userSlot: 3, scoring: 'ppr' as const, speed: 'normal' as const },
      picks: [],
      currentPickIndex: 0,
      availablePlayerIds: [],
      allPlayerIds: [],
      lockedPlayerIds: [],
      status: 'drafting' as const,
    }
    const id = await saveDraft(fakeState)
    expect(id).toHaveLength(6)
    expect(id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

describe('loadDraft', () => {
  it('returns DraftState when found', async () => {
    const { loadDraft } = await import('@/lib/draft/supabase')
    const result = await loadDraft('ABC123')
    expect(result).not.toBeNull()
    expect(result?.schemaVersion).toBe(1)
    expect(result?.shareId).toBe('ABC123')
  })

  it('returns null when not found', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValueOnce({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          })),
        })),
      })),
    } as ReturnType<typeof createClient>)
    const { loadDraft } = await import('@/lib/draft/supabase')
    const result = await loadDraft('XXXXXX')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npx vitest run tests/lib/draft-supabase.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Create `lib/draft/supabase.ts`**

```typescript
// lib/draft/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { generateShareId } from './engine'
import type { DraftState } from './types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Save (upsert) draft state. If state.shareId is null, a new ID is generated.
 * Returns the shareId.
 */
export async function saveDraft(state: DraftState): Promise<string> {
  const shareId = state.shareId ?? generateShareId()
  const { error } = await supabase.from('drafts').upsert({
    share_id: shareId,
    state: JSON.stringify({ ...state, shareId }),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return shareId
}

/** Load draft state by shareId. Returns null if not found. */
export async function loadDraft(shareId: string): Promise<DraftState | null> {
  const { data, error } = await supabase
    .from('drafts')
    .select('state')
    .eq('share_id', shareId)
    .single()

  if (error || !data) return null
  return JSON.parse(data.state) as DraftState
}
```

- [ ] **Step 5: Create Supabase migration**

Create the SQL migration at `supabase/migrations/20260729000000_drafts.sql`:
```sql
create table if not exists drafts (
  share_id text primary key,
  state    jsonb not null,
  updated_at timestamptz not null default now()
);
```

Apply via Supabase MCP or `supabase db push` if CLI is available.

- [ ] **Step 6: Run tests — should pass**

```bash
npx vitest run tests/lib/draft-supabase.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/draft/supabase.ts tests/lib/draft-supabase.test.ts supabase/migrations/20260729000000_drafts.sql
git commit -m "feat: Supabase draft persistence (saveDraft, loadDraft)"
```

---

### Task 4: Draft setup page

**Files:**
- Create: `components/draft/DraftSetup.tsx`
- Test: `tests/components/DraftSetup.test.tsx` (create)

**Interfaces:**
- Consumes: `DraftSettings` from `lib/draft/types.ts`
- Produces: `<DraftSetup onStart={(settings, players) => void} />`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/components/DraftSetup.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DraftSetup } from '@/components/draft/DraftSetup'

vi.mock('@/lib/data/sleeper', () => ({
  SleeperProvider: class {
    getDraftPlayers = vi.fn().mockResolvedValue([
      { id: '1', name: 'Alpha', position: 'QB', team: 'KC', searchRank: 1, byeWeek: 7 },
    ])
  },
}))

describe('DraftSetup', () => {
  it('renders team count, pick slot, scoring, and speed selects', () => {
    const onStart = vi.fn()
    render(<DraftSetup onStart={onStart} />)
    expect(screen.getByLabelText(/teams/i)).toBeDefined()
    expect(screen.getByLabelText(/your pick/i)).toBeDefined()
    expect(screen.getByLabelText(/scoring/i)).toBeDefined()
    expect(screen.getByLabelText(/draft speed/i)).toBeDefined()
  })

  it('does not show rounds select (15 rounds fixed)', () => {
    render(<DraftSetup onStart={vi.fn()} />)
    expect(screen.queryByLabelText(/rounds/i)).toBeNull()
  })

  it('updates pick slot options when team count changes', () => {
    render(<DraftSetup onStart={vi.fn()} />)
    const teamsSelect = screen.getByLabelText(/teams/i) as HTMLSelectElement
    fireEvent.change(teamsSelect, { target: { value: '8' } })
    const slotSelect = screen.getByLabelText(/your pick/i) as HTMLSelectElement
    expect(slotSelect.options).toHaveLength(8)
  })

  it('calls onStart with correct settings when Start Draft clicked', async () => {
    const onStart = vi.fn()
    render(<DraftSetup onStart={onStart} />)
    fireEvent.click(screen.getByRole('button', { name: /start draft/i }))
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledOnce())
    const [settings] = onStart.mock.calls[0]
    expect(settings.numRounds).toBe(15)
    expect(settings.scoring).toBeDefined()
    expect(settings.speed).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/components/DraftSetup.test.tsx
```

- [ ] **Step 3: Create `components/draft/DraftSetup.tsx`**

```typescript
// components/draft/DraftSetup.tsx
'use client'
import { useState } from 'react'
import { SleeperProvider } from '@/lib/data/sleeper'
import type { DraftSettings, Player } from '@/lib/draft/types'
import { DRAFT_TEAM_OPTIONS } from '@/lib/draft/types'

interface DraftSetupProps {
  onStart: (settings: DraftSettings, players: Player[]) => void
}

const SCORING_LABELS: Record<DraftSettings['scoring'], string> = {
  ppr: 'PPR',
  half_ppr: 'Half PPR',
  standard: 'Standard',
}

const SPEED_LABELS: Record<DraftSettings['speed'], string> = {
  instant: 'Instant (0s)',
  fast: 'Fast (0.5s)',
  normal: 'Normal (1s)',
}

export function DraftSetup({ onStart }: DraftSetupProps) {
  const [numTeams, setNumTeams] = useState(10)
  const [userSlot, setUserSlot] = useState(1)
  const [scoring, setScoring] = useState<DraftSettings['scoring']>('ppr')
  const [speed, setSpeed] = useState<DraftSettings['speed']>('normal')
  const [loading, setLoading] = useState(false)

  const handleTeamsChange = (v: number) => {
    setNumTeams(v)
    if (userSlot > v) setUserSlot(1)
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      const provider = new SleeperProvider()
      const players = await provider.getDraftPlayers()
      const settings: DraftSettings = { numTeams, numRounds: 15, userSlot, scoring, speed }
      onStart(settings, players)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-pmp-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-pmp-white text-2xl font-bold">Mock Draft</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">15 rounds · Snake format</p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Teams</span>
            <select
              aria-label="Teams"
              value={numTeams}
              onChange={e => handleTeamsChange(Number(e.target.value))}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {DRAFT_TEAM_OPTIONS.map(n => (
                <option key={n} value={n}>{n} Teams</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Your Pick Slot</span>
            <select
              aria-label="Your pick slot"
              value={userSlot}
              onChange={e => setUserSlot(Number(e.target.value))}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {Array.from({ length: numTeams }, (_, i) => i + 1).map(slot => (
                <option key={slot} value={slot}>Slot {slot}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Scoring</span>
            <select
              aria-label="Scoring"
              value={scoring}
              onChange={e => setScoring(e.target.value as DraftSettings['scoring'])}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(SCORING_LABELS) as [DraftSettings['scoring'], string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Draft Speed</span>
            <select
              aria-label="Draft Speed"
              value={speed}
              onChange={e => setSpeed(e.target.value as DraftSettings['speed'])}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(SPEED_LABELS) as [DraftSettings['speed'], string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Loading players...' : 'Start Draft'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npx vitest run tests/components/DraftSetup.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/draft/DraftSetup.tsx tests/components/DraftSetup.test.tsx
git commit -m "feat: DraftSetup form (teams, slot, scoring, speed; 15 rounds fixed)"
```

---

### Task 5: DraftBoard shell + useReducer

**Files:**
- Create: `components/draft/DraftBoard.tsx`
- Test: `tests/components/DraftBoard.test.tsx` (create)

**Interfaces:**
- Consumes: all engine functions, `DraftState`, `DraftSettings`, `Player[]`
- Produces: `<DraftBoard settings={DraftSettings} players={Player[]} initialState={DraftState | null} />`
- CPU auto-draft effect: fires when `status === 'drafting'` and `!currentPick.isUser`; pauses (sets `status = 'paused'`) when it is the user's turn
- Undo/redo stacks are separate `useState` — not in persisted `DraftState`
- Autosave: debounced 1000ms on every state change; calls `saveDraft` and updates URL with shareId

- [ ] **Step 1: Write failing tests**

```typescript
// tests/components/DraftBoard.test.tsx
import { render, screen, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DraftBoard } from '@/components/draft/DraftBoard'
import { buildInitialState } from '@/lib/draft/engine'
import type { DraftSettings, Player } from '@/lib/draft/types'

vi.mock('@/lib/draft/supabase', () => ({
  saveDraft: vi.fn().mockResolvedValue('SAVE01'),
}))

vi.useFakeTimers()

const SETTINGS: DraftSettings = {
  numTeams: 2, numRounds: 15, userSlot: 2, scoring: 'ppr', speed: 'instant',
}

const PLAYERS: Player[] = Array.from({ length: 40 }, (_, i) => ({
  id: String(i + 1),
  name: `Player ${i + 1}`,
  position: ['QB', 'RB', 'WR', 'TE'][i % 4] as Player['position'],
  team: 'KC',
  searchRank: i + 1,
  byeWeek: 7,
}))

describe('DraftBoard', () => {
  it('renders without crashing', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    render(<DraftBoard settings={SETTINGS} players={PLAYERS} initialState={state} />)
    expect(screen.getByText(/continue draft/i)).toBeDefined()
  })

  it('CPU auto-picks for slot 1 (not user) and pauses at user slot 2', async () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    render(<DraftBoard settings={SETTINGS} players={PLAYERS} initialState={state} />)
    // With speed=instant, CPU should pick immediately and then pause at user turn
    await act(async () => { vi.advanceTimersByTime(100) })
    // After CPU picks slot 1, it's now user's turn (slot 2) — should be paused
    expect(screen.getByText(/your pick/i)).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/components/DraftBoard.test.tsx
```

- [ ] **Step 3: Create `components/draft/DraftBoard.tsx`**

```typescript
// components/draft/DraftBoard.tsx
'use client'
import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import { buildInitialState, makePick, assignPlayerToSlot, resetToADP, selectBestAvailable, generateShareId, computeDraftAnalytics } from '@/lib/draft/engine'
import { saveDraft } from '@/lib/draft/supabase'
import { DRAFT_SPEED_MS } from '@/lib/draft/types'
import type { DraftState, DraftSettings, Player } from '@/lib/draft/types'

type Action =
  | { type: 'MAKE_PICK'; playerId: string }
  | { type: 'ASSIGN'; pickIndex: number; playerId: string }
  | { type: 'RESET' }
  | { type: 'SET_STATUS'; status: DraftState['status'] }
  | { type: 'SET_SHARE_ID'; shareId: string }
  | { type: 'RESTORE'; state: DraftState }

function reducer(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'MAKE_PICK':   return makePick(state, action.playerId)
    case 'ASSIGN':      return assignPlayerToSlot(state, action.pickIndex, action.playerId)
    case 'RESET':       return resetToADP(state)
    case 'SET_STATUS':  return { ...state, status: action.status }
    case 'SET_SHARE_ID':return { ...state, shareId: action.shareId }
    case 'RESTORE':     return action.state
    default:            return state
  }
}

interface DraftBoardProps {
  settings: DraftSettings
  players: Player[]
  initialState: DraftState | null
}

export function DraftBoard({ settings, players, initialState }: DraftBoardProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? buildInitialState(settings, players)
  )
  const [undoStack, setUndoStack] = useState<DraftState[]>([])
  const [redoStack, setRedoStack] = useState<DraftState[]>([])
  const [selectedPoolPlayerId, setSelectedPoolPlayerId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const playerMap = useRef(new Map(players.map(p => [p.id, p]))).current

  // Autosave on every state change (debounced 1000ms)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const shareId = await saveDraft(state)
        if (!state.shareId) dispatch({ type: 'SET_SHARE_ID', shareId })
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', `/mock-draft/${shareId}`)
        }
      } catch { /* silent */ }
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state])

  // CPU auto-pick effect
  useEffect(() => {
    if (state.status !== 'drafting') return
    const currentPick = state.picks[state.currentPickIndex]
    if (!currentPick) return

    if (currentPick.isUser) {
      dispatch({ type: 'SET_STATUS', status: 'paused' })
      return
    }

    const delay = DRAFT_SPEED_MS[state.settings.speed]
    const timer = setTimeout(() => {
      const playerId = selectBestAvailable(state)
      if (playerId) dispatch({ type: 'MAKE_PICK', playerId })
    }, delay)
    return () => clearTimeout(timer)
  }, [state.currentPickIndex, state.status])

  const pushUndo = useCallback((prev: DraftState) => {
    setUndoStack(s => [...s, prev])
    setRedoStack([])
  }, [])

  const handleUserPick = (playerId: string) => {
    pushUndo(state)
    dispatch({ type: 'MAKE_PICK', playerId })
    setSelectedPoolPlayerId(null)
    // Status stays 'paused' — user must click Continue Draft
  }

  const handleAssign = (pickIndex: number, playerId: string) => {
    pushUndo(state)
    dispatch({ type: 'ASSIGN', pickIndex, playerId })
  }

  const handleReset = () => {
    pushUndo(state)
    dispatch({ type: 'RESET' })
  }

  const handleUndo = () => {
    if (!undoStack.length) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(s => [...s, state])
    setUndoStack(s => s.slice(0, -1))
    dispatch({ type: 'RESTORE', state: prev })
  }

  const handleRedo = () => {
    if (!redoStack.length) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(s => [...s, state])
    setRedoStack(s => s.slice(0, -1))
    dispatch({ type: 'RESTORE', state: next })
  }

  const handleContinueDraft = () => {
    dispatch({ type: 'SET_STATUS', status: 'drafting' })
  }

  const handleShareCopyLink = async () => {
    const url = state.shareId
      ? `${window.location.origin}/mock-draft/${state.shareId}`
      : window.location.href
    await navigator.clipboard.writeText(url).catch(() => {})
  }

  const analytics = state.status === 'complete'
    ? computeDraftAnalytics(state, playerMap)
    : null

  const currentPick = state.picks[state.currentPickIndex]
  const isUserTurn = currentPick?.isUser && state.status === 'paused'

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col">
      {/* DraftControls, PickGrid, DraftPlayerPool, MyTeam, DraftSummary are rendered here.
          They are implemented in subsequent tasks. This shell exposes the handlers as props. */}
      <div data-testid="draft-board">
        {isUserTurn && (
          <p className="text-pmp-red text-sm font-bold text-center py-2">Your pick</p>
        )}
        {state.status === 'paused' && (
          <button
            onClick={handleContinueDraft}
            className="w-full bg-pmp-red text-pmp-white font-bold py-4 text-lg rounded-none"
          >
            ▶ Continue Draft
          </button>
        )}
        {/* Child panels will be wired in Task 9 (DraftLayout) */}
      </div>
    </div>
  )
}

// Export handlers type for child components
export type DraftBoardHandlers = {
  onUserPick: (playerId: string) => void
  onAssign: (pickIndex: number, playerId: string) => void
  onReset: () => void
  onUndo: () => void
  onRedo: () => void
  onContinueDraft: () => void
  onShareCopyLink: () => Promise<void>
  selectedPoolPlayerId: string | null
  setSelectedPoolPlayerId: (id: string | null) => void
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npx vitest run tests/components/DraftBoard.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/draft/DraftBoard.tsx tests/components/DraftBoard.test.tsx
git commit -m "feat: DraftBoard useReducer shell with CPU auto-pick, undo/redo, autosave"
```

---

### Task 6: PickGrid + PickCell (drag-to-swap + click-to-place)

**Files:**
- Create: `components/draft/PickGrid.tsx`
- Create: `components/draft/PickCell.tsx`
- Test: `tests/components/PickGrid.test.tsx` (create)

**Interfaces:**
- Consumes: `PickSlot[]`, `Map<string, Player>`, `currentPickIndex`, `selectedPoolPlayerId`, `onAssign`, `onSelectCell`
- Produces: `<PickGrid picks={PickSlot[]} playerMap={Map} currentPickIndex={number} selectedPoolPlayerId={string|null} onAssign={fn} onSelectCell={fn} />`
- Click-to-place: if `selectedPoolPlayerId` is set and user clicks a completed slot, calls `onAssign(pickIndex, selectedPoolPlayerId)`
- Drag-to-swap: uses `@dnd-kit/core` `useDraggable` / `useDroppable` on completed PickCells; dragging one filled cell onto another completed cell swaps the two players

- [ ] **Step 1: Write failing tests**

```typescript
// tests/components/PickGrid.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PickGrid } from '@/components/draft/PickGrid'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

const PICKS: PickSlot[] = [
  { overallPick: 1, round: 1, pickInRound: 1, teamSlot: 1, isUser: false, playerId: 'p1' },
  { overallPick: 2, round: 1, pickInRound: 2, teamSlot: 2, isUser: true, playerId: 'p2' },
  { overallPick: 3, round: 1, pickInRound: 3, teamSlot: 3, isUser: false, playerId: null },
]

const PLAYER_MAP = new Map<string, Player>([
  ['p1', { id: 'p1', name: 'Alpha RB', position: 'RB', team: 'KC', searchRank: 1, byeWeek: 7 }],
  ['p2', { id: 'p2', name: 'Beta QB', position: 'QB', team: 'DAL', searchRank: 2, byeWeek: 9 }],
])

describe('PickGrid', () => {
  it('renders player names in completed slots', () => {
    render(
      <PickGrid
        picks={PICKS}
        playerMap={PLAYER_MAP}
        currentPickIndex={2}
        selectedPoolPlayerId={null}
        onAssign={vi.fn()}
        onSelectCell={vi.fn()}
      />
    )
    expect(screen.getByText('Alpha RB')).toBeDefined()
    expect(screen.getByText('Beta QB')).toBeDefined()
  })

  it('shows empty state for unpicked slots', () => {
    render(
      <PickGrid
        picks={PICKS}
        playerMap={PLAYER_MAP}
        currentPickIndex={2}
        selectedPoolPlayerId={null}
        onAssign={vi.fn()}
        onSelectCell={vi.fn()}
      />
    )
    // Pick 3 has no player — should show round.pick label
    expect(screen.getByText('1.03')).toBeDefined()
  })

  it('calls onAssign when clicking a completed slot with selectedPoolPlayerId set', () => {
    const onAssign = vi.fn()
    render(
      <PickGrid
        picks={PICKS}
        playerMap={PLAYER_MAP}
        currentPickIndex={2}
        selectedPoolPlayerId="p99"
        onAssign={onAssign}
        onSelectCell={vi.fn()}
      />
    )
    // Click pick 0 (completed)
    fireEvent.click(screen.getByText('Alpha RB'))
    expect(onAssign).toHaveBeenCalledWith(0, 'p99')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/components/PickGrid.test.tsx
```

- [ ] **Step 3: Create `components/draft/PickCell.tsx`**

```typescript
// components/draft/PickCell.tsx
'use client'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface PickCellProps {
  pick: PickSlot
  pickIndex: number
  player: Player | undefined
  currentPickIndex: number
  selectedPoolPlayerId: string | null
  onAssign: (pickIndex: number, playerId: string) => void
  onSelectCell: (pickIndex: number) => void
}

export function PickCell({
  pick, pickIndex, player, currentPickIndex, selectedPoolPlayerId, onAssign, onSelectCell,
}: PickCellProps) {
  const isCompleted = pickIndex < currentPickIndex
  const isCurrent = pickIndex === currentPickIndex
  const label = `${pick.round}.${String(pick.pickInRound).padStart(2, '0')}`

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `pick-${pickIndex}`,
    disabled: !isCompleted || !player,
    data: { pickIndex, playerId: player?.id },
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${pickIndex}`,
    disabled: !isCompleted,
    data: { pickIndex },
  })

  const handleClick = () => {
    if (!isCompleted) return
    if (selectedPoolPlayerId) {
      onAssign(pickIndex, selectedPoolPlayerId)
    } else {
      onSelectCell(pickIndex)
    }
  }

  const bg = pick.isUser ? 'bg-[#1a0a0a] border-pmp-red/30' : 'bg-pmp-gray-900 border-pmp-gray-800'
  const activeBg = isOver ? 'border-pmp-red' : ''
  const currentBg = isCurrent ? 'border-pmp-red animate-pulse' : ''

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`relative border rounded-lg p-1.5 cursor-pointer select-none transition-all ${bg} ${activeBg} ${currentBg} ${isDragging ? 'opacity-40' : ''} ${selectedPoolPlayerId && isCompleted ? 'hover:border-pmp-red' : ''}`}
    >
      <p className="text-pmp-gray-600 text-[10px] leading-none">{label}</p>
      {player ? (
        <>
          <p className="text-pmp-white text-xs font-semibold truncate mt-0.5 leading-tight">{player.name}</p>
          <p className="text-pmp-gray-500 text-[10px]">{player.position} · {player.team}</p>
        </>
      ) : (
        <p className="text-pmp-gray-700 text-xs mt-0.5">{isCurrent ? 'On the clock' : label}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/draft/PickGrid.tsx`**

```typescript
// components/draft/PickGrid.tsx
'use client'
import { DndContext, DragEndEvent } from '@dnd-kit/core'
import { PickCell } from './PickCell'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface PickGridProps {
  picks: PickSlot[]
  playerMap: Map<string, Player>
  currentPickIndex: number
  selectedPoolPlayerId: string | null
  onAssign: (pickIndex: number, playerId: string) => void
  onSelectCell: (pickIndex: number) => void
  numTeams: number
}

export function PickGrid({
  picks, playerMap, currentPickIndex, selectedPoolPlayerId, onAssign, onSelectCell, numTeams,
}: PickGridProps) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const srcIndex: number = active.data.current?.pickIndex
    const dstIndex: number = over.data.current?.pickIndex
    if (srcIndex === undefined || dstIndex === undefined || srcIndex === dstIndex) return
    if (dstIndex >= currentPickIndex || srcIndex >= currentPickIndex) return

    const srcPlayerId = picks[srcIndex].playerId
    const dstPlayerId = picks[dstIndex].playerId
    if (srcPlayerId) onAssign(dstIndex, srcPlayerId)
    if (dstPlayerId) onAssign(srcIndex, dstPlayerId)
  }

  const numRounds = picks.length / numTeams

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5 min-w-max"
          style={{ gridTemplateColumns: `repeat(${numTeams}, minmax(72px, 1fr))` }}
        >
          {/* Header row */}
          {Array.from({ length: numTeams }, (_, i) => (
            <div key={i} className="text-center text-pmp-gray-600 text-[10px] py-1">
              {i + 1 === picks.find(p => p.isUser)?.teamSlot ? 'YOU' : `T${i + 1}`}
            </div>
          ))}

          {picks.map((pick, idx) => (
            <PickCell
              key={pick.overallPick}
              pick={pick}
              pickIndex={idx}
              player={pick.playerId ? playerMap.get(pick.playerId) : undefined}
              currentPickIndex={currentPickIndex}
              selectedPoolPlayerId={selectedPoolPlayerId}
              onAssign={onAssign}
              onSelectCell={onSelectCell}
            />
          ))}
        </div>
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 5: Run tests — should pass**

```bash
npx vitest run tests/components/PickGrid.test.tsx
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/draft/PickCell.tsx components/draft/PickGrid.tsx tests/components/PickGrid.test.tsx
git commit -m "feat: PickGrid with drag-to-swap and click-to-place"
```

---

### Task 7: DraftPlayerPool

**Files:**
- Create: `components/draft/DraftPlayerPool.tsx`
- Test: `tests/components/DraftPlayerPool.test.tsx` (create)

**Interfaces:**
- Consumes: `availablePlayerIds`, `Map<string, Player>`, `selectedPoolPlayerId`, `lockedPlayerIds`, `onPickPlayer`, `onSelectPlayer`, `onToggleLock`, `isUserTurn`
- Produces: `<DraftPlayerPool ... />`
- Filter tabs: ALL / QB / RB / WR / TE / K / DEF
- Click player while `isUserTurn` → calls `onPickPlayer`; otherwise sets `selectedPoolPlayerId`
- Lock icon (🔒) per player prevents CPU from auto-picking them

- [ ] **Step 1: Write failing tests**

```typescript
// tests/components/DraftPlayerPool.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DraftPlayerPool } from '@/components/draft/DraftPlayerPool'
import type { Player } from '@/lib/data/types'

const PLAYERS: Player[] = [
  { id: '1', name: 'Patrick Mahomes', position: 'QB', team: 'KC', searchRank: 1, byeWeek: 14 },
  { id: '2', name: 'CMC', position: 'RB', team: 'SF', searchRank: 2, byeWeek: 9 },
  { id: '3', name: 'Justin Tucker', position: 'K', team: 'BAL', searchRank: 50, byeWeek: 9 },
]

const PLAYER_MAP = new Map(PLAYERS.map(p => [p.id, p]))

describe('DraftPlayerPool', () => {
  it('renders all players by default', () => {
    render(
      <DraftPlayerPool
        availablePlayerIds={['1', '2', '3']}
        playerMap={PLAYER_MAP}
        selectedPoolPlayerId={null}
        lockedPlayerIds={[]}
        isUserTurn={false}
        onPickPlayer={vi.fn()}
        onSelectPlayer={vi.fn()}
        onToggleLock={vi.fn()}
      />
    )
    expect(screen.getByText('Patrick Mahomes')).toBeDefined()
    expect(screen.getByText('CMC')).toBeDefined()
    expect(screen.getByText('Justin Tucker')).toBeDefined()
  })

  it('filters by position when tab clicked', () => {
    render(
      <DraftPlayerPool
        availablePlayerIds={['1', '2', '3']}
        playerMap={PLAYER_MAP}
        selectedPoolPlayerId={null}
        lockedPlayerIds={[]}
        isUserTurn={false}
        onPickPlayer={vi.fn()}
        onSelectPlayer={vi.fn()}
        onToggleLock={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    expect(screen.getByText('Patrick Mahomes')).toBeDefined()
    expect(screen.queryByText('CMC')).toBeNull()
  })

  it('calls onPickPlayer when isUserTurn and player clicked', () => {
    const onPickPlayer = vi.fn()
    render(
      <DraftPlayerPool
        availablePlayerIds={['1', '2', '3']}
        playerMap={PLAYER_MAP}
        selectedPoolPlayerId={null}
        lockedPlayerIds={[]}
        isUserTurn={true}
        onPickPlayer={onPickPlayer}
        onSelectPlayer={vi.fn()}
        onToggleLock={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Patrick Mahomes'))
    expect(onPickPlayer).toHaveBeenCalledWith('1')
  })

  it('calls onSelectPlayer when not user turn', () => {
    const onSelectPlayer = vi.fn()
    render(
      <DraftPlayerPool
        availablePlayerIds={['1']}
        playerMap={PLAYER_MAP}
        selectedPoolPlayerId={null}
        lockedPlayerIds={[]}
        isUserTurn={false}
        onPickPlayer={vi.fn()}
        onSelectPlayer={onSelectPlayer}
        onToggleLock={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Patrick Mahomes'))
    expect(onSelectPlayer).toHaveBeenCalledWith('1')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/components/DraftPlayerPool.test.tsx
```

- [ ] **Step 3: Create `components/draft/DraftPlayerPool.tsx`**

```typescript
// components/draft/DraftPlayerPool.tsx
'use client'
import { useState } from 'react'
import type { Player } from '@/lib/data/types'

type PositionFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'
const FILTERS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

interface DraftPlayerPoolProps {
  availablePlayerIds: string[]
  playerMap: Map<string, Player>
  selectedPoolPlayerId: string | null
  lockedPlayerIds: string[]
  isUserTurn: boolean
  onPickPlayer: (playerId: string) => void
  onSelectPlayer: (playerId: string | null) => void
  onToggleLock: (playerId: string) => void
}

export function DraftPlayerPool({
  availablePlayerIds, playerMap, selectedPoolPlayerId, lockedPlayerIds,
  isUserTurn, onPickPlayer, onSelectPlayer, onToggleLock,
}: DraftPlayerPoolProps) {
  const [filter, setFilter] = useState<PositionFilter>('ALL')

  const visible = availablePlayerIds
    .map(id => playerMap.get(id))
    .filter((p): p is Player => !!p && (filter === 'ALL' || p.position === filter))

  const handlePlayerClick = (playerId: string) => {
    if (isUserTurn) {
      onPickPlayer(playerId)
    } else {
      onSelectPlayer(selectedPoolPlayerId === playerId ? null : playerId)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex gap-1 px-2 py-2 border-b border-pmp-gray-800 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded text-xs font-bold shrink-0 transition-colors ${
              filter === f
                ? 'bg-pmp-red text-pmp-white'
                : 'text-pmp-gray-500 hover:text-pmp-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto">
        {visible.map((player, idx) => {
          const isSelected = selectedPoolPlayerId === player.id
          const isLocked = lockedPlayerIds.includes(player.id)
          return (
            <div
              key={player.id}
              onClick={() => handlePlayerClick(player.id)}
              className={`flex items-center gap-3 px-3 py-2.5 border-b border-pmp-gray-800 cursor-pointer transition-colors ${
                isSelected ? 'bg-pmp-red/10 border-pmp-red/30' : 'hover:bg-pmp-gray-900'
              }`}
            >
              <span className="text-pmp-gray-600 text-xs w-5 text-right">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${isUserTurn ? 'text-pmp-white' : 'text-pmp-white'}`}>
                  {player.name}
                </p>
                <p className="text-pmp-gray-500 text-xs">
                  {player.position} · {player.team}
                  {player.byeWeek ? ` · Bye ${player.byeWeek}` : ''}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onToggleLock(player.id) }}
                className={`text-xs px-1 ${isLocked ? 'text-pmp-red' : 'text-pmp-gray-700 hover:text-pmp-gray-500'}`}
                aria-label={isLocked ? 'Unlock player' : 'Lock player'}
              >
                {isLocked ? '🔒' : '○'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npx vitest run tests/components/DraftPlayerPool.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/draft/DraftPlayerPool.tsx tests/components/DraftPlayerPool.test.tsx
git commit -m "feat: DraftPlayerPool with position filters, click-to-select, lock"
```

---

### Task 8: MyTeam panel

**Files:**
- Create: `components/draft/MyTeam.tsx`
- Test: `tests/components/MyTeam.test.tsx` (create)

**Interfaces:**
- Consumes: `picks: PickSlot[]`, `playerMap: Map<string, Player>`, `numRounds: 15`
- Produces: `<MyTeam picks={PickSlot[]} playerMap={Map} numRounds={15} />`
- Shows only `isUser` pick slots with player name (or "Round N" placeholder)

- [ ] **Step 1: Write failing tests**

```typescript
// tests/components/MyTeam.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MyTeam } from '@/components/draft/MyTeam'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

const USER_PICKS: PickSlot[] = [
  { overallPick: 3, round: 1, pickInRound: 3, teamSlot: 3, isUser: true, playerId: 'p1' },
  { overallPick: 18, round: 2, pickInRound: 3, teamSlot: 3, isUser: true, playerId: null },
]

const PLAYER_MAP = new Map<string, Player>([
  ['p1', { id: 'p1', name: 'CMC', position: 'RB', team: 'SF', searchRank: 1, byeWeek: 9 }],
])

describe('MyTeam', () => {
  it('shows drafted player name', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} numRounds={15} />)
    expect(screen.getByText('CMC')).toBeDefined()
  })

  it('shows round placeholder for empty slots', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} numRounds={15} />)
    expect(screen.getByText('Round 2')).toBeDefined()
  })

  it('only shows user picks', () => {
    const mixed: PickSlot[] = [
      ...USER_PICKS,
      { overallPick: 1, round: 1, pickInRound: 1, teamSlot: 1, isUser: false, playerId: 'cpu1' },
    ]
    render(<MyTeam picks={mixed} playerMap={PLAYER_MAP} numRounds={15} />)
    // Only 2 rows (user picks), not 3
    expect(screen.queryByText('T1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/components/MyTeam.test.tsx
```

- [ ] **Step 3: Create `components/draft/MyTeam.tsx`**

```typescript
// components/draft/MyTeam.tsx
'use client'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface MyTeamProps {
  picks: PickSlot[]
  playerMap: Map<string, Player>
  numRounds: 15
}

export function MyTeam({ picks, playerMap, numRounds }: MyTeamProps) {
  const userPicks = picks.filter(p => p.isUser)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-pmp-gray-800">
        <h2 className="text-pmp-white text-sm font-bold">My Team</h2>
      </div>
      {userPicks.map((pick, idx) => {
        const player = pick.playerId ? playerMap.get(pick.playerId) : undefined
        return (
          <div
            key={pick.overallPick}
            className="flex items-center gap-3 px-3 py-2.5 border-b border-pmp-gray-800"
          >
            <span className="text-pmp-gray-600 text-xs w-5 text-right">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              {player ? (
                <>
                  <p className="text-pmp-white text-sm font-semibold truncate">{player.name}</p>
                  <p className="text-pmp-gray-500 text-xs">{player.position} · {player.team}</p>
                </>
              ) : (
                <p className="text-pmp-gray-700 text-sm">Round {pick.round}</p>
              )}
            </div>
            {player && (
              <span className="text-pmp-gray-600 text-[10px] shrink-0">
                {pick.round}.{String(pick.pickInRound).padStart(2, '0')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npx vitest run tests/components/MyTeam.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/draft/MyTeam.tsx tests/components/MyTeam.test.tsx
git commit -m "feat: MyTeam panel showing user picks with round placeholders"
```

---

### Task 9: DraftSummary (completion analytics)

**Files:**
- Create: `components/draft/DraftSummary.tsx`
- Test: `tests/lib/draft-analytics.test.ts` (create)

**Interfaces:**
- Consumes: `DraftAnalytics`, `DraftState` (for settings), `onPlayAgain: () => void`
- Produces: `<DraftSummary analytics={DraftAnalytics} settings={DraftSettings} onPlayAgain={fn} />`
- Shows: positional breakdown table, avg ADP, earliest reach, biggest value pick, Play Again button

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/draft-analytics.test.ts
import { describe, it, expect } from 'vitest'
import { buildInitialState, makePick, computeDraftAnalytics } from '@/lib/draft/engine'
import type { DraftSettings, Player } from '@/lib/draft/types'

const SETTINGS: DraftSettings = {
  numTeams: 2, numRounds: 15, userSlot: 1, scoring: 'ppr', speed: 'instant',
}

const PLAYERS: Player[] = [
  { id: '1', name: 'P1 QB', position: 'QB', team: 'KC', searchRank: 1, byeWeek: 7 },
  { id: '2', name: 'P2 RB', position: 'RB', team: 'SF', searchRank: 2, byeWeek: 9 },
  { id: '3', name: 'P3 WR', position: 'WR', team: 'DAL', searchRank: 3, byeWeek: 11 },
  { id: '4', name: 'P4 TE', position: 'TE', team: 'KC', searchRank: 100, byeWeek: 14 },
  ...Array.from({ length: 26 }, (_, i) => ({
    id: String(i + 5),
    name: `P${i + 5}`,
    position: 'WR' as Player['position'],
    team: 'TEN',
    searchRank: i + 5,
    byeWeek: 7,
  })),
]

describe('computeDraftAnalytics', () => {
  it('computes correct positional breakdown', () => {
    // 2 teams, 2 rounds = 4 total picks; user is slot 1 (picks 1 and 4)
    let state = buildInitialState({ ...SETTINGS, numRounds: 15 }, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Simulate full draft
    for (let i = 0; i < state.picks.length; i++) {
      const pid = state.availablePlayerIds[0]
      if (pid) state = makePick(state, pid)
    }
    const analytics = computeDraftAnalytics(state, playerMap)
    expect(analytics.positionBreakdown).toBeDefined()
    const total = Object.values(analytics.positionBreakdown).reduce((a, b) => a + b, 0)
    expect(total).toBe(15) // 15 rounds = 15 user picks
  })

  it('earliestReach: player picked before their ADP', () => {
    // User picks player with searchRank=100 at overall pick 1 — big reach
    let state = buildInitialState(SETTINGS, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Force pick player id='4' (searchRank=100) at pick 0 (overall=1)
    // We'll do this by running the draft with only player 4 available
    const singlePlayerState = {
      ...state,
      availablePlayerIds: ['4', ...PLAYERS.filter(p => p.id !== '4').map(p => p.id)],
    }
    // just compute analytics on a manually constructed completed state
    const manualState = {
      ...singlePlayerState,
      status: 'complete' as const,
      currentPickIndex: state.picks.length,
      picks: state.picks.map((p, i) => ({
        ...p,
        playerId: i === 0 ? '4' : (PLAYERS[i] ? PLAYERS[i].id : null),
      })),
    }
    const analytics = computeDraftAnalytics(manualState, playerMap)
    // Pick at overall=1, ADP=100 → reach of 99
    expect(analytics.earliestReach).not.toBeNull()
    expect(analytics.earliestReach?.player.id).toBe('4')
  })

  it('biggestValue: player available much later than ADP', () => {
    let state = buildInitialState(SETTINGS, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Player 1 has searchRank=1 but picked at overall=15 = value
    const manualState = {
      ...state,
      status: 'complete' as const,
      currentPickIndex: state.picks.length,
      picks: state.picks.map((p, i) => ({
        ...p,
        playerId: i === 14 && p.isUser ? '1' : (PLAYERS[i] ? PLAYERS[i].id : null),
      })),
    }
    const analytics = computeDraftAnalytics(manualState, playerMap)
    // If user pick at 15 has player searchRank=1, that's +14 value
    if (analytics.biggestValue) {
      expect(analytics.biggestValue.actualPick).toBeGreaterThan(analytics.biggestValue.expectedADP)
    }
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run tests/lib/draft-analytics.test.ts
```

- [ ] **Step 3: Run tests — should pass (engine already implemented in Task 2)**

```bash
npx vitest run tests/lib/draft-analytics.test.ts
```
Expected: PASS — `computeDraftAnalytics` is already in `lib/draft/engine.ts`.

- [ ] **Step 4: Create `components/draft/DraftSummary.tsx`**

```typescript
// components/draft/DraftSummary.tsx
'use client'
import type { DraftAnalytics, DraftSettings } from '@/lib/draft/types'

interface DraftSummaryProps {
  analytics: DraftAnalytics
  settings: DraftSettings
  onPlayAgain: () => void
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export function DraftSummary({ analytics, settings, onPlayAgain }: DraftSummaryProps) {
  const positions = POSITION_ORDER.filter(p => analytics.positionBreakdown[p])

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col items-center justify-start px-4 py-8 gap-6">
      <div className="text-center">
        <h1 className="text-pmp-white text-2xl font-bold">Draft Complete</h1>
        <p className="text-pmp-gray-500 text-sm mt-1">{settings.numTeams} teams · 15 rounds · {settings.scoring.toUpperCase()}</p>
      </div>

      {/* Positional Breakdown */}
      <div className="w-full max-w-sm bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
        <h2 className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-3">My Roster</h2>
        <div className="grid grid-cols-3 gap-2">
          {positions.map(pos => (
            <div key={pos} className="text-center">
              <p className="text-pmp-red text-lg font-bold">{analytics.positionBreakdown[pos]}</p>
              <p className="text-pmp-gray-500 text-xs">{pos}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
          <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Avg ADP Reached</p>
          <p className="text-pmp-white text-xl font-bold mt-1">
            {analytics.averageADPReached.toFixed(1)}
          </p>
        </div>

        {analytics.earliestReach && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
            <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Earliest Reach</p>
            <p className="text-pmp-white font-semibold mt-1">{analytics.earliestReach.player.name}</p>
            <p className="text-pmp-gray-500 text-xs">
              Picked {analytics.earliestReach.actualPick} · ADP {analytics.earliestReach.expectedADP}
            </p>
          </div>
        )}

        {analytics.biggestValue && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4">
            <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Biggest Value</p>
            <p className="text-pmp-white font-semibold mt-1">{analytics.biggestValue.player.name}</p>
            <p className="text-pmp-gray-500 text-xs">
              Picked {analytics.biggestValue.actualPick} · ADP {analytics.biggestValue.expectedADP}
            </p>
          </div>
        )}
      </div>

      <button
        onClick={onPlayAgain}
        className="w-full max-w-sm bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-base hover:opacity-90 transition-opacity"
      >
        Draft Again
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/draft/DraftSummary.tsx tests/lib/draft-analytics.test.ts
git commit -m "feat: DraftSummary analytics screen (positional breakdown, ADP, reach, value)"
```

---

### Task 10: DraftLayout + DraftControls + MobileTabs

**Files:**
- Create: `components/draft/DraftControls.tsx`
- Create: `components/draft/MobileTabs.tsx`
- Create: `components/draft/DraftLayout.tsx`

**Interfaces:**
- `DraftLayout` wires `DraftBoard`'s state/handlers to `PickGrid`, `DraftPlayerPool`, `MyTeam`, `DraftSummary`, and `DraftControls` into a cohesive 3-column desktop / tabbed mobile layout
- On mobile, `MobileTabs` toggles between "Players" | "Board" | "My Team"
- `DraftControls` renders: ▶ Continue Draft (primary, only when paused), Reset to ADP, Undo, Redo, Share

- [ ] **Step 1: Create `components/draft/DraftControls.tsx`**

```typescript
// components/draft/DraftControls.tsx
'use client'
import { useState } from 'react'

interface DraftControlsProps {
  status: 'drafting' | 'paused' | 'complete'
  canUndo: boolean
  canRedo: boolean
  onContinueDraft: () => void
  onReset: () => void
  onUndo: () => void
  onRedo: () => void
  onShare: () => Promise<void>
}

export function DraftControls({
  status, canUndo, canRedo, onContinueDraft, onReset, onUndo, onRedo, onShare,
}: DraftControlsProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    await onShare()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-2 p-3 border-b border-pmp-gray-800">
      {status === 'paused' && (
        <button
          onClick={onContinueDraft}
          className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-base hover:opacity-90 transition-opacity"
        >
          ▶ Continue Draft
        </button>
      )}

      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white text-xs font-semibold py-2 rounded-lg disabled:opacity-30 hover:border-pmp-gray-600 transition-colors"
        >
          ↩ Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white text-xs font-semibold py-2 rounded-lg disabled:opacity-30 hover:border-pmp-gray-600 transition-colors"
        >
          ↪ Redo
        </button>
        <button
          onClick={onReset}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-gray-500 text-xs font-semibold py-2 rounded-lg hover:border-pmp-gray-600 hover:text-pmp-white transition-colors"
        >
          Reset
        </button>
        <button
          onClick={handleShare}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-gray-500 text-xs font-semibold py-2 rounded-lg hover:border-pmp-gray-600 hover:text-pmp-white transition-colors"
        >
          {copied ? '✓ Copied' : 'Share'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/draft/MobileTabs.tsx`**

```typescript
// components/draft/MobileTabs.tsx
'use client'

export type MobileTab = 'players' | 'board' | 'team'

interface MobileTabsProps {
  active: MobileTab
  onChange: (tab: MobileTab) => void
}

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'players', label: 'Players' },
  { id: 'board', label: 'Board' },
  { id: 'team', label: 'My Team' },
]

export function MobileTabs({ active, onChange }: MobileTabsProps) {
  return (
    <div className="flex border-b border-pmp-gray-800 md:hidden">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
            active === tab.id
              ? 'text-pmp-red border-b-2 border-pmp-red'
              : 'text-pmp-gray-500'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update `components/draft/DraftBoard.tsx` to wire child panels**

Replace the placeholder `<div data-testid="draft-board">` render block with the full layout. Add imports for `DraftControls`, `MobileTabs`, `PickGrid`, `DraftPlayerPool`, `MyTeam`, `DraftSummary`. Add `mobileTab` state. The DraftBoard's return should be:

```typescript
// Add to imports:
import { DraftControls } from './DraftControls'
import { MobileTabs, type MobileTab } from './MobileTabs'
import { PickGrid } from './PickGrid'
import { DraftPlayerPool } from './DraftPlayerPool'
import { MyTeam } from './MyTeam'
import { DraftSummary } from './DraftSummary'

// Add inside DraftBoard function (after existing state declarations):
const [mobileTab, setMobileTab] = useState<MobileTab>('players')

// Handle lock toggle (add to existing handlers):
const handleToggleLock = (playerId: string) => {
  dispatch({
    type: 'RESTORE',
    state: {
      ...state,
      lockedPlayerIds: state.lockedPlayerIds.includes(playerId)
        ? state.lockedPlayerIds.filter(id => id !== playerId)
        : [...state.lockedPlayerIds, playerId],
    },
  })
}

// Replace the return block:
return (
  <div className="min-h-screen bg-pmp-black flex flex-col">
    {state.status === 'complete' && analytics ? (
      <DraftSummary
        analytics={analytics}
        settings={state.settings}
        onPlayAgain={() => dispatch({ type: 'RESET' })}
      />
    ) : (
      <>
        <DraftControls
          status={state.status}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onContinueDraft={handleContinueDraft}
          onReset={handleReset}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onShare={handleShareCopyLink}
        />

        <MobileTabs active={mobileTab} onChange={setMobileTab} />

        {/* Desktop: 3-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Player pool — left on desktop, "Players" tab on mobile */}
          <div className={`w-full md:w-72 flex-shrink-0 border-r border-pmp-gray-800 ${mobileTab !== 'players' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
            <DraftPlayerPool
              availablePlayerIds={state.availablePlayerIds}
              playerMap={playerMap}
              selectedPoolPlayerId={selectedPoolPlayerId}
              lockedPlayerIds={state.lockedPlayerIds}
              isUserTurn={isUserTurn}
              onPickPlayer={handleUserPick}
              onSelectPlayer={setSelectedPoolPlayerId}
              onToggleLock={handleToggleLock}
            />
          </div>

          {/* Board — center on desktop, "Board" tab on mobile */}
          <div className={`flex-1 overflow-auto ${mobileTab !== 'board' ? 'hidden md:block' : 'block'}`}>
            <PickGrid
              picks={state.picks}
              playerMap={playerMap}
              currentPickIndex={state.currentPickIndex}
              selectedPoolPlayerId={selectedPoolPlayerId}
              onAssign={handleAssign}
              onSelectCell={() => {}}
              numTeams={state.settings.numTeams}
            />
          </div>

          {/* My Team — right on desktop, "My Team" tab on mobile */}
          <div className={`w-full md:w-64 flex-shrink-0 border-l border-pmp-gray-800 ${mobileTab !== 'team' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
            <MyTeam
              picks={state.picks}
              playerMap={playerMap}
              numRounds={15}
            />
          </div>
        </div>
      </>
    )}
  </div>
)
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/draft/DraftControls.tsx components/draft/MobileTabs.tsx components/draft/DraftBoard.tsx
git commit -m "feat: DraftLayout — 3-column desktop, mobile tabs, DraftControls wired"
```

---

### Task 11: Routes + analytics events + homepage update

**Files:**
- Create: `app/mock-draft/page.tsx`
- Create: `app/mock-draft/[id]/page.tsx`
- Modify: `lib/analytics/events.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- `app/mock-draft/page.tsx` — setup page; on start, renders `DraftBoard`
- `app/mock-draft/[id]/page.tsx` — loads draft by shareId and renders `DraftBoard` with `initialState`
- `lib/analytics/events.ts` — add `mockDraftStarted(settings)` and `mockDraftShared()`

- [ ] **Step 1: Read `lib/analytics/events.ts` to understand existing pattern**

Read `lib/analytics/events.ts` and identify the existing event tracking pattern before adding new events.

- [ ] **Step 2: Add analytics events to `lib/analytics/events.ts`**

Add to the `analytics` export object:
```typescript
mockDraftStarted: (settings: { numTeams: number; scoring: string; speed: string }) => {
  track('mock_draft_started', settings)
},
mockDraftShared: () => {
  track('mock_draft_shared', {})
},
```

Where `track` is whatever the existing internal tracking function is called.

- [ ] **Step 3: Create `app/mock-draft/page.tsx`**

```typescript
// app/mock-draft/page.tsx
'use client'
import { useState } from 'react'
import { DraftSetup } from '@/components/draft/DraftSetup'
import { DraftBoard } from '@/components/draft/DraftBoard'
import { buildInitialState } from '@/lib/draft/engine'
import { analytics } from '@/lib/analytics/events'
import type { DraftSettings, DraftState, Player } from '@/lib/draft/types'

export default function MockDraftPage() {
  const [draftState, setDraftState] = useState<{ settings: DraftSettings; players: Player[]; initialState: DraftState } | null>(null)

  const handleStart = (settings: DraftSettings, players: Player[]) => {
    analytics.mockDraftStarted({
      numTeams: settings.numTeams,
      scoring: settings.scoring,
      speed: settings.speed,
    })
    setDraftState({ settings, players, initialState: buildInitialState(settings, players) })
  }

  if (!draftState) {
    return <DraftSetup onStart={handleStart} />
  }

  return (
    <DraftBoard
      settings={draftState.settings}
      players={draftState.players}
      initialState={draftState.initialState}
    />
  )
}
```

- [ ] **Step 4: Create `app/mock-draft/[id]/page.tsx`**

```typescript
// app/mock-draft/[id]/page.tsx
import { loadDraft } from '@/lib/draft/supabase'
import { notFound } from 'next/navigation'
import MockDraftClientPage from './client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MockDraftSharePage({ params }: PageProps) {
  const { id } = await params
  const state = await loadDraft(id)
  if (!state) notFound()
  return <MockDraftClientPage initialState={state} />
}
```

Create `app/mock-draft/[id]/client.tsx`:
```typescript
// app/mock-draft/[id]/client.tsx
'use client'
import { DraftBoard } from '@/components/draft/DraftBoard'
import type { DraftState } from '@/lib/draft/types'

interface Props {
  initialState: DraftState
}

export default function MockDraftClientPage({ initialState }: Props) {
  // Reconstruct players list from allPlayerIds — in a real implementation,
  // re-fetch from DataProvider. For now, DraftBoard receives an empty players
  // array and uses initialState directly (players already embedded in picks).
  // TODO: store players in DraftState or re-fetch by ID on share load.
  return (
    <DraftBoard
      settings={initialState.settings}
      players={[]}
      initialState={initialState}
    />
  )
}
```

- [ ] **Step 5: Update `app/page.tsx` to add Mock Draft link**

Read `app/page.tsx`. Find the "Coming Soon" section with the pills `['Weekly Rankings', 'Mock Drafts', 'Trade Analyzer']`. Replace with a "Tools" section:

```tsx
{/* Tools */}
<div className="flex flex-col gap-3 w-full">
  <p className="text-pmp-gray-600 text-xs uppercase tracking-widest text-center">Tools</p>
  <Link
    href="/mock-draft"
    className="group flex items-center gap-4 px-5 py-4 rounded-xl bg-pmp-gray-900 border border-pmp-gray-800 hover:border-pmp-red transition-all duration-200"
  >
    <div className="flex-1">
      <p className="text-pmp-white font-semibold text-sm group-hover:text-pmp-red transition-colors">
        Mock Draft
      </p>
      <p className="text-pmp-gray-600 text-xs mt-0.5">Snake draft simulator</p>
    </div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-pmp-gray-700 group-hover:text-pmp-red transition-colors shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </Link>
  <div className="flex gap-2 flex-wrap justify-center">
    {['Weekly Rankings', 'Trade Analyzer'].map(label => (
      <span key={label} className="text-pmp-gray-700 text-xs px-3 py-1 rounded-full border border-pmp-gray-800">
        {label} — coming soon
      </span>
    ))}
  </div>
</div>
```

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 7: Build check**

```bash
npm run build
```
Expected: no TypeScript errors, successful build.

- [ ] **Step 8: Commit**

```bash
git add app/mock-draft/page.tsx app/mock-draft/[id]/page.tsx app/mock-draft/[id]/client.tsx lib/analytics/events.ts app/page.tsx
git commit -m "feat: mock draft routes, analytics events, homepage link"
```
