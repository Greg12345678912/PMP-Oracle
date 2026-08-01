# Task 6 Report — Rankings API routes (save draft + lock)

## Files Created / Modified

### `lib/oracle/rankings.ts` (created)
Core library module. Exports:
- `RankingRow` interface: `{ playerRank, playerId, playerName, confidence }`
- `ValidateResult` type: discriminated union `{ ok: true } | { ok: false; error: string }`
- `validateRankings(position, rows)` — validates max size (from `POSITION_LIST_SIZE`) and no duplicate ranks
- `rankingsKey(userId, seasonId, position)` — DB composite key descriptor
- `getRankings(userId, seasonId, position)` — reads `rankings` jsonb column via service client
- `upsertRankings(userId, seasonId, position, rows)` — upserts via `onConflict: 'user_id,season_id,position'`

Schema note: adapted to actual `challenge_rankings` table (`rankings jsonb` column rather than per-row schema) while keeping the `RankingRow[]` shape stored in the jsonb value.

### `lib/oracle/__tests__/rankings.test.ts` (created)
4 vitest tests for `validateRankings`:
1. Rejects if too many entries (> `POSITION_LIST_SIZE.QB`)
2. Rejects duplicate ranks
3. Accepts a valid full QB list (10 rows)
4. Allows partial list (draft save)

### `app/api/oracle/rankings/route.ts` (created)
Two handlers:

**GET `/api/oracle/rankings?position=<POS>`** (optionally `?userId=<id>`)
- Unauthenticated → `{ rankings: [] }` (no error, graceful)
- Invalid position → 400
- Requester is non-owner AND `now < ORACLE_LOCK_DATE` → 403 (non-negotiable product rule)
- Non-owner after lock → checks `is_public` flag; 404 if not public
- Owner → returns own rankings from `getRankings()`

**PUT `/api/oracle/rankings`** — body `{ position, rankings: RankingRow[] }`
- Unauthenticated → 401
- Invalid position → 400
- `now >= ORACLE_LOCK_DATE` → 423 Locked (non-negotiable product rule)
- DB season locked (`isLocked(season)`) → 423 Locked
- No active season → 404
- `rankings` not array → 400
- `validateRankings` fails → 400
- Success → `{ ok: true }`

## Tests Written and Pass

```
Test Files  27 passed (27)
     Tests  159 passed (159)
  Duration  3.86s
```

Rankings-specific: 4/4 pass.

## Build Result

```
✓ Compiled successfully in 11.5s
✓ TypeScript passed
ƒ /api/oracle/rankings  — appears as dynamic route
```

## Self-Review Notes

1. **DB schema alignment**: The brief's `lib/oracle/rankings.ts` code queried per-row columns (`player_rank`, `player_id`, `player_name`) but the actual `challenge_rankings` table has a `rankings jsonb` column. Implemented using `upsert` on `rankings` jsonb storing the full `RankingRow[]`. If the actual table turns out to have per-row columns, `getRankings` and `upsertRankings` need updating.

2. **Lock status code**: Brief says 409 for locked, system prompt spec says 423 (HTTP 423 Locked is the correct semantic). Used 423.

3. **Test runner**: Brief says `npx jest` but project uses vitest. Tests written for vitest's global `describe/it/expect` — works correctly with existing config.

4. **GET userId param**: Brief only shows `?position=` but the 403 product rule requires knowing who the owner is. Added optional `?userId=` query param so callers can view others' public rankings post-lock. Owner always gets their own rankings regardless.

5. **Upsert conflict key**: Assumes a unique constraint on `(user_id, season_id, position)` in the DB. If this constraint doesn't exist, the upsert will fall back to insert and may create duplicates. A DB migration adding this constraint is recommended.

## Fix: jsonb schema alignment
- Replaced per-row migration with jsonb (one row per user/season/position)
- Added unique(user_id, season_id, position) constraint
- Fixed upsert conflict key
- Added request.json() try/catch in route
- Removed dynamic import of getServiceClient
- Build: pass
- Tests: 4/4 pass
