# Oracle Challenge V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build The Oracle Challenge — a pre-season PPR rankings competition where users lock in their Top 10 QB / Top 20 RB / Top 20 WR / Top 10 TE predictions before NFL Week 1 (September 9, 2026) and get scored at season's end with a full per-player right/wrong breakdown.

**Architecture:** Supabase Google OAuth for auth (triggered only at save/lock/share — all tools remain anonymous). New tables in existing Supabase project. Next.js App Router, same patterns as existing league/draft features. Drag-and-drop ranking UI via `@dnd-kit/core`. No leaderboard in this build.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2, `@dnd-kit/core` + `@dnd-kit/sortable`, `@supabase/ssr` for auth cookie handling, html2canvas (already installed) for share cards.

**Design spec:** `docs/superpowers/specs/2026-07-31-oracle-challenge-design.md`
**Product principles:** `docs/product-principles.md`

## Global Constraints

- All routes and components follow existing file/naming conventions (see `app/`, `lib/`, `components/`)
- Server components fetch data; client components handle interaction — same pattern as `app/mock-draft/` and `app/league/`
- Supabase service client (`lib/league/db.ts` → `getServiceClient()`) for API routes; anon client for client-side realtime/auth
- All PPR scoring: every reference to rankings must say "PPR" explicitly in UI copy
- Colors: `pmp-red`, `pmp-white`, `pmp-black`, `pmp-gray-{500,600,800,900}` — no raw Tailwind `text-white`
- Heights: `h-[100dvh]` not `h-screen`
- Auth gate pattern: anonymous → trigger sign-in only at save/lock/share, never on page load
- `@dnd-kit` not `react-beautiful-dnd` (which is unmaintained)
- Lock date constant: `2026-09-09T20:20:00-04:00` (Wednesday Sept 9, 2026 — first NFL game kickoff ET). Store in a single shared constant.
- Username: unique handle (used in URLs, set at sign-up, immutable) + display_name (shown in UI, changeable)
- Admin flag: `user_profiles.is_admin = true` — checked server-side in admin API routes
- Rankings UI is mobile-first: large drag handles (min 44px touch target), sticky "Save Draft" / "Lock Rankings" CTA at bottom of screen, progress indicator showing "X/Y ranked" for each position
- Anonymous auto-save: ranking state persisted to `localStorage` under key `oracle_rankings_draft` in real time (no sign-in required). On sign-in, localStorage draft is uploaded to the DB and cleared.
- `@dnd-kit` drag handles must be explicit `<DragHandle>` elements (not the whole row) for mobile usability

---

## Phase 1 — Foundation

### Task 1: Install dependencies + Supabase auth setup

**Files:**
- Modify: `package.json`
- Create: `lib/auth/client.ts`
- Create: `lib/auth/server.ts`
- Create: `middleware.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces:
  - `getBrowserClient(): SupabaseClient` — anon client for browser (uses `@supabase/ssr` `createBrowserClient`)
  - `getServerClient(): SupabaseClient` — server client with cookie access (uses `createServerClient`)
  - `getSession(): Promise<Session | null>` — reads session from cookies server-side
  - `middleware.ts` refreshes auth tokens on every request (required by `@supabase/ssr`)

- [ ] **Step 1: Install packages**

```bash
npm install @supabase/ssr @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create browser Supabase client**

Create `lib/auth/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3: Create server Supabase client**

Create `lib/auth/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export async function getSession() {
  const supabase = await getServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
```

- [ ] **Step 4: Create middleware to refresh auth tokens**

Create `middleware.ts` at project root:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  )

  await supabase.auth.getUser()
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```

Expected: no TypeScript errors. No runtime changes yet.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/auth/client.ts lib/auth/server.ts middleware.ts
git commit -m "feat: add @supabase/ssr + @dnd-kit, create auth client/server helpers and middleware"
```

---

### Task 2: Supabase — enable Google OAuth + create tables

**Files:**
- Create: `supabase/migrations/20260731_oracle_challenge_foundation.sql`

**Interfaces:**
- Produces: tables `user_profiles`, `seasons`, and `ORACLE_LOCK_DATE` constant
- Produces: `lib/oracle/constants.ts` exporting `ORACLE_LOCK_DATE`

**Note:** Google OAuth must be enabled in the Supabase dashboard (Authentication → Providers → Google). This migration only covers DB schema. The OAuth client ID/secret must be added as env vars: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` already exist; no new env vars needed for auth itself (OAuth config lives in Supabase dashboard).

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/20260731_oracle_challenge_foundation.sql`:

```sql
-- user_profiles: linked to Supabase auth
create table if not exists public.user_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique not null references auth.users(id) on delete cascade,
  username       text unique not null,        -- immutable @handle, used in /u/[username]
  display_name   text not null,
  avatar_url     text,
  is_verified    boolean not null default false,
  is_creator     boolean not null default false,
  is_admin       boolean not null default false,
  creator_links  jsonb not null default '{}', -- { youtube, tiktok, podcast, newsletter }
  accuracy_rating int not null default 1000,  -- stored now, surfaced post-Season-1
  created_at     timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read all profiles"
  on public.user_profiles for select using (true);

create policy "Users can update their own profile"
  on public.user_profiles for update using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.user_profiles for insert with check (auth.uid() = user_id);

-- seasons: one row per NFL season
create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  year       int unique not null,
  name       text not null,           -- "2026 Oracle Challenge"
  lock_at    timestamptz not null,    -- rankings/predictions lock at this timestamp
  scored_at  timestamptz,             -- null until admin triggers scoring
  status     text not null default 'open'
                check (status in ('open','locked','scoring','scored'))
);

alter table public.seasons enable row level security;

create policy "Anyone can read seasons"
  on public.seasons for select using (true);

create policy "Admins can manage seasons"
  on public.seasons for all using (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid() and is_admin = true
    )
  );

-- Seed 2026 season
insert into public.seasons (year, name, lock_at, status)
values (
  2026,
  '2026 Oracle Challenge',
  '2026-09-09T20:20:00-04:00',
  'open'
) on conflict (year) do nothing;
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool with the SQL above against the production project. Confirm success.

- [ ] **Step 3: Create shared constants file**

Create `lib/oracle/constants.ts`:

```ts
/** Lock date for The Oracle Challenge 2026.
 *  Wednesday September 9, 2026 — NFL Week 1 opening kickoff (8:20 PM ET). */
export const ORACLE_LOCK_DATE = new Date('2026-09-09T20:20:00-04:00')

export const ORACLE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const
export type OraclePosition = typeof ORACLE_POSITIONS[number]

/** How many players users rank per position */
export const POSITION_LIST_SIZE: Record<OraclePosition, number> = {
  QB: 10,
  RB: 20,
  WR: 20,
  TE: 10,
}
```

- [ ] **Step 4: Verify tables exist**

In Supabase dashboard or via MCP `execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in ('user_profiles', 'seasons');
```

Expected: 2 rows returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731_oracle_challenge_foundation.sql lib/oracle/constants.ts
git commit -m "feat: add user_profiles + seasons tables, seed 2026 season, oracle constants"
```

---

### Task 3: Google Sign-In flow + user_profiles creation

**Files:**
- Create: `app/auth/callback/route.ts`
- Create: `app/api/auth/profile/route.ts`
- Create: `lib/oracle/profile.ts`
- Create: `components/oracle/SignInButton.tsx`

**Interfaces:**
- Produces:
  - `GET /auth/callback` — Supabase OAuth callback handler (exchanges code for session, redirects)
  - `POST /api/auth/profile` — creates or fetches `user_profiles` row for authenticated user; body `{ username, displayName }`, returns `{ profile }`
  - `getOrCreateProfile(userId, googleDisplayName, avatarUrl): Promise<UserProfile>` in `lib/oracle/profile.ts`
  - `<SignInButton label="..." redirectTo="..." />` — triggers Google OAuth, anonymous session carries over

**Consumes:** `lib/auth/server.ts` `getSession()`; `lib/auth/client.ts` `getBrowserClient()`

- [ ] **Step 1: Write failing test for profile creation**

Create `lib/oracle/__tests__/profile.test.ts`:

```ts
import { generateUsername } from '../profile'

