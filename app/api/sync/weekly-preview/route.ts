import { runWeeklyPipeline } from '@/lib/oracle/pipeline/pipeline'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'

// Allow up to 5 minutes — same as the real pipeline
export const maxDuration = 300

/**
 * GET|POST /api/sync/weekly-preview
 * Runs the Oracle pipeline in dryRun mode, validates key metrics,
 * and posts a PASS/FAIL report to Discord via ORACLE_ALERT_WEBHOOK_URL.
 *
 * Scheduled every Tuesday at 2 AM UTC (Monday 10 PM ET) — 12 hours before
 * the real Tuesday 2 PM UTC cron — so any issues surface with time to act.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const webhookUrl = process.env.ORACLE_ALERT_WEBHOOK_URL

  async function postToDiscord(content: string) {
    if (!webhookUrl) return
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
    } catch {
      // Non-fatal
    }
  }

  try {
    // Get expected submitted user count for validation
    const db = getServiceClient()
    const season = await getCurrentSeason()
    let expectedUsers = 0
    if (season) {
      const { data: submittedUsers } = await db
        .from('challenge_rankings')
        .select('user_id')
        .eq('season_id', season.id)
        .eq('is_submitted', true)
      expectedUsers = new Set((submittedUsers ?? []).map(r => r.user_id)).size
    }

    const result = await runWeeklyPipeline({ dryRun: true })

    const checks = {
      statsUpserted:        result.statsUpserted > 0,
      groundTruthComplete:  result.groundTruthPositions === 4,
      allUsersScored:       result.usersScored === expectedUsers,
      noErrors:             result.errors.length === 0,
    }
    const passed = Object.values(checks).every(Boolean)

    const icon = (ok: boolean) => (ok ? '✅' : '❌')
    const lines = [
      `**[Oracle Pipeline] Dry Run Preview — Week ${result.week}** ${passed ? '✅ PASS' : '❌ FAIL'}`,
      `Stats upserted: ${result.statsUpserted} ${icon(checks.statsUpserted)}`,
      `Ground truth positions: ${result.groundTruthPositions}/4 ${icon(checks.groundTruthComplete)}`,
      `Users scored: ${result.usersScored}/${expectedUsers} ${icon(checks.allUsersScored)}`,
      `Errors: ${result.errors.length} ${icon(checks.noErrors)}`,
    ]
    if (result.errors.length > 0) {
      lines.push('**Errors:**')
      result.errors.forEach(e => lines.push(`• ${e}`))
    }
    lines.push(
      passed
        ? 'Real pipeline fires in ~12 hours. No action needed.'
        : '⚠️ Investigate before Tuesday 10 AM ET.',
    )

    await postToDiscord(lines.join('\n'))

    return Response.json({ ok: true, passed, checks, expectedUsers, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await postToDiscord(
      `**[Oracle Pipeline] Dry Run FAILED**\n${message}\n⚠️ Investigate before Tuesday 10 AM ET.`,
    )
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
