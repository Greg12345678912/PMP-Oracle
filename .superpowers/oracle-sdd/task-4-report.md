# Task 4 Report — Countdown Component + /challenge Landing Page

## Files Created / Modified

| File | Action |
|---|---|
| `lib/oracle/__tests__/season.test.ts` | Created — 3 vitest tests for `isLocked` |
| `lib/oracle/season.ts` | Created — `Season` interface, `getCurrentSeason()`, `isLocked()` |
| `components/oracle/Countdown.tsx` | Created — `'use client'` live D/H/M/S countdown |
| `app/challenge/page.tsx` | Created — server component, `force-dynamic`, reads season from DB |

## Test Results

```
Test Files  1 passed (1)
     Tests  3 passed (3)
  Duration  394ms
```

All three `isLocked` cases pass: open+future → false, open+past → true, non-open → true.

## Build Result

```
✓ Compiled successfully
✓ Generating static pages (15/15)
ƒ /challenge    (Dynamic) server-rendered on demand
```

Build clean. `/challenge` appears as `ƒ (Dynamic)` — correct because `export const dynamic = 'force-dynamic'` was required; without it, Next.js 16 attempted to prerender the page at build time, calling `getServiceClient()` with no env vars and throwing `Invalid supabaseUrl`.

## Commit

```
94be5ef feat: oracle challenge landing page with live countdown to Sept 9 lock date
```

## Self-Review Notes

1. **`dynamic = 'force-dynamic'` not in brief.** The brief's `page.tsx` sample omits this export. It is required in Next.js 16 (non-Cache-Components mode) because `getCurrentSeason()` calls `getServiceClient()` which reads `NEXT_PUBLIC_SUPABASE_URL` at module load. Without env vars at build time the prerender crashes. Added per AGENTS.md mandate to check `node_modules/next/dist/docs/` before writing any code.

2. **CTA route discrepancy.** The system prompt context says the CTA button should go to `/challenge/rank`; the brief's code sample uses `/challenge/rankings`. Implemented `/challenge/rankings` per the brief (authoritative spec). If `/challenge/rank` is the correct route target, one `href` change is the only fix needed.

3. **No `getSession()` check on the CTA label.** The system prompt design intent says to check `getSession()` server-side and show "Continue Rankings" vs "Build Your Rankings". The brief's code uses `isLocked(season)` to toggle "View My Rankings" vs "Lock In My Rankings" instead. Implemented per the brief. The session-aware variant can be added in Task 5 when the rankings page is built.

4. **`Countdown` init state matches server.** `useState` initializes with `() => getTimeLeft(lockDate)` (lazy initializer) so there is no hydration mismatch — the first client render matches what the server would show if it rendered the same moment.

5. **Pre-existing build warning.** `Failed to set Next.js data cache for https://api.sleeper.app/v1/players/nfl, items over 2MB` — pre-existing, unrelated to this task.