describe('generateUsername', () => {
  it('converts display name to lowercase handle', () => {
    expect(generateUsername('Greg Spunt')).toBe('gregspunt')
  })
  it('strips special chars', () => {
    expect(generateUsername('Greg O\'Brien!')).toBe('gregobrien')
  })
  it('truncates to 20 chars', () => {
    expect(generateUsername('averylongnamethatexceedstwentycharacters')).toHaveLength(20)
  })
})
```

Run: `npx jest lib/oracle/__tests__/profile.test.ts`
Expected: FAIL — `generateUsername` not defined yet.

- [ ] **Step 2: Create auth callback route**

Create `app/auth/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/auth/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/challenge'

  if (code) {
    const supabase = await getServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 3: Create profile helper**

Create `lib/oracle/profile.ts`:

```ts
import { getServiceClient } from '@/lib/league/db'

export interface UserProfile {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  isCreator: boolean
  isAdmin: boolean
  creatorLinks: Record<string, string>
  accuracyRating: number
  createdAt: string
}

/** Derive a URL-safe username from a display name. */
export function generateUsername(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20)
}

/** Append a random suffix to make username unique. */
export function uniqueUsername(base: string, suffix: number): string {
  const trimmed = base.slice(0, 16)
  return `${trimmed}${suffix}`
}

/** Fetch existing profile or return null. */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return mapRow(data)
}

/** Create profile, handling username collisions with numeric suffix. */
export async function createProfile(params: {
  userId: string
  displayName: string
  avatarUrl: string | null
}): Promise<UserProfile> {
  const db = getServiceClient()
  const base = generateUsername(params.displayName) || 'user'

  for (let attempt = 0; attempt < 10; attempt++) {
    const username = attempt === 0 ? base : uniqueUsername(base, attempt)
    const { data, error } = await db
      .from('user_profiles')
      .insert({
        user_id: params.userId,
        username,
        display_name: params.displayName,
        avatar_url: params.avatarUrl,
      })
      .select()
      .single()

    if (!error && data) return mapRow(data)
    // If unique violation on username, try next suffix
    if (error?.code !== '23505') throw error
  }
  throw new Error('Could not generate unique username after 10 attempts')
}

function mapRow(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatarUrl: row.avatar_url as string | null,
    isVerified: row.is_verified as boolean,
    isCreator: row.is_creator as boolean,
    isAdmin: row.is_admin as boolean,
    creatorLinks: (row.creator_links ?? {}) as Record<string, string>,
    accuracyRating: row.accuracy_rating as number,
    createdAt: row.created_at as string,
  }
}
```

- [ ] **Step 4: Run test — should pass now**

```bash
npx jest lib/oracle/__tests__/profile.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Create profile API route**

Create `app/api/auth/profile/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile, createProfile } from '@/lib/oracle/profile'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ profile: null })

  const profile = await getProfile(session.user.id)
  return NextResponse.json({ profile })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // If profile already exists, return it
  const existing = await getProfile(session.user.id)
  if (existing) return NextResponse.json({ profile: existing })

  const body = await request.json() as { displayName?: string }
  const displayName = body.displayName
    ?? session.user.user_metadata?.full_name
    ?? session.user.email?.split('@')[0]
    ?? 'Anonymous'
  const avatarUrl = session.user.user_metadata?.avatar_url ?? null

  const profile = await createProfile({ userId: session.user.id, displayName, avatarUrl })
  return NextResponse.json({ profile }, { status: 201 })
}
```

- [ ] **Step 6: Create SignInButton component**

Create `components/oracle/SignInButton.tsx`:

```tsx
'use client'
import { getBrowserClient } from '@/lib/auth/client'

interface SignInButtonProps {
  label?: string
  redirectTo?: string
  className?: string
}

export function SignInButton({
  label = 'Sign in with Google',
  redirectTo = '/challenge',
  className = '',
}: SignInButtonProps) {
  const handleSignIn = async () => {
    const supabase = getBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })
  }

  return (
    <button
      onClick={handleSignIn}
      className={`bg-pmp-white text-pmp-black font-bold py-3 px-6 rounded-xl text-sm hover:opacity-90 transition-opacity flex items-center gap-2 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      {label}
    </button>
  )
}
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add app/auth/callback/route.ts app/api/auth/profile/route.ts lib/oracle/profile.ts lib/oracle/__tests__/profile.test.ts components/oracle/SignInButton.tsx
git commit -m "feat: Google OAuth callback, user_profiles create/fetch, SignInButton component"
```

---

### Task 4: Countdown component + /challenge landing page

**Files:**
- Create: `components/oracle/Countdown.tsx`
- Create: `app/challenge/page.tsx`
- Create: `lib/oracle/season.ts`

**Interfaces:**
- Produces:
  - `<Countdown lockDate={Date} />` — live D/H/M/S countdown, switches to "Rankings are locked" after lockDate
  - `GET /challenge` — server component that reads current season from DB; passes to client shell
  - `getCurrentSeason(): Promise<Season | null>` in `lib/oracle/season.ts`
  - `isLocked(season: Season): boolean` — true if `season.lock_at < now` or `season.status !== 'open'`

- [ ] **Step 1: Write failing test**

Create `lib/oracle/__tests__/season.test.ts`:

```ts
import { isLocked } from '../season'

const future = new Date(Date.now() + 60_000).toISOString()
const past   = new Date(Date.now() - 60_000).toISOString()

describe('isLocked', () => {
  it('returns false when status is open and lock_at is future', () => {
    expect(isLocked({ status: 'open', lock_at: future } as any)).toBe(false)
  })
  it('returns true when lock_at is in the past', () => {
    expect(isLocked({ status: 'open', lock_at: past } as any)).toBe(true)
  })
  it('returns true when status is locked', () => {
    expect(isLocked({ status: 'locked', lock_at: future } as any)).toBe(true)
  })
})
```

Run: `npx jest lib/oracle/__tests__/season.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create season helper**

Create `lib/oracle/season.ts`:

```ts
import { getServiceClient } from '@/lib/league/db'

export interface Season {
  id: string
  year: number
  name: string
  lock_at: string
  scored_at: string | null
  status: 'open' | 'locked' | 'scoring' | 'scored'
}

export async function getCurrentSeason(): Promise<Season | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('seasons')
    .select('*')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as Season | null
}

export function isLocked(season: Season): boolean {
  if (season.status !== 'open') return true
  return new Date(season.lock_at) <= new Date()
}
```

- [ ] **Step 3: Run test — should pass**

```bash
npx jest lib/oracle/__tests__/season.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 4: Create Countdown component**

Create `components/oracle/Countdown.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'

interface CountdownProps {
  lockDate: string  // ISO string
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(lockDate: string): TimeLeft | null {
  const diff = new Date(lockDate).getTime() - Date.now()
  if (diff <= 0) return null
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  }
}

export function Countdown({ lockDate }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => getTimeLeft(lockDate))

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft(lockDate)), 1_000)
    return () => clearInterval(interval)
  }, [lockDate])

  if (!timeLeft) {
    return (
      <p className="text-pmp-gray-500 text-sm font-medium tracking-wide">
        Rankings are locked
      </p>
    )
  }

  const parts = [
    { label: 'days',    value: timeLeft.days },
    { label: 'hours',   value: timeLeft.hours },
    { label: 'min',     value: timeLeft.minutes },
    { label: 'sec',     value: timeLeft.seconds },
  ]

  return (
    <div className="flex items-end gap-3">
      {parts.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center">
          <span className="text-pmp-white text-2xl font-bold font-mono tabular-nums w-10 text-center">
            {String(value).padStart(2, '0')}
          </span>
          <span className="text-pmp-gray-600 text-[10px] uppercase tracking-widest">{label}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create /challenge page**

Create `app/challenge/page.tsx`:

```tsx
import Link from 'next/link'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { Countdown } from '@/components/oracle/Countdown'

export default async function ChallengePage() {
  const season = await getCurrentSeason()

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-md flex flex-col items-center gap-8">

        <div className="flex flex-col gap-3">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em]">
            Pretty Much Picks
          </p>
          <h1 className="text-pmp-white text-4xl font-bold leading-tight">
            The Oracle Challenge
          </h1>
          <p className="text-pmp-gray-500 text-base">
            Lock in your PPR rankings before Week 1.<br />
            Come back in January to see who actually knows football.
          </p>
        </div>

        {season && !isLocked(season) ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-pmp-gray-600 text-xs uppercase tracking-widest">
              Rankings lock in
            </p>
            <Countdown lockDate={season.lock_at} />
          </div>
        ) : (
          <p className="text-pmp-gray-600 text-sm">
            {season?.status === 'scored' ? 'Season complete — results available' : 'Rankings are locked for the 2026 season'}
          </p>
        )}

        <div className="flex flex-col gap-3 w-full">
          <Link
            href="/challenge/rankings"
            className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            {season && isLocked(season) ? 'View My Rankings' : 'Lock In My Rankings'}
          </Link>
          <Link
            href="/challenge/predictions"
            className="w-full bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white font-medium py-3 rounded-xl text-sm hover:border-pmp-gray-600 transition-colors"
          >
            Season Predictions
          </Link>
        </div>

        <p className="text-pmp-gray-600 text-xs">
          2026 · PPR scoring · Top 10 QB / Top 20 RB / Top 20 WR / Top 10 TE
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `/challenge` appears as a static route in build output.

- [ ] **Step 7: Commit**

```bash
git add components/oracle/Countdown.tsx app/challenge/page.tsx lib/oracle/season.ts lib/oracle/__tests__/season.test.ts
git commit -m "feat: oracle challenge landing page with live countdown to Sept 9 lock date"
```

---

## Phase 2 — Rankings

