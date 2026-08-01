# Draft Polish — P0/P1/P2 Fixes + Unified UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix every P0/P1/P2 issue from the audit, add draft grading + share card, unify solo/multiplayer UI, and fix the multiplayer numTeams bug so CPU fills empty slots.

**Architecture:** All fixes are isolated to existing files. The unified UI approach adds MobileTabs to solo DraftBoard. DraftSummary gains a grade system and downloadable card. Multiplayer create form gets lineup presets. The numTeams bug fix is in DraftService.

**Tech Stack:** Next.js 15 App Router, Supabase, Tailwind (pmp tokens), html2canvas (dynamic import for card download)

## Global Constraints

- All colors must use pmp design tokens: `pmp-red`, `pmp-white`, `pmp-black`, `pmp-gray-{500,600,800,900}`. No raw Tailwind color values (e.g. `text-red-400`, `hover:text-gray-300`).
- All client components: `'use client'` at top.
- Next.js 15: `params` is `Promise<{id:string}>`, always `await params`.
- `h-[100dvh]` not `h-screen` for full-height mobile layouts.
- No new npm dependencies except `html2canvas` (dynamic import only, for Task 5).
- No TypeScript errors. All existing tests must pass (`npx vitest run`).
- Do NOT commit `.env` files or secrets.
- Commit after each task with a descriptive message.

---

### Task 1: Quick fixes — back button, hover token, h-dvh, dead code, Draft Again

**Files:**
- Modify: `components/draft/DraftSetup.tsx`
- Modify: `components/draft/DraftBoard.tsx`
- Modify: `components/draft/DraftSummary.tsx`
- Modify: `components/league/LiveDraftBoard.tsx`

**Interfaces:**
- Produces: `DraftSummary` accepts optional `playAgainLabel?: string` prop (defaults to `"Draft Again"`)

- [ ] **Step 1: Add back button to DraftSetup**

In `components/draft/DraftSetup.tsx`, add `import Link from 'next/link'` at the top. Replace the header `<div className="text-center">` with:

```tsx
<div className="relative text-center">
  <Link
    href="/"
    className="absolute left-0 top-1 flex items-center gap-1 text-pmp-gray-600 text-sm hover:text-pmp-gray-500 transition-colors"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
    Back
  </Link>
  <h1 className="text-pmp-white text-2xl font-bold">Mock Draft</h1>
  <p className="text-pmp-gray-500 text-sm mt-1">15 rounds · Snake format</p>
</div>
```

- [ ] **Step 2: Fix DraftBoard — h-dvh, hover token, remove dead ZOOM_WIDTHS const**

In `components/draft/DraftBoard.tsx`:

a) Remove the line `const ZOOM_WIDTHS = { compact: 60, normal: 76, large: 96 } as const` at the top — it's dead code (PickGrid defines its own copy).

b) Change `h-screen` → `h-[100dvh]` on the outermost div.

c) In the zoom strip buttons, change `hover:text-pmp-gray-300` → `hover:text-pmp-white`:
```tsx
className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
  zoom === z ? 'bg-pmp-red text-white' : 'text-pmp-gray-500 hover:text-pmp-white'
}`}
```

- [ ] **Step 3: Add optional playAgainLabel prop to DraftSummary**

In `components/draft/DraftSummary.tsx`, update the interface and button:

```tsx
interface DraftSummaryProps {
  analytics: DraftAnalytics
  settings: DraftSettings
  onPlayAgain: () => void
  playAgainLabel?: string
}

// button at the bottom:
<button
  onClick={onPlayAgain}
  className="w-full max-w-sm bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-base hover:opacity-90 transition-opacity"
>
  {playAgainLabel ?? 'Draft Again'}
