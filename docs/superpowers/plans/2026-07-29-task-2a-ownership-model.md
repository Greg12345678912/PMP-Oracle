# Task 2A: Ownership-Based Draft Pick Trading

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace pair-swap trading with a true ownership model so the draft engine only cares about who currently owns each pick, and the UI supports N-for-M trades with live preview.

**Architecture:** `PickSlot.isUser` (stored boolean) is replaced by `PickSlot.currentOwnerTeamSlot: number` (canonical). `isUser` is derived everywhere as `pick.currentOwnerTeamSlot === settings.userSlot`. A new `DraftPickTradesPanel` component handles pre-draft trading with a live board preview, shopping-cart model (Cancel restores, Apply commits), and trade history. The engine never sees trades — only the resolved `currentOwnerTeamSlot` values.

**Tech Stack:** Next.js 16.2.11 App Router, TypeScript strict, Tailwind v4 (bracket notation), Vitest + jsdom

## Global Constraints

- Tailwind v4: no config file. Bracket notation for non-token hex: `bg-[#1a0505]`, `border-[#2a2a2a]`
- Existing pmp-* tokens: `pmp-black`, `pmp-red`, `pmp-white`, `pmp-gray-900/800/700/600/500`
- TypeScript strict — no `any`, no implicit `any`
- Vitest tests in `tests/`; run `npx vitest run` to verify; all existing tests must keep passing
- `PickSlot.isUser` is REMOVED — never re-introduce it
- `PickSlot.currentOwnerTeamSlot` is the ONLY ownership field — always a number equal to a valid teamSlot
- `isUser` is ALWAYS derived as `pick.currentOwnerTeamSlot === settings.userSlot` — never stored
- Engine (`lib/draft/engine.ts`) reads `currentOwnerTeamSlot` directly — no trade logic in the engine
- Trade history is UI-only — `TradeRecord[]` never enters `DraftState`
- `tradePickSlots` in engine.ts is DELETED (replaced by ownership model)
- N-for-M trades: you can give any number of your picks and receive any number of opponent picks
- Live preview: pending trade updates the board visualization before Apply is clicked
- Cancel restores the board exactly (pending state is discarded, committed map is unchanged)
- `pickOwnershipMap`: `Map<string, number>` keyed `"${round}_${teamSlot}"` → `currentOwnerTeamSlot`

---

### Task 2A-1: Replace `isUser` with `currentOwnerTeamSlot` in types + engine + components

**Files:**
- Modify: `lib/draft/types.ts`
- Modify: `lib/draft/engine.ts`
- Modify: `components/draft/PickCell.tsx`
- Modify: `components/draft/PickGrid.tsx`
- Modify: `components/draft/DraftBoard.tsx`
- Modify: `components/draft/MyTeam.tsx`
- Modify: `tests/lib/draft-engine.test.ts`
- Modify: `tests/lib/draft-analytics.test.ts`

**Interfaces:**
- Produces: `PickSlot.currentOwnerTeamSlot: number` (replaces `isUser`)
- Produces: `TradeRecord` type in `lib/draft/types.ts`
- Consumed by: Task 2A-2 (TradeBuilder UI)

**Type changes in `lib/draft/types.ts`:**

```typescript
// REMOVE isUser from PickSlot, ADD currentOwnerTeamSlot:
export interface PickSlot {
  overallPick: number
  round: number
  pickInRound: number
  teamSlot: number            // original draft position (NEVER changes)
  currentOwnerTeamSlot: number // who owns this pick — starts equal to teamSlot
  playerId: string | null
}

// ADD TradeRecord (UI-only, never in DraftState):
export interface TradeRecord {
  id: string           // crypto.randomUUID() or `trade-${Date.now()}`
  opponentSlot: number // which team you traded with
  youGive: { round: number; teamSlot: number }[]    // picks going to opponent
  youReceive: { round: number; teamSlot: number }[] // picks coming to you
}
```

**Engine changes in `lib/draft/engine.ts`:**

1. In `buildInitialState`, replace `isUser: teamSlot === userSlot` with `currentOwnerTeamSlot: teamSlot`:
```typescript
// BEFORE:
teamSlot,
isUser: teamSlot === userSlot,

// AFTER:
teamSlot,
currentOwnerTeamSlot: teamSlot,
```

2. DELETE `tradePickSlots` function entirely.

3. In `computeDraftAnalytics` (line 138), replace:
```typescript
// BEFORE:
const userPicks = state.picks.filter(p => p.isUser && p.playerId !== null)

// AFTER:
const userPicks = state.picks.filter(
  p => p.currentOwnerTeamSlot === state.settings.userSlot && p.playerId !== null
)
```

**Component changes:**

