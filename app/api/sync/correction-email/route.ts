/**
 * One-time Week 5 correction email endpoint.
 * DELETE THIS FILE after use.
 *
 * Trigger: POST https://www.prettymuchpicks.ca/api/sync/correction-email
 *   -H "Authorization: Bearer $CRON_SECRET"
 */
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getServiceClient } from '@/lib/league/db'

const SEASON_ID = 'e9929112-9137-4393-b983-3b52624712a2'
const WEEK = 5
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
  rank: number
  totalParticipants: number
  overallScore: number
  rankChange: number | null
}): string {
  const { firstName, rank, totalParticipants, overallScore, rankChange } = params
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
    <p style="color:#888;font-size:16px;margin:0 0 24px;">Week ${WEEK} Stat Correction</p>
    <p style="color:#666;font-size:14px;margin:0 0 32px;">We found an error in Week ${WEEK}'s stats and have corrected the rankings. Here are your updated results.</p>

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

export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  const resend = new Resend(process.env.RESEND_API_KEY!)

  const { data: scores, error: scoresError } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score, global_rank, rank_change')
    .eq('season_id', SEASON_ID)
    .order('global_rank', { ascending: true })

  if (scoresError || !scores || scores.length === 0) {
    return NextResponse.json({ error: 'Failed to fetch scores', detail: scoresError?.message }, { status: 500 })
  }

  const totalParticipants = scores.length
  const userIds = scores.map(s => s.user_id as string)

  const { data: profiles } = await db
    .from('user_profiles')
    .select('user_id, display_name')
    .in('user_id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map(p => [p.user_id as string, p.display_name as string | null]),
  )

  const { data: usersData, error: usersError } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (usersError) {
    return NextResponse.json({ error: 'Failed to fetch auth users', detail: usersError.message }, { status: 500 })
  }

  const emailMap = new Map(usersData.users.map(u => [u.id, u.email ?? null]))

  const batch = scores.flatMap(score => {
    const userId = score.user_id as string
    const email = emailMap.get(userId)
    if (!email) return []
    return [{
      from: FROM,
      to: email,
      subject: `Week ${WEEK} Stat Correction — Your Updated Results`,
      html: buildHtml({
        firstName: getFirstName(profileMap.get(userId) ?? null),
        rank: (score.global_rank as number) ?? totalParticipants,
        totalParticipants,
        overallScore: score.overall_score as number,
        rankChange: score.rank_change as number | null,
      }),
    }]
  })

  let sent = 0
  let failed = 0
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE)
    const { error } = await resend.batch.send(chunk)
    if (error) {
      failed += chunk.length
    } else {
      sent += chunk.length
    }
  }

  return NextResponse.json({ sent, failed, total: batch.length })
}