### Task 5: DB tables for rankings + player data layer

**Files:**
- Create: `supabase/migrations/20260731_oracle_challenge_rankings.sql`
- Create: `lib/oracle/players.ts`

**Interfaces:**
- Produces: tables `challenge_rankings`
- Produces:
  - `getPlayerPool(position: OraclePosition): Promise<Player[]>` — returns ADP-sorted Sleeper players for a position (reuses existing `SleeperProvider`)
  - `Player` type reused from `lib/data/types.ts`

**Consumes:** `lib/data/sleeper.ts` `SleeperProvider`, `lib/oracle/constants.ts`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260731_oracle_challenge_rankings.sql`:

```sql
create table if not exists public.challenge_rankings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  season_id    uuid not null references public.seasons(id),
  position     text not null check (position in ('QB','RB','WR','TE')),
  player_rank  int not null check (player_rank >= 1),
  player_id    text not null,
  player_name  text not null,
  confidence   text not null default 'medium'
                 check (confidence in ('low','medium','high')),
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, season_id, position, player_rank)
);

alter table public.challenge_rankings enable row level security;

create policy "Users can read all rankings after lock"
  on public.challenge_rankings for select using (true);

create policy "Users can manage their own rankings"
  on public.challenge_rankings for all using (auth.uid() = user_id);

-- Draft rankings: allow unauthenticated users to save via API (server-side writes use service role)
```

Apply via Supabase MCP `apply_migration`.

- [ ] **Step 2: Write failing test**

Create `lib/oracle/__tests__/players.test.ts`:

```ts
import { positionFilter } from '../players'

describe('positionFilter', () => {
  it('matches QB players', () => {
    const p = { position: 'QB', fantasyPositions: ['QB'] }
    expect(positionFilter('QB')(p as any)).toBe(true)
  })
  it('excludes WR from QB filter', () => {
    const p = { position: 'WR', fantasyPositions: ['WR', 'FLEX'] }
    expect(positionFilter('QB')(p as any)).toBe(false)
  })
  it('includes FLEX-eligible RBs', () => {
    const p = { position: 'RB', fantasyPositions: ['RB', 'FLEX'] }
    expect(positionFilter('RB')(p as any)).toBe(true)
  })
})
```

Run: `npx jest lib/oracle/__tests__/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create players helper**

Create `lib/oracle/players.ts`:

```ts
import { SleeperProvider } from '@/lib/data/sleeper'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from './constants'

/** Filter predicate: does this player belong to the given oracle position? */
export function positionFilter(position: OraclePosition): (p: Player) => boolean {
  return (p: Player) => p.position === position
}

/** Fetch ADP-sorted player pool for a position from Sleeper.
 *  Returns top 60 for RB/WR, top 30 for QB/TE — plenty of choices. */
export async function getPlayerPool(position: OraclePosition): Promise<Player[]> {
  const provider = new SleeperProvider()
  const all = await provider.getDraftPlayers('ppr')
  return all.filter(positionFilter(position))
}
```

- [ ] **Step 4: Run test — should pass**

```bash
npx jest lib/oracle/__tests__/players.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731_oracle_challenge_rankings.sql lib/oracle/players.ts lib/oracle/__tests__/players.test.ts
git commit -m "feat: challenge_rankings table + player pool helper for oracle ranking UI"
```

---

### Task 6: Rankings API routes (save draft + lock)

**Files:**
- Create: `app/api/oracle/rankings/route.ts`
- Create: `lib/oracle/rankings.ts`

**Interfaces:**
- Produces:
  - `GET /api/oracle/rankings?position=WR` — returns current user's saved rankings for a position (or empty array if not signed in / none saved). Reads from `challenge_rankings`.
  - `PUT /api/oracle/rankings` — upserts a full position's rankings. Body: `{ seasonId, position, rankings: [{ playerRank, playerId, playerName, confidence }] }`. Rejects if season is locked. No auth required (anonymous draft save stores in `localStorage`; this endpoint is only called post-sign-in). Returns `{ ok: true }`.
  - `rankingsKey(userId, seasonId, position)` — DB composite key helper
  - `getRankings(userId, seasonId, position): Promise<RankingRow[]>`
  - `upsertRankings(userId, seasonId, position, rows): Promise<void>`

- [ ] **Step 1: Write failing tests**

Create `lib/oracle/__tests__/rankings.test.ts`:

```ts
import { validateRankings } from '../rankings'
import { POSITION_LIST_SIZE } from '../constants'

describe('validateRankings', () => {
  const makeRow = (rank: number) => ({
    playerRank: rank, playerId: `p${rank}`, playerName: `Player ${rank}`, confidence: 'medium' as const,
  })

  it('rejects if too many entries', () => {
    const rows = Array.from({ length: POSITION_LIST_SIZE.QB + 1 }, (_, i) => makeRow(i + 1))
    expect(validateRankings('QB', rows).ok).toBe(false)
  })
  it('rejects duplicate ranks', () => {
    const rows = [makeRow(1), makeRow(1)]
    expect(validateRankings('QB', rows).ok).toBe(false)
  })
  it('accepts a valid QB list', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow(i + 1))
    expect(validateRankings('QB', rows).ok).toBe(true)
  })
  it('allows partial list (save draft)', () => {
    const rows = [makeRow(1), makeRow(2)]
    expect(validateRankings('QB', rows).ok).toBe(true)
  })
})
```

Run: `npx jest lib/oracle/__tests__/rankings.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create rankings library**

Create `lib/oracle/rankings.ts`:

```ts
import { getServiceClient } from '@/lib/league/db'
import type { OraclePosition } from './constants'
import { POSITION_LIST_SIZE } from './constants'

export interface RankingRow {
  playerRank: number
  playerId: string
  playerName: string
  confidence: 'low' | 'medium' | 'high'
}

export type ValidateResult = { ok: true } | { ok: false; error: string }

export function validateRankings(position: OraclePosition, rows: RankingRow[]): ValidateResult {
  const max = POSITION_LIST_SIZE[position]
  if (rows.length > max) return { ok: false, error: `Max ${max} players for ${position}` }
  const ranks = rows.map(r => r.playerRank)
  if (new Set(ranks).size !== ranks.length) return { ok: false, error: 'Duplicate ranks' }
  return { ok: true }
}

export async function getRankings(
  userId: string,
  seasonId: string,
  position: OraclePosition,
): Promise<RankingRow[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('challenge_rankings')
    .select('player_rank, player_id, player_name, confidence')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .eq('position', position)
    .order('player_rank')
  return (data ?? []).map(r => ({
    playerRank: r.player_rank as number,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    confidence: r.confidence as RankingRow['confidence'],
  }))
}

export async function upsertRankings(
  userId: string,
  seasonId: string,
  position: OraclePosition,
  rows: RankingRow[],
): Promise<void> {
  const db = getServiceClient()
  // Delete existing rows for this position then re-insert (clean replace)
  await db
    .from('challenge_rankings')
    .delete()
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .eq('position', position)

  if (rows.length === 0) return

  await db.from('challenge_rankings').insert(
    rows.map(r => ({
      user_id: userId,
      season_id: seasonId,
      position,
      player_rank: r.playerRank,
      player_id: r.playerId,
      player_name: r.playerName,
      confidence: r.confidence,
      updated_at: new Date().toISOString(),
    }))
  )
}
```

- [ ] **Step 3: Run tests — should pass**

```bash
npx jest lib/oracle/__tests__/rankings.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4: Create rankings API route**

Create `app/api/oracle/rankings/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getRankings, upsertRankings, validateRankings } from '@/lib/oracle/rankings'
import type { OraclePosition } from '@/lib/oracle/constants'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ rankings: [] })

  const position = request.nextUrl.searchParams.get('position') as OraclePosition | null
  if (!position || !ORACLE_POSITIONS.includes(position)) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
  }

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ rankings: [] })

  const rankings = await getRankings(session.user.id, season.id, position)
  return NextResponse.json({ rankings })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to save rankings' }, { status: 401 })

  const body = await request.json() as {
    position: OraclePosition
    rankings: RankingRow[]
  }

  if (!ORACLE_POSITIONS.includes(body.position)) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
  }

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })
  if (isLocked(season)) return NextResponse.json({ error: 'Rankings are locked' }, { status: 409 })

  const validation = validateRankings(body.position, body.rankings)
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

  await upsertRankings(session.user.id, season.id, body.position, body.rankings)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: `/api/oracle/rankings` appears as dynamic route.

- [ ] **Step 6: Commit**

```bash
git add lib/oracle/rankings.ts lib/oracle/__tests__/rankings.test.ts app/api/oracle/rankings/route.ts
git commit -m "feat: oracle rankings API — GET/PUT with validation, lock enforcement"
```

---

### Task 7: Drag-and-drop ranking UI

**Files:**
- Create: `components/oracle/RankingList.tsx`
- Create: `components/oracle/RankingRow.tsx`
- Create: `components/oracle/ConfidenceDot.tsx`
- Create: `app/challenge/rankings/page.tsx`
- Create: `app/challenge/rankings/client.tsx`

**Interfaces:**
- Consumes: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`; `getPlayerPool(position)`; `/api/oracle/rankings` GET/PUT
- Produces:
  - `<RankingList position={OraclePosition} initialRows={RankingRow[]} players={Player[]} locked={boolean} seasonId={string} />` — full drag-and-drop list for one position
  - `<ConfidenceDot confidence="low"|"medium"|"high" onClick={fn} />` — colored dot toggling confidence
  - `/challenge/rankings` — server component that detects auth + fetches initial data for all 4 positions, passes to client shell

