# The Oracle Challenge — Design Spec

## Goal

A yearly fantasy football accuracy competition where users lock in their PPR rankings and predictions before Week 1, then get scored at season's end. Results show exactly what you got right and wrong — not just a score. Builds toward a long-term credibility system (Accuracy Rating) that compounds across seasons.

## Product Phases

**V1 (now — draft prep tools)**
- Tier Builder
- Mock Draft (solo + multiplayer)
- Trade Analyzer
- Rankings Builder (personal rankings, shareable — no competition yet)

**V2 (preseason 2026 — this spec)**
- The Oracle Challenge: lock PPR rankings + predictions before Week 1
- End-of-season scoring with per-player right/wrong breakdown
- Shareable results card
- Creator + Verified badges

**V3 (in-season / post-season 2026)**
- Global leaderboard
- Position leaderboards
- Creator leaderboard
- Weekly "if the season ended today" projected scores
- Risers/falls tracker

**V4 (after Season 1 completes)**
- Accuracy Rating (Elo-inspired, multi-season)
- Rating tiers: Beginner → Draft Scout → Analyst → Expert → Elite → Fantasy Oracle
- Historical profile (season-by-season breakdown)

---

## Architecture

### Auth

Supabase Google OAuth (Apple Sign-In added later).

**Trigger points only — no upfront account wall:**
- Save rankings draft
- Lock in rankings / predictions
- Share results

All tools (tier builder, mock draft, rankings builder) are fully usable anonymously. On sign-in, pending session is attached to the new account.

### Tech Stack

Next.js + Supabase (existing). New: Supabase Auth with Google provider. No new infra needed for V2.

---

## The Oracle Challenge — Rankings

### Scoring Format

All rankings use **PPR scoring** — communicated clearly throughout the UI. Ground truth is PPR fantasy finish.

Users rank:
- **Top 10 QBs** (PPR)
- **Top 20 RBs** (PPR)
- **Top 20 WRs** (PPR)
- **Top 10 TEs** (PPR)

FLEX, K, and DEF excluded from V2. Always add later.

### User Flow

1. `/challenge` — landing page with four drag-and-drop ranking lists
2. Lists are pre-populated with ADP/consensus suggestions as a starting point (all draggable/swappable)
3. Users can build rankings without an account
4. "Lock In My Rankings" → Google sign-in gate → rankings saved with timestamp
5. Rankings are editable until lockout (NFL Week 1 Thursday kickoff)
6. Post-lockout: read-only. Share card available. Results page visible after scoring.

### Scoring — Per Player

Stepped, floor at 0:

| Distance from correct rank | Points |
|---|---|
| Exact | 50 |
| Off by 1 | 45 |
| Off by 2 | 40 |
| Off by 3 | 35 |
| Off by 4 | 30 |
| Off by 5 | 25 |
| Off by 6 | 20 |
| Off by 7 | 15 |
| Off by 8 | 10 |
| Off by 9 | 5 |
| Off by 10+ | 0 |

**Inclusion bonus:** If you ranked a player in your list and they finished within the position tier (Top 10 QB, Top 20 RB/WR, Top 10 TE) but your distance was 10+, award 3 pts. Rewards "at least knowing they mattered."

**Player not in your list:** 0 pts if they finished in the top tier. No penalty.

### Scoring — Normalization

Each position is normalized to 0–100:

```
position_score = (raw_pts / max_possible_pts) * 100
```

Max possible = 50 × number of players in that position's list.

**Overall Oracle Score** = unweighted average of 4 position scores. Each position = 25% regardless of list size (QB Top 10 counts the same as WR Top 20).

### Confidence

Three levels, applied per player when ranking:

- **Low** — no modifier
- **Medium** (default) — ×1.2 if score ≥ 30; ×0.8 if score = 0
- **High** — ×1.5 if score ≥ 30; ×0.5 if score = 0

