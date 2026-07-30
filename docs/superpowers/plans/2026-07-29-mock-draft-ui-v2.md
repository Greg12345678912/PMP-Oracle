# Mock Draft UI V2 — Polish & Animations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the mock draft from a functional developer tool into a polished, Sleeper-caliber draft experience: visual hierarchy, player headshots/rankings, position-based My Team with custom lineup, sticky board headers, pick animations, board zoom, and obvious swap UX.

**Architecture:** All changes are UI-only — the engine (`lib/draft/engine.ts`) is untouched except Task 1 adds `lineup` to `DraftSettings` in `lib/draft/types.ts`. Drag-to-swap and click-to-place remain the swap mechanism; this plan makes them dramatically more visible and satisfying.

**Tech Stack:** Next.js 16.2.11 App Router, TypeScript strict, Tailwind CSS v4 (bracket notation for non-token colors), CSS keyframe animations (no Framer Motion — avoids peer dep issues)

## Global Constraints

- Tailwind v4: no config file. Bracket notation for non-token hex: `bg-[#181818]`, `border-[#2a2a2a]`
- Existing pmp-* tokens: `pmp-black`, `pmp-red`, `pmp-white`, `pmp-gray-900/800/700/600/500`
- Engine (`lib/draft/engine.ts`) MAY be modified ONLY to add `tradePickSlots` — no changes to existing functions
- `lib/draft/types.ts` MAY be modified ONLY to add `LineupConfig`, `DEFAULT_LINEUP`, and `lineup?: LineupConfig` to `DraftSettings`
- `assignPlayerToSlot` already rejects future picks — swap logic respects this
- TypeScript strict mode — no `any`, no implicit `any`
- Vitest + jsdom tests in `tests/`; run `npx vitest run` to verify
- Colors: bg `#0d0d0d`, cells `#181818`, your-picks `#1a0505`, current `bright red border + animate-pulse`, completed others `#1e1e1e`, empty `#111111`
- My Team lineup: fully customizable via `LineupConfig` set in DraftSetup; default = `{ QB:1, RB:2, WR:3, TE:1, FLEX:1, K:0, DEF:1, BN:6 }` (= 15 slots)
- FLEX accepts RB/WR/TE; BN accepts any position
- Slot assignment: greedy — iterate ROSTER_SLOTS order, assign first matching undrafted player
- `headshotUrl` already exists on `Player` — use it; show initials fallback if null/empty
- Swap UX: drag-to-swap and click-to-place already work — make them visually obvious with hover hint and animated cell flash on successful swap
- Do NOT add a text-input swap panel (deferred to V4)
- Do NOT touch `lib/draft/supabase.ts`

---

### Task 1: Customizable lineup — add to types + DraftSetup

**Files:**
- Modify: `lib/draft/types.ts` (add `LineupConfig` + `lineup?` to `DraftSettings`)
- Modify: `components/draft/DraftSetup.tsx` (add lineup editor)
- Modify: `components/draft/DraftBoard.tsx` (pass lineup through)
- Test: `tests/lib/draft-lineup.test.ts` (create)

**Interfaces:**
- Produces: `LineupConfig` type, `DraftSettings.lineup?: LineupConfig`
- Consumed by: Task 3 (MyTeam), Task 4 (DraftBoard)

**LineupConfig type:**
```typescript
// lib/draft/types.ts — add after DraftSettings:
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

// Add to DraftSettings interface:
// lineup?: LineupConfig
```

**LineupConfig → ROSTER_SLOTS converter** (pure function, no React):
```typescript
// lib/draft/lineup.ts (create)
import type { LineupConfig } from './types'

export interface RosterSlot {
  label: string
  positions: string[]
}

export function buildRosterSlots(lineup: LineupConfig): RosterSlot[] {
  const slots: RosterSlot[] = []
  const repeat = (n: number, label: string, positions: string[]) => {
    for (let i = 0; i < n; i++) slots.push({ label, positions })
  }
  repeat(lineup.QB,   'QB',   ['QB'])
  repeat(lineup.RB,   'RB',   ['RB'])
  repeat(lineup.WR,   'WR',   ['WR'])
  repeat(lineup.TE,   'TE',   ['TE'])
  repeat(lineup.FLEX, 'FLEX', ['RB', 'WR', 'TE'])
  repeat(lineup.K,    'K',    ['K'])
  repeat(lineup.DEF,  'DEF',  ['DEF'])
  repeat(lineup.BN,   'BN',   ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
  return slots
}
```

**DraftSetup lineup editor** — stepper row for each position:
```tsx
// In DraftSetup.tsx, add below the existing selects and above the Start button.
// lineup state: useState<LineupConfig>(DEFAULT_LINEUP)
// Each row: label + "-" button + count + "+" button
// Show total slots = sum of all values, warn if total !== numRounds (15)

const total = Object.values(lineup).reduce((s, n) => s + n, 0)

<div className="w-full">
  <p className="text-pmp-gray-600 text-xs uppercase tracking-widest mb-3">LINEUP</p>
  {(['QB','RB','WR','TE','FLEX','K','DEF','BN'] as const).map(pos => (
    <div key={pos} className="flex items-center justify-between py-1.5">
      <span className="text-pmp-white text-sm w-12">{pos}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setLineup(l => ({ ...l, [pos]: Math.max(0, l[pos] - 1) }))}
          className="w-7 h-7 rounded-full bg-[#1e1e1e] text-pmp-white text-lg leading-none flex items-center justify-center hover:bg-[#2a2a2a]"
        >−</button>
        <span className="text-pmp-white text-sm w-4 text-center">{lineup[pos]}</span>
        <button
          type="button"
          onClick={() => setLineup(l => ({ ...l, [pos]: l[pos] + 1 }))}
          className="w-7 h-7 rounded-full bg-[#1e1e1e] text-pmp-white text-lg leading-none flex items-center justify-center hover:bg-[#2a2a2a]"
        >+</button>
      </div>
    </div>
  ))}
  <p className={`text-xs mt-2 ${total === 15 ? 'text-pmp-gray-600' : 'text-yellow-500'}`}>
    {total} / 15 slots {total !== 15 ? '— adjust to match 15 rounds' : '✓'}
  </p>
</div>
```