**UX rules:**
- Users drag players from a searchable pool on the left into the ranked list (1–N slots) on the right
- Each row shows: rank number, player name, position tag, confidence dot (toggle L/M/H on tap)
- Pool shows already-ranked players as greyed out (still draggable back out)
- "Save rankings" button calls PUT `/api/oracle/rankings` per position
- If not signed in: Save triggers Google sign-in, then redirects back with rankings in `localStorage` → auto-saves on return
- If locked: all inputs disabled, list is read-only

- [ ] **Step 1: Create ConfidenceDot**

Create `components/oracle/ConfidenceDot.tsx`:

```tsx
'use client'
const COLORS: Record<string, string> = {
  low:    'bg-pmp-gray-600',
  medium: 'bg-[#f97316]',   // orange
  high:   'bg-pmp-red',
}
const LABELS: Record<string, string> = { low: 'L', medium: 'M', high: 'H' }
const CYCLE: Record<string, string>  = { low: 'medium', medium: 'high', high: 'low' }

interface ConfidenceDotProps {
  confidence: 'low' | 'medium' | 'high'
  onChange: (next: 'low' | 'medium' | 'high') => void
  disabled?: boolean
}

export function ConfidenceDot({ confidence, onChange, disabled }: ConfidenceDotProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(CYCLE[confidence] as 'low' | 'medium' | 'high')}
      title={`Confidence: ${confidence} — tap to change`}
      className={`w-5 h-5 rounded-full text-[9px] font-bold text-pmp-white flex items-center justify-center shrink-0 transition-opacity ${COLORS[confidence]} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {LABELS[confidence]}
    </button>
  )
}
```

- [ ] **Step 2: Create RankingRow**

Create `components/oracle/RankingRow.tsx`:

```tsx
'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ConfidenceDot } from './ConfidenceDot'
import type { RankingRow as RankingRowData } from '@/lib/oracle/rankings'

interface RankingRowProps {
  row: RankingRowData
  rank: number
  locked: boolean
  onConfidenceChange: (confidence: RankingRowData['confidence']) => void
  onRemove: () => void
}