</button>
```

- [ ] **Step 4: Wire Back to Home in LiveDraftBoard**

In `components/league/LiveDraftBoard.tsx`, add `import { useRouter } from 'next/navigation'` and inside the component add `const router = useRouter()`. Update the DraftSummary render:

```tsx
<DraftSummary
  analytics={analytics}
  settings={{ ...settings, userSlot: myTeamSlot ?? 1 }}
  onPlayAgain={() => router.push('/')}
  playAgainLabel="Back to Home"
/>
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/draft/DraftSetup.tsx components/draft/DraftBoard.tsx components/draft/DraftSummary.tsx components/league/LiveDraftBoard.tsx
git commit -m "fix: back button on setup, h-[100dvh], hover token, dead code, Draft Again → Back to Home in multiplayer"
```

---

### Task 2: Unified mobile layout — MobileTabs in solo DraftBoard

**Files:**
- Modify: `components/draft/DraftBoard.tsx`

**Interfaces:**
- Consumes: `MobileTabs` from `@/components/draft/MobileTabs`, `MobileTab` type (already exists, used by LiveDraftBoard)
- Produces: DraftBoard has same mobile tab layout as LiveDraftBoard

**Context:** DraftBoard always shows all three panels side-by-side. On mobile (below `md:` breakpoint) only one panel should be visible at a time. Desktop: all panels visible. The zoom strip is desktop-only (`hidden md:flex`).

- [ ] **Step 1: Import MobileTabs, add mobileTab state**

At the top of `components/draft/DraftBoard.tsx` add:
```tsx
import { MobileTabs } from './MobileTabs'
import type { MobileTab } from './MobileTabs'
```

Inside `DraftBoard`, add:
```tsx
const [mobileTab, setMobileTab] = useState<MobileTab>('players')
```

- [ ] **Step 2: Insert MobileTabs bar after DraftControls, before zoom strip**

In the JSX (after `<DraftControls ... />` and before the zoom strip div):
```tsx
<MobileTabs active={mobileTab} onChange={setMobileTab} />
```

- [ ] **Step 3: Make zoom strip desktop-only**

Change the zoom strip div's className from `flex items-center ...` to `hidden md:flex items-center ...`:
```tsx
<div className="hidden md:flex items-center gap-1 px-2 py-1 border-b border-[#1e1e1e] bg-[#111111] shrink-0">
```

- [ ] **Step 4: Update three-panel layout with mobile visibility**

Replace each panel's className to show/hide by tab on mobile, always visible on `md:`:

**Left panel (player pool):**
```tsx
<aside className={`
  shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-hidden
  ${mobileTab === 'players' ? 'flex' : 'hidden'}
  md:flex md:w-[264px]
`}>
```

**Center panel (board):**
```tsx
<main className={`
  flex-1 overflow-auto p-2
  ${mobileTab === 'board' ? 'block' : 'hidden'}
  md:block
`}>
```

**Right panel (my team):**
```tsx
<aside className={`
  shrink-0 border-l border-[#1e1e1e] overflow-y-auto
  ${mobileTab === 'team' ? 'flex flex-col w-full' : 'hidden'}
  md:flex md:flex-col md:w-[220px]
`}>
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add components/draft/DraftBoard.tsx
git commit -m "feat: mobile tabs in solo DraftBoard — Players/Board/My Team, unified layout with multiplayer"
```

---

### Task 3: Fix share page — re-fetch players server-side

**Files:**
- Modify: `app/mock-draft/[id]/page.tsx`
- Modify: `app/mock-draft/[id]/client.tsx`

**Interfaces:**
- `MockDraftClientPage` now accepts `players: Player[]` prop (imported from `@/lib/data/types`)
- Server page fetches players using `new SleeperProvider().getDraftPlayers(state.settings.scoring)`

- [ ] **Step 1: Update server page to fetch players**

Replace `app/mock-draft/[id]/page.tsx` entirely:

```tsx
import { loadDraft } from '@/lib/draft/supabase'
import { notFound } from 'next/navigation'
import { SleeperProvider } from '@/lib/data/sleeper'
import MockDraftClientPage from './client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MockDraftSharePage({ params }: PageProps) {
  const { id } = await params
  const state = await loadDraft(id)
  if (!state) notFound()

  const provider = new SleeperProvider()
  const players = await provider.getDraftPlayers(state.settings.scoring)

  return <MockDraftClientPage initialState={state} players={players} />
}
```

- [ ] **Step 2: Update client component to accept and forward players**

Replace `app/mock-draft/[id]/client.tsx` entirely:

```tsx
'use client'
import { DraftBoard } from '@/components/draft/DraftBoard'
import type { DraftState } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface Props {
  initialState: DraftState
  players: Player[]
}