**League presets** — shown above the custom steppers:
```typescript
const LINEUP_PRESETS: Record<string, { label: string; icon: string; lineup: LineupConfig }> = {
  espn: {
    label: 'ESPN Standard', icon: '🏈',
    lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 },
  },
  sleeper: {
    label: 'Sleeper Default', icon: '🔥',
    lineup: { QB:1, RB:2, WR:3, TE:1, FLEX:1, K:0, DEF:1, BN:6 },
  },
  yahoo: {
    label: 'Yahoo Default', icon: '👑',
    lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 },
  },
}
```

Preset buttons row (above the steppers):
```tsx
<div className="w-full">
  <p className="text-pmp-gray-600 text-xs uppercase tracking-widest mb-2">LINEUP PRESET</p>
  <div className="grid grid-cols-2 gap-2 mb-4">
    {Object.entries(LINEUP_PRESETS).map(([key, preset]) => (
      <button
        key={key}
        type="button"
        onClick={() => { setLineup(preset.lineup); setCustomizing(false) }}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          !customizing && JSON.stringify(lineup) === JSON.stringify(preset.lineup)
            ? 'border-pmp-red bg-[#1a0505] text-pmp-white'
            : 'border-[#2a2a2a] bg-[#111111] text-pmp-gray-400 hover:border-pmp-gray-600'
        }`}
      >
        <span>{preset.icon}</span>
        <span>{preset.label}</span>
      </button>
    ))}
    <button
      type="button"
      onClick={() => setCustomizing(true)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors col-span-2 ${
        customizing
          ? 'border-pmp-red bg-[#1a0505] text-pmp-white'
          : 'border-[#2a2a2a] bg-[#111111] text-pmp-gray-400 hover:border-pmp-gray-600'
      }`}
    >
      <span>⚙️</span><span>Custom</span>
    </button>
  </div>
  {/* Stepper rows only shown when customizing === true */}
  {customizing && (
    <div>/* ... steppers ... */</div>
  )}
</div>
```

`customizing` state: `useState(false)`. Clicking a preset sets `customizing = false`; clicking Custom sets `customizing = true`.

Pass `lineup` into `settings` when calling `onStart(settings, players)`:
```tsx
onStart({ numTeams, userSlot, scoring, speed, lineup }, players)
```

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/draft-lineup.test.ts
import { describe, it, expect } from 'vitest'
import { buildRosterSlots } from '@/lib/draft/lineup'
import { DEFAULT_LINEUP } from '@/lib/draft/types'

describe('buildRosterSlots', () => {
  it('builds 15 slots from DEFAULT_LINEUP', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    expect(slots).toHaveLength(15)
  })

  it('first slot is QB', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    expect(slots[0].label).toBe('QB')
    expect(slots[0].positions).toEqual(['QB'])
  })

  it('FLEX slot accepts RB WR TE', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    const flex = slots.find(s => s.label === 'FLEX')
    expect(flex?.positions).toEqual(['RB', 'WR', 'TE'])
  })

  it('handles custom lineup', () => {
    const custom = { ...DEFAULT_LINEUP, WR: 4, BN: 5 }
    const slots = buildRosterSlots(custom)
    const wrSlots = slots.filter(s => s.label === 'WR')
    expect(wrSlots).toHaveLength(4)
  })

  it('BN slots accept any position', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    const bn = slots.find(s => s.label === 'BN')
    expect(bn?.positions).toContain('QB')
    expect(bn?.positions).toContain('DEF')
  })
})
```

- [ ] **Step 2: Run test to confirm fail**

```bash
npx vitest run tests/lib/draft-lineup.test.ts
```
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Add LineupConfig + DEFAULT_LINEUP to lib/draft/types.ts**

Add after the existing `DRAFT_TEAM_OPTIONS` constant. Add `lineup?: LineupConfig` to `DraftSettings` interface.

- [ ] **Step 4: Create lib/draft/lineup.ts with buildRosterSlots**

- [ ] **Step 5: Run tests to confirm pass**

```bash
npx vitest run tests/lib/draft-lineup.test.ts
```
Expected: 5/5 PASS

- [ ] **Step 6: Update DraftSetup.tsx**

Add `lineup` state initialized to `DEFAULT_LINEUP`. Add the stepper UI below the existing selects. Pass `lineup` in `settings` object to `onStart`.

- [ ] **Step 7: Update DraftBoard.tsx prop types if needed**

`DraftSettings.lineup` is optional — `buildRosterSlots(state.settings.lineup ?? DEFAULT_LINEUP)` in MyTeam. No forced changes needed.

- [ ] **Step 8: Commit**

```bash
git add lib/draft/types.ts lib/draft/lineup.ts components/draft/DraftSetup.tsx tests/lib/draft-lineup.test.ts
git commit -m "feat: customizable lineup config — QB/RB/WR/TE/FLEX/K/DEF/BN stepper in setup"
```

---

### Task 2: Pre-draft pick trading (setup screen) + cell contrast + swap UX hints

**Files:**
- Modify: `lib/draft/engine.ts` (add `tradePickSlots` only)
- Modify: `components/draft/DraftSetup.tsx` (add "Customize Draft Order" toggle + pick trade UI)
- Modify: `components/draft/PickCell.tsx` (contrast, hover, flash, swap hints)
- Modify: `components/draft/PickGrid.tsx` (sticky headers, ⭐ YOU, drag guard)
- Modify: `app/mock-draft/page.tsx` (pass initialTrades to DraftBoard)
- Modify: `components/draft/DraftBoard.tsx` (apply trades at init, NOT mid-draft)
- Test: `tests/lib/draft-engine.test.ts` (add tradePickSlots tests)
- Test: `tests/components/PickCell.test.tsx` (update existing)

**Key rule — two completely separate modes:**
- **Setup screen (before draft starts):** Users can trade pick *slots* — swap which team owns which pick. This changes the draft order before a single pick is made.
- **Draft board (during/after draft):** Drag-to-swap means swapping *drafted players* between completed picks only. Future picks are NEVER draggable during the draft.

**Engine: `tradePickSlots` function** (add to `lib/draft/engine.ts`):
```typescript
/**
 * Trade two pick slots — swap their teamSlot and isUser fields.
 * Used at draft initialization to apply pre-draft trades from setup.
 * NOT called during the draft — only called once when initializing state.
 */
