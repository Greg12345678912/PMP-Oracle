# Multiplayer Draft — Architecture Design

**Date:** 2026-07-29
**Status:** Approved — ready for implementation planning

---

## Implementation Constraints

These rules govern every implementation decision. They are binding.

**1. The engine is a singleton — never fork it.**
`lib/draft/engine.ts` is the one and only draft engine. Solo draft calls it client-side. Multiplayer calls it server-side (in `DraftService`). Same code, zero divergence. Any bug fix or rule change benefits both modes instantly. The engine gains `undoPick()` as a pure function; nothing else about its contract changes.

**2. Every screen must be reconstructible from three sources only:**
- `leagues` row (metadata, settings, status)
- `league_drafts.state` (current `DraftState` — the cache)
- `draft_events` rows (the permanent record)

No ephemeral in-memory state, no session variables, no server-side caches that survive restarts. A user who closes their laptop at pick 97 must be able to rejoin tomorrow and continue.

**3. API routes are thin orchestrators — no business logic.**
Every route follows the same pattern:
```
POST /pick -> validateRequest() -> DraftService.makePick() -> persist() -> broadcast() -> respond
```
All draft logic lives in `DraftService` (which calls the engine) and `lib/draft/engine.ts`. Routes coordinate; they do not decide.

**4. All mutating client actions must be idempotent.**
Every client-side action includes a `requestId` (UUID generated at click time). The server stores processed `requestId`s and returns the original result for duplicates without re-processing. This handles retries transparently on unreliable connections.

**5. Core success milestone (must pass before any secondary feature).**
Two browsers join the same private league, alternate making picks, either browser may refresh or disconnect and reconnect at any time, and the draft finishes with identical final state in both browsers. Chat, reactions, undo, replay, timers, and autopick are not built until this milestone is verified end-to-end.

**6. Phase 2 scope is minimal by constraint.**
Milestone 1 is exactly: create league, join league, start draft, make picks, real-time sync, finish draft. Nothing else ships until the core loop is proven.

**7. Replay is strictly read-only.**
The replay route rebuilds `DraftState` from `draft_events` into a temporary in-memory object. It never reads from or writes to `league_drafts`. It cannot touch a live league's state under any circumstances.

---

## Goal

Enable multiple humans to draft together in real time through a shared private league, using invite codes to join and Supabase Realtime for live sync. Every client sees exactly the same draft state in the same sequence. No optimistic updates.

## Architecture Overview

**Transport:** Supabase Realtime Broadcast per league channel — already installed, no additional WebSocket server needed.

**Command flow (server-authoritative, no optimistic updates):**

```
User clicks "Draft [player]"
  -> POST /api/league/[id]/pick
  -> Server validates (turn, availability, version check)
  -> Server writes to DB (increments version, inserts draft_events row)
  -> Server broadcasts DraftEvent via Supabase Realtime
  -> ALL clients (including picker) receive event and update state simultaneously
```

A 50-100ms round-trip is acceptable in a turn-based draft. Consistency is more valuable than perceived latency.

**State management:**
- `league_drafts.state` (jsonb) = **runtime cache**, rebuildable at any time
- `draft_events` table = **permanent immutable record**, source of truth
- `league_drafts.version` = monotonic counter, incremented per server write
- Clients always know if they are behind by comparing their local version to the broadcast event version

**Existing code reused verbatim:**
- `lib/draft/engine.ts` — `buildInitialState`, `makePick`, `selectBestAvailable` are pure functions; the server applies them and clients receive the result
- `DraftState` type extended with `version: number`
- No fork of the solo draft engine

---

## Database Schema

