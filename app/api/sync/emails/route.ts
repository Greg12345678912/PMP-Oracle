import { sendWeeklyScoreEmails } from '@/lib/oracle/emails'
import { getCurrentSeason } from '@/lib/oracle/season'

export const maxDuration = 300

/**
 * POST /api/sync/emails
 * Manually trigger weekly score emails for a given week.
 * Used when fire-and-forget from the pipeline fails (e.g. cold Vercel shutdown).
 *
 * Body: { "week": 1 }
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { week?: number } = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    // empty body is fine
  }

  const season = await getCurrentSeason()
  if (!season) return Response.json({ error: 'No active season' }, { status: 400 })

  const week = body.week
  if (!week) return Response.json({ error: 'week is required' }, { status: 400 })

  try {
    await sendWeeklyScoreEmails(season.id, week)
    return Response.json({ ok: true, seasonId: season.id, week })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