"High and wrong" means your score for that pick is halved. "High and right" means it's multiplied. This forces people to pick their spots.

UI shows confidence as colored dots next to each player while building rankings. Toggle per player.

---

## Results Page — Right/Wrong Breakdown

This is the core experience. After scoring, `/challenge/results` (or `/u/username` results tab) shows a full per-player breakdown — not just a number.

### Layout (per position)

```
WR Rankings — Your Score: 89.6 / 100

#   You Picked         Actual Finish   Points   Confidence
1   Ja'Marr Chase      WR1   ✓ exact   50 pts   High  (+25)
2   CeeDee Lamb        WR3   off by 1  45 pts   Medium
3   Puka Nacua         WR8   off by 5  25 pts   High  (-12)
4   Justin Jefferson   WR2   off by 2  40 pts   Low
5   Tyreek Hill        WR11  miss      0 pts    Medium
...
```

Color coding:
- Green row = exact or within 2 spots
- Yellow = off by 3–5
- Orange = off by 6–9
- Red = miss (10+ or not in top tier)

**Summary callouts** shown above the table:
- "You nailed 4 of your Top 10 WRs exactly"
- "Your biggest miss: Puka Nacua (you had WR3, he finished WR8)"
- "Best call: Ja'Marr Chase — WR1, just like you said"

These feed directly into social sharing copy.

### Share Card

One-tap downloadable card (html2canvas, same mechanic as draft share card):

```
The Oracle Challenge 2026
Pretty Much Picks

WR Score: 89.6    #21 of 41,883
Best call: Ja'Marr Chase — WR1 ✓
Biggest miss: Puka Nacua (WR3 → WR8)

pretty-much-picks.com/challenge
```

---

## Predictions

Separate from rankings. Users lock individual predictions before Week 1. Scored separately, results shown separately from rankings.

### Prediction Types

- **Outcome:** "Who finishes RB1 in PPR?" (multiple choice)
- **Range:** "Does Bijan Robinson finish Top 5 RB?" (Yes / No)
- **Award:** "Who wins the PPR Rookie of the Year?" (multiple choice)
- **Event:** "Who is the first head coach fired?" (multiple choice)
- **Bust:** "Which of these players busts hardest?" (multiple choice from list)

All predictions are multiple-choice — no free text. Admin creates the questions + options. This keeps scoring clean and automated.

### Confidence applies here too

Same Low/Medium/High system as rankings.

### Scoring

Each prediction has a difficulty rating (set by admin):

| Difficulty | Base points |
|---|---|
| Easy (obvious) | 25 |
| Medium | 50 |
| Hard | 100 |
| Long shot | 200 |

Confidence modifier same as rankings (×1.5 / ×0.5 at High; ×1.2 / ×0.8 at Medium).

### Results

Same right/wrong table layout as rankings — shows each prediction, what you chose, what happened, and your points.

```
Predictions — Your Score: 340 / 600

Question                          Your Pick          Result      Points
Who finishes RB1?                 Bijan Robinson     Bijan ✓     100 pts   High (+50)
First coach fired?                Mike McDaniel      Wrong       0 pts     Medium
PPR Bust of the Year?             Garrett Wilson     Wrong       0 pts     High (-50)
...
```

---

## Badges & Verification

### Identity Badges (shown on profile and leaderboard)

- **Verified** — identity confirmed. Admin-granted initially.
- **Creator** — self-declared. User links YouTube / TikTok / podcast / newsletter. No approval needed. Shows on profile. Leaderboard can filter to Creators.

### Achievement Badges (earned, shown on profile)

Examples:

- Top 1% WR Ranker (2026)
- #8 RB Accuracy
- Perfect QB Prediction
- 3 for 3 on Hard Predictions
- Called the Bust
- Nailed RB1 (exact)

Achievements are stored and shareable. Shown as icon grid on profile with expandable detail.

---

## Profile Page — `/u/username`