```sql
-- One row per private league
CREATE TABLE leagues (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code      text UNIQUE NOT NULL,       -- 6-char alphanumeric alias for id (e.g. "ABC123")
  name             text NOT NULL,
  host_user_id     text NOT NULL,              -- current host; may change on transfer
  settings         jsonb NOT NULL,             -- DraftSettings JSON
  status           text NOT NULL DEFAULT 'lobby', -- lobby | drafting | paused | complete
  replay_id        text UNIQUE,                -- set on completion; enables /replay/[id]
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- One row per human participant
CREATE TABLE league_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id      text NOT NULL,                  -- anonymous session token (localStorage UUID)
  display_name text NOT NULL,
  team_slot    integer,                        -- 1-indexed; NULL until host starts draft
  is_ready     boolean NOT NULL DEFAULT false,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (league_id, user_id)
);

-- Runtime DraftState cache — rebuildable from draft_events
CREATE TABLE league_drafts (
  league_id     uuid PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  version       integer NOT NULL DEFAULT 0,    -- monotonic; incremented per event
  state         jsonb NOT NULL,               -- full DraftState (includes version field)
  pick_deadline timestamptz,                  -- NULL = no clock; non-NULL = auto-pick at expiry
  updated_at    timestamptz DEFAULT now()
);

-- Immutable event log — permanent record; enables state rebuild and replay
CREATE TABLE draft_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  version    integer NOT NULL,                -- version AFTER this event was applied
  type       text NOT NULL,                   -- see DraftEventType below
  payload    jsonb NOT NULL,
  user_id    text NOT NULL,                   -- who triggered this event
  created_at timestamptz DEFAULT now(),
  UNIQUE (league_id, version)                 -- no gaps or duplicates in version sequence
);

-- Chat and reactions are stored as draft_events (type = 'chat' | 'reaction')
-- No separate chat table needed
```

**Invite code is only an alias.** All internal foreign keys use `leagues.id` (uuid). Invite codes can be regenerated freely without changing any other data.

---

## DraftState Extension

The existing `DraftState` type gains one field:

```typescript
interface DraftState {
  schemaVersion: 1
  version: number        // NEW: monotonic, matches league_drafts.version
  shareId: string | null
  settings: DraftSettings
  picks: PickSlot[]
  currentPickIndex: number
  availablePlayerIds: string[]
  allPlayerIds: string[]
  lockedPlayerIds: string[]
  status: 'drafting' | 'paused' | 'complete'
}
```

---

## DraftEvent Envelope

Every broadcast — picks, chat, reactions, host transfers, pauses — uses the same envelope:

```typescript
interface DraftEvent<T = unknown> {
  id: string            // uuid — matches draft_events.id
  leagueId: string      // uuid
  version: number       // version AFTER this event applied
  timestamp: string     // ISO 8601
  type: DraftEventType
  payload: T
  userId: string        // who triggered it
}

type DraftEventType =
  | 'draft_started'
  | 'pick_made'
  | 'pick_undone'
  | 'draft_paused'
  | 'draft_resumed'
  | 'draft_complete'
  | 'host_transferred'
  | 'member_joined'
  | 'member_left'
  | 'chat'
  | 'reaction'
```

**Reaction payload example:**
```typescript
{ type: 'reaction', payload: { emoji: '🔥', targetPickIndex: 42 } }
```
Reactions use the same envelope and are stored in `draft_events` — no schema change needed when reactions are added.

**Replay:** Because every event is stored with its version and timestamp, the `/replay/[replay_id]` page loads events from `draft_events` ordered by version and animates them exactly as they happened.

---

## API Routes

```
POST /api/league                     Create league → { leagueId, inviteCode }
POST /api/league/[id]/join           Join league   → { userId, teamSlot? }
GET  /api/league/[id]                Fetch current state + members
POST /api/league/[id]/ready          Toggle ready state
POST /api/league/[id]/start          Host only: start draft (assigns team slots)
POST /api/league/[id]/pick           { playerId }
POST /api/league/[id]/undo           Host only: undo last pick
POST /api/league/[id]/pause          Host only
POST /api/league/[id]/resume         Host only
POST /api/league/[id]/transfer-host  { newUserId } — host-initiated transfer
POST /api/league/[id]/chat           { message }
```

All mutating routes:
1. Authenticate user_id from session cookie/header
2. Load league + draft state from DB
3. Validate action (turn, authorization, version)
4. Apply change in a DB transaction
5. Insert row into `draft_events`
6. Broadcast `DraftEvent` via Supabase Realtime
7. Return `{ ok: true }` or error

---

## WebSocket / Realtime Channel

Channel name: `draft:{leagueId}`

**Broadcast** — server sends, all subscribers receive:

