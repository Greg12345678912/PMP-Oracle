# Task 12 Report — Player Community Stats Pages `/players/[id]`

## Files Created

- `lib/oracle/playerStats.ts` — shared aggregation helper
- `app/api/oracle/players/[id]/route.ts` — GET handler
- `app/players/[id]/page.tsx` — server-rendered page

## What Was Built

### `lib/oracle/playerStats.ts`
A shared `getPlayerStats(playerId, seasonId, userId)` function that:
1. Fetches all submitted `challenge_rankings` rows for the season via `getServiceClient()`
2. Iterates each row's `rankings` jsonb array (typed as `RankingRow[]`) and finds the player by `playerId`
3. Aggregates: community average rank, most common rank (by frequency map), confidence breakdown (low/medium/high as % of total), and the calling user's own rank if `userId` is provided
4. Returns `null` if the player appears in zero submitted rankings

### `app/api/oracle/players/[id]/route.ts`
- Returns 403 before `ORACLE_LOCK_DATE`
- Resolves session and current season in parallel
- Delegates to `getPlayerStats` and returns JSON
- Context typed with inline `interface RouteContext { params: Promise<{ id: string }> }` (avoids dependency on `next typegen` for `RouteContext<…>`)

### `app/players/[id]/page.tsx`
- `export const dynamic = 'force-dynamic'`
- Gates on `ORACLE_LOCK_DATE` — returns a message if before lock
- Fetches stats directly from DB (same helper, avoids internal HTTP fetch)
- Calls `notFound()` if player not in any rankings
- UI sections: header (player name, submission count), rank cards (community avg + most common in 2-col grid), "Your Rank vs Community" card (signed-in users only, shows delta direction), confidence breakdown with animated bar chart
- All colors use pmp tokens only (`pmp-black`, `pmp-white`, `pmp-red`, `pmp-gray-*`)
- `h-[100dvh]` not `h-screen`; 44px min-height on interactive containers

## Build Output

```
✓ Compiled successfully in 1746ms
✓ TypeScript — clean (no errors in new files; pre-existing test file errors unrelated to this task)
✓ Generating static pages (18/18) in 1944ms

Route (app)
├ ƒ /api/oracle/players/[id]   → dynamic, server-rendered on demand
├ ƒ /players/[id]              → dynamic, server-rendered on demand
```

## Commit

`838598b` — feature/multiplayer-m1

## Concerns

- The `RouteContext<'/api/oracle/players/[id]'>` global helper (introduced in Next.js 15/16) requires `next typegen` to have been run first to register the route in the generated types. Using it cold causes TS2344. Switched to the explicit inline `interface RouteContext` pattern used by the rest of this codebase — fully equivalent, no functional difference.
- The `challenge_rankings` table has no index on `season_id + is_submitted`. With large numbers of users this full-table scan will become slow. A partial index on `(season_id) WHERE is_submitted = true` would help when traffic scales.
- The Sleeper API cache-miss warning (`items over 2MB`) during build is pre-existing and unrelated to this task.