export default function MockDraftClientPage({ initialState, players }: Props) {
  return (
    <DraftBoard
      settings={initialState.settings}
      players={players}
      initialState={initialState}
    />
  )
}
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add app/mock-draft/[id]/page.tsx app/mock-draft/[id]/client.tsx
git commit -m "fix: share page fetches players server-side — player pool, names, and My Team all populate correctly"
```

---

### Task 4: Instant draft_complete — apply state immediately in hook

**Files:**
- Modify: `lib/league/useLeagueDraft.ts`

**Interfaces:**
- No interface changes; internal event handler change only

**Context:** When the last pick is made, server broadcasts `type: 'draft_complete'` with `payload` shaped as `PickMadePayload` (same as `pick_made` — includes the full final `state`). The hook currently calls only `fetchState()` for `draft_complete`, causing a visible delay before the DraftSummary appears. Fix: apply the state payload immediately (same as `pick_made`), set league status to `'complete'` locally, then call `fetchState()` for any background cleanup.

- [ ] **Step 1: Update draft_complete handler**

In `lib/league/useLeagueDraft.ts`, find:

```ts
if (event.type === 'draft_complete') {
  // DraftCompletePayload carries replayId only — re-fetch to get final state
  fetchState()
}
```

Replace with:

```ts
if (event.type === 'draft_complete') {
  const p = event.payload as PickMadePayload
  setDraft(prev =>
    prev && event.version > prev.version
      ? { ...prev, version: event.version, state: p.state }
      : prev,
  )
  setLeague(prev => prev ? { ...prev, status: 'complete' } : null)
  fetchState() // background cleanup
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all pass (including `tests/lib/league-realtime.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add lib/league/useLeagueDraft.ts
git commit -m "fix: draft_complete applies state immediately — DraftSummary shows instantly on last pick"
```

---

### Task 5: Draft grade + downloadable branded share card

**Files:**
- Modify: `lib/draft/types.ts`
- Modify: `lib/draft/engine.ts`
- Modify: `components/draft/DraftSummary.tsx`
- Modify: `tests/lib/draft-analytics.test.ts`

**Interfaces:**
- `DraftGrade` type added to `lib/draft/types.ts`: `{ letter: string; score: number }`
- `DraftAnalytics` gains `grade: DraftGrade` field
- `computeDraftAnalytics` returns grade computed from avg (actualPick - expectedADP)
- `DraftSummary` shows grade letter prominently, download card button

**Grade formula:** avg delta = average of (pick.overallPick - player.searchRank) across all user's picks. Positive = drafted players later than ADP (value). Negative = reached earlier than ADP.

```
avgDelta > 20  → A+
> 15           → A
> 10           → A-
> 5            → B+
> 0            → B
> -5           → B-
> -10          → C+
> -20          → C
≤ -20          → D
```

- [ ] **Step 1: Add DraftGrade to types and extend DraftAnalytics**

In `lib/draft/types.ts`, add before the `DraftAnalytics` interface:
```ts
export interface DraftGrade {
  letter: string
  score: number
}
```

Add `grade: DraftGrade` to `DraftAnalytics`:
```ts
export interface DraftAnalytics {
  positionBreakdown: Record<string, number>
  averageADPReached: number
  earliestReach: { player: Player; expectedADP: number; actualPick: number } | null
  biggestValue: { player: Player; expectedADP: number; actualPick: number } | null
  grade: DraftGrade
}
```

- [ ] **Step 2: Write failing test**

In `tests/lib/draft-analytics.test.ts`, add a describe block:

```ts
describe('draft grade in computeDraftAnalytics', () => {
  it('includes a grade field in analytics', () => {
    // buildInitialState needs players with searchRank set
    // Use the existing test helpers or minimal setup
    const result = computeDraftAnalytics(
      { ...minimalCompleteState, settings: { ...minimalCompleteState.settings, userSlot: 1 } },
      playerMapForTests
    )
    expect(result.grade).toBeDefined()
    expect(result.grade.letter).toMatch(/^(A\+|A|A-|B\+|B|B-|C\+|C|D)$/)
    expect(typeof result.grade.score).toBe('number')
  })
})
```

Note: use whatever minimal-state and playerMap helpers already exist in that test file. If none exist, create a minimal state with 1 completed pick and 1 player.

Run: `npx vitest run tests/lib/draft-analytics.test.ts`
Expected: FAIL (no `grade` field yet)

- [ ] **Step 3: Update computeDraftAnalytics in engine.ts to compute grade**

In `lib/draft/engine.ts`, inside `computeDraftAnalytics`:

a) Add `let totalDelta = 0` alongside the existing `let totalADP = 0`.

b) Inside the per-pick loop, after `const diff = actualPick - expectedADP`:
```ts
totalDelta += diff
```

