# Weekly Live Oracle Standings — Design Spec

## North Star

Pretty Much Picks is building the reputation layer for fantasy football.

Oracle is not a feature. It is a living competition.

Every opinion should eventually become measurable.
Every measurable opinion should strengthen a user's reputation.
Every feature should feed this loop.

Every Tuesday should feel like opening the fantasy standings after Monday Night Football.

Every surface answers one emotional question:
- **Dashboard:** How am I doing?
- **Leaderboard:** Who's beating me?
- **Profile:** Who am I as a fantasy manager?
- **Player Page:** Was I right about him?
- **Results:** How good was I this season?

Optimize for anticipation, competition, and pride — not information density.

---

## What This Builds

Weekly Live Oracle Standings turns Oracle from a one-time preseason submission into a season-long competition. After NFL Week 1, the leaderboard updates every Tuesday. Users open the app to find out if they moved. The January results page becomes the culmination of 18 weeks of weekly drama rather than a single cold reveal.

This is the weekly habit that makes Oracle a product people return to without being asked.

---

## Product Philosophy

**Automation does the work. Humans approve the truth.**

Oracle's entire value is trust. Users are betting their reputation on their rankings. If the standings are ever wrong — due to a bad Sleeper stat, a scoring bug, or a misidentified player — that trust is gone. An admin approval gate before every weekly publish is not overhead. It is the product.

Most weeks, approval takes 10 seconds. The rare week it catches something becomes the moment you're glad you built it this way.

---

## Weekly Pipeline

### Cadence

Every Tuesday at 7:00 AM ET, a Vercel Cron job fires. By the time users wake up, standings are either live or pending one admin tap.

### Flow

```
Tuesday 7:00 AM ET
       ↓
Vercel Cron → POST /api/admin/oracle/weekly-import/trigger
       ↓
Fetch cumulative season stats from Sleeper API
(GET /v1/stats/nfl/regular/{season}/{week} — uses pts_ppr field)
       ↓
Rank QB / RB / WR / TE by cumulative PPR descending
       ↓
Insert rows into oracle_weekly_standings (status: pending)
       ↓
Admin opens /admin/oracle/weeks
Previews: top 5 per position, source, import time
       ↓
Admin clicks Approve
       ↓
Status → publishing (users still see last week's leaderboard)
       ↓
Score all submitted users for this week
Compute ranks, percentiles, movements, score deltas
       ↓
published_at set, status → approved
       ↓
Leaderboard swaps atomically
```

### Import Status Lifecycle

`importing` → `pending` → `approved` → `rejected`

`importing` exists so a crashed mid-import is distinguishable from a clean pending state.

### Versioning

If a week is re-imported after approval (e.g., Sleeper corrects a stat), a new `version` row is inserted (version 2, 3, etc.) and the prior version is never modified. The app always reads the highest-version approved rows for a given week. Every record is immutable. Oracle should be fully auditable — users can always ask "what data did Oracle use for Week 6?" and get a precise answer.

---

## Scoring Engine

### Existing Engine (unchanged)

`scoreUser()` in `lib/oracle/scoring.ts` scores users against `ground_truth` (final season rankings) and writes to `accuracy_scores`. This is the end-of-season engine. It is not modified.

### New: Weekly Engine

**`scoreUserForWeek(userId, seasonId, week, version)`**
- Reads user's locked preseason rankings from `challenge_rankings`
- Reads approved `oracle_weekly_standings` for `week` + `version` as the reference
- Runs identical `scoreRankings` + `applyConfidence` formulas
- Returns `{ qb, rb, wr, te, overall }`

