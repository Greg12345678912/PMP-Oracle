# Stat Corrections — Operational Procedure

**Status:** Defined pre-season. Follow this document exactly. Do not make ad-hoc decisions mid-season.

---

## Default Policy: Wait Until the Following Tuesday

When Sleeper publishes stat corrections after a Tuesday scoring run, **do not manually re-run the pipeline**. Let the following Tuesday's scheduled cron pick up the corrected data automatically.

**Why this is the right default:**
- The pipeline is fully idempotent. The next Tuesday run re-fetches all weeks up to `current_week` and rebuilds ground truth from scratch. Corrections are absorbed automatically with zero manual intervention.
- Stat corrections are almost always minor (1–3 PPR points) and do not change the rank order of the leaderboard.
- Manual re-runs create an inconsistent cadence. Users who check the leaderboard on Wednesday and again on Thursday would see unexplained rank changes. A weekly update cycle is predictable and trustworthy.
- All major fantasy platforms (ESPN, Yahoo, Sleeper) settle stats on a weekly cycle for the same reason.

---

## Exception: Material Correction

A manual re-run is warranted only when **all three** of the following are true:

1. A single player's PPR score changed by **15 or more points** due to a stats provider error (not a judgment call — a data error).
2. The correction **changes the #1 rank** on the leaderboard.
3. The correction is **confirmed final** by Sleeper (not a provisional update that may change again).

If any one of those three conditions is not met, wait for the following Tuesday.

---

## Manual Re-Run Procedure

If the exception criteria are met, follow these steps in order.

### Step 1 — Confirm the correction is final

Check Sleeper's stats for the affected player at:
```
https://api.sleeper.app/v1/stats/nfl/regular/{year}/{week}
```
Confirm the corrected `pts_ppr` value matches official NFL/NGS data. Do not re-run against provisional numbers.

### Step 2 — Run a dry run first

```bash
curl -X POST https://www.prettymuchpicks.ca/api/sync/weekly \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"week": <week_number>, "dryRun": true}'
```

Review the response:
- `errors` must be empty
- `usersScored` must equal the expected number of submitted entries
- `groundTruthPositions` must be 4

Do not proceed if any of those are wrong.

### Step 3 — Run the live pipeline

```bash
curl -X POST https://www.prettymuchpicks.ca/api/sync/weekly \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"week": <week_number>}'
```

### Step 4 — Verify in Supabase

Query `sync_jobs` for the most recent row:
```sql
select status, records_processed, error, completed_at
from sync_jobs
order by started_at desc
limit 1;
```

Confirm `status = 'success'` and `error` is null.

### Step 5 — Spot-check the leaderboard

Manually verify that the top 3 ranks on `accuracy_scores` reflect the corrected stats. Cross-reference at least one affected user's score against the updated ground truth.

---

## CRON_SECRET

Stored as a Vercel production environment variable. Retrieve it from the Vercel dashboard or Vercel CLI:
```bash
npx vercel env pull
```

---

## Summary

| Situation | Action |
|---|---|
| Minor stat correction (< 15 pts) | Wait for following Tuesday — no action |
| Major correction, does not change #1 rank | Wait for following Tuesday — no action |
| Major correction (>= 15 pts), changes #1 rank, confirmed final | Manual re-run per procedure above |
| Cron failed silently on scheduled Tuesday | Manual re-run per procedure above |