c) Before the return, compute grade:
```ts
const avgDelta = userPicks.length > 0 ? totalDelta / userPicks.length : 0
const gradeLetter =
  avgDelta > 20  ? 'A+' :
  avgDelta > 15  ? 'A'  :
  avgDelta > 10  ? 'A-' :
  avgDelta > 5   ? 'B+' :
  avgDelta > 0   ? 'B'  :
  avgDelta > -5  ? 'B-' :
  avgDelta > -10 ? 'C+' :
  avgDelta > -20 ? 'C'  : 'D'
```

d) Add `grade: { letter: gradeLetter, score: avgDelta }` to the return object.

- [ ] **Step 4: Re-run test**

```bash
npx vitest run tests/lib/draft-analytics.test.ts
```
Expected: PASS

- [ ] **Step 5: Install html2canvas**

```bash
cd /Users/gregspunt/pretty-much-picks && npm install html2canvas
```

- [ ] **Step 6: Rewrite DraftSummary with grade + download card**

Replace `components/draft/DraftSummary.tsx` entirely:

```tsx
'use client'
import { useRef } from 'react'
import type { DraftAnalytics, DraftSettings } from '@/lib/draft/types'

interface DraftSummaryProps {
  analytics: DraftAnalytics
  settings: DraftSettings
  onPlayAgain: () => void
  playAgainLabel?: string
}

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

function gradeColor(letter: string): string {
  if (letter.startsWith('A')) return '#ef4444'
  if (letter.startsWith('B')) return '#f97316'
  if (letter.startsWith('C')) return '#eab308'
  return '#6b7280'
}

export function DraftSummary({ analytics, settings, onPlayAgain, playAgainLabel }: DraftSummaryProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const positions = POSITION_ORDER.filter(p => analytics.positionBreakdown[p])
  const { letter, score } = analytics.grade
  const color = gradeColor(letter)

  const handleDownload = async () => {
    if (!cardRef.current) return
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(cardRef.current, { backgroundColor: '#111111', scale: 2 })
      const link = document.createElement('a')
      link.download = 'draft-grade.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      // silent — user can screenshot manually
    }
  }

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col items-center justify-start px-4 py-8 gap-6">
      <div className="text-center">
        <h1 className="text-pmp-white text-2xl font-bold">Draft Complete</h1>
        <p className="text-pmp-gray-500 text-sm mt-1">
          {settings.numTeams} teams · {settings.numRounds} rounds · {settings.scoring.toUpperCase()}
        </p>
      </div>

      {/* Shareable card — also the html2canvas capture target */}
      <div
        ref={cardRef}
        className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
        style={{ backgroundColor: '#111111', border: '1px solid #1e1e1e' }}
      >
        {/* Brand header */}
        <div className="flex items-center justify-between">
          <span className="text-pmp-red text-xs font-bold uppercase tracking-widest">Pretty Much Picks</span>
          <span className="text-pmp-gray-600 text-xs">{settings.scoring.toUpperCase()} · {settings.numTeams}T</span>
        </div>

        {/* Grade block */}
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 font-black text-4xl text-white"
            style={{ backgroundColor: color }}
          >
            {letter}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Draft Grade</p>
            <p className="text-pmp-white text-sm">
              Avg value: {score > 0 ? '+' : ''}{score.toFixed(1)} picks
            </p>
            <div className="flex gap-2 flex-wrap mt-1">
              {positions.map(pos => (
                <span key={pos} className="text-pmp-gray-500 text-xs">
                  {analytics.positionBreakdown[pos]}{pos}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Value pick */}
        {analytics.biggestValue && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#0d0d0d' }}>
            <span className="text-base">📈</span>
            <div>
              <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest">Best Value</p>
              <p className="text-pmp-white text-sm font-semibold">
                {analytics.biggestValue.player.firstName} {analytics.biggestValue.player.lastName}
              </p>
              <p className="text-pmp-gray-500 text-xs">
                Picked {analytics.biggestValue.actualPick} · ADP {analytics.biggestValue.expectedADP}
              </p>
            </div>
          </div>
        )}

        {/* Reach */}
        {analytics.earliestReach && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: '#0d0d0d' }}>
            <span className="text-base">⚠️</span>
            <div>
              <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest">Biggest Reach</p>
              <p className="text-pmp-white text-sm font-semibold">
                {analytics.earliestReach.player.firstName} {analytics.earliestReach.player.lastName}
              </p>
              <p className="text-pmp-gray-500 text-xs">
                Picked {analytics.earliestReach.actualPick} · ADP {analytics.earliestReach.expectedADP}
              </p>
            </div>
          </div>
        )}

        <p className="text-pmp-gray-800 text-[10px] text-center">prettymuchpicks.com</p>
      </div>

      {/* Action buttons */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <button
          onClick={handleDownload}
          className="w-full bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white font-semibold py-3 rounded-xl text-sm hover:border-pmp-gray-600 transition-colors flex items-center justify-center gap-2"
        >
          <span>⬇</span> Download Card
        </button>
        <button
          onClick={onPlayAgain}
          className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-base hover:opacity-90 transition-opacity"
        >
          {playAgainLabel ?? 'Draft Again'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run all tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add lib/draft/types.ts lib/draft/engine.ts components/draft/DraftSummary.tsx tests/lib/draft-analytics.test.ts package.json package-lock.json
git commit -m "feat: draft grade (A+ to D) + branded downloadable share card on summary screen"
```