**`scoreAllUsersForWeek(seasonId, week, version)`**
- Preloads all users' previous-week ranks into a Map (one query, not N queries)
- Scores all submitted users sequentially
- After scoring: derives `projected_rank` (rank by overall_score desc), `percentile` (projected_rank / total_users), `rank_movement` (current rank − previous rank, negative = climbed), `score_delta` (overall − previous week's overall)
- Inserts all rows into `oracle_weekly_scores`

```
// TODO: At ~5,000 users, chunk scoring into batches of 500 with a queue.
// Sequential is correct at launch. Don't over-engineer it early.
```

### Computed at Query Time (not stored)

These are calculated fresh when a page loads — they don't need to survive across requests.

- **Biggest Wins** — user's top 3 players by `final_score` this week
- **Biggest Misses** — user's bottom 3 players by `final_score` this week
- **Most Improved** — players whose `oracle_weekly_standings` rank climbed the most week-over-week
- **Weekly MVP** — user's single highest per-player accuracy score (the perfect or near-perfect pick)
- **Community Hit Rate** (player pages) — % of users who ranked a player in the top N who are currently beating the median score
- **Your Story** — a one-sentence narrative generated from rank movement + top winning player

**Weekly MVP definition:** The user's ranked player with the highest `final_score` in the current week. Displayed with name + position finish (e.g., "Brock Bowers · TE2 exact").

**Your Story generation:** Simple template logic:
- If percentile improved: "You climbed from Top X% → Top Y% because your [player] prediction gained Z points."
- If flat: "You held your position at Top X%. Your best pick this week was [player]."
- If dropped: "A tough week — you moved from Top X% → Top Y%. Your [player] pick is still your biggest advantage."

---

## DB Schema

### `oracle_weekly_standings`

Stores Sleeper-imported player rankings for each week. Source of truth for weekly scoring.

```sql
create table public.oracle_weekly_standings (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.seasons(id),
  week         int not null,
  version      int not null default 1,
  position     text not null check (position in ('QB','RB','WR','TE')),
  rank         int not null,
  player_id    text not null,
  player_name  text not null,
  ppr_points   numeric not null,
  status       text not null default 'importing'
               check (status in ('importing','pending','approved','rejected')),
  imported_at  timestamptz not null default now(),
  approved_at  timestamptz,
  published_at timestamptz,
  unique (season_id, week, version, position, rank)
);
```

**`published_at`** records when users actually saw the update — separate from `approved_at` because scoring runs between the two.

### `oracle_weekly_scores`

Weekly per-user score snapshots. Insert-only. Never updated. The leaderboard, profile charts, and dashboard all read from here.

```sql
create table public.oracle_weekly_scores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  season_id       uuid not null references public.seasons(id),
  week            int not null,
  version         int not null,
  scoring_version int not null default 1,
  score_qb        numeric,
  score_rb        numeric,
  score_wr        numeric,
  score_te        numeric,
  overall_score   numeric,
  projected_rank  int,
  total_users     int,
  percentile      numeric,          -- 0–100, e.g. 3.2 = Top 3.2%
  previous_rank   int,
  rank_movement   int,              -- negative = climbed (better)
  score_delta     numeric,          -- positive = score improved
  calculated_at   timestamptz not null default now(),
  unique (user_id, season_id, week, version)
);
```

**`scoring_version`** records which version of the Oracle scoring algorithm was used. Increment when the formula changes. Makes future score changes fully explainable.

**`percentile`** is the primary number shown to users, not raw rank. A rank of #455 out of 22,000 users is Top 2.1% — that's the number that matters.

### RLS

```sql
-- Weekly standings: anyone can read approved rows
create policy "Read approved standings"
  on public.oracle_weekly_standings for select
  using (status = 'approved');

-- Weekly scores: users read own rows; leaderboard reads are public (rank + percentile only)
create policy "Users read own weekly scores"
  on public.oracle_weekly_scores for select
  using (auth.uid() = user_id);

-- Admins can read and insert all rows on both tables
```

---

## UI

**Core principle:** One screen, one emotional moment. Never show everything at once.

### Dashboard (`/challenge`)

Three mutually exclusive states based on season status:

**Pre-season (no live week yet):** Existing entry checklist + countdown. Unchanged.

**In-season (live week exists):** Entry checklist is replaced by the Live Oracle Standing card:

```
⚡ Live Oracle Standing  ·  Week 7
Based on results through Week 7. Final standings determined after the season.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  #418  ·  Top 3%
  ▲ +0.8%  ·  +2.4 pts this week

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Your Story This Week
  You climbed from Top 6% → Top 3%
  because your Brock Bowers prediction
  gained 18 points.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🏆 Best Win            ⭐ Weekly MVP
  Brock Bowers           Brock Bowers
  +18 pts                TE2 · exact

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  View Leaderboard →
```

One screen. No scrolling required. Four emotional questions answered: Did I move? Why? What's my best pick? Who's winning?

**Post-season (scored):** Final results card with Oracle Rating, final rank, link to results page.

### Leaderboard (`/challenge/leaderboard`)

Week selector strip at the top (Week 1 → current live week). Default: latest.

Each row:

```
[rank]  [avatar] [username]  [Top X%]  [movement]  [badge]
  1       Greg    @greg       Top 0.1%  ▲ 7          👑
  2       Jake    @jake       Top 0.1%  ▼ 2
  3       Sarah   @sarah      Top 0.1%  ▲ 18         🔥
```

**Badges** (at most one per user per week, priority order):
- 👑 Weekly MVP — highest single-player accuracy score this week
- 🔥 N-week streak climbing — visible after 3+ consecutive weeks of rank improvement
- 🚀 Biggest Climber — largest percentile gain this week
- ⭐ Perfect pick — at least one player ranked within 1 spot of actual finish

**Week headline** (above the list, computed once per week after publish):
```
Week 7 Highlights
🚀 Biggest Climber: Greg (+418 places)
⭐ Most Accurate Pick: Brock Bowers
🎯 Most Divisive Player: Garrett Wilson
```

The final-season leaderboard (when `status === 'scored'`) remains unchanged — shows official Oracle Ratings.

### Profile (`/u/[username]`)

The sparkline becomes the hero, above everything else:

```
Greg
@greg

⚡ Oracle Rating
1,482
Unlocked after first season   [until final scoring]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 [sparkline: percentile Week 1 → Week 8]
   Top 12%  →  Top 3%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Week 8  ·  #418  ·  Top 3%  ·  ▲ 19

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

QB  ████████░░  82%
RB  ██████░░░░  61%
WR  ███████░░░  74%
TE  █████████░  91%
```

The chart tells the story of the season at a glance. A rising line from Week 1 to Week 8 is the identity statement.

Sparkline: simple SVG path, no charting library. Y-axis inverted (lower percentile = higher on chart = better). 8 data points max for this season.

### Player Pages (`/players/[id]`)

After lock, the community stats card gains:

```
Puka Nacua
WR · LAR  ·  Current ADP: WR8

Community Avg Rank    Most Common    Your Rank
     WR5                  WR4           WR3

Current Finish  ·  WR8  ↑ (was WR11 last week)

Community Hit Rate: 84%
People who ranked him Top 10 are currently
beating the field by 3.2 pts.

Most Improved this week: ↑ 3 spots
```

**Community Hit Rate** answers the key emotional question: *was fading this player smart?* It's computed as: % of submitted users who ranked this player in the top N (where N = their position list size / 2) whose `overall_score` is above the median this week.

### Admin Panel (`/admin/oracle/weeks`)

Protected route, admin-only. Mission control feel.

Week list with status pills. Clicking a week expands:

```
Week 8  ·  Imported Tue 7:02 AM  ·  Sleeper API  ·  v1
Status: PENDING REVIEW

QB1  Josh Allen      284.3 pts
QB2  Lamar Jackson   271.8 pts
QB3  Joe Burrow      258.1 pts

RB1  Bijan Robinson  203.4 pts
RB2  Saquon Barkley  197.2 pts
...

[ Approve ]  [ Reject ]  [ Re-import ]
```

After approval completes:

```
✅ Week 8 Published
   12,481 users scored
   Leaderboard updated
   Duration: 1m 42s
```

Shows exactly what ran, how many users were affected, and how long it took. The admin should never wonder if something actually completed.

---

## Out of Scope (This Build)

These are the right next features but belong in separate specs:

- **Push notifications** — "You climbed 23 spots" on Tuesday morning
- **Friends / social** — "Your friend @jake passed you this week"
- **`oracle_seasons` aggregate table** — instant profile loading for historical seasons
- **Scoring chunking** — batched queue for 5,000+ users
- **Prediction scoring in weekly** — predictions are binary (right/wrong at season end), not applicable mid-season

---

## Scope Summary

**New tables:** `oracle_weekly_standings`, `oracle_weekly_scores`

**New API routes:**
- `POST /api/admin/oracle/weekly-import/trigger` — Vercel Cron entry point
- `POST /api/admin/oracle/weeks/[week]/approve` — triggers scoring pipeline
- `POST /api/admin/oracle/weeks/[week]/reject`
- `POST /api/admin/oracle/weeks/[week]/reimport`
- `GET /api/oracle/standing/current` — current user's live week score

**New lib:** `lib/oracle/weeklyScoring.ts` — `scoreUserForWeek`, `scoreAllUsersForWeek`

**Modified pages:** `/challenge` (dashboard state), `/challenge/leaderboard` (week selector + badges), `/u/[username]` (sparkline hero), `/players/[id]` (current finish + community hit rate)

**New pages:** `/admin/oracle/weeks`

**Vercel Cron:** `vercel.json` entry for Tuesday 7 AM ET

---

## The Habit This Creates

Users don't open Oracle because they're reminded to.

They open it because it's Tuesday and they want to know if they moved.

That's the difference between a feature and a ritual.