`components/draft/PickCell.tsx` — add `userSlot: number` prop, derive `isUser`:
```typescript
// Add to PickCellProps:
userSlot: number

// At top of component body, replace any pick.isUser usage:
const isUser = pick.currentOwnerTeamSlot === userSlot

// In cellBg:
if (isCompleted && isUser) return 'bg-[#1a0505] border-pmp-red/20'
```

`components/draft/PickGrid.tsx` — add `userSlot: number` prop, remove the `picks.find(p => p.isUser)` lookup:
```typescript
// Add to PickGridProps:
userSlot: number

// REMOVE:
const userTeamSlot = picks.find(p => p.isUser)?.teamSlot

// REPLACE with direct use of userSlot prop for header:
style={i + 1 === userSlot ? { color: '#ef4444' } : { color: '#4b5563' }}
// and:
{i + 1 === userSlot ? '⭐ YOU' : `${i + 1}`}

// Pass userSlot down to each PickCell:
<PickCell
  userSlot={userSlot}
  // ...other existing props
/>
```

`components/draft/DraftBoard.tsx`:
1. Pass `userSlot={state.settings.userSlot}` to `<PickGrid>`.
2. Replace `currentPick.isUser` (lines 94 and 175):
```typescript
// BEFORE:
if (currentPick.isUser) {

// AFTER:
if (currentPick.currentOwnerTeamSlot === state.settings.userSlot) {

// BEFORE:
const isUserTurn = currentPick?.isUser === true && state.status === 'paused'

// AFTER:
const isUserTurn =
  currentPick?.currentOwnerTeamSlot === state.settings.userSlot &&
  state.status === 'paused'
```

3. Replace the `initialTrades` prop and trade application logic with `ownershipMap`:
```typescript
// Remove initialTrades prop. Add:
ownershipMap?: Map<string, number>  // keyed "${round}_${teamSlot}" → currentOwnerTeamSlot

// In the useReducer init function, replace the for-loop trade application:
() => {
  const initial = initialState ?? buildInitialState(settings, players)
  if (!ownershipMap?.size) return initial
  return {
    ...initial,
    picks: initial.picks.map(p => {
      const key = `${p.round}_${p.teamSlot}`
      const owner = ownershipMap.get(key)
      return owner !== undefined ? { ...p, currentOwnerTeamSlot: owner } : p
    }),
  }
}
```

4. Remove import of `tradePickSlots` from engine.

`components/draft/MyTeam.tsx` — replace `.filter(p => p.isUser && ...)`:
```typescript
// BEFORE:
.filter(p => p.isUser && p.playerId !== null)

// AFTER:
// MyTeam already receives picks + playerMap. It also needs to know userSlot.
// Add userSlot prop to MyTeamProps:
interface MyTeamProps {
  picks: PickSlot[]
  playerMap: Map<string, Player>
  lineup: LineupConfig
  userSlot: number   // NEW
}

// Then:
.filter(p => p.currentOwnerTeamSlot === userSlot && p.playerId !== null)
```

Pass `userSlot={state.settings.userSlot}` to `<MyTeam>` in DraftBoard.

**Test changes:**

`tests/lib/draft-engine.test.ts`:
- Replace `expect(state.picks[2].isUser).toBe(true)` with `expect(state.picks[2].currentOwnerTeamSlot).toBe(3)` (for userSlot=3)
- Replace `expect(state.picks[17].isUser).toBe(true)` with `expect(state.picks[17].currentOwnerTeamSlot).toBe(3)`
- Delete the 4 `tradePickSlots` tests (function no longer exists)
- Keep all other engine tests unchanged

`tests/lib/draft-analytics.test.ts`:
- Replace `p.isUser ? '1' : ...` with `p.currentOwnerTeamSlot === state.settings.userSlot ? '1' : ...`
  Actually, check the test context — it likely accesses `p.isUser` to build mock data. Replace with the equivalent using `currentOwnerTeamSlot`.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/draft-ownership.test.ts (NEW)
import { describe, it, expect } from 'vitest'
import { buildInitialState } from '@/lib/draft/engine'
import { DEFAULT_LINEUP } from '@/lib/draft/types'

const BASE = {
  numTeams: 4, numRounds: 15 as const, userSlot: 1,
  scoring: 'ppr' as const, speed: 'fast' as const, lineup: DEFAULT_LINEUP,
}