| Event type | When | Key payload fields |
|---|---|---|
| `draft_started` | Host starts draft | `state: DraftState` |
| `pick_made` | Pick validated | `overallPick`, `playerId`, `playerName`, `teamSlot`, `state` |
| `pick_undone` | Host undoes pick | `overallPick`, `state` |
| `draft_paused` | Host or clock | `reason: 'host' \| 'clock_expired'` |
| `draft_resumed` | Host resumes | — |
| `draft_complete` | All picks made | `replayId` |
| `host_transferred` | Host leaves or transfers | `newHostUserId`, `displayName` |
| `member_joined` | Someone joins lobby | `userId`, `displayName`, `teamSlot` |
| `member_left` | Someone disconnects | `userId` |
| `chat` | Chat message | `displayName`, `message` |
| `reaction` | Emoji reaction | `emoji`, `targetPickIndex` |

**Presence** — each client tracks itself:

```typescript
type PresenceState = {
  userId: string
  displayName: string
  teamSlot: number | null
  status: 'online' | 'away'
}
```

Presence leave events trigger host transfer logic (server-side, detected via Realtime presence diff or a heartbeat mechanism).

---

## Server State Machine

```
LOBBY ──(host starts)──> DRAFTING ──(all picks made)──> COMPLETE
         (2+ members)         |
                              |<──(host resumes)──┐
                              └──(host pauses  ──> PAUSED
                                  clock expires)
```

Transitions:
- `LOBBY → DRAFTING`: host calls `/start`; server assigns `team_slot` to each member, calls `buildInitialState`, writes to `league_drafts`, broadcasts `draft_started`
- `DRAFTING → PAUSED`: host calls `/pause` or `pick_deadline` expires (clock enforcement)
- `PAUSED → DRAFTING`: host calls `/resume`
- `DRAFTING → COMPLETE`: after `makePick` returns `status: 'complete'`; server sets `leagues.replay_id`, broadcasts `draft_complete`

---

## Race Conditions & Failure Cases

| Scenario | Handling |
|---|---|
| Two clients POST /pick simultaneously | DB transaction checks `version = expected_version`; second write fails with 409; losing client receives next broadcast and corrects |
| Wrong-turn pick | API checks `team_slot === currentOwner` before applying; returns 403 |
| Pick for unavailable player | API validates `playerId` in `state.availablePlayerIds`; returns 409 |
| Client disconnects mid-draft | State persists in DB; client reconnects, calls `GET /api/league/[id]`, re-subscribes to channel |
| Host disconnects | Presence leave detected; server auto-promotes oldest remaining member; broadcasts `host_transferred` |
| All clients disconnect | State persists in DB; anyone with invite code can re-join and resume |
| Clock expires, current picker gone | Supabase Edge Function (cron or scheduled): if `pick_deadline < now()` and status is `drafting`, server auto-picks best available for that team slot |
| State cache corrupted | Rebuild from `draft_events`: replay all events through `applyEvent()` to reconstruct `DraftState` |
| Network partition mid-pick | Client shows loading state on pick button; on reconnect, GET returns current state from DB |
| Undo request | Host only; server replays all `draft_events` up to `(currentPickIndex - 1)`, reconstructs state, writes cache, broadcasts `pick_undone` |

---

## Client State Hook

```typescript
// New: lib/draft/useLeagueDraft.ts
function useLeagueDraft(leagueId: string, userId: string) {
  const [state, setState] = useState<DraftState | null>(null)
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [presence, setPresence] = useState<PresenceState[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [isPicking, setIsPicking] = useState(false)  // replaces optimistic state

  useEffect(() => {
    // 1. GET /api/league/[id] — load initial state + members
    // 2. Subscribe to Supabase Realtime channel `draft:{leagueId}`
    // 3. On each DraftEvent: update state, members, chat, or presence
    // 4. On CHANNEL_ERROR or offline: re-fetch on reconnect
    // 5. Track own presence
  }, [leagueId])

  async function submitPick(playerId: string) {
    setIsPicking(true)
    try {
      const res = await fetch(`/api/league/${leagueId}/pick`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        // Server rejected — state will self-correct via next broadcast
        console.error('Pick rejected', await res.json())
      }
      // No local state update here — wait for broadcast
    } finally {
      setIsPicking(false)
    }
  }

  return { state, members, presence, chat, isPicking, submitPick }
}
```

**Reconnection flow:**
1. Supabase fires `CHANNEL_ERROR` or client detects offline
2. On `SUBSCRIBED` (reconnect): immediately call `GET /api/league/[id]`
3. Replace local state with server state (full replace, not merge)
4. Re-subscribe — no partial-apply needed because we replace rather than patch