export function RankingRowItem({ row, rank, locked, onConfidenceChange, onRemove }: RankingRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.playerId })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 bg-pmp-gray-900 rounded-lg px-3 py-2 select-none"
    >
      {/* Drag handle */}
      {!locked && (
        <button
          {...attributes}
          {...listeners}
          className="text-pmp-gray-800 hover:text-pmp-gray-600 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </button>
      )}

      <span className="text-pmp-gray-600 text-xs font-bold w-5 text-right shrink-0">
        {rank}
      </span>
      <span className="text-pmp-white text-sm font-medium flex-1 truncate">{row.playerName}</span>

      <ConfidenceDot confidence={row.confidence} onChange={onConfidenceChange} disabled={locked} />

      {!locked && (
        <button onClick={onRemove} className="text-pmp-gray-800 hover:text-pmp-red transition-colors ml-1" aria-label="Remove">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create RankingList**

Create `components/oracle/RankingList.tsx`:

```tsx
'use client'
import { useState, useCallback } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { RankingRowItem } from './RankingRow'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from '@/lib/oracle/constants'
import { POSITION_LIST_SIZE } from '@/lib/oracle/constants'

interface RankingListProps {
  position: OraclePosition
  initialRows: RankingRow[]
  players: Player[]
  locked: boolean
  onSave: (position: OraclePosition, rows: RankingRow[]) => Promise<void>
}

export function RankingList({ position, initialRows, players, locked, onSave }: RankingListProps) {
  const [rows, setRows] = useState<RankingRow[]>(initialRows)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const maxSize = POSITION_LIST_SIZE[position]
  const rankedIds = new Set(rows.map(r => r.playerId))

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setRows(prev => {
        const oldIndex = prev.findIndex(r => r.playerId === active.id)
        const newIndex = prev.findIndex(r => r.playerId === over.id)
        return arrayMove(prev, oldIndex, newIndex).map((r, i) => ({ ...r, playerRank: i + 1 }))
      })
    }
  }, [])

  const addPlayer = (player: Player) => {
    if (rows.length >= maxSize || rankedIds.has(player.id)) return
    setRows(prev => [...prev, {
      playerRank: prev.length + 1,
      playerId: player.id,
      playerName: player.name,
      confidence: 'medium',
    }])
  }

  const removePlayer = (playerId: string) => {
    setRows(prev => prev.filter(r => r.playerId !== playerId).map((r, i) => ({ ...r, playerRank: i + 1 })))
  }

  const updateConfidence = (playerId: string, confidence: RankingRow['confidence']) => {
    setRows(prev => prev.map(r => r.playerId === playerId ? { ...r, confidence } : r))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(position, rows)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const filtered = players.filter(p =>
    !rankedIds.has(p.id) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-pmp-white font-bold text-base">
          {position} Rankings
          <span className="text-pmp-gray-600 text-xs font-normal ml-2">PPR · Top {maxSize}</span>
        </h2>
        <span className="text-pmp-gray-600 text-xs">{rows.length} / {maxSize}</span>
      </div>

      {/* Ranked list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows.map(r => r.playerId)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {rows.map((row, i) => (
              <RankingRowItem
                key={row.playerId}
                row={row}
                rank={i + 1}
                locked={locked}
                onConfidenceChange={c => updateConfidence(row.playerId, c)}
                onRemove={() => removePlayer(row.playerId)}
              />
            ))}
            {rows.length < maxSize && !locked && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 border border-dashed border-pmp-gray-800 text-pmp-gray-800 text-sm">
                {rows.length + 1}. Add a player below
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Player pool search */}
      {!locked && rows.length < maxSize && (
        <div className="flex flex-col gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${position} players...`}
            className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm placeholder-pmp-gray-600"
          />
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {filtered.map(player => (
              <button
                key={player.id}
                onClick={() => addPlayer(player)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-pmp-gray-900 transition-colors"
              >
                <span className="text-pmp-white text-sm">{player.name}</span>
                <span className="text-pmp-gray-600 text-xs ml-auto">{player.team}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Save button */}
      {!locked && (
        <button
          onClick={handleSave}
          disabled={saving || rows.length === 0}
          className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : `Save ${position} Rankings`}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create /challenge/rankings client shell**

Create `app/challenge/rankings/client.tsx`:

```tsx
'use client'
import { useState, useCallback } from 'react'
import { getBrowserClient } from '@/lib/auth/client'
import { RankingList } from '@/components/oracle/RankingList'
import { SignInButton } from '@/components/oracle/SignInButton'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from '@/lib/oracle/constants'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'

interface RankingsClientProps {
  initialRankings: Partial<Record<OraclePosition, RankingRow[]>>
  players: Record<OraclePosition, Player[]>
  locked: boolean
  isSignedIn: boolean
}

export function RankingsClient({ initialRankings, players, locked, isSignedIn }: RankingsClientProps) {
  const [activePosition, setActivePosition] = useState<OraclePosition>('QB')

  const handleSave = useCallback(async (position: OraclePosition, rows: RankingRow[]) => {
    if (!isSignedIn) {
      // Store in localStorage, trigger sign-in
      localStorage.setItem(`oracle_draft_${position}`, JSON.stringify(rows))
      const supabase = getBrowserClient()
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/challenge/rankings` },
      })
      return
    }
    await fetch('/api/oracle/rankings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position, rankings: rows }),
    })
  }, [isSignedIn])

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-[#1e1e1e] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-pmp-white font-bold text-lg">My Rankings</h1>
          <p className="text-pmp-gray-600 text-xs mt-0.5">PPR · 2026 Oracle Challenge</p>
        </div>
        {!isSignedIn && (
          <SignInButton label="Sign in to save" redirectTo="/challenge/rankings" className="text-xs py-2 px-3" />
        )}
      </div>

      {/* Position tabs */}
      <div className="flex border-b border-[#1e1e1e] shrink-0">
        {ORACLE_POSITIONS.map(pos => (
          <button
            key={pos}
            onClick={() => setActivePosition(pos)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              activePosition === pos
                ? 'text-pmp-white border-b-2 border-pmp-red'
                : 'text-pmp-gray-600 hover:text-pmp-gray-500'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Active list */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <RankingList
          key={activePosition}
          position={activePosition}
          initialRows={initialRankings[activePosition] ?? []}
          players={players[activePosition] ?? []}
          locked={locked}
          onSave={handleSave}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create /challenge/rankings server page**

Create `app/challenge/rankings/page.tsx`:

```tsx
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getRankings } from '@/lib/oracle/rankings'
import { getPlayerPool } from '@/lib/oracle/players'
import { RankingsClient } from './client'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'

export default async function RankingsPage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  const locked = season ? isLocked(season) : true

  // Fetch all 4 player pools in parallel
  const poolsArr = await Promise.all(ORACLE_POSITIONS.map(pos => getPlayerPool(pos)))
  const players = Object.fromEntries(
    ORACLE_POSITIONS.map((pos, i) => [pos, poolsArr[i]])
  ) as Record<OraclePosition, Player[]>

  // Fetch saved rankings for signed-in users
  let initialRankings: Partial<Record<OraclePosition, RankingRow[]>> = {}
  if (session && season) {
    const savedArr = await Promise.all(
      ORACLE_POSITIONS.map(pos => getRankings(session.user.id, season.id, pos))
    )
    initialRankings = Object.fromEntries(
      ORACLE_POSITIONS.map((pos, i) => [pos, savedArr[i]])
    ) as Record<OraclePosition, RankingRow[]>
  }

  return (
    <RankingsClient
      initialRankings={initialRankings}
      players={players}
      locked={locked}
      isSignedIn={!!session}
    />
  )
}
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

Expected: `/challenge/rankings` appears in build output. No TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add components/oracle/ConfidenceDot.tsx components/oracle/RankingRow.tsx components/oracle/RankingList.tsx app/challenge/rankings/client.tsx app/challenge/rankings/page.tsx
git commit -m "feat: drag-and-drop PPR ranking UI with confidence dots, save draft, anonymous → sign-in flow"
```

---

## Phase 3 — Predictions

### Task 8: Predictions tables + admin management

**Files:**
- Create: `supabase/migrations/20260731_oracle_challenge_predictions.sql`
- Create: `lib/oracle/predictions.ts`
- Create: `app/api/oracle/predictions/route.ts`
- Create: `app/api/admin/predictions/route.ts`

**Interfaces:**
- Produces: tables `predictions`, `user_predictions`
- Produces:
  - `GET /api/oracle/predictions` — list all predictions for current season with user's choices if signed in
  - `PUT /api/oracle/predictions` — submit/update user's picks. Body: `[{ predictionId, chosenOption, confidence }]`. Locked after season lock_at.
  - `POST /api/admin/predictions` — create a prediction question (admin only). Body: `{ question, options, basePoints, difficulty }`.
  - `getPredictions(seasonId): Promise<Prediction[]>`
  - `getUserPredictions(userId, seasonId): Promise<UserPrediction[]>`
  - `upsertUserPredictions(userId, picks): Promise<void>`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260731_oracle_challenge_predictions.sql`:

```sql
create table if not exists public.predictions (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references public.seasons(id),
  question       text not null,
  options        jsonb not null,       -- string[]
  correct_option text,                 -- set by admin after season
  base_points    int not null default 50,
  difficulty     text not null default 'medium'
                   check (difficulty in ('easy','medium','hard','longshot')),
  status         text not null default 'open'
                   check (status in ('open','locked','scored')),
  created_at     timestamptz not null default now()
);

alter table public.predictions enable row level security;
create policy "Anyone can read predictions" on public.predictions for select using (true);
create policy "Admins can manage predictions" on public.predictions for all using (
  exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
);

create table if not exists public.user_predictions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  prediction_id  uuid not null references public.predictions(id),
  chosen_option  text not null,
  confidence     text not null default 'medium'
                   check (confidence in ('low','medium','high')),
  submitted_at   timestamptz not null default now(),
  unique (user_id, prediction_id)
);

alter table public.user_predictions enable row level security;
create policy "Users can read their own predictions" on public.user_predictions
  for select using (auth.uid() = user_id);
create policy "Users can manage their own predictions" on public.user_predictions
  for all using (auth.uid() = user_id);
```

Apply via Supabase MCP `apply_migration`.

- [ ] **Step 2: Write failing test**

Create `lib/oracle/__tests__/predictions.test.ts`:

```ts
import { validatePrediction } from '../predictions'

describe('validatePrediction', () => {
  const options = ['Josh Allen', 'Lamar Jackson', 'Jalen Hurts']
  it('accepts a valid option', () => {
    expect(validatePrediction('Josh Allen', options).ok).toBe(true)
  })
  it('rejects an option not in the list', () => {
    expect(validatePrediction('Patrick Mahomes', options).ok).toBe(false)
  })
})
```

Run: `npx jest lib/oracle/__tests__/predictions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create predictions library**

Create `lib/oracle/predictions.ts`:

```ts
import { getServiceClient } from '@/lib/league/db'

export interface Prediction {
  id: string
  seasonId: string
  question: string
  options: string[]
  correctOption: string | null
  basePoints: number
  difficulty: 'easy' | 'medium' | 'hard' | 'longshot'
  status: 'open' | 'locked' | 'scored'
}

export interface UserPrediction {
  predictionId: string
  chosenOption: string
  confidence: 'low' | 'medium' | 'high'
}

export type ValidateResult = { ok: true } | { ok: false; error: string }

export function validatePrediction(chosenOption: string, options: string[]): ValidateResult {
  if (!options.includes(chosenOption)) return { ok: false, error: 'Invalid option' }
  return { ok: true }
}

export async function getPredictions(seasonId: string): Promise<Prediction[]> {
  const db = getServiceClient()
  const { data } = await db.from('predictions').select('*').eq('season_id', seasonId).order('created_at')
  return (data ?? []).map(r => ({
    id: r.id as string,
    seasonId: r.season_id as string,
    question: r.question as string,
    options: r.options as string[],
    correctOption: r.correct_option as string | null,
    basePoints: r.base_points as number,
    difficulty: r.difficulty as Prediction['difficulty'],
    status: r.status as Prediction['status'],
  }))
}

export async function getUserPredictions(userId: string, seasonId: string): Promise<UserPrediction[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('user_predictions')
    .select('prediction_id, chosen_option, confidence')
    .eq('user_id', userId)
    .in('prediction_id',
      (await db.from('predictions').select('id').eq('season_id', seasonId)).data?.map((r: { id: string }) => r.id) ?? []
    )
  return (data ?? []).map(r => ({
    predictionId: r.prediction_id as string,
    chosenOption: r.chosen_option as string,
    confidence: r.confidence as UserPrediction['confidence'],
  }))
}

export async function upsertUserPredictions(userId: string, picks: UserPrediction[]): Promise<void> {
  const db = getServiceClient()
  for (const pick of picks) {
    await db.from('user_predictions').upsert(
      { user_id: userId, prediction_id: pick.predictionId, chosen_option: pick.chosenOption, confidence: pick.confidence },
      { onConflict: 'user_id,prediction_id' }
    )
  }
}
```

- [ ] **Step 4: Run test — should pass**

```bash
npx jest lib/oracle/__tests__/predictions.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Create prediction API routes**

Create `app/api/oracle/predictions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getPredictions, getUserPredictions, upsertUserPredictions, validatePrediction } from '@/lib/oracle/predictions'
import type { UserPrediction } from '@/lib/oracle/predictions'

export async function GET() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  if (!season) return NextResponse.json({ predictions: [], userPicks: [] })

  const [predictions, userPicks] = await Promise.all([
    getPredictions(season.id),
    session ? getUserPredictions(session.user.id, season.id) : Promise.resolve([]),
  ])
  return NextResponse.json({ predictions, userPicks })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to submit predictions' }, { status: 401 })

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })
  if (isLocked(season)) return NextResponse.json({ error: 'Predictions are locked' }, { status: 409 })

  const picks = await request.json() as UserPrediction[]
  const predictions = await getPredictions(season.id)
  const predictionMap = new Map(predictions.map(p => [p.id, p]))

  for (const pick of picks) {
    const pred = predictionMap.get(pick.predictionId)
    if (!pred) return NextResponse.json({ error: `Unknown prediction: ${pick.predictionId}` }, { status: 400 })
    const v = validatePrediction(pick.chosenOption, pred.options)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  }

  await upsertUserPredictions(session.user.id, picks)
  return NextResponse.json({ ok: true })
}
```

Create `app/api/admin/predictions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })

  const body = await request.json() as {
    question: string
    options: string[]
    basePoints: number
    difficulty: 'easy' | 'medium' | 'hard' | 'longshot'
  }

  const db = getServiceClient()
  const { data, error } = await db.from('predictions').insert({
    season_id: season.id,
    question: body.question.trim(),
    options: body.options,
    base_points: body.basePoints,
    difficulty: body.difficulty,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prediction: data }, { status: 201 })
}
```

- [ ] **Step 6: Create /challenge/predictions page**

Create `app/challenge/predictions/page.tsx`:

```tsx
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getPredictions, getUserPredictions } from '@/lib/oracle/predictions'
import { PredictionsClient } from './client'