describe('currentOwnerTeamSlot', () => {
  it('all picks start owned by their teamSlot', () => {
    const state = buildInitialState(BASE, [])
    expect(state.picks.every(p => p.currentOwnerTeamSlot === p.teamSlot)).toBe(true)
  })

  it('isUser is derived correctly for slot 1', () => {
    const state = buildInitialState(BASE, [])
    const userPick = state.picks[0]  // round 1, slot 1 = pick 1
    expect(userPick.currentOwnerTeamSlot === BASE.userSlot).toBe(true)
  })

  it('ownership map application changes currentOwnerTeamSlot', () => {
    const state = buildInitialState(BASE, [])
    const ownershipMap = new Map<string, number>([['1_1', 4], ['2_4', 1]])
    const updated = {
      ...state,
      picks: state.picks.map(p => {
        const key = `${p.round}_${p.teamSlot}`
        const owner = ownershipMap.get(key)
        return owner !== undefined ? { ...p, currentOwnerTeamSlot: owner } : p
      }),
    }
    const pick_1_1 = updated.picks.find(p => p.round === 1 && p.teamSlot === 1)
    const pick_2_4 = updated.picks.find(p => p.round === 2 && p.teamSlot === 4)
    expect(pick_1_1?.currentOwnerTeamSlot).toBe(4)
    expect(pick_2_4?.currentOwnerTeamSlot).toBe(1)
  })

  it('no pick has isUser field', () => {
    const state = buildInitialState(BASE, [])
    expect('isUser' in state.picks[0]).toBe(false)
  })
})
```

Run: `npx vitest run tests/lib/draft-ownership.test.ts`
Expected: FAIL — `isUser` still exists, `currentOwnerTeamSlot` doesn't

- [ ] **Step 2: Update `lib/draft/types.ts`**

Remove `isUser: boolean` from `PickSlot`. Add `currentOwnerTeamSlot: number`. Add `TradeRecord` interface.

- [ ] **Step 3: Update `lib/draft/engine.ts`**

In `buildInitialState`: replace `isUser: teamSlot === userSlot` with `currentOwnerTeamSlot: teamSlot`.

In `computeDraftAnalytics`: replace `.filter(p => p.isUser && ...)` with `.filter(p => p.currentOwnerTeamSlot === state.settings.userSlot && ...)`.

Delete `tradePickSlots` function entirely.

- [ ] **Step 4: Run draft-ownership tests**

```bash
npx vitest run tests/lib/draft-ownership.test.ts
```
Expected: PASS

- [ ] **Step 5: Update `tests/lib/draft-engine.test.ts`**

Replace the two `isUser` assertions:
```typescript
// BEFORE:
expect(state.picks[2].isUser).toBe(true)   // pick 3 of round 1
expect(state.picks[17].isUser).toBe(true)  // round 2 reverses: slot 3 is pick 18

// AFTER — userSlot is 3 in that test's baseSettings:
expect(state.picks[2].currentOwnerTeamSlot).toBe(3)
expect(state.picks[17].currentOwnerTeamSlot).toBe(3)
```

Delete the 4 `tradePickSlots` describe block (function is gone). Also delete the import of `tradePickSlots` from that test file.

- [ ] **Step 6: Update `tests/lib/draft-analytics.test.ts`**

Find the `p.isUser` reference (line ~73). The test likely constructs a mock state. Replace `p.isUser ? '1'` with the equivalent: check if `p.currentOwnerTeamSlot === userSlot` using the settings from that test's state.

Read the full test context before changing, to get the right `userSlot` value.

- [ ] **Step 7: Run all engine and analytics tests**

```bash
npx vitest run tests/lib/
```
Expected: all pass

- [ ] **Step 8: Update `components/draft/PickCell.tsx`**

Add `userSlot: number` to `PickCellProps`. Add `const isUser = pick.currentOwnerTeamSlot === userSlot` at top of component. Replace `pick.isUser` usage with `isUser`.

- [ ] **Step 9: Update `components/draft/PickGrid.tsx`**

Add `userSlot: number` to `PickGridProps`. Remove `const userTeamSlot = picks.find(p => p.isUser)?.teamSlot`. Use `userSlot` directly in headers and pass it to each `<PickCell>`.

- [ ] **Step 10: Update `components/draft/MyTeam.tsx`**

Add `userSlot: number` to `MyTeamProps`. Replace `.filter(p => p.isUser && ...)` with `.filter(p => p.currentOwnerTeamSlot === userSlot && ...)`.

- [ ] **Step 11: Update `components/draft/DraftBoard.tsx`**

a. Remove `tradePickSlots` import and `initialTrades` prop.
b. Add `ownershipMap?: Map<string, number>` prop.
c. Update `useReducer` init to apply ownership map instead of trades.
d. Fix `currentPick.isUser` → `currentPick.currentOwnerTeamSlot === state.settings.userSlot` (2 places).
e. Pass `userSlot={state.settings.userSlot}` to `<PickGrid>`.
f. Pass `userSlot={state.settings.userSlot}` to `<MyTeam>`.

- [ ] **Step 12: Run full test suite**

```bash
npx vitest run
```
Expected: all existing tests pass (≥84)

- [ ] **Step 13: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "tests/"
```
Expected: no errors in component/lib files