---

### Task 6: Multiplayer setup — numTeams fix + lineup preset in create form

**Files:**
- Modify: `lib/league/service.ts`
- Modify: `app/league/new/page.tsx`
- Modify: `tests/lib/league-service.test.ts`

**Interfaces:**
- `DraftService.initializeDraft` must use `params.settings.numTeams` for draft size, assign human members to random slots within [1..numTeams]
- `app/league/new/page.tsx` exposes lineup preset selector in the Create tab; value included in `settings` body

**Critical bug context:** `DraftService.initializeDraft` currently overrides `numTeams` with `members.length`:
```ts
const settings = { ...params.settings, numTeams: params.members.length }
```
This makes a 10-team league with 2 humans create only a 2-pick-per-round draft. CPU auto-pick never fires. Fix: use `params.settings.numTeams` directly, assign human members to randomly chosen slots within [1..numTeams].

- [ ] **Step 1: Write failing test**

In `tests/lib/league-service.test.ts`, add to the existing describe block (or create one):

```ts
it('preserves settings.numTeams regardless of member count', () => {
  const settings: DraftSettings = {
    numTeams: 10, numRounds: 15, userSlot: 1, scoring: 'ppr', speed: 'normal',
    lineup: DEFAULT_LINEUP,
  }
  const members: LeagueMember[] = [
    { id: '1', leagueId: 'l', userId: 'u1', displayName: 'Alice', teamSlot: null, isReady: false, joinedAt: '' },
    { id: '2', leagueId: 'l', userId: 'u2', displayName: 'Bob',   teamSlot: null, isReady: false, joinedAt: '' },
  ]
  const { state, membersWithSlots } = DraftService.initializeDraft({ settings, players: [], members })
  expect(state.settings.numTeams).toBe(10)
  expect(state.picks).toHaveLength(10 * 15)
  expect(membersWithSlots).toHaveLength(2)
  membersWithSlots.forEach(m => {
    expect(m.teamSlot).toBeGreaterThanOrEqual(1)
    expect(m.teamSlot).toBeLessThanOrEqual(10)
  })
  const slots = membersWithSlots.map(m => m.teamSlot)
  expect(new Set(slots).size).toBe(2)  // no duplicate slots
})
```

