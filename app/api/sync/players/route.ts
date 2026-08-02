import { syncPlayersToCache } from '@/lib/data/sync'

/**
 * POST /api/sync/players
 * Syncs Sleeper + FantasyCalc player data into player_cache.
 *
 * Called daily by Vercel Cron. Can also be triggered manually:
 *   curl -X POST https://<domain>/api/sync/players \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncPlayersToCache('ppr')
    return Response.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