export default async function PredictionsPage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  const locked = season ? isLocked(season) : true

  const [predictions, userPicks] = await Promise.all([
    season ? getPredictions(season.id) : Promise.resolve([]),
    session && season ? getUserPredictions(session.user.id, season.id) : Promise.resolve([]),
  ])

  return (
    <PredictionsClient
      predictions={predictions}
      initialPicks={userPicks}
      locked={locked}
      isSignedIn={!!session}
    />
  )
}
```

Create `app/challenge/predictions/client.tsx` — a simple list of prediction cards, each with radio buttons for the options and a `<ConfidenceDot>`. "Submit predictions" button calls `PUT /api/oracle/predictions` (triggers sign-in if not authenticated). Full implementation: one card per prediction showing question, options as a button group, confidence dot, and a submit-all button at the bottom. Follow the same anonymous → sign-in pattern used in the rankings client.

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260731_oracle_challenge_predictions.sql lib/oracle/predictions.ts lib/oracle/__tests__/predictions.test.ts app/api/oracle/predictions/route.ts app/api/admin/predictions/route.ts app/challenge/predictions/page.tsx app/challenge/predictions/client.tsx
git commit -m "feat: predictions tables, API routes, predictions page with confidence + admin management"
```

---

## Phase 4 — Results

### Task 9: Scoring engine + admin import

**Files:**
- Create: `supabase/migrations/20260731_oracle_challenge_scoring.sql`
- Create: `lib/oracle/scoring.ts`
- Create: `app/api/admin/seasons/[year]/import/route.ts`
- Create: `app/api/admin/seasons/[year]/score/route.ts`

**Interfaces:**
- Produces: tables `ground_truth`, `accuracy_scores`, `ranking_score_detail`
- Produces:
  - `scoreRankings(userRank, actualRank): number` — stepped scoring function (50/45/40.../0)
  - `applyConfidence(rawScore, confidence, distance): number` — confidence multiplier
  - `scorePosition(userId, seasonId, position, groundTruth): Promise<PositionScore>` — computes per-player detail + normalized 0-100 score
  - `scoreUser(userId, seasonId): Promise<OverallScore>` — runs all 4 positions + predictions, writes to `accuracy_scores` and `ranking_score_detail`
  - `POST /api/admin/seasons/[year]/import` — accepts CSV rows, writes to `ground_truth`
  - `POST /api/admin/seasons/[year]/score` — runs `scoreUser` for all users with submitted rankings, computes global ranks, updates `accuracy_scores.global_rank`

- [ ] **Step 1: Write failing tests for scoring engine**

Create `lib/oracle/__tests__/scoring.test.ts`:

```ts
import { scoreRankings, applyConfidence } from '../scoring'

describe('scoreRankings', () => {
  it('returns 50 for exact match', () => expect(scoreRankings(1, 1)).toBe(50))
  it('returns 45 for off by 1',    () => expect(scoreRankings(1, 2)).toBe(45))
  it('returns 5 for off by 9',     () => expect(scoreRankings(1, 10)).toBe(5))
  it('returns 0 for off by 10',    () => expect(scoreRankings(1, 11)).toBe(0))
  it('returns 0 for not in tier',  () => expect(scoreRankings(1, null as any)).toBe(0))
})

describe('applyConfidence', () => {
  it('high confidence + high score = 1.5x', () => {
    expect(applyConfidence(50, 'high', 0)).toBe(75)
  })
  it('high confidence + miss = 0.5x', () => {
    expect(applyConfidence(0, 'high', 11)).toBe(0) // 0 * 0.5 = 0 (already 0)
  })
  it('medium confidence + high score = 1.2x', () => {
    expect(applyConfidence(50, 'medium', 0)).toBeCloseTo(60)
  })
  it('low confidence = no modifier', () => {
    expect(applyConfidence(40, 'low', 2)).toBe(40)
  })
})
```

Run: `npx jest lib/oracle/__tests__/scoring.test.ts`
Expected: FAIL.

- [ ] **Step 2: Write migration for scoring tables**

Create `supabase/migrations/20260731_oracle_challenge_scoring.sql`:

```sql
create table if not exists public.ground_truth (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons(id),
  position    text not null check (position in ('QB','RB','WR','TE')),
  rank        int not null,
  player_id   text not null,
  player_name text not null,
  ppr_points  numeric,
  source      text not null,
  imported_at timestamptz not null default now(),
  unique (season_id, position, rank)
);

alter table public.ground_truth enable row level security;
create policy "Anyone can read ground truth" on public.ground_truth for select using (true);
create policy "Admins can manage ground truth" on public.ground_truth for all using (
  exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
);

create table if not exists public.accuracy_scores (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  season_id           uuid not null references public.seasons(id),
  score_qb            numeric,
  score_rb            numeric,
  score_wr            numeric,
  score_te            numeric,
  score_predictions   numeric,
  overall_score       numeric,
  global_rank         int,
  is_projected        boolean not null default false,
  computed_at         timestamptz not null default now(),
  unique (user_id, season_id)
);

alter table public.accuracy_scores enable row level security;
create policy "Anyone can read accuracy scores" on public.accuracy_scores for select using (true);

create table if not exists public.ranking_score_detail (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  season_id    uuid not null references public.seasons(id),
  position     text not null,
  player_id    text not null,
  player_name  text not null,
  user_rank    int not null,
  actual_rank  int,
  distance     int,
  raw_score    int not null default 0,
  confidence   text not null default 'medium',
  final_score  numeric not null default 0,
  unique (user_id, season_id, position, player_id)
);

alter table public.ranking_score_detail enable row level security;
create policy "Users can read their own detail" on public.ranking_score_detail
  for select using (auth.uid() = user_id);
create policy "Admins can read all detail" on public.ranking_score_detail
  for select using (
    exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
  );
```

Apply via Supabase MCP `apply_migration`.

- [ ] **Step 3: Create scoring engine**

Create `lib/oracle/scoring.ts`:

```ts
import { getServiceClient } from '@/lib/league/db'
import type { OraclePosition } from './constants'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from './constants'
import { getRankings } from './rankings'
import { getUserPredictions, getPredictions } from './predictions'

/** Points for a given distance from the correct rank. */
export function scoreRankings(userRank: number, actualRank: number | null): number {
  if (actualRank == null) return 0
  const distance = Math.abs(userRank - actualRank)
  if (distance >= 10) return 0
  return 50 - distance * 5
}

/** Apply confidence multiplier.
 *  High: ×1.5 if rawScore ≥ 30; ×0.5 if rawScore = 0
 *  Medium: ×1.2 if rawScore ≥ 30; ×0.8 if rawScore = 0
 *  Low: no modifier
 */
export function applyConfidence(
  rawScore: number,
  confidence: 'low' | 'medium' | 'high',
  distance: number,
): number {
  if (confidence === 'low') return rawScore
  const isStrong = rawScore >= 30
  const multipliers = {
    medium: isStrong ? 1.2 : 0.8,
    high:   isStrong ? 1.5 : 0.5,
  }
  return Math.round(rawScore * multipliers[confidence])
}

/** Fetch ground truth for a position and return a map of playerId → rank. */
async function getGroundTruth(seasonId: string, position: OraclePosition): Promise<Map<string, number>> {
  const db = getServiceClient()
  const { data } = await db
    .from('ground_truth')
    .select('player_id, rank')
    .eq('season_id', seasonId)
    .eq('position', position)
  const map = new Map<string, number>()
  ;(data ?? []).forEach((r: { player_id: string; rank: number }) => map.set(r.player_id, r.rank))
  return map
}

interface PositionScore {
  normalized: number   // 0–100
  detail: Array<{
    playerId: string
    playerName: string
    userRank: number
    actualRank: number | null
    distance: number | null
    rawScore: number
    confidence: string
    finalScore: number
  }>
}

export async function scorePosition(
  userId: string,
  seasonId: string,
  position: OraclePosition,
): Promise<PositionScore> {
  const [rows, truthMap] = await Promise.all([
    getRankings(userId, seasonId, position),
    getGroundTruth(seasonId, position),
  ])

  const maxPossible = POSITION_LIST_SIZE[position] * 50
  let totalRaw = 0

  const detail = rows.map(row => {
    const actualRank = truthMap.get(row.playerId) ?? null
    const distance = actualRank != null ? Math.abs(row.playerRank - actualRank) : null
    const rawScore = scoreRankings(row.playerRank, actualRank)
    const finalScore = applyConfidence(rawScore, row.confidence, distance ?? 99)
    totalRaw += finalScore
    return {
      playerId: row.playerId,
      playerName: row.playerName,
      userRank: row.playerRank,
      actualRank,
      distance,
      rawScore,
      confidence: row.confidence,
      finalScore,
    }
  })

  const normalized = maxPossible > 0 ? Math.round((totalRaw / maxPossible) * 1000) / 10 : 0
  return { normalized, detail }
}

export async function scoreUser(userId: string, seasonId: string): Promise<void> {
  const db = getServiceClient()

  // Score all 4 positions
  const positionResults = await Promise.all(
    ORACLE_POSITIONS.map(pos => scorePosition(userId, seasonId, pos))
  )

  // Score predictions
  const [predictions, userPicks] = await Promise.all([
    getPredictions(seasonId),
    getUserPredictions(userId, seasonId),
  ])
  const pickMap = new Map(userPicks.map(p => [p.predictionId, p]))
  let predictionScore = 0
  for (const pred of predictions) {
    if (pred.status !== 'scored' || !pred.correctOption) continue
    const pick = pickMap.get(pred.id)
    if (!pick) continue
    const isCorrect = pick.chosenOption === pred.correctOption
    if (!isCorrect) {
      if (pick.confidence === 'high') predictionScore -= pred.basePoints * 0.5
      continue
    }
    const multiplier = pick.confidence === 'high' ? 1.5 : pick.confidence === 'medium' ? 1.2 : 1
    predictionScore += pred.basePoints * multiplier
  }

  const [qb, rb, wr, te] = positionResults.map(r => r.normalized)
  const overall = Math.round(((qb + rb + wr + te) / 4) * 10) / 10

  // Upsert accuracy_scores
  await db.from('accuracy_scores').upsert({
    user_id: userId,
    season_id: seasonId,
    score_qb: qb,
    score_rb: rb,
    score_wr: wr,
    score_te: te,
    score_predictions: predictionScore,
    overall_score: overall,
    is_projected: false,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,season_id' })

  // Upsert ranking_score_detail rows
  for (let i = 0; i < ORACLE_POSITIONS.length; i++) {
    const position = ORACLE_POSITIONS[i]
    const { detail } = positionResults[i]
    for (const d of detail) {
      await db.from('ranking_score_detail').upsert({
        user_id: userId,
        season_id: seasonId,
        position,
        player_id: d.playerId,
        player_name: d.playerName,
        user_rank: d.userRank,
        actual_rank: d.actualRank,
        distance: d.distance,
        raw_score: d.rawScore,
        confidence: d.confidence,
        final_score: d.finalScore,
      }, { onConflict: 'user_id,season_id,position,player_id' })
    }
  }
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npx jest lib/oracle/__tests__/scoring.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Create admin import route**

Create `app/api/admin/seasons/[year]/import/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'