**`DraftBoard` adaptation:**
The existing component accepts `initialState` + a `onPickSelected` callback. For multiplayer, swap those props for the `useLeagueDraft` hook's outputs. The visual components (`PickGrid`, `PickCell`, `MyTeam`, `DraftPlayerPool`) need no changes.

---

## Replay Route

When a draft completes, `leagues.replay_id` is set (reuse invite_code or generate new short ID).

Route: `GET /replay/[replayId]`
1. Load `leagues` row by `replay_id`
2. Load all `draft_events` for that `league_id`, ordered by `version ASC`
3. Filter to `type IN ('pick_made', 'pick_undone')` for the animation
4. Stream events to client with configurable delay between picks
5. Client renders existing `DraftBoard` in read-only mode, animating picks sequentially

No additional DB schema needed — everything is already in `draft_events`.

---

## Host Transfer

```typescript
// Triggered by: presence leave event for current host_user_id
async function handleHostDisconnect(leagueId: string, departingUserId: string) {
  // Find oldest remaining member (by joined_at) excluding departing user
  const nextHost = await db.from('league_members')
    .select('user_id, display_name')
    .eq('league_id', leagueId)
    .neq('user_id', departingUserId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (!nextHost) return  // all gone — state persists, anyone can rejoin

  await db.from('leagues')
    .update({ host_user_id: nextHost.user_id })
    .eq('id', leagueId)

  await insertAndBroadcast(leagueId, 'host_transferred', {
    previousHostUserId: departingUserId,
    newHostUserId: nextHost.user_id,
    displayName: nextHost.display_name,
  })
}
```

The host can also explicitly transfer via `POST /api/league/[id]/transfer-host` — useful before leaving intentionally.

---

## Anonymous Identity

Phase 1 uses a simple anonymous identity model:
- On first visit, generate `userId = crypto.randomUUID()` and store in `localStorage`
- Send as `X-User-Id` header on all API requests
- Display name set at join time, stored in `league_members`

This is intentionally thin. Supabase Auth (or any auth provider) can replace it later without changing the schema — `user_id` columns just start holding real auth UIDs instead of random tokens.

---

## Implementation Roadmap

### Phase 1 — Private leagues (lobby, no live draft)
- DB migrations: `leagues`, `league_members` tables
- Anonymous identity (localStorage UUID)
- Create league → get invite code
- Join league via invite code
- Lobby screen: members list, ready toggle, host starts draft
- Route: `/league/[id]` (lobby only)
- No Realtime yet — Realtime added in Phase 2

### Phase 2 — Live draft (core real-time)
- DB migrations: `league_drafts`, `draft_events` tables
- API routes: `/pick`, `/pause`, `/resume`, `/undo`
- `useLeagueDraft` hook (Supabase Realtime subscription)
- Adapt `DraftBoard` to accept hook outputs instead of `initialState` + `onPickSelected`
- `DraftBoard` shows loading state on pick button during POST
- Pick clock display (no server enforcement yet)
- Version mismatch detection: if received event version > local version + 1, re-fetch state

### Phase 3 — Host controls
- Undo last pick (event replay)
- Pause / resume
- Extend pick clock (update `pick_deadline`)
- Transfer host explicitly
- Auto-transfer on disconnect (Presence leave)

### Phase 4 — Chat and reactions
- Chat panel in draft board
- `POST /api/league/[id]/chat` → insert `draft_events` row, broadcast
- Reaction bar (emoji buttons) on each pick cell
- `POST /api/league/[id]/react` → same path

### Phase 5 — Clock enforcement and autopick
- Supabase Edge Function: poll for `pick_deadline < now()`, auto-pick best available
- Autopick toggle per team slot (stored in `league_members`)

### Phase 6 — Replay
- Set `leagues.replay_id` on draft complete
- `/replay/[id]` route animating from `draft_events`

### Phase 7 — Future
- Replace anonymous tokens with Supabase Auth (column rename only)
- Public lobbies / matchmaking
- Spectator mode (read-only Realtime subscription)
- Keeper / dynasty settings in `leagues.settings`
- AI co-manager (calls existing `selectBestAvailable` + position-need heuristic)
