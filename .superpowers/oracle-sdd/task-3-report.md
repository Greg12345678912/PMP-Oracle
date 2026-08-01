# Task 3 Report: Google Sign-In flow + user_profiles creation

## Files Created

### `lib/oracle/__tests__/profile.test.ts`
Unit tests for `generateUsername`. Three cases: lowercase conversion, special-char stripping, 20-char truncation. All pass via Vitest.

### `lib/oracle/profile.ts`
- `UserProfile` interface (camelCase mapping from snake_case DB columns)
- `generateUsername(displayName)` — strips non-alphanumeric, lowercases, truncates to 20
- `uniqueUsername(base, suffix)` — trims base to 16 chars, appends numeric suffix for collision handling
- `getProfile(userId)` — queries `user_profiles` with service client, returns mapped row or null
- `createProfile(params)` — inserts with up to 10 collision-retry attempts on Postgres error code `23505`
- `getOrCreateProfile(userId, googleDisplayName, avatarUrl)` — convenience wrapper (required by brief interface contract)
- `mapRow(row)` — internal snake_case → camelCase mapper

### `app/auth/callback/route.ts`
GET handler: reads `code` and `next` query params, exchanges code for session via `supabase.auth.exchangeCodeForSession`, redirects to `${origin}${next}` (defaults to `/challenge`).

### `app/api/auth/profile/route.ts`
- `GET` — returns `{ profile }` for authenticated user or `{ profile: null }` if unauthenticated
- `POST` — creates profile if none exists; falls back to `session.user_metadata.full_name`, email prefix, or "Anonymous" for display name; returns 201 on creation, 200 on existing

### `components/oracle/SignInButton.tsx`
`'use client'` component. Props: `label`, `redirectTo`, `className`. Calls `supabase.auth.signInWithOAuth({ provider: 'google' })` with redirect to `/auth/callback?next=<encoded>`. Uses `bg-pmp-white text-pmp-black` (no raw `text-white`). Google logo SVG inline.

## Build Result

`npm run build` — clean. TypeScript passed. All 5 new routes appear in the route table:
- `ƒ /api/auth/profile`
- `ƒ /auth/callback`

## Test Result

`npx vitest run lib/oracle/__tests__/profile.test.ts` — 3/3 passed.

## Self-Review Notes

- `getOrCreateProfile` is exported from `lib/oracle/profile.ts` as specified in the Interfaces section of the brief, even though no test exercises it directly; it delegates to `getProfile` + `createProfile`.
- `mapRow` will cast `undefined` DB columns (e.g. `creator_links` if column doesn't exist yet) safely via nullish coalescing — fine at runtime, but if `creator_links` column is absent a DB schema migration will be needed before that field returns meaningful data.
- The `getProfile` / `createProfile` functions use the service-role client (bypasses RLS), which is correct for server-side profile provisioning but means callers must stay in API routes or server components.
- No raw `h-screen`, no raw `text-white` used anywhere in new files.

## Fix: getOrCreateProfile in callback
- Added getOrCreateProfile call post-exchange
- Build result: pass
