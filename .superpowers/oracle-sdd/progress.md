# Oracle Challenge V2 — SDD Progress Ledger

Plan: /Users/gregspunt/pretty-much-picks/docs/superpowers/plans/2026-07-31-oracle-challenge-v2.md
Project: /Users/gregspunt/pretty-much-picks
Branch: feature/gspunt
Merge base: 65e696f
Started: 2026-07-31

## Task Status
- [ ] Task 1: Install deps + Supabase auth helpers
- [ ] Task 2: DB migration (user_profiles, seasons) + constants
- [ ] Task 3: Google OAuth callback + SignInButton
- [ ] Task 4: Countdown component + /challenge landing page
- [ ] Task 5: Player data layer
- [ ] Task 6: Rankings API (GET/PUT)
- [ ] Task 7: Drag-and-drop ranking UI
- [ ] Task 8: Predictions tables, API, admin routes, predictions page
- [ ] Task 9: Scoring engine + admin trigger
- [ ] Task 10: Results page
- [ ] Task 11: Public profiles (/u/[username])
- [ ] Task 12: Player pages (/players/[id])
- [ ] Task 13: Deploy

## Minor Findings
Task 1: complete (commits 65e696f..3c965d3, review clean after middleware→proxy fix)
Minor: @dnd-kit was already installed (pre-existing), install was a no-op for those packages
Task 2: complete (commits 99fd6ca..e85cffb, review clean)
Minor: user_profiles uses user_id FK (not id) — brief had labeling error, implementation is correct; seasons uses uuid PK (brief said int); extra columns (avatar_url, is_verified, etc) included — appropriate for domain
Task 3: complete (commits e85cffb..4a5f922, review clean after fix)
Fix: added getOrCreateProfile call in OAuth callback (was missing — profile row not created on first sign-in)
Minor: creator_links concern was unfounded — column present in migration with NOT NULL DEFAULT '{}'
Task 4: complete (commits 4a5f922..94be5ef, review clean)
Minor: Countdown receives lockDate as prop (from season.lock_at) rather than importing ORACLE_LOCK_DATE directly — spirit of constraint met (no hardcode), no issue
Minor: session-aware CTA copy ("Continue Rankings") deferred to Task 5 per brief — correct
Notable: export const dynamic='force-dynamic' added to prevent build-time crash — correct Next.js 16 decision
Task 5: complete (commits 72f3bdb..1f7e87f, review clean)
Minor: getPlayerPool returns full pool, not sliced to POSITION_LIST_SIZE — correct (UI owns slicing); Player imported from lib/data/types.ts (source) rather than lib/draft/types.ts (re-export) — fine
Task 6: complete (commits 1f7e87f..a5378fd, review clean after critical fix)
Fix: migration replaced (per-row → jsonb), unique(user_id,season_id,position) added, upsert conflict key fixed, request.json() wrapped, dynamic import removed, type guard added
Task 7: complete (commits a5378fd..89fdb2b, review clean — no issues)
Notable: TouchSensor added beyond brief requirement; locked state fully enforced; localStorage key exact; PPR label in position header; TypeScript clean
Future: Sleeper 19MB response — consider caching at getPlayerPool level (not blocking)
UX Polish (founder test): complete (commits 1965002..b95eded, review clean — 14/14 constraints)
- CTA fixed: "Build My Rankings" on landing
- Predictions link disabled (coming soon)
- Persistent save time replaces flash "Saved!"
- Completion tracker (✅/☐, X of 4) on rankings page
- 4s nudge to next position after save
- Review page: pre-flight checklist with ✅/⏳ per position
- Incomplete entry warning: ⚠️ + "Enter Anyway" escape hatch
- Confirmation: "🎉 You're officially entered."
- is_submitted column + POST /api/oracle/rankings/enter
Task 8: complete (commits b95eded..463e0a7, review clean after minor fixes)
Design change: open-ended text predictions → 8 predefined questions (NFL MVP, OROY, CPOY, RB1, WR1, TE1, Bust, Breakout)
Fix: upsertPrediction wrapped in try/catch in route; "✓ Saved" wording corrected
Minor (not fixed): admin [id]/route.ts returns ok:true even on 0-row match — low priority
Task 9: complete (commits 463e0a7..a864c4f, review clean after test fix)
Fix: added scorePosition normalization tests + scoreAll average test; removed dead distance param from applyConfidence
13/13 tests passing
Task 10: complete (commits b5c3357..9fb68fe, review clean — 15/15 constraints)
Minor fix: inline bg on share card for html2canvas (Tailwind custom tokens don't always resolve in headless capture)
V3 backlog: "Compare with a Friend / Compare with Pretty Much Picks" side-by-side results
Task 11: complete (commits 9fb68fe..52e0e3a, review approved after fix pass)
Fix: ResultsShareCard imported and rendered in scored profile section
Fix: is_public column added to user_profiles via migration 20260801_user_profiles_is_public.sql
Fix: rank fallback changed from totalParticipants to null; percentile gated on rank !== null
Fix: lockDateLabel derived server-side from ORACLE_LOCK_DATE, no hardcoded date string
Minor (not fixed — pre-existing): NaN percentile when totalParticipants=0 in computePercentile helper
Minor (not fixed — pre-existing): Position tab strip buttons ~28px height, below 44px target
Task 12: complete (commits 52e0e3a..bc90f98, review approved after fix pass)
Fix: confidence pct rounding — high bucket derived as 100-low-med to guarantee sum=100
Fix: hardcoded "September 9, 2026" replaced with ORACLE_LOCK_DATE.toLocaleDateString()
Zero-rankings edge: playerEntries.length === 0 → returns null → 404 before any divide-by-total math
Minor (not fixed): mostCommonRank tie-breaking is insertion-order dependent
Minor (not fixed): communityAvgRank returned as rounded int; true float not exposed in API response
