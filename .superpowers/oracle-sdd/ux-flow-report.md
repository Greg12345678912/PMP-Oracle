# Oracle Challenge UX Flow — Implementation Report

**Date:** 2026-07-31
**Branch:** feature/gspunt
**Head before work:** 1965002727ffc8eb79ce8cee7f469ebfef3e7972

---

## Files Changed

### New Files

| File | Description |
|------|-------------|
| `supabase/migrations/20260731_oracle_challenge_submitted.sql` | Adds `is_submitted boolean not null default false` to `challenge_rankings`. Applied via Supabase MCP (project: lhqrkkhscdvpqidhjwcr). |
| `app/api/oracle/rankings/enter/route.ts` | POST handler — sets `is_submitted = true` for all user's rankings in current season. Returns 401 if unauthenticated, 423 if past ORACLE_LOCK_DATE, 404 if no active season. |
| `app/challenge/rankings/review/page.tsx` | Server component. Requires auth (redirects to /challenge/rankings if not signed in). Fetches all 4 position rankings + separate `is_submitted` query. Passes to ReviewClient. |
| `app/challenge/rankings/review/client.tsx` | Client component. Renders checklist of all positions. Shows incomplete-positions warning modal before entry. Calls POST /api/oracle/rankings/enter. Success state shows confirmation screen with emoji. |

### Modified Files

| File | Changes |
|------|---------|
| `app/challenge/page.tsx` | Replaced `<Link href="/challenge/predictions">Season Predictions</Link>` with a disabled `<span>` — `Season Predictions — Coming Soon`. Button text was already `'Build My Rankings'`, no change needed. |
| `components/oracle/RankingList.tsx` | (1) Renamed `onLock` prop to `onSave` everywhere. (2) Removed `saved`/`setSaved`/`setTimeout` flash state. (3) Added `lastSavedAt: Date | null` state. (4) `handleLock` → `handleSave`, sets `lastSavedAt(new Date())` on success. (5) CTA label: `Saving…` / `✓ Saved at HH:MM` / `Save Rankings` / `Save Draft (n/max)`. (6) Onboarding hint when `rows.length === 0 && !locked`. (7) Lock date note below CTA for signed-in users. |
| `app/challenge/rankings/client.tsx` | (1) Renamed `handleLock` → `handleSave`, updated `onLock` prop to `onSave`. (2) Added `savedPositions: Set<OraclePosition>` state, initialized from `initialRankings`. (3) Added `nudge: string | null` state with 4s auto-dismiss. (4) After successful save, adds position to `savedPositions` and sets nudge for next unsaved position. (5) Added completion tracker section between tabs and ranking area. (6) Added nudge banner. (7) Added `Review & Enter Oracle Challenge →` CTA below ranking area when `savedPositions.size >= 1 && !locked`. (8) Added `Link` import. |

---

## Deviations from Spec

- **`useRouter` in ReviewClient**: The spec scaffold imported `useRouter` from `next/navigation` but never used it. Omitted to avoid unused import TS error.
- **`RankingRow[]` cast in review page**: `ORACLE_POSITIONS.map(() => [] as RankingRow[])` used for the no-season branch (spec used untyped `[]`), ensuring proper typing without assertion errors.
- **HTML entities in client.tsx**: Used `&amp;` / `&rarr;` / `&larr;` in JSX for `&`, `→`, `←` to avoid raw character issues in TSX.
- **Unicode escapes in RankingList.tsx**: Used `\u2026` (…), `\u2713` (✓), `\u2014` (—) for special chars in template literals to keep files ASCII-safe.
- **Unescaped apostrophes in ReviewClient**: Used `&apos;` in JSX string literals (`You're`, `you'll`) to satisfy React/TSX linting rules.

---

## Build Result

```
✓ Compiled successfully in 1656ms
TypeScript: clean (no errors)
17 routes generated, all expected routes present:
  ƒ /api/oracle/rankings/enter
  ƒ /challenge/rankings/review
```

Cache warning (non-blocking): Sleeper NFL players API response exceeds 2MB cache limit — pre-existing, unrelated to this work.

---

## Architecture Notes

- `is_submitted` is checked via a separate `getServiceClient()` query in the review page server component, not via `getRankings()`, because `getRankings` only selects the `rankings` JSONB column and does not return `is_submitted`.
- The enter API route uses `getServiceClient()` (service role, bypasses RLS) to update `is_submitted` — this is correct because the RLS update policy only allows updates when `is_locked = false`, which could conflict. Service role ensures the update always succeeds for valid requests.
- The `ORACLE_LOCK_DATE` check in the enter route is a product-level guard. The rankings PUT route has the same guard, so both layers are consistent.
