# Player Data Sync

## How It Works

Players are fetched from the Sleeper API at request time with a 1-hour revalidation window (`next: { revalidate: 3600 }`). Sleeper maintains the authoritative NFL roster.

## Automatic Updates (Sleeper handles these)
- Trades: Sleeper updates team assignments within hours
- Injuries: status field updates automatically
- Rookies: added to Sleeper's database at draft time
- Retirements: status becomes "Inactive" and player is filtered out

## Manual Updates Required

**Rankings JSON files** (`/public/rankings/*.json`):
Update manually after each evaluation. Edit the JSON file and push to trigger a new Vercel deployment. Vercel CDN serves the updated file immediately.

Example update:
1. Open `public/rankings/rb.json`
2. Update `lastUpdated` to current ISO timestamp
3. Update `tiers` with new player IDs (use Sleeper player_id values)
4. Commit and push

## Edge Cases

**Duplicate names** (e.g., two players named "Mike Williams"):
Sleeper player IDs are unique — the UI uses IDs internally. Names display only in cards and the download graphic. No special handling needed.

**Player traded mid-rankings**: Team name on existing ranked cards updates on next page load (Sleeper data refreshes). Rankings position is preserved.

**Player retired/cut**: Will disappear from player pool on next data refresh. If they were already ranked in a tier, their card remains but headshot may 404 gracefully.