- [ ] **Step 14: Commit**

```bash
git add lib/draft/types.ts lib/draft/engine.ts \
  components/draft/PickCell.tsx components/draft/PickGrid.tsx \
  components/draft/DraftBoard.tsx components/draft/MyTeam.tsx \
  tests/lib/draft-ownership.test.ts tests/lib/draft-engine.test.ts \
  tests/lib/draft-analytics.test.ts
git commit -m "feat: replace isUser with currentOwnerTeamSlot — ownership-first model"
```

---

### Task 2A-2: Trade Builder UI

**Files:**
- Create: `components/draft/DraftPickTradesPanel.tsx`
- Modify: `components/draft/DraftSetup.tsx` (replace dropdown with panel)
- Modify: `app/mock-draft/page.tsx` (pass `ownershipMap` to DraftBoard instead of trades)
- Test: `tests/components/DraftPickTradesPanel.test.tsx` (create)

**Interfaces:**
- Consumes: `TradeRecord` from `lib/draft/types.ts` (Task 2A-1)
- Consumes: `PickSlot.currentOwnerTeamSlot` (Task 2A-1)
- Produces: `ownershipMap: Map<string, number>` that DraftBoard accepts

**Core ownership helpers** (inline in `DraftPickTradesPanel.tsx` — pure functions, no exports needed):

```typescript
// Build fresh map where every pick starts owned by its teamSlot
function buildBaseMap(numTeams: number, numRounds: number): Map<string, number> {
  const map = new Map<string, number>()
  for (let r = 1; r <= numRounds; r++) {
    for (let s = 1; s <= numTeams; s++) {
      map.set(`${r}_${s}`, s)
    }
  }
  return map
}

// Apply a committed trade to an ownership map (immutable — returns new map)
function applyTrade(
  map: Map<string, number>,
  trade: TradeRecord,
  userSlot: number,
  opponentSlot: number,
): Map<string, number> {
  const next = new Map(map)
  for (const p of trade.youGive)    next.set(`${p.round}_${p.teamSlot}`, opponentSlot)
  for (const p of trade.youReceive) next.set(`${p.round}_${p.teamSlot}`, userSlot)
  return next
}

// Derive ownership map from a list of committed trades
function buildOwnershipMap(
  trades: TradeRecord[],
  numTeams: number,
  numRounds: number,
  userSlot: number,
): Map<string, number> {
  let map = buildBaseMap(numTeams, numRounds)
  for (const t of trades) {
    map = applyTrade(map, t, userSlot, t.opponentSlot)
  }
  return map
}
```

**Component props:**

```typescript
interface DraftPickTradesPanelProps {
  numTeams: number
  numRounds: number     // always 15
  userSlot: number
  trades: TradeRecord[]
  onTradesChange: (trades: TradeRecord[]) => void
}
```

**State:**

```typescript
// Pending trade being built
const [pendingOpponentSlot, setPendingOpponentSlot] = useState<number | null>(null)
const [pendingYouGive, setPendingYouGive] = useState<{ round: number; teamSlot: number }[]>([])
const [pendingYouReceive, setPendingYouReceive] = useState<{ round: number; teamSlot: number }[]>([])

// Derived: ownership map from committed trades only
const committedMap = useMemo(
  () => buildOwnershipMap(trades, numTeams, numRounds, userSlot),
  [trades, numTeams, numRounds, userSlot],
)

// Derived: preview map = committed + pending
const previewMap = useMemo(() => {
  if (!pendingOpponentSlot) return committedMap
  const pending: TradeRecord = {
    id: 'pending',
    opponentSlot: pendingOpponentSlot,
    youGive: pendingYouGive,
    youReceive: pendingYouReceive,
  }
  return applyTrade(committedMap, pending, userSlot, pendingOpponentSlot)
}, [committedMap, pendingOpponentSlot, pendingYouGive, pendingYouReceive, userSlot])
```

**Pick ownership grid** (inline component `OwnershipGrid`):

A compact read-only grid showing all pick slots colored by current owner. Clicking a pick adds it to the pending trade.

