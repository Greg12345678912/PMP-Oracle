import { runWeeklyPipeline } from '@/lib/oracle/pipeline/pipeline'

// Allow up to 5 minutes — the pipeline scores all users + writes rankings sequentially.
// Default Vercel Pro timeout (60s) is insufficient once user counts grow into the hundreds.
export const maxDuration = 300

/**
 * POST /api/sync/weekly
 * Runs the full Oracle weekly pipeline:
 *   stats sync → ground truth → scoring → ranking
 *
 * Called every Tuesday at 2pm UTC by Vercel Cron.
 * Manual trigger:
 *   curl -X POST https://<domain>/api/sync/weekly \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"week": 8}'          # optional week override
 *     -d '{"dryRun": true}'     # optional dry-run mode
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { week?: number; dryRun?: boolean } = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    // empty body is fine
  }

  try {
    const result = await runWeeklyPipeline({
      week: body.week,
      dryRun: body.dryRun ?? false,
    })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