export function tradePickSlots(
  state: DraftState,
  indexA: number,
  indexB: number,
): DraftState {
  if (indexA === indexB) return state
  if (indexA < 0 || indexB < 0) return state
  if (indexA >= state.picks.length || indexB >= state.picks.length) return state

  const picks = state.picks.map((p, i) => {
    if (i === indexA) return { ...p, teamSlot: state.picks[indexB].teamSlot, isUser: state.picks[indexB].isUser }
    if (i === indexB) return { ...p, teamSlot: state.picks[indexA].teamSlot, isUser: state.picks[indexA].isUser }
    return p
  })
  return { ...state, picks }
}
```

**Setup screen — "Customize Draft Order" section:**

Add below the lineup section in `DraftSetup.tsx`. Hidden behind a toggle so casual users never see it.

```tsx
// State:
const [customizePicks, setCustomizePicks] = useState(false)
const [pickTrades, setPickTrades] = useState<{ roundA: number; slotA: number; roundB: number; slotB: number }[]>([])

// UI:
<div className="w-full">
  <button
    type="button"
    onClick={() => setCustomizePicks(v => !v)}
    className="flex items-center gap-2 text-pmp-gray-500 text-sm hover:text-pmp-gray-300 transition-colors"
  >
    <span className={`text-xs transition-transform ${customizePicks ? 'rotate-90' : ''}`}>▶</span>
    Customize Draft Order
  </button>

  {customizePicks && (
    <div className="mt-3 space-y-2">
      <p className="text-pmp-gray-600 text-xs">
        Trade pick slots before the draft — e.g. trade your 1.01 to T4 and receive their 1.04.
      </p>

      {pickTrades.map((trade, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* Round A */}
          <select value={trade.roundA} onChange={e => updateTrade(i, 'roundA', +e.target.value)}
            className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
            {Array.from({length: 15}, (_, r) => (
              <option key={r+1} value={r+1}>Rd {r+1}</option>
            ))}
          </select>
          {/* Slot A */}
          <select value={trade.slotA} onChange={e => updateTrade(i, 'slotA', +e.target.value)}
            className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
            {Array.from({length: numTeams}, (_, s) => (
              <option key={s+1} value={s+1}>{s+1 === userSlot ? 'YOU' : `T${s+1}`}</option>
            ))}
          </select>
          <span className="text-pmp-gray-500 text-xs">↔</span>
          {/* Round B */}
          <select value={trade.roundB} onChange={e => updateTrade(i, 'roundB', +e.target.value)}
            className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
            {Array.from({length: 15}, (_, r) => (
              <option key={r+1} value={r+1}>Rd {r+1}</option>
            ))}
          </select>
          {/* Slot B */}
          <select value={trade.slotB} onChange={e => updateTrade(i, 'slotB', +e.target.value)}
            className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
            {Array.from({length: numTeams}, (_, s) => (
              <option key={s+1} value={s+1}>{s+1 === userSlot ? 'YOU' : `T${s+1}`}</option>
            ))}
          </select>
          <button type="button" onClick={() => removeTrade(i)}
            className="text-pmp-gray-600 hover:text-pmp-red text-xs">✕</button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setPickTrades(t => [...t, { roundA: 1, slotA: userSlot, roundB: 1, slotB: userSlot === 1 ? 2 : 1 }])}
        className="text-pmp-red text-xs hover:text-red-400 transition-colors"
      >
        + Add Pick Trade
      </button>
    </div>
  )}
</div>
```

Helper functions:
```tsx
const updateTrade = (i: number, field: string, value: number) =>
  setPickTrades(trades => trades.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
const removeTrade = (i: number) =>
  setPickTrades(trades => trades.filter((_, idx) => idx !== i))
```

Pass trades to `onStart`:
```tsx
onStart({ numTeams, userSlot, scoring, speed, lineup }, players, pickTrades)
```

**Apply trades in DraftBoard at init:**

`app/mock-draft/page.tsx` passes `initialTrades` to DraftBoard. DraftBoard applies them once when building initial state:

```typescript
// In DraftBoard's initial state computation (where buildInitialState is called):
let initial = buildInitialState(settings, players)
for (const trade of (initialTrades ?? [])) {
  const idxA = initial.picks.findIndex(p => p.round === trade.roundA && p.teamSlot === trade.slotA)
  const idxB = initial.picks.findIndex(p => p.round === trade.roundB && p.teamSlot === trade.slotB)
  if (idxA !== -1 && idxB !== -1) initial = tradePickSlots(initial, idxA, idxB)
}
```

**DraftBoard + PickGrid — NO change to drag behavior:**
- `useDraggable` in PickCell keeps `disabled: !isCompleted || !player` — future picks are NEVER draggable
- `handleDragEnd` in PickGrid stays exactly as is — only swaps players in completed picks
- Do NOT add `onTrade` prop to PickGrid

**PickCell visual changes:**

1. Cell colors by state:
```tsx
const cellBg = (() => {
  if (isCurrent)                  return 'bg-[#1a0505] border-pmp-red animate-pulse'
  if (isCompleted && pick.isUser) return 'bg-[#1a0505] border-pmp-red/20'
  if (isCompleted)                return 'bg-[#1e1e1e] border-[#2a2a2a]'
  return 'bg-[#111111] border-[#1e1e1e]'
})()
```

2. Hover on completed cells — lift + glow:
```tsx
const hoverClass = isCompleted
  ? 'hover:border-pmp-red/50 hover:shadow-[0_0_8px_rgba(220,38,38,0.25)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing'
  : 'cursor-default'
```

3. Remove "On the clock" from empty non-current cells:
```tsx
{player ? (
  <>
    <p className="text-pmp-white text-xs font-semibold truncate mt-0.5 leading-tight">{player.name}</p>
    <p className="text-pmp-gray-500 text-[10px]">{player.position} · {player.team}</p>
  </>
) : isCurrent ? (
  <p className="text-pmp-red text-[10px] font-semibold mt-0.5 animate-pulse">On the clock</p>
) : null}
```

4. "drag to swap" hint on completed cells with players:
```tsx
{isCompleted && player && (
  <p className="absolute bottom-0.5 right-1 text-[8px] text-pmp-gray-700 opacity-0 group-hover:opacity-100 transition-opacity leading-none">
    drag to swap
  </p>
)}
```
Add `group` class to the outer div.

**PickGrid header changes:**
```tsx
<div
  key={i}
  className="sticky top-0 z-20 text-center py-2 text-[11px] font-semibold bg-[#0d0d0d] border-b border-[#1e1e1e]"
  style={i + 1 === userTeamSlot ? { color: '#ef4444' } : { color: '#4b5563' }}
>
  {i + 1 === userTeamSlot ? '⭐ YOU' : `${i + 1}`}
</div>
```

**What changes in PickCell:**

1. Cell colors by state (replace existing `bg` / `activeBg` / `currentBg`):
```tsx
const cellBg = (() => {
  if (isCurrent)                    return 'bg-[#1a0505] border-pmp-red animate-pulse'
  if (isCompleted && pick.isUser)   return 'bg-[#1a0505] border-pmp-red/20'
  if (isCompleted)                  return 'bg-[#1e1e1e] border-[#2a2a2a]'
  return 'bg-[#111111] border-[#1e1e1e]'
})()
```

2. Hover: lift + red glow on completed cells:
```tsx
const hoverClass = isCompleted
  ? 'hover:border-pmp-red/50 hover:shadow-[0_0_8px_rgba(220,38,38,0.25)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing'
  : 'cursor-default'
```

3. Remove "On the clock" from all empty non-current cells — just show the label:
```tsx
{player ? (
  <>
    <p className="text-pmp-white text-xs font-semibold truncate mt-0.5 leading-tight">{player.name}</p>
    <p className="text-pmp-gray-500 text-[10px]">{player.position} · {player.team}</p>
  </>
) : isCurrent ? (
  <p className="text-pmp-red text-[10px] font-semibold mt-0.5 animate-pulse">On the clock</p>
) : null}
```

4. Swap hint tooltip on hover for completed cells with players:
```tsx
{isCompleted && player && (
  <p className="absolute bottom-0.5 right-1 text-[8px] text-pmp-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
    drag to swap
  </p>
)}
```
Add `group` class to the outer div.

5. Flash animation on newly completed cell (add `data-flash` attribute trigger):
```css
/* Add to globals.css or as a Tailwind @keyframes via style tag */
@keyframes cell-flash {
  0%   { background-color: #7f1d1d; border-color: #ef4444; }
  100% { background-color: #1a0505; border-color: rgba(239,68,68,0.2); }
}
.cell-flash { animation: cell-flash 0.6s ease-out forwards; }
```
In PickCell, track a `flash` state triggered when `isCompleted` transitions from false to true (use `useEffect` comparing previous `isCompleted`).

**What changes in PickGrid:**

Column headers: ⭐ YOU + numbered others, `sticky top-0 z-20`:
```tsx
<div
  key={i}
  className="sticky top-0 z-20 text-center py-2 text-[11px] font-semibold bg-[#0d0d0d] border-b border-[#1e1e1e]"
  style={i + 1 === userTeamSlot ? { color: '#ef4444' } : { color: '#4b5563' }}
>
  {i + 1 === userTeamSlot ? '⭐ YOU' : `${i + 1}`}
</div>
```

- [ ] **Step 1: Add tradePickSlots tests to draft-engine.test.ts**

```typescript
// Append to tests/lib/draft-engine.test.ts — import tradePickSlots alongside existing imports
describe('tradePickSlots', () => {
  const baseSettings = { numTeams: 4, numRounds: 15 as const, userSlot: 1, scoring: 'ppr' as const, speed: 'fast' as const, lineup: DEFAULT_LINEUP }

  it('swaps teamSlot and isUser between two picks', () => {
    const state = buildInitialState(baseSettings, [])
    const slot0 = state.picks[0].teamSlot  // slot 1, isUser true
    const slot3 = state.picks[3].teamSlot  // slot 4, isUser false
    const next = tradePickSlots(state, 0, 3)
    expect(next.picks[0].teamSlot).toBe(slot3)
    expect(next.picks[0].isUser).toBe(false)
    expect(next.picks[3].teamSlot).toBe(slot0)
    expect(next.picks[3].isUser).toBe(true)
  })

  it('is a no-op when indices are equal', () => {
    const state = buildInitialState(baseSettings, [])
    expect(tradePickSlots(state, 2, 2)).toBe(state)
  })

  it('is a no-op for out-of-range index', () => {
    const state = buildInitialState(baseSettings, [])
    expect(tradePickSlots(state, 0, 9999)).toBe(state)
  })

  it('does not mutate original state', () => {
    const state = buildInitialState(baseSettings, [])
    const original = state.picks[0].teamSlot
    tradePickSlots(state, 0, 1)
    expect(state.picks[0].teamSlot).toBe(original)
  })
})
```

Run: `npx vitest run tests/lib/draft-engine.test.ts`
Expected: new tests FAIL (function not yet added)

- [ ] **Step 2: Add `tradePickSlots` to lib/draft/engine.ts**

Add the pure function exactly as specified above. No new imports needed.

- [ ] **Step 3: Run engine tests**

```bash
npx vitest run tests/lib/draft-engine.test.ts
```
Expected: all existing + 4 new tradePickSlots tests pass.

- [ ] **Step 4: Update DraftSetup.tsx** — add `customizePicks` toggle + `pickTrades` state + trade row UI + pass trades to `onStart`

Update the `onStart` callback signature in `DraftSetup` to include trades. The `onStart` prop type changes from:
```tsx
onStart: (settings: DraftSettings, players: Player[]) => void
```
to:
```tsx
onStart: (settings: DraftSettings, players: Player[], trades: { roundA: number; slotA: number; roundB: number; slotB: number }[]) => void
```

- [ ] **Step 5: Update app/mock-draft/page.tsx** — `DraftBoard` receives `initialTrades` prop and applies them at init.

The page component's `handleStart` now receives trades and passes them to DraftBoard.

- [ ] **Step 6: Update DraftBoard.tsx** — apply trades once at initialization using `tradePickSlots`. Do NOT add any mid-draft trade action. PickGrid's drag guard stays `disabled: !isCompleted || !player` (unchanged).

- [ ] **Step 7: Update PickCell.tsx** with new colors, hover classes, swap hint, and group class.

- [ ] **Step 8: Update PickGrid.tsx** — sticky headers, ⭐ YOU / numbered columns.

- [ ] **Step 2: Add `@keyframes cell-flash` to `app/globals.css`**

```css
@keyframes cell-flash {
  0%   { background-color: #7f1d1d; border-color: #ef4444; box-shadow: 0 0 16px rgba(239,68,68,0.5); }
  100% { background-color: #1a0505; border-color: rgba(239,68,68,0.2); box-shadow: none; }
}
.cell-flash { animation: cell-flash 0.6s ease-out forwards; }
```

- [ ] **Step 3: Update PickGrid.tsx** column header styling as shown above.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/components/PickCell.test.tsx
```
Expected: existing tests pass (no runtime errors).

- [ ] **Step 5: Commit**

```bash
git add components/draft/PickCell.tsx components/draft/PickGrid.tsx app/globals.css
git commit -m "feat: cell contrast, flash animation, swap hints, sticky headers"
```

---

### Task 3: My Team — position-based roster with custom lineup

**Files:**
- Modify: `components/draft/MyTeam.tsx`
- Create: (no new file — uses `lib/draft/lineup.ts` from Task 1)
- Test: `tests/components/MyTeam.test.tsx` (update/create)

**Slot assignment algorithm:**
```typescript
// Pure function — no React, no imports beyond types
function assignToRoster(
  userPicks: { player: Player; pick: PickSlot }[],
  slots: RosterSlot[]
): ({ player: Player; pick: PickSlot } | null)[] {
  const used = new Set<number>()
  return slots.map(slot => {
    const match = userPicks.find(
      up => !used.has(up.pick.overallPick) &&
            slot.positions.includes(up.player.position)
    )
    if (match) used.add(match.pick.overallPick)
    return match ?? null
  })
}
```

**Row rendering — filled slot:**
```tsx
<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a0505] border border-pmp-red/20">
  <span className="text-pmp-red text-[10px] font-bold w-8 shrink-0">{slot.label}</span>
  {entry.player.headshotUrl ? (
    <img
      src={entry.player.headshotUrl}
      alt={entry.player.name}
      className="w-8 h-8 rounded-full object-cover bg-[#2a2a2a] shrink-0"
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0">
      <span className="text-pmp-gray-500 text-xs font-bold">
        {entry.player.name.charAt(0)}
      </span>
    </div>
  )}
  <div className="flex-1 min-w-0">
    <p className="text-pmp-white text-xs font-semibold truncate leading-tight">{entry.player.name}</p>
    <p className="text-pmp-gray-600 text-[10px]">{entry.player.team}</p>
  </div>
</div>
```

**Row rendering — empty slot:**
```tsx
<div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#111111] border border-dashed border-[#2a2a2a]">
  <span className="text-pmp-gray-700 text-[10px] font-bold w-8 shrink-0">{slot.label}</span>
  <span className="text-pmp-gray-700 text-xs">—</span>
</div>
```

**Props update:**
```tsx
interface MyTeamProps {
  picks: PickSlot[]
  playerMap: Map<string, Player>
  lineup: LineupConfig  // new — passed from DraftBoard
}
```

In DraftBoard, pass `lineup={state.settings.lineup ?? DEFAULT_LINEUP}` to MyTeam.

- [ ] **Step 1: Write tests**

```typescript
// tests/components/MyTeam.test.tsx
import { describe, it, expect } from 'vitest'
import { buildRosterSlots } from '@/lib/draft/lineup'
import { DEFAULT_LINEUP } from '@/lib/draft/types'

// Copy assignToRoster inline for testing
function assignToRoster(userPicks, slots) {
  const used = new Set()
  return slots.map(slot => {
    const match = userPicks.find(
      up => !used.has(up.pick.overallPick) && slot.positions.includes(up.player.position)
    )
    if (match) used.add(match.pick.overallPick)
    return match ?? null
  })
}

const mockPlayer = (id, name, pos) => ({
  id, name, position: pos, team: 'BUF', searchRank: 1, byeWeek: 7,
  headshotUrl: '', firstName: name.split(' ')[0], lastName: name.split(' ')[1] ?? ''
})
const mockPick = (overall, round, slot) => ({
  overallPick: overall, round, pickInRound: slot, teamSlot: 1, isUser: true, playerId: null
})

describe('assignToRoster', () => {
  const slots = buildRosterSlots(DEFAULT_LINEUP)

  it('assigns QB to QB slot', () => {
    const picks = [{ player: mockPlayer('1', 'Josh Allen', 'QB'), pick: mockPick(1, 1, 1) }]
    const result = assignToRoster(picks, slots)
    expect(result[0]?.player.name).toBe('Josh Allen')
    expect(result[1]).toBeNull()
  })

  it('puts 2nd QB into BN', () => {
    const picks = [
      { player: mockPlayer('1', 'Josh Allen', 'QB'), pick: mockPick(1, 1, 1) },
      { player: mockPlayer('2', 'Joe Burrow', 'QB'), pick: mockPick(20, 2, 1) },
    ]
    const result = assignToRoster(picks, slots)
    expect(result[0]?.player.name).toBe('Josh Allen')
    const bnAssigned = result.slice(9).some(r => r?.player.name === 'Joe Burrow')
    expect(bnAssigned).toBe(true)
  })

  it('WR fills FLEX before BN when WR slots exhausted', () => {
    const picks = [
      { player: mockPlayer('1', 'WR1', 'WR'), pick: mockPick(1, 1, 1) },
      { player: mockPlayer('2', 'WR2', 'WR'), pick: mockPick(2, 1, 2) },
      { player: mockPlayer('3', 'WR3', 'WR'), pick: mockPick(3, 1, 3) },
      { player: mockPlayer('4', 'WR4', 'WR'), pick: mockPick(4, 1, 4) },
    ]
    const result = assignToRoster(picks, slots)
    // DEFAULT_LINEUP: QB(0) RB(0) WR(1) WR(2) WR(3) TE FLEX K DEF BN...
    // WR1,WR2,WR3 fill 3 WR slots; WR4 should fill FLEX (index 6)
    const flexIdx = slots.findIndex(s => s.label === 'FLEX')
    expect(result[flexIdx]?.player.name).toBe('WR4')
  })
})
```

- [ ] **Step 2: Run test to confirm fail**

```bash
npx vitest run tests/components/MyTeam.test.tsx
```

- [ ] **Step 3: Rewrite MyTeam.tsx**

Full rewrite using `buildRosterSlots(lineup)`, `assignToRoster`, and the row rendering shown above. Import `buildRosterSlots` from `@/lib/draft/lineup`, `DEFAULT_LINEUP` and `LineupConfig` from `@/lib/draft/types`.

- [ ] **Step 4: Update DraftBoard.tsx** to pass `lineup={state.settings.lineup ?? DEFAULT_LINEUP}` to `<MyTeam>`.

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/components/MyTeam.test.tsx
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/draft/MyTeam.tsx components/draft/DraftBoard.tsx tests/components/MyTeam.test.tsx
git commit -m "feat: position-based My Team roster with custom lineup support"
```

---

### Task 4: Player pool — rankings, headshots, sticky search, pill filters

**Files:**
- Modify: `components/draft/DraftPlayerPool.tsx`
- Test: `tests/components/DraftPlayerPool.test.tsx` (update/create)

**ADP rank:** The `players` prop arrives ADP-sorted. Rank = position in the original sorted array, not the filtered result.

```tsx
const rankMap = useMemo(() => {
  const map = new Map<string, number>()
  players.forEach((p, i) => map.set(p.id, i + 1))
  return map
}, [players])
```

**Sticky search bar:**
```tsx
<div className="sticky top-0 z-10 bg-[#0d0d0d] px-3 pt-3 pb-2">
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pmp-gray-500 text-sm select-none">🔍</span>
    <input
      type="text"
      placeholder="Search players..."
      value={search}
      onChange={e => setSearch(e.target.value)}
      className="w-full h-10 pl-8 pr-3 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg text-pmp-white text-sm placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-red/50 transition-colors"
    />
  </div>
</div>
```

**Pill filters:**
```tsx
<div className="flex gap-1.5 flex-wrap px-3 pb-2">
  {(['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const).map(pos => (
    <button
      key={pos}
      onClick={() => setSelectedPosition(pos === 'ALL' ? null : pos)}
      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
        (pos === 'ALL' ? selectedPosition === null : selectedPosition === pos)
          ? 'bg-pmp-red text-white'
          : 'bg-[#1e1e1e] text-pmp-gray-400 hover:bg-[#2a2a2a] hover:text-pmp-gray-300'
      }`}
    >
      {pos}
    </button>
  ))}
</div>
```

**Player row:**
```tsx
<div
  onClick={handlePlayerClick}
  className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#1e1e1e] hover:border-l-2 hover:border-pmp-red transition-all duration-100 cursor-pointer group"
>
  <span className="text-pmp-gray-600 text-[11px] w-5 text-right shrink-0 font-mono tabular-nums">
    {rankMap.get(player.id)}
  </span>
  {player.headshotUrl ? (
    <img
      src={player.headshotUrl}
      alt={player.name}
      className="w-9 h-9 rounded-full object-cover bg-[#2a2a2a] shrink-0"
      loading="lazy"
    />
  ) : (
    <div className="w-9 h-9 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0">
      <span className="text-pmp-gray-500 text-xs font-bold">{player.name.charAt(0)}</span>
    </div>
  )}
  <div className="flex-1 min-w-0">
    <p className="text-pmp-white text-sm font-semibold truncate leading-tight group-hover:text-pmp-red transition-colors">
      {player.name}
    </p>
    <p className="text-pmp-gray-500 text-xs">{player.position} · {player.team}</p>
  </div>
  {/* existing lock button stays */}
</div>
```

If `search` state doesn't exist yet in DraftPlayerPool, add it as `const [search, setSearch] = useState('')` and filter `visiblePlayers` by `player.name.toLowerCase().includes(search.toLowerCase())`.

- [ ] **Step 1: Add search state and rankMap**

```tsx
const [search, setSearch] = useState('')
const rankMap = useMemo(() => {
  const map = new Map<string, number>()
  players.forEach((p, i) => map.set(p.id, i + 1))
  return map
}, [players])
```

- [ ] **Step 2: Filter by search + existing position filter**

```tsx
const visiblePlayers = useMemo(() => {
  return players
    .filter(p => availablePlayerIds.includes(p.id))
    .filter(p => !selectedPosition || p.position === selectedPosition)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
}, [players, availablePlayerIds, selectedPosition, search])
```

- [ ] **Step 3: Replace search input, pill filters, and player rows**

Full rebuild of the return JSX using the code above. Keep all existing click/lock logic — only the visual layout changes.

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/components/DraftPlayerPool.test.tsx
```
Expected: pass (update any test that checks for specific class names if needed).

- [ ] **Step 5: Commit**

```bash
git add components/draft/DraftPlayerPool.tsx
git commit -m "feat: player rankings, headshots, sticky search, pill position filters"
```

---

### Task 5: Layout hierarchy + progress bar + icon controls + background

**Files:**
- Modify: `components/draft/DraftBoard.tsx`
- Modify: `components/draft/DraftControls.tsx`
- Modify: `components/draft/PickGrid.tsx` (add overflow-auto scroll container)

**Page background:** wrap the entire DraftBoard in `bg-[#0d0d0d]`.

**Progress bar** (inline component in DraftBoard.tsx):
```tsx
function DraftProgressBar({
  currentPickIndex, totalPicks, numTeams,
}: { currentPickIndex: number; totalPicks: number; numTeams: number }) {
  const round = Math.min(Math.floor(currentPickIndex / numTeams) + 1, 15)
  const pct = Math.round((currentPickIndex / totalPicks) * 100)
  return (
    <div className="bg-[#111111] border-b border-[#1e1e1e] px-4 py-2 flex items-center gap-4 shrink-0">
      <span className="text-pmp-white text-sm font-bold">Round {round}</span>
      <span className="text-pmp-gray-500 text-xs">
        Pick {currentPickIndex + 1} / {totalPicks}
      </span>
      <div className="flex-1 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full bg-pmp-red rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-pmp-gray-600 text-xs">{pct}%</span>
    </div>
  )
}
```

**Layout structure in DraftBoard.tsx:**
```tsx
return (
  <div className="h-screen bg-[#0d0d0d] flex flex-col overflow-hidden">
    <DraftProgressBar
      currentPickIndex={state.currentPickIndex}
      totalPicks={state.picks.length}
      numTeams={state.settings.numTeams}
    />

    {/* Continue Draft banner */}
    {isUserTurn && (
      <div className="bg-pmp-red px-4 py-3 flex items-center justify-center shrink-0">
        <button
          onClick={handleContinue}
          className="text-white font-bold text-lg tracking-wide w-full text-center"
        >
          ▶ Continue Draft
        </button>
      </div>
    )}

    <DraftControls
      status={state.status}
      undoDisabled={undoStack.length === 0}
      redoDisabled={redoStack.length === 0}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onReset={handleReset}
      onShare={handleShare}
      shareLabel={shareLabel}
    />

    <div className="flex flex-1 overflow-hidden">
      {/* Left panel: player pool */}
      <aside className="w-[264px] shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-hidden">
        <DraftPlayerPool ... />
      </aside>

      {/* Center: board */}
      <main className="flex-1 overflow-auto p-2">
        <PickGrid ... />
      </main>

      {/* Right panel: my team */}
      <aside className="w-[220px] shrink-0 border-l border-[#1e1e1e] overflow-y-auto">
        <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest px-3 py-3 sticky top-0 bg-[#0d0d0d] border-b border-[#1e1e1e]">
          My Team
        </p>
        <div className="flex flex-col gap-1 p-2">
          <MyTeam picks={state.picks} playerMap={playerMap} lineup={state.settings.lineup ?? DEFAULT_LINEUP} />
        </div>
      </aside>
    </div>
  </div>
)
```

**DraftControls icon buttons:**
```tsx
// Replace each plain-text button:
const controls = [
  { label: 'Undo',         icon: '↶', onClick: onUndo,  disabled: undoDisabled },
  { label: 'Redo',         icon: '↷', onClick: onRedo,  disabled: redoDisabled },
  { label: 'Reset',        icon: '⟳', onClick: onReset, disabled: false },
  { label: shareLabel,     icon: '🔗', onClick: onShare, disabled: false },
]

// Render as:
<div className="flex border-b border-[#1e1e1e] bg-[#111111] shrink-0">
  {controls.map(c => (
    <button
      key={c.label}
      onClick={c.onClick}
      disabled={c.disabled}
      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-pmp-gray-400 hover:text-pmp-white hover:bg-[#1e1e1e] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      <span>{c.icon}</span>
      <span>{c.label}</span>
    </button>
  ))}
</div>
```

**PickGrid scroll container:**
```tsx
// Wrap the grid div in a scroll container:
<div className="overflow-auto">
  <div className="grid gap-0.5 min-w-max" style={...}>
    {/* headers + cells */}
  </div>
</div>
```
(The `max-h` is handled by the `main` panel's `overflow-auto` above.)

- [ ] **Step 1: Add DraftProgressBar inline in DraftBoard.tsx and wire it**

- [ ] **Step 2: Replace layout container with `h-screen flex flex-col overflow-hidden` structure**

- [ ] **Step 3: Update DraftControls.tsx with icon+label button array**

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep -v "tests/"
```
Expected: no errors in component files.

- [ ] **Step 5: Commit**

```bash
git add components/draft/DraftBoard.tsx components/draft/DraftControls.tsx components/draft/PickGrid.tsx
git commit -m "feat: layout hierarchy, progress bar, icon controls, page background"
```

---

### Task 6: Draft board zoom + pick animation + final QA

**Files:**
- Modify: `components/draft/PickGrid.tsx` (zoom)
- Modify: `components/draft/PickCell.tsx` (use flash class from Task 2)
- Modify: `components/draft/DraftBoard.tsx` (zoom state + controls)
- Modify: `app/globals.css` (verify flash keyframe from Task 2 is there)

**Draft board zoom:**

Three zoom levels change the cell min-width:
```typescript
const ZOOM_WIDTHS = { compact: 60, normal: 76, large: 96 } as const
type ZoomLevel = keyof typeof ZOOM_WIDTHS
```

In DraftBoard, add `const [zoom, setZoom] = useState<ZoomLevel>('normal')`.

Pass `zoom` to PickGrid as a prop:
```tsx
// PickGrid props: add zoom: ZoomLevel
style={{ gridTemplateColumns: `repeat(${numTeams}, minmax(${ZOOM_WIDTHS[zoom]}px, 1fr))` }}
```

Zoom toggle buttons — add to the DraftControls row or as a separate strip above the board:
```tsx
// In DraftBoard, above <main>:
<div className="flex items-center gap-1 px-2 py-1 border-b border-[#1e1e1e] bg-[#111111] shrink-0">
  <span className="text-pmp-gray-600 text-[10px] mr-1">Zoom</span>
  {(['compact', 'normal', 'large'] as const).map(z => (
    <button
      key={z}
      onClick={() => setZoom(z)}
      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
        zoom === z ? 'bg-pmp-red text-white' : 'text-pmp-gray-500 hover:text-pmp-gray-300'
      }`}
    >
      {z.charAt(0).toUpperCase() + z.slice(1)}
    </button>
  ))}
</div>
```

**Pick flash animation wiring:**

In PickCell, track when the cell transitions from incomplete to completed:
```tsx
const [flash, setFlash] = useState(false)
const prevCompletedRef = useRef(false)
useEffect(() => {
  if (isCompleted && !prevCompletedRef.current) {
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 600)
    return () => clearTimeout(t)
  }
  prevCompletedRef.current = isCompleted
}, [isCompleted])

// Add `flash ? 'cell-flash' : ''` to className
```

This means: the instant a pick becomes completed, the cell plays a 600ms red flash animation. This creates the "rewarding" feeling of a pick landing without requiring Framer Motion.

**Player pool fade-out on pick:**

When `isUserTurn` goes from true → false (user just picked), briefly dim the top player in the list. Simple opacity transition on the pool container:
```tsx
// In DraftPlayerPool:
const [justPicked, setJustPicked] = useState(false)
// Track previous isUserTurn
useEffect(() => {
  if (!isUserTurn && prevIsUserTurn.current) {
    setJustPicked(true)
    setTimeout(() => setJustPicked(false), 400)
  }
  prevIsUserTurn.current = isUserTurn
}, [isUserTurn])

// Apply to pool list: className={`transition-opacity duration-300 ${justPicked ? 'opacity-50' : 'opacity-100'}`}
```

**Final QA checklist:**

- [ ] **Step 1: Add zoom state + controls to DraftBoard.tsx**

- [ ] **Step 2: Pass zoom to PickGrid, update grid template column width**

- [ ] **Step 3: Add flash useEffect + class to PickCell.tsx**

- [ ] **Step 4: Add pool fade-out to DraftPlayerPool.tsx**

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 6: Production build**

```bash
npx next build 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v "tests/"
```
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/draft/PickGrid.tsx components/draft/PickCell.tsx components/draft/DraftBoard.tsx components/draft/DraftPlayerPool.tsx
git commit -m "feat: board zoom levels, pick flash animation, pool fade on pick"
```

---

## Summary

| Task | Feature | Key Files |
|------|---------|-----------|
| 1 | Custom lineup + league presets (ESPN/Sleeper/Yahoo/Custom) | types.ts, lineup.ts, DraftSetup |
| 2 | Pre-draft pick trading (drag future picks between teams) + cell contrast + ⭐ YOU | engine.ts, PickCell, PickGrid, DraftBoard |
| 3 | Position-based My Team (QB/RB/WR slots with headshots) | MyTeam |
| 4 | Player rankings + headshots + sticky search + pill filters | DraftPlayerPool |
| 5 | Layout hierarchy + progress bar + icon controls + page bg | DraftBoard, DraftControls |
| 6 | Board zoom (Compact/Normal/Large) + pick flash + pool fade | PickGrid, PickCell, DraftBoard |

**Explicitly deferred:**
- Natural-language swap panel (V4)
- Pick-flies-to-slot Framer Motion animation (V3 — needs layoutId)
- Skeleton loading (brief load, low priority)
- Football background texture on setup page (cosmetic)
