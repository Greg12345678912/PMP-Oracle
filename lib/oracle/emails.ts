/**
 * Oracle Challenge weekly score emails.
 *
 * Reads finalized accuracy_scores — the exact same records that power
 * the leaderboard and results page — and sends a personalized email to
 * every participant via Resend batch API.
 *
 * Called fire-and-forget from the pipeline after Stage 5 completes
 * successfully. Failures are logged but never surface as pipeline errors.
 */
import { Resend } from 'resend'
import { getServiceClient } from '@/lib/league/db'

const FROM = 'PrettyMuchPicks <noreply@prettymuchpicks.ca>'
const RESULTS_URL = 'https://www.prettymuchpicks.ca/challenge/results'
const BATCH_SIZE = 100

function getFirstName(displayName: string | null): string {
  if (!displayName) return 'there'
  return displayName.split(' ')[0]
}

function rankChangeHtml(change: number | null): string {
  if (change === null || change === 0) return ''
  const up = change > 0
  const abs = Math.abs(change)
  const text = up
    ? `&#9650; Up ${abs} spot${abs === 1 ? '' : 's'} this week`
    : `&#9660; Down ${abs} spot${abs === 1 ? '' : 's'} this week`
  const color = up ? '#4ade80' : '#e53935'
  return `<p style="color:${color};font-size:14px;font-weight:600;margin:12px 0 0;">${text}</p>`
}

function buildHtml(params: {
  firstName: string
  week: number
  rank: number
  totalParticipants: number
  overallScore: number
  rankChange: number | null
}): string {
  const { firstName, week, rank, totalParticipants, overallScore, rankChange } = params
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" bgcolor="#000000" cellpadding="0" cellspacing="0" border="0">
    <tr><td>
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;background:#000;">

    <p style="color:#555;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 32px;">2026 Oracle Challenge</p>

    <p style="color:#fff;font-size:18px;font-weight:600;margin:0 0 8px;">Hey ${firstName},</p>
    <p style="color:#888;font-size:16px;margin:0 0 32px;">Week ${week} scores are live.</p>

    <div style="background:#111;border:1px solid #222;border-radius:16px;padding:32px;text-align:center;margin-bottom:16px;">
      <p style="color:#555;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 8px;">Your Rank</p>
      <p style="color:#fff;font-size:64px;font-weight:900;line-height:1;margin:0 0 8px;">#${rank.toLocaleString()}</p>
      <p style="color:#555;font-size:14px;margin:0;">out of ${totalParticipants.toLocaleString()}</p>
      ${rankChangeHtml(rankChange)}
    </div>

    <div style="background:#111;border:1px solid #222;border-radius:16px;padding:20px;margin-bottom:32px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="color:#666;font-size:14px;">Overall accuracy</td>
          <td style="color:#fff;font-size:14px;font-weight:700;text-align:right;">${overallScore.toFixed(1)}</td>
        </tr>
      </table>
    </div>

    <a href="${RESULTS_URL}" style="display:block;background:#e53935;color:#fff;text-align:center;padding:16px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:40px;">View My Results &#8594;</a>

    <p style="color:#333;font-size:11px;text-align:center;margin:0;">
      Scores update every Tuesday &middot;
      <a href="https://www.prettymuchpicks.ca" style="color:#444;text-decoration:none;">prettymuchpicks.ca</a>
    </p>

  </div>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendWeeklyScoreEmails(seasonId: string, week: number): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const db = getServiceClient()

  // Read the finalized accuracy_scores — exact same records powering leaderboard + results page
  const { data: scores, error: scoresError } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score, global_rank, rank_change')
    .eq('season_id', seasonId)
    .order('global_rank', { ascending: true })

  if (scoresError || !scores || scores.length === 0) {
    console.error('[oracle/emails] No scores found:', scoresError?.message ?? 'empty result')
    return
  }

  const totalParticipants = scores.length
  const userIds = scores.map(s => s.user_id as string)

  // Fetch display names
  const { data: profiles } = await db
    .from('user_profiles')
    .select('user_id, display_name')
    .in('user_id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map(p => [p.user_id as string, p.display_name as string | null]),
  )

  // Fetch emails via admin API (requires service role key)
  const { data: usersData, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (usersError) {
    console.error('[oracle/emails] Failed to fetch auth users:', usersError.message)
    return
  }

  const emailMap = new Map(usersData.users.map(u => [u.id, u.email ?? null]))

  // Build individual emails from finalized DB records only — no derived calculations
  const batch = scores.flatMap(score => {
    const userId = score.user_id as string
    const email = emailMap.get(userId)
    if (!email) return []

    return [{
      from: FROM,
      to: email,
      subject: `Week ${week} Oracle results are in`,
      html: buildHtml({
        firstName: getFirstName(profileMap.get(userId) ?? null),
        week,
        rank: (score.global_rank as number) ?? totalParticipants,
        totalParticipants,
        overallScore: score.overall_score as number,
        rankChange: score.rank_change as number | null,
      }),
    }]
  })

  if (batch.length === 0) {
    console.warn('[oracle/emails] No emails to send — users missing email addresses')
    return
  }

  // Send in chunks (Resend batch limit: 100 per call)
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE)
    const { error } = await resend.batch.send(chunk)
    if (error) {
      console.error(`[oracle/emails] Batch send failed (chunk ${Math.floor(i / BATCH_SIZE) + 1}):`, error)
    }
  }

  console.log(`[oracle/emails] Week ${week} — ${batch.length} score emails dispatched`)
}