interface RouteContext { params: Promise<{ year: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { year } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getServiceClient()
  const { data: season } = await db.from('seasons').select('id').eq('year', Number(year)).single()
  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  const body = await request.json() as {
    position: string
    source: string
    rows: Array<{ rank: number; playerId: string; playerName: string; pprPoints?: number }>
  }

  // Delete existing ground truth for this position then re-insert
  await db.from('ground_truth').delete().eq('season_id', season.id).eq('position', body.position)
  await db.from('ground_truth').insert(
    body.rows.map(r => ({
      season_id: season.id,
      position: body.position,
      rank: r.rank,
      player_id: r.playerId,
      player_name: r.playerName,
      ppr_points: r.pprPoints ?? null,
      source: body.source,
    }))
  )

  return NextResponse.json({ ok: true, imported: body.rows.length })
}
```

- [ ] **Step 6: Create admin score trigger route**

Create `app/api/admin/seasons/[year]/score/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'
import { scoreUser } from '@/lib/oracle/scoring'

interface RouteContext { params: Promise<{ year: string }> }

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { year } = await params
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getServiceClient()
  const { data: season } = await db.from('seasons').select('id').eq('year', Number(year)).single()
  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  // Get all users who submitted at least one ranking
  const { data: submitters } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('season_id', season.id)

  const uniqueUserIds = [...new Set((submitters ?? []).map((r: { user_id: string }) => r.user_id))]

  // Score each user (sequential to avoid DB overload)
  let scored = 0
  for (const userId of uniqueUserIds) {
    await scoreUser(userId, season.id)
    scored++
  }

  // Compute and assign global ranks
  const { data: scores } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score')
    .eq('season_id', season.id)
    .order('overall_score', { ascending: false })

  for (let i = 0; i < (scores ?? []).length; i++) {
    const s = (scores!)[i] as { user_id: string; overall_score: number }
    await db.from('accuracy_scores')
      .update({ global_rank: i + 1 })
      .eq('user_id', s.user_id)
      .eq('season_id', season.id)
  }

  // Mark season as scored
  await db.from('seasons').update({ status: 'scored', scored_at: new Date().toISOString() }).eq('id', season.id)

  return NextResponse.json({ ok: true, scored })
}
```

- [ ] **Step 7: Verify build**

```bash
npm run build
```

Expected: clean build, new admin routes appear.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260731_oracle_challenge_scoring.sql lib/oracle/scoring.ts lib/oracle/__tests__/scoring.test.ts app/api/admin/seasons app/api/admin/predictions/route.ts
git commit -m "feat: scoring engine (stepped pts + confidence), admin import + score trigger routes"
```

---

### Task 10: Results page — per-player right/wrong breakdown

**Files:**
- Create: `app/challenge/results/page.tsx`
- Create: `app/challenge/results/client.tsx`
- Create: `components/oracle/ResultsTable.tsx`
- Create: `components/oracle/ResultsShareCard.tsx`
- Create: `app/api/oracle/results/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/oracle/results` — returns current user's `accuracy_scores` + `ranking_score_detail` rows + `user_predictions` with outcomes. 401 if not signed in, 404 if season not scored yet.
  - `<ResultsTable position rows detail />` — colored table showing rank, player name, actual finish, points, confidence modifier. Green/yellow/orange/red row colors.
  - `<ResultsShareCard score username bestCall biggestMiss />` — branded downloadable card (html2canvas)
  - Summary callouts: "You nailed N of your Top M exactly", "Best call: ...", "Biggest miss: ..."

- [ ] **Step 1: Create results API**

Create `app/api/oracle/results/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to view results' }, { status: 401 })

  const season = await getCurrentSeason()
  if (!season || season.status !== 'scored') {
    return NextResponse.json({ error: 'Results not available yet' }, { status: 404 })
  }

  const db = getServiceClient()
  const [scoresRes, detailRes] = await Promise.all([
    db.from('accuracy_scores').select('*').eq('user_id', session.user.id).eq('season_id', season.id).maybeSingle(),
    db.from('ranking_score_detail').select('*').eq('user_id', session.user.id).eq('season_id', season.id),
  ])

  return NextResponse.json({
    season,
    score: scoresRes.data,
    detail: detailRes.data ?? [],
  })
}
```

- [ ] **Step 2: Create ResultsTable component**

Create `components/oracle/ResultsTable.tsx`:

```tsx
interface DetailRow {
  position: string
  playerName: string
  userRank: number
  actualRank: number | null
  distance: number | null
  finalScore: number
  confidence: string
}

interface ResultsTableProps {
  position: string
  positionScore: number
  rows: DetailRow[]
}

function rowColor(distance: number | null): string {
  if (distance == null) return 'bg-pmp-gray-900 opacity-60'
  if (distance === 0) return 'bg-[#14290a]'          // dark green
  if (distance <= 2) return 'bg-[#1e2a0a]'            // lighter green
  if (distance <= 5) return 'bg-[#2a200a]'            // yellow-brown
  if (distance <= 9) return 'bg-[#2a150a]'            // orange-brown
  return 'bg-[#1a0505]'                                // dark red
}

export function ResultsTable({ position, positionScore, rows }: ResultsTableProps) {
  const exact = rows.filter(r => r.distance === 0).length
  const best = rows.reduce((a, b) => (a.finalScore > b.finalScore ? a : b), rows[0])
  const worst = rows.filter(r => r.distance != null && r.distance >= 5)
    .reduce((a, b) => ((a?.distance ?? 0) > (b?.distance ?? 0) ? a : b), rows[0])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-pmp-white font-bold text-base">{position} Rankings</h2>
        <span className="text-pmp-white font-bold">{positionScore.toFixed(1)} / 100</span>
      </div>

      {/* Callouts */}
      <div className="flex flex-col gap-1 text-xs">
        <p className="text-pmp-gray-500">You nailed <span className="text-pmp-white font-semibold">{exact}</span> exact</p>
        {best && <p className="text-pmp-gray-500">Best call: <span className="text-pmp-white font-semibold">{best.playerName}</span> — you had {position}{best.userRank}, finished {position}{best.actualRank ?? '—'}</p>}
        {worst?.distance != null && worst.distance >= 5 && (
          <p className="text-pmp-gray-500">Biggest miss: <span className="text-pmp-white font-semibold">{worst.playerName}</span> — you had {position}{worst.userRank}, finished {worst.actualRank != null ? `${position}${worst.actualRank}` : 'outside top'}</p>
        )}
      </div>

      {/* Table */}
      <div className="flex flex-col gap-px">
        <div className="grid grid-cols-[2rem_1fr_5rem_3rem_2rem] text-[10px] text-pmp-gray-600 uppercase tracking-widest px-2 py-1">
          <span>#</span><span>Player</span><span className="text-right">Actual</span><span className="text-right">Pts</span><span className="text-right">Conf</span>
        </div>
        {rows.map(row => (
          <div
            key={row.playerName}
            className={`grid grid-cols-[2rem_1fr_5rem_3rem_2rem] px-2 py-2 rounded items-center ${rowColor(row.distance)}`}
          >
            <span className="text-pmp-gray-600 text-xs">{row.userRank}</span>
            <span className="text-pmp-white text-sm truncate">{row.playerName}</span>
            <span className="text-right text-xs text-pmp-gray-500">
              {row.actualRank != null ? `${position}${row.actualRank}` : '—'}
              {row.distance === 0 && <span className="text-[#4ade80] ml-1">exact</span>}
            </span>
            <span className="text-right text-xs font-semibold text-pmp-white">{row.finalScore}</span>
            <span className="text-right text-[10px] text-pmp-gray-600 uppercase">{row.confidence[0].toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ResultsShareCard**

Create `components/oracle/ResultsShareCard.tsx`:

```tsx
'use client'
import { useRef } from 'react'