```tsx
function OwnershipGrid({
  numTeams, numRounds, ownershipMap, userSlot, opponentSlot,
  pendingYouGive, pendingYouReceive,
  onPickClick,
}: {
  numTeams: number; numRounds: number
  ownershipMap: Map<string, number>
  userSlot: number; opponentSlot: number | null
  pendingYouGive: { round: number; teamSlot: number }[]
  pendingYouReceive: { round: number; teamSlot: number }[]
  onPickClick: (round: number, teamSlot: number) => void
}) {
  // Build picks array sorted by round then teamSlot (same as PickGrid)
  const cells = []
  for (let r = 1; r <= numRounds; r++) {
    for (let s = 1; s <= numTeams; s++) {
      cells.push({ round: r, teamSlot: s })
    }
  }

  return (
    <div className="overflow-auto">
      <div
        className="grid gap-0.5 min-w-max"
        style={{ gridTemplateColumns: `repeat(${numTeams}, minmax(56px, 1fr))` }}
      >
        {/* Column headers */}
        {Array.from({ length: numTeams }, (_, i) => (
          <div
            key={i}
            className="text-center py-1 text-[10px] font-semibold sticky top-0 bg-[#0d0d0d] border-b border-[#1e1e1e]"
            style={{ color: i + 1 === userSlot ? '#ef4444' : '#4b5563' }}
          >
            {i + 1 === userSlot ? '⭐ YOU' : `${i + 1}`}
          </div>
        ))}

        {cells.map(({ round, teamSlot }) => {
          const key = `${round}_${teamSlot}`
          const owner = ownershipMap.get(key) ?? teamSlot
          const isYourPick = owner === userSlot
          const isOpponentPick = opponentSlot !== null && owner === opponentSlot
          const inYouGive = pendingYouGive.some(p => p.round === round && p.teamSlot === teamSlot)
          const inYouReceive = pendingYouReceive.some(p => p.round === round && p.teamSlot === teamSlot)

          const bg = inYouGive
            ? 'bg-[#1a0505] border-pmp-red ring-1 ring-pmp-red'
            : inYouReceive
            ? 'bg-[#051a08] border-green-700 ring-1 ring-green-600'
            : isYourPick
            ? 'bg-[#1a0505] border-pmp-red/20'
            : isOpponentPick
            ? 'bg-[#1e1e1e] border-[#3a3a3a]'
            : 'bg-[#111111] border-[#1e1e1e]'

          const clickable = isYourPick || isOpponentPick
          const label = `${round}.${String(teamSlot).padStart(2, '0')}`
          const ownerLabel = owner === userSlot ? 'YOU' : `T${owner}`

          return (
            <button
              key={key}
              type="button"
              onClick={() => clickable ? onPickClick(round, teamSlot) : undefined}
              disabled={!clickable}
              className={`border rounded p-1 text-left transition-all ${bg} ${
                clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              }`}
            >
              <p className="text-pmp-gray-600 text-[9px] leading-none">{label}</p>
              <p className={`text-[9px] font-semibold mt-0.5 leading-none ${
                isYourPick ? 'text-pmp-red' : isOpponentPick ? 'text-pmp-gray-400' : 'text-pmp-gray-700'
              }`}>{ownerLabel}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

**Click handler logic:**

```typescript
const handlePickClick = (round: number, teamSlot: number) => {
  const key = `${round}_${teamSlot}`
  const owner = previewMap.get(key) ?? teamSlot

  if (owner === userSlot) {
    // Toggle in youGive
    const already = pendingYouGive.some(p => p.round === round && p.teamSlot === teamSlot)
    if (already) {
      setPendingYouGive(prev => prev.filter(p => !(p.round === round && p.teamSlot === teamSlot)))
    } else {
      setPendingYouGive(prev => [...prev, { round, teamSlot }])
    }
  } else if (owner === pendingOpponentSlot) {
    // Toggle in youReceive
    const already = pendingYouReceive.some(p => p.round === round && p.teamSlot === teamSlot)
    if (already) {
      setPendingYouReceive(prev => prev.filter(p => !(p.round === round && p.teamSlot === teamSlot)))
    } else {
      setPendingYouReceive(prev => [...prev, { round, teamSlot }])
    }
  }
}
```

**Cancel and Apply:**

```typescript
const handleCancel = () => {
  setPendingOpponentSlot(null)
  setPendingYouGive([])
  setPendingYouReceive([])
}

