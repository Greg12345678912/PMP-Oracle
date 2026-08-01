# Task 7 Report: Drag-and-drop PPR Ranking UI

## Status: COMPLETE

## Commit
`89fdb2b` — feat: drag-and-drop PPR ranking UI with confidence dots, save draft, anonymous → sign-in flow

## Files Created

### `components/oracle/ConfidenceDot.tsx`
Low/Medium/High confidence toggle button. Visual dot is 20px; the wrapping `<button>` is `w-11 h-11` (44px) to meet the touch-target requirement. Cycles L → M → H → L. Colors: gray-600 / orange #f97316 / pmp-red.

### `components/oracle/RankingRow.tsx`
Individual sortable player row using `useSortable` from `@dnd-kit/sortable`. Drag handle is an explicit `<button>` with `w-11 h-11` (44px), separate from the row — not the whole row. Remove button is also 44px. Both hidden in locked state.

### `components/oracle/RankingList.tsx`
Full dnd-kit sortable list for one position:
- `PointerSensor` (delay=5px) + `TouchSensor` (delay=120ms, tolerance=8px) + `KeyboardSensor`
- Real-time `localStorage` auto-save under key `oracle_rankings_draft_{position}` on every `rows` state change (skips first render to avoid stomping server data)
- Seeds from localStorage draft if present, falls back to `initialRows` from server
- Progress bar (red fill, % of maxSize) + `X / Y ranked` counter
- Player pool search filtered by name, shows top 30 matches, 44px row touch targets
- Sticky CTA at bottom: gradient background, `fixed bottom-0`, `pb-24` padding on scrollable content. Label changes: "Save Draft (X/Y)" when anonymous, "Lock {POS} Rankings" when signed in
- Post-lock: reads-only banner, all inputs/handles hidden
- All position labels include "PPR": `Top {N} {POS} (PPR)`

### `app/challenge/rankings/client.tsx`
`'use client'` shell with QB/RB/WR/TE tab bar (44px min-height). Handles:
- `handleLock`: if signed out → writes localStorage (already done by RankingList) then triggers Google OAuth via `supabase.auth.signInWithOAuth` with `redirectTo=/auth/callback?next=/challenge/rankings`
- Post-sign-in sync `useEffect`: on mount when `isSignedIn=true` and `?synced` param absent, uploads all localStorage drafts to `/api/oracle/rankings` (PUT) then sets `?synced=1` in URL to prevent re-runs

### `app/challenge/rankings/page.tsx`
Server component (`dynamic = 'force-dynamic'`):
- Fetches `getSession()` + `getCurrentSeason()` in parallel
- Fetches all 4 player pools via `getPlayerPool()` in parallel
- Fetches saved rankings for signed-in users via `getRankings()` in parallel
- Renders `<RankingsClient>` with all data

## Build Result
```
✓ Compiled successfully in 6.2s
✓ TypeScript clean (zero errors in source files)
ƒ /challenge/rankings  — Dynamic, server-rendered on demand
```

Pre-existing test file errors (missing `@types/jest`, test fixture shape mismatches) — all pre-date this task, none in new files.

## Self-Review

### Mobile drag UX
- Explicit 44px drag handles on every row — not whole-row-draggable. Touch sensor uses delay=120ms / tolerance=8px to avoid accidental reorders during scroll.
- Sticky CTA uses `fixed bottom-0` with gradient fade so it's always visible. `pb-24` on the list prevents last item from hiding behind it.
- Progress bar provides clear X/Y feedback at a glance.

### localStorage flow
- Writes happen in a `useEffect` that fires after every rows change, skipping the initial render. Key: `oracle_rankings_draft_{position}` exactly as specified.
- On sign-in return, the client reads each position's draft, PUTs to API, clears key, marks `?synced=1` in URL.

### Concern: Sleeper API cache warning
The build log shows `Failed to set Next.js data cache for https://api.sleeper.app/v1/players/nfl, items over 2MB`. This is a build-time static page generation issue (the Sleeper response is 19MB). It does not affect the `force-dynamic` `/challenge/rankings` route at runtime — but it means every request to `/challenge/rankings` will re-fetch Sleeper data. Worth caching at the `getPlayerPool` level in a future task.

### Concern: No optimistic confidence default reset
Per the brief, new players added to a ranked list default to `'low'` confidence (implemented). The brief snippet used `'medium'` but the non-negotiable constraint says `'low'` — I used `'low'`.