Also check what imports are needed at the top of the test file and add `DEFAULT_LINEUP` import from `@/lib/draft/types` if missing.

Run: `npx vitest run tests/lib/league-service.test.ts`
Expected: FAIL

- [ ] **Step 2: Fix DraftService.initializeDraft**

In `lib/league/service.ts`, replace `initializeDraft`:

```ts
initializeDraft(params: {
  settings: DraftSettings
  players: Player[]
  members: LeagueMember[]
}): InitResult {
  const numTeams = params.settings.numTeams

  // Shuffle all [1..numTeams] slots (Fisher-Yates), assign first members.length to real members
  const allSlots = Array.from({ length: numTeams }, (_, i) => i + 1)
  for (let i = allSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allSlots[i], allSlots[j]] = [allSlots[j], allSlots[i]]
  }

  const membersWithSlots: LeagueMember[] = params.members.map((m, i) => ({
    ...m,
    teamSlot: allSlots[i],
  }))

  // Use settings directly — CPU auto-pick handles slots with no real member
  const state = buildInitialState(params.settings, params.players)

  return { state, membersWithSlots }
},
```

- [ ] **Step 3: Re-run test**

```bash
npx vitest run tests/lib/league-service.test.ts
```
Expected: PASS

- [ ] **Step 4: Add lineup presets to create league form**

In `app/league/new/page.tsx`:

a) Add imports at the top:
```tsx
import { DEFAULT_LINEUP } from '@/lib/draft/types'
import type { LineupConfig } from '@/lib/draft/types'
```

b) Add state alongside other state declarations:
```tsx
const [lineup, setLineup] = useState<LineupConfig>(DEFAULT_LINEUP)
```

c) Add `LINEUP_PRESETS` constant outside the component:
```tsx
const LINEUP_PRESETS: Record<string, { label: string; lineup: LineupConfig }> = {
  espn:    { label: 'ESPN',    lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 } },
  sleeper: { label: 'Sleeper', lineup: { QB:1, RB:2, WR:3, TE:1, FLEX:1, K:0, DEF:1, BN:6 } },
  yahoo:   { label: 'Yahoo',   lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 } },
}
```