const handleApply = () => {
  if (!pendingOpponentSlot) return
  if (pendingYouGive.length === 0 && pendingYouReceive.length === 0) return
  const newTrade: TradeRecord = {
    id: `trade-${Date.now()}`,
    opponentSlot: pendingOpponentSlot,
    youGive: pendingYouGive,
    youReceive: pendingYouReceive,
  }
  onTradesChange([...trades, newTrade])
  handleCancel()  // reset pending state
}
```

**Full component JSX structure:**

```tsx
export function DraftPickTradesPanel({ numTeams, numRounds, userSlot, trades, onTradesChange }: DraftPickTradesPanelProps) {
  // ... state and handlers above ...

  const canApply = pendingOpponentSlot !== null && (pendingYouGive.length > 0 || pendingYouReceive.length > 0)

  return (
    <div className="space-y-4">
      {/* Team selector */}
      <div>
        <p className="text-pmp-gray-600 text-xs uppercase tracking-widest mb-2">Trade With</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: numTeams }, (_, i) => i + 1).filter(s => s !== userSlot).map(slot => (
            <button
              key={slot}
              type="button"
              onClick={() => { setPendingOpponentSlot(slot); setPendingYouGive([]); setPendingYouReceive([]) }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                pendingOpponentSlot === slot
                  ? 'bg-pmp-red text-white'
                  : 'bg-[#1e1e1e] text-pmp-gray-400 hover:bg-[#2a2a2a]'
              }`}
            >
              Team {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Ownership grid (always visible) */}
      <OwnershipGrid
        numTeams={numTeams}
        numRounds={numRounds}
        ownershipMap={previewMap}
        userSlot={userSlot}
        opponentSlot={pendingOpponentSlot}
        pendingYouGive={pendingYouGive}
        pendingYouReceive={pendingYouReceive}
        onPickClick={handlePickClick}
      />

      {/* Pending trade summary + actions (only shown when team is selected) */}
      {pendingOpponentSlot !== null && (
        <div className="border border-[#2a2a2a] rounded-lg p-3 space-y-3">
          <p className="text-pmp-white text-xs font-semibold">Pending trade with Team {pendingOpponentSlot}</p>

          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-pmp-red text-[10px] uppercase tracking-wider mb-1">You Give</p>
              {pendingYouGive.length === 0 ? (
                <p className="text-pmp-gray-700 text-xs">Click your picks above</p>
              ) : (
                pendingYouGive.map(p => (
                  <p key={`${p.round}_${p.teamSlot}`} className="text-pmp-white text-xs">
                    {p.round}.{String(p.teamSlot).padStart(2, '0')}
                  </p>
                ))
              )}
            </div>
            <div className="flex-1">
              <p className="text-green-500 text-[10px] uppercase tracking-wider mb-1">You Receive</p>
              {pendingYouReceive.length === 0 ? (
                <p className="text-pmp-gray-700 text-xs">Click their picks above</p>
              ) : (
                pendingYouReceive.map(p => (
                  <p key={`${p.round}_${p.teamSlot}`} className="text-pmp-white text-xs">
                    {p.round}.{String(p.teamSlot).padStart(2, '0')}
                  </p>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg text-xs text-pmp-gray-400 hover:text-pmp-white border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pmp-red text-white hover:opacity-90 disabled:opacity-30 transition-colors"
            >
              Apply Trade
            </button>
          </div>
        </div>
      )}

      {/* Trade history */}
      {trades.length > 0 && (
        <div>
          <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest mb-2">Trade History</p>
          {trades.map(trade => (
            <div key={trade.id} className="border border-[#1e1e1e] rounded-lg p-2.5 mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-pmp-white text-xs font-semibold mb-1">Team {trade.opponentSlot}</p>
                {trade.youGive.length > 0 && (
                  <p className="text-pmp-red text-[10px]">
                    Give: {trade.youGive.map(p => `${p.round}.${String(p.teamSlot).padStart(2, '0')}`).join(', ')}
                  </p>
                )}
                {trade.youReceive.length > 0 && (
                  <p className="text-green-500 text-[10px]">
                    Receive: {trade.youReceive.map(p => `${p.round}.${String(p.teamSlot).padStart(2, '0')}`).join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onTradesChange(trades.filter(t => t.id !== trade.id))}
                className="text-pmp-gray-700 hover:text-pmp-red text-xs shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**`DraftSetup.tsx` changes:**

Remove `PickTrade`, `pickTrades`, `updateTrade`, `removeTrade` state. Replace the "Customize Draft Order" dropdown section with `DraftPickTradesPanel`. The `onStart` callback passes the resolved `ownershipMap` instead of raw trades:

```typescript
import { DraftPickTradesPanel } from './DraftPickTradesPanel'
import type { TradeRecord } from '@/lib/draft/types'

// State changes:
// REMOVE: const [customizePicks, setCustomizePicks] = useState(false)
// REMOVE: const [pickTrades, setPickTrades] = useState<PickTrade[]>([])
// ADD:
const [showTradeBuilder, setShowTradeBuilder] = useState(false)
const [trades, setTrades] = useState<TradeRecord[]>([])

// onStart prop type changes:
// REMOVE: onStart: (settings, players, trades: PickTrade[]) => void
// ADD:
onStart: (settings: DraftSettings, players: Player[], ownershipMap: Map<string, number>) => void

// In handleStart, compute ownershipMap from trades:
const ownershipMap = buildOwnershipMapFromTrades(trades, numTeams, 15, userSlot)
onStart(settings, players, ownershipMap)
```

The `buildOwnershipMapFromTrades` function needs to be available in DraftSetup. Either import from DraftPickTradesPanel (if exported) or duplicate the 3-line pure function. Prefer duplicating the 3 lines since it's trivial and avoids a component-to-component import.

Replace the Customize Draft Order section in JSX:
```tsx
{/* Pre-draft pick trading */}
<div className="w-full">
  <button
    type="button"
    onClick={() => setShowTradeBuilder(v => !v)}
    className="flex items-center gap-2 text-pmp-gray-500 text-sm hover:text-pmp-gray-300 transition-colors"
  >
    <span className={`text-xs transition-transform ${showTradeBuilder ? 'rotate-90' : ''}`}>▶</span>
    Pre-Draft Pick Trades
    {trades.length > 0 && (
      <span className="bg-pmp-red text-white text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
        {trades.length}
      </span>
    )}
  </button>

  {showTradeBuilder && (
    <div className="mt-3">
      <DraftPickTradesPanel
        numTeams={numTeams}
        numRounds={15}
        userSlot={userSlot}
        trades={trades}
        onTradesChange={setTrades}
      />
    </div>
  )}
</div>
```

**`app/mock-draft/page.tsx` changes:**

The page's `handleStart` now receives `(settings, players, ownershipMap)` instead of `(settings, players, trades)`. Pass `ownershipMap` to DraftBoard:
```tsx
// The DraftBoard prop changes from initialTrades to ownershipMap
<DraftBoard
  settings={settings}
  players={players}
  initialState={null}
  ownershipMap={ownershipMap}
/>
```

- [ ] **Step 1: Write failing tests**

```typescript
// tests/components/DraftPickTradesPanel.test.tsx
import { describe, it, expect } from 'vitest'
import { TradeRecord } from '@/lib/draft/types'

// Pure helpers to test in isolation (copy from component)
function buildBaseMap(numTeams: number, numRounds: number): Map<string, number> {
  const map = new Map<string, number>()
  for (let r = 1; r <= numRounds; r++) {
    for (let s = 1; s <= numTeams; s++) {
      map.set(`${r}_${s}`, s)
    }
  }
  return map
}

function applyTradeToMap(
  map: Map<string, number>,
  trade: TradeRecord,
  userSlot: number,
): Map<string, number> {
  const next = new Map(map)
  for (const p of trade.youGive)    next.set(`${p.round}_${p.teamSlot}`, trade.opponentSlot)
  for (const p of trade.youReceive) next.set(`${p.round}_${p.teamSlot}`, userSlot)
  return next
}

describe('buildBaseMap', () => {
  it('creates a 4x3 map with 12 entries all equal to teamSlot', () => {
    const map = buildBaseMap(4, 3)
    expect(map.size).toBe(12)
    expect(map.get('1_1')).toBe(1)
    expect(map.get('3_4')).toBe(4)
  })
})

describe('applyTradeToMap', () => {
  it('one-for-one: gives 1.01 to T4, receives 2.04', () => {
    const map = buildBaseMap(4, 15)
    const trade: TradeRecord = {
      id: 't1', opponentSlot: 4,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [{ round: 2, teamSlot: 4 }],
    }
    const result = applyTradeToMap(map, trade, 1)
    expect(result.get('1_1')).toBe(4)  // 1.01 now owned by T4
    expect(result.get('2_4')).toBe(1)  // 2.04 now owned by you
  })

  it('N-for-M: 3 picks for 3 picks', () => {
    const map = buildBaseMap(10, 15)
    const trade: TradeRecord = {
      id: 't2', opponentSlot: 4,
      youGive: [
        { round: 1, teamSlot: 1 },
        { round: 7, teamSlot: 1 },
        { round: 15, teamSlot: 1 },
      ],
      youReceive: [
        { round: 2, teamSlot: 4 },
        { round: 3, teamSlot: 4 },
        { round: 5, teamSlot: 4 },
      ],
    }
    const result = applyTradeToMap(map, trade, 1)
    expect(result.get('1_1')).toBe(4)
    expect(result.get('7_1')).toBe(4)
    expect(result.get('15_1')).toBe(4)
    expect(result.get('2_4')).toBe(1)
    expect(result.get('3_4')).toBe(1)
    expect(result.get('5_4')).toBe(1)
  })

  it('2-for-1: give 2 picks, receive 1', () => {
    const map = buildBaseMap(10, 15)
    const trade: TradeRecord = {
      id: 't3', opponentSlot: 4,
      youGive: [{ round: 1, teamSlot: 1 }, { round: 5, teamSlot: 1 }],
      youReceive: [{ round: 2, teamSlot: 4 }],
    }
    const result = applyTradeToMap(map, trade, 1)
    expect(result.get('1_1')).toBe(4)
    expect(result.get('5_1')).toBe(4)
    expect(result.get('2_4')).toBe(1)
    // Unaffected pick:
    expect(result.get('3_1')).toBe(1)
  })

  it('chain: receive pick in trade 1, give it in trade 2', () => {
    let map = buildBaseMap(10, 15)
    // Trade 1: give 1.01, receive 2.04 from T4
    const trade1: TradeRecord = {
      id: 't1', opponentSlot: 4,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [{ round: 2, teamSlot: 4 }],
    }
    map = applyTradeToMap(map, trade1, 1)
    expect(map.get('2_4')).toBe(1) // you now own 2.04

    // Trade 2: give the 2.04 you received to T7, receive T7's 3.07
    const trade2: TradeRecord = {
      id: 't2', opponentSlot: 7,
      youGive: [{ round: 2, teamSlot: 4 }],   // the pick you received
      youReceive: [{ round: 3, teamSlot: 7 }],
    }
    map = applyTradeToMap(map, trade2, 1)
    expect(map.get('2_4')).toBe(7) // 2.04 now owned by T7
    expect(map.get('3_7')).toBe(1) // 3.07 now owned by you
  })

  it('is immutable — does not mutate the original map', () => {
    const map = buildBaseMap(4, 15)
    const original = map.get('1_1')
    const trade: TradeRecord = {
      id: 't1', opponentSlot: 4,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [],
    }
    applyTradeToMap(map, trade, 1)
    expect(map.get('1_1')).toBe(original)
  })
})
```

Run: `npx vitest run tests/components/DraftPickTradesPanel.test.tsx`
Expected: FAIL (component file doesn't exist yet, pure functions not defined)

- [ ] **Step 2: Create `components/draft/DraftPickTradesPanel.tsx`**

Full implementation using the code in the spec above. The pure functions `buildBaseMap`, `applyTradeToMap`, and `buildOwnershipMapFromTrades` live at the top of the file before the component. Export only `DraftPickTradesPanel` and the `buildOwnershipMapFromTrades` helper (needed by DraftSetup).

```typescript
// Export the map builder so DraftSetup can compute the final ownershipMap:
export function buildOwnershipMapFromTrades(
  trades: TradeRecord[],
  numTeams: number,
  numRounds: number,
  userSlot: number,
): Map<string, number> {
  let map = buildBaseMap(numTeams, numRounds)
  for (const t of trades) map = applyTradeToMap(map, t, userSlot)
  return map
}
```

- [ ] **Step 3: Run DraftPickTradesPanel tests**

```bash
npx vitest run tests/components/DraftPickTradesPanel.test.tsx
```
Expected: PASS (all 6 tests)

- [ ] **Step 4: Update `components/draft/DraftSetup.tsx`**

a. Remove `PickTrade` type, `customizePicks`, `pickTrades`, `updateTrade`, `removeTrade`.
b. Add `showTradeBuilder`, `trades`, import `DraftPickTradesPanel`, `TradeRecord`, `buildOwnershipMapFromTrades`.
c. Update `onStart` prop signature.
d. Replace "Customize Draft Order" section with the new Trade Builder section.
e. In `handleStart`, compute `ownershipMap` and pass it.

- [ ] **Step 5: Update `app/mock-draft/page.tsx`**

Change `handleStart` signature to accept `ownershipMap: Map<string, number>`. Pass it as `ownershipMap` prop to `<DraftBoard>` instead of `initialTrades`.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass (≥84)

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "tests/"
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add components/draft/DraftPickTradesPanel.tsx components/draft/DraftSetup.tsx \
  app/mock-draft/page.tsx tests/components/DraftPickTradesPanel.test.tsx
git commit -m "feat: trade builder — N-for-M trades, live board preview, trade history"
```

---

## Summary

| Task | Feature | Key Files |
|------|---------|-----------|
| 2A-1 | Replace `isUser` with `currentOwnerTeamSlot` everywhere | types.ts, engine.ts, PickCell, PickGrid, DraftBoard, MyTeam, tests |
| 2A-2 | TradeBuilder — N-for-M, live preview, shopping cart, history | DraftPickTradesPanel, DraftSetup, page.tsx |

**After Task 2A, continue with Tasks 3–6 from the V2 plan.**
Note: Task 3 (My Team) is already complete. Begin at Task 4.