```
[Avatar]  Greg Spunt
          @gregspunt   Verified   Creator

2026 Season
  Oracle Score     91.4
  Rankings         89.8
  Predictions      340 pts

  QB   88.2   "Nailed 7/10"
  RB   94.1   "Nailed 12/20 — best call: Bijan RB1"
  WR   89.6   "Biggest miss: Puka WR3 → WR8"
  TE   93.7   "Nailed 8/10"

[View Full Results Breakdown]
[Download Share Card]

Achievements: [badges grid]

Past Seasons
  (empty until after Season 1)
```

Accuracy Rating section hidden until after first completed season (V4).

---

## Ground Truth Import

### V2: CSV Upload (Admin)

Admin page at `/admin/seasons/[year]/import`.

CSV format (one file per position):
```
rank,player_name,player_id,ppr_points
1,Ja'Marr Chase,CHAfoo,342.1
2,CeeDee Lamb,LAMbar,331.8
...
```

Preview before confirming. Validation: no duplicate ranks, all required fields present.

Source of truth is declared publicly before the season starts (e.g., "FantasyPros PPR consensus end-of-season rankings"). The `ground_truth` table stores the source field.

### V3+: Automated Import

Design accommodates pulling from FantasyPros API or Sleeper at season end. The `source` field and import timestamp on `ground_truth` support this without schema changes.

---

## In-Season Engagement (V3)

Implemented during the season, after lock date:

- **Weekly projected score:** admin triggers an import of current PPR standings mid-season. System recomputes "if season ended today" scores for all users.
- **Projected rank:** "You're currently #183 overall"
- **Position risers/falls:** which players on your list have moved significantly
- **"Best call so far" callout:** the player where you're closest to correct

These surface on the profile and results page. Keeps users checking in weekly even though final scoring is January.

---

## Data Model

```sql
-- user_profiles: extends Supabase auth.users
CREATE TABLE user_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text UNIQUE NOT NULL,
  display_name text NOT NULL,
  avatar_url   text,
  is_verified  boolean DEFAULT false,
  is_creator   boolean DEFAULT false,
  creator_links jsonb DEFAULT '{}', -- { youtube, tiktok, podcast, newsletter }
  accuracy_rating int DEFAULT 1000, -- populated after Season 1
  created_at   timestamptz DEFAULT now()
);

-- seasons: one row per NFL season
CREATE TABLE seasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year       int UNIQUE NOT NULL,
  name       text NOT NULL,      -- "2026 Oracle Challenge"
  lock_at    timestamptz NOT NULL,
  scored_at  timestamptz,
  status     text DEFAULT 'open' -- open | locked | scoring | scored
);

-- challenge_rankings: one row per user × season × position × rank
CREATE TABLE challenge_rankings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  season_id   uuid REFERENCES seasons(id),
  position    text NOT NULL,       -- QB | RB | WR | TE
  player_rank int NOT NULL,        -- 1-based rank the user assigned
  player_id   text NOT NULL,       -- Sleeper player ID
  confidence  text DEFAULT 'medium', -- low | medium | high
  submitted_at timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id, position, player_rank)
);

-- predictions: admin-created questions
CREATE TABLE predictions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      uuid REFERENCES seasons(id),
  question       text NOT NULL,
  options        jsonb NOT NULL,   -- ["Josh Allen", "Lamar Jackson", ...]
  correct_option text,             -- set after season ends
  base_points    int NOT NULL,     -- 25 | 50 | 100 | 200
  status         text DEFAULT 'open' -- open | locked | scored
);

-- user_predictions: one row per user × prediction
CREATE TABLE user_predictions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  prediction_id  uuid REFERENCES predictions(id),
  chosen_option  text NOT NULL,
  confidence     text DEFAULT 'medium',
  submitted_at   timestamptz DEFAULT now(),
  UNIQUE(user_id, prediction_id)
);

-- ground_truth: final PPR rankings (admin-imported)
CREATE TABLE ground_truth (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   uuid REFERENCES seasons(id),
  position    text NOT NULL,
  rank        int NOT NULL,
  player_id   text NOT NULL,
  player_name text NOT NULL,
  ppr_points  numeric,
  source      text NOT NULL,     -- "FantasyPros PPR 2026"
  imported_at timestamptz DEFAULT now(),
  UNIQUE(season_id, position, rank)
);

-- accuracy_scores: computed after scoring; one row per user × season
CREATE TABLE accuracy_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  season_id           uuid REFERENCES seasons(id),
  score_qb            numeric,   -- 0-100 normalized
  score_rb            numeric,
  score_wr            numeric,
  score_te            numeric,
  score_predictions   numeric,   -- raw pts
  overall_score       numeric,   -- avg of 4 position scores (0-100)
  global_rank         int,
  is_projected        boolean DEFAULT false, -- true = mid-season estimate
  computed_at         timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id)
);

-- per-player scoring detail (drives right/wrong breakdown UI)
CREATE TABLE ranking_score_detail (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  season_id      uuid REFERENCES seasons(id),
  position       text NOT NULL,
  player_id      text NOT NULL,
  user_rank      int NOT NULL,   -- what the user predicted
  actual_rank    int,            -- null if player didn't finish in top tier
  distance       int,            -- abs(user_rank - actual_rank), null if missed
  raw_score      int,            -- pts before confidence modifier
  confidence     text,
  final_score    numeric,        -- after confidence modifier
  UNIQUE(user_id, season_id, position, player_id)
);

-- user_achievements
CREATE TABLE user_achievements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  season_id       uuid REFERENCES seasons(id),
  achievement_key text NOT NULL,
  label           text NOT NULL,
  icon            text NOT NULL,
  earned_at       timestamptz DEFAULT now()
);
```