interface ResultsShareCardProps {
  year: number
  username: string
  overallScore: number
  globalRank: number
  totalUsers: number
  bestCall: string
  biggestMiss: string
}

export function ResultsShareCard({
  year, username, overallScore, globalRank, totalUsers, bestCall, biggestMiss,
}: ResultsShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const handleDownload = async () => {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(cardRef.current!, { backgroundColor: '#0d0d0d', scale: 2 })
    const link = document.createElement('a')
    link.download = `oracle-challenge-${year}-${username}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={cardRef}
        className="bg-pmp-black border border-pmp-gray-800 rounded-2xl p-5 flex flex-col gap-4 w-full max-w-sm"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-pmp-red text-[10px] font-bold uppercase tracking-[0.3em]">Pretty Much Picks</p>
            <p className="text-pmp-white font-bold text-sm">The Oracle Challenge {year}</p>
          </div>
          <p className="text-pmp-gray-600 text-xs">@{username}</p>
        </div>
        <div className="flex items-end gap-3">
          <span className="text-pmp-white text-5xl font-bold">{overallScore.toFixed(1)}</span>
          <div className="pb-1">
            <p className="text-pmp-white text-sm font-semibold">#{globalRank.toLocaleString()}</p>
            <p className="text-pmp-gray-600 text-xs">of {totalUsers.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <p className="text-pmp-gray-600">Best call: <span className="text-pmp-white">{bestCall}</span></p>
          <p className="text-pmp-gray-600">Biggest miss: <span className="text-pmp-white">{biggestMiss}</span></p>
        </div>
        <p className="text-pmp-gray-800 text-[10px]">pretty-much-picks.com/challenge</p>
      </div>
      <button
        onClick={handleDownload}
        className="w-full bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white font-medium py-2.5 rounded-xl text-sm hover:border-pmp-gray-600 transition-colors"
      >
        Download Share Card
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Create results page**

Create `app/challenge/results/page.tsx` — server component that fetches session + redirects to sign-in if not authenticated. Passes data to `ResultsClient`.

Create `app/challenge/results/client.tsx` — renders four `<ResultsTable>` components (one per position, tab-switched on mobile), `<ResultsShareCard>`, and a predictions results section.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add app/api/oracle/results/route.ts components/oracle/ResultsTable.tsx components/oracle/ResultsShareCard.tsx app/challenge/results/
git commit -m "feat: results page with per-player right/wrong breakdown, callouts, and downloadable share card"
```

---

## Phase 5 — Community

### Task 11: Public profiles — `/u/[username]`

**Files:**
- Create: `app/u/[username]/page.tsx`
- Create: `app/u/[username]/client.tsx`

**Interfaces:**
- `GET /u/[username]` — server component. Fetches `user_profiles` by username, fetches `accuracy_scores` for current season. If season not scored, shows "Rankings locked — results in January." If profile not found: 404.
- Shows: avatar, display name, @handle, badges, current season scores (if available), achievements grid, results summary with tab-switch between positions.

- [ ] **Step 1: Create profile page**

Create `app/u/[username]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getServiceClient } from '@/lib/league/db'
import { getSession } from '@/lib/auth/server'
import { ProfileClient } from './client'

interface PageProps { params: Promise<{ username: string }> }

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params
  const db = getServiceClient()

  const { data: profile } = await db
    .from('user_profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle()

  if (!profile) notFound()

  const { data: score } = await db
    .from('accuracy_scores')
    .select('*')
    .eq('user_id', profile.user_id)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: detail } = await db
    .from('ranking_score_detail')
    .select('*')
    .eq('user_id', profile.user_id)

  const session = await getSession()
  const isOwn = session?.user.id === profile.user_id

  return (
    <ProfileClient
      profile={profile}
      score={score}
      detail={detail ?? []}
      isOwn={isOwn}
    />
  )
}
```

The `ProfileClient` component renders:
- Avatar (Google photo or initials fallback), display name, @handle
- Badge row: `is_verified` → "Verified", `is_creator` → "Creator"
- Season scores if available (QB/RB/WR/TE grid + overall), with tab-switch to full breakdown
- "Results not yet available" state if season not scored
- Download share card button (same `ResultsShareCard` component)

- [ ] **Step 2: Commit**

```bash
git add app/u/
git commit -m "feat: public profile page /u/[username] — scores, badges, results breakdown"
```

---

### Task 12: Player pages — `/players/[id]`

**Files:**
- Create: `app/players/[id]/page.tsx`
- Create: `app/api/oracle/players/[id]/route.ts`

**Interfaces:**
- `GET /api/oracle/players/[id]` — aggregates community data from `challenge_rankings` for a given `player_id` and the current season. Returns: `{ playerName, position, communityAvgRank, distribution, confidenceBreakdown, mostCommonRank, userRank (if signed in) }`.
- Player page renders community distribution bar chart, your rank vs community avg vs PMP creator ranking.

- [ ] **Step 1: Create player stats API**

Create `app/api/oracle/players/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })

  const db = getServiceClient()

  const { data: rows } = await db
    .from('challenge_rankings')
    .select('player_rank, player_name, confidence, user_id')
    .eq('season_id', season.id)
    .eq('player_id', id)

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'Player not found in any rankings' }, { status: 404 })
  }

  const playerName = (rows[0] as { player_name: string }).player_name
  const ranks = (rows as { player_rank: number }[]).map(r => r.player_rank)
  const communityAvgRank = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length)

  // Confidence breakdown
  const confidenceCounts = { low: 0, medium: 0, high: 0 }
  ;(rows as { confidence: string }[]).forEach(r => {
    if (r.confidence in confidenceCounts) confidenceCounts[r.confidence as keyof typeof confidenceCounts]++
  })

  // Most common rank
  const rankFreq = new Map<number, number>()
  ranks.forEach(r => rankFreq.set(r, (rankFreq.get(r) ?? 0) + 1))
  const mostCommonRank = [...rankFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // User's own rank
  let userRank: number | null = null
  if (session) {
    const userRow = (rows as { user_id: string; player_rank: number }[]).find(r => r.user_id === session.user.id)
    userRank = userRow?.player_rank ?? null
  }

  const total = rows.length
  return NextResponse.json({
    playerName,
    total,
    communityAvgRank,
    mostCommonRank,
    userRank,
    confidenceBreakdown: {
      low: Math.round((confidenceCounts.low / total) * 100),
      medium: Math.round((confidenceCounts.medium / total) * 100),
      high: Math.round((confidenceCounts.high / total) * 100),
    },
  })
}
```

- [ ] **Step 2: Create player page**

Create `app/players/[id]/page.tsx` — fetches community stats from the API and renders:
- Player name + position
- Community average rank with bar showing distribution (buckets: top 3, 4–6, 7–10, 11–15, 16–20, outside)
- Your rank vs community
- Confidence breakdown (Low/Medium/High %)
- Most common rank

- [ ] **Step 3: Commit**

```bash
git add app/players/ app/api/oracle/players/
git commit -m "feat: player pages with community distribution, your rank vs consensus"
```

---

### Task 13: Deploy + smoke test

**Files:** none — deployment only.

- [ ] **Step 1: Final build check**

```bash
npm run build
```

Expected: clean. All new routes listed.

- [ ] **Step 2: Deploy to Vercel**

```bash
npx vercel --prod
```

- [ ] **Step 3: Smoke test (manual)**

- Visit `/challenge` — countdown visible
- Visit `/challenge/rankings` — position tabs load, player pool search works
- Click "Save QB Rankings" without signing in — Google OAuth triggers
- After sign-in, return to `/challenge/rankings` — rankings saved
- Visit `/challenge/predictions` — prediction cards show
- Visit `/players/[any-player-id]` — community stats show
- Visit `/u/[your-username]` — profile page renders

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: V2 Oracle Challenge complete — all phases deployed"
```