d) In the Create tab JSX (between Teams selector and Create button), add:
```tsx
<div className="flex flex-col gap-2">
  <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Lineup</span>
  <div className="grid grid-cols-3 gap-2">
    {(Object.entries(LINEUP_PRESETS)).map(([key, preset]) => (
      <button
        key={key}
        type="button"
        onClick={() => setLineup(preset.lineup)}
        className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${
          JSON.stringify(lineup) === JSON.stringify(preset.lineup)
            ? 'border-pmp-red bg-[#1a0505] text-pmp-white'
            : 'border-pmp-gray-800 bg-pmp-gray-900 text-pmp-gray-500 hover:text-pmp-white'
        }`}
      >
        {preset.label}
      </button>
    ))}
  </div>
</div>
```

e) Include `lineup` in the `handleCreate` request body:
```tsx
body: JSON.stringify({ name, displayName, settings: { ...DEFAULT_SETTINGS, scoring, numTeams, lineup } }),
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/league/service.ts app/league/new/page.tsx tests/lib/league-service.test.ts
git commit -m "fix: multiplayer uses settings.numTeams for draft — CPU fills empty slots; add lineup preset to create form"
```

---

### Task 7: Loading skeleton for player pool in LiveDraftBoard

**Files:**
- Modify: `components/league/LiveDraftBoard.tsx`

**Interfaces:**
- No interface changes; visual-only addition

- [ ] **Step 1: Add skeleton in the player pool aside**

In `components/league/LiveDraftBoard.tsx`, inside the player pool `<aside>`, wrap `<DraftPlayerPool .../>` with a condition:

```tsx
<aside className={...}>
  {players.length === 0 ? (
    <div className="flex flex-col gap-2 p-3 animate-pulse">
      {/* Search bar skeleton */}
      <div className="h-10 bg-[#1e1e1e] rounded-lg" />
      {/* Position pills skeleton */}
      <div className="flex gap-1.5 flex-wrap">
        {['', '', '', '', ''].map((_, i) => (
          <div key={i} className="h-6 w-10 bg-[#1e1e1e] rounded-full" />
        ))}
      </div>
      {/* Player row skeletons */}
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-5 h-3 bg-[#1e1e1e] rounded" />
          <div className="w-9 h-9 bg-[#1e1e1e] rounded-full shrink-0" />
          <div className="flex flex-col gap-1 flex-1">
            <div className="h-3 bg-[#1e1e1e] rounded w-3/4" />
            <div className="h-2 bg-[#1e1e1e] rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <DraftPlayerPool
      players={players}
      availablePlayerIds={state.availablePlayerIds}
      playerMap={playerMap}
      selectedPoolPlayerId={selectedPoolPlayerId}
      lockedPlayerIds={state.lockedPlayerIds}
      isUserTurn={isMyTurn && !isPicking}
      onPickPlayer={handlePickPlayer}
      onSelectPlayer={setSelectedPoolPlayerId}
      onToggleLock={() => {}}
    />
  )}
</aside>
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add components/league/LiveDraftBoard.tsx
git commit -m "feat: player pool loading skeleton while Sleeper data fetches in multiplayer draft"
```

---

### Task 8: Deploy

**Files:** None — deploy only.

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run
```
Expected: all pass.

- [ ] **Step 2: Deploy**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vercel --prod --yes
```
Expected: build succeeds, deployment URL printed.

- [ ] **Step 3: Smoke-test checklist**

Manual verification:
- [ ] Mobile `/mock-draft`: back button visible, Players/Board/My Team tabs work
- [ ] `/mock-draft/[shareId]`: player pool shows names, My Team populated
- [ ] Solo draft complete: grade letter + download card button
- [ ] "Download Card" generates PNG
- [ ] Multiplayer create: lineup presets shown (ESPN/Sleeper/Yahoo)
- [ ] 2-player 10-team league: draft has 150 picks, CPU auto-picks remaining 8 slots instantly
- [ ] Multiplayer last pick: DraftSummary appears immediately (no visible delay)
- [ ] Multiplayer summary: "Back to Home" button works