---

## Pages

```
/challenge                     -- Oracle Challenge landing + ranking builder
/challenge/predictions         -- Prediction submissions
/challenge/results             -- Your results (right/wrong breakdown) — post-scoring only
/u/[username]                  -- Public profile
/admin/seasons                 -- Manage seasons
/admin/seasons/[year]/import   -- Import ground truth CSV
/admin/seasons/[year]/score    -- Trigger scoring run
/admin/predictions             -- Create/manage prediction questions
```

Leaderboard pages added in V3:
```
/leaderboard                   -- Overall / Position / Creator tabs
```

---

## Accuracy Rating (V4 — after Season 1)

Stored in `user_profiles.accuracy_rating` from day one. Surfaced publicly only after the first season is scored.

Starting rating: 1,000 for all users.

Season-end adjustment based on overall percentile:

| Finish | Rating change |
|---|---|
| Top 1% | +150 |
| Top 5% | +75 |
| Top 10% | +40 |
| Top 25% | +15 |
| Top 50% | 0 |
| Bottom 50% | -30 |
| Bottom 25% | -60 |

**Tiers:**

| Rating | Tier |
|---|---|
| < 1,000 | Beginner |
| 1,000-1,199 | Draft Scout |
| 1,200-1,399 | Analyst |
| 1,400-1,599 | Expert |
| 1,600-1,799 | Elite |
| 1,800+ | Fantasy Oracle |

Launch messaging after Season 1: "Your 2026 season is now permanent. Accuracy Ratings are live. Every future season builds your fantasy reputation."

---

## Open Questions (resolved before planning)

- Ground truth source: FantasyPros PPR end-of-season? Or Sleeper? Needs to be declared publicly before Week 1.
- Lock date: exact timestamp (Week 1 Thursday kickoff — ~September 3, 2026 8:20 PM ET)
- Username format: display name only, or also a unique handle (@gregspunt)?
- Admin auth: is there a separate admin role in Supabase, or is it a flag on user_profiles?
