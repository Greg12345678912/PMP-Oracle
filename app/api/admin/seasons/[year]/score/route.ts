import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'
import { scoreUser } from '@/lib/oracle/scoring'

interface RouteContext { params: Promise<{ year: string }> }

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { year } = await params

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getServiceClient()
  const { data: season } = await db
    .from('seasons')
    .select('id')
    .eq('year', Number(year))
    .single()
  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  const seasonId = (season as { id: string }).id

  // Fetch all users who have submitted rankings for this season
  const { data: submitters } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('season_id', seasonId)

  const uniqueUserIds = [
    ...new Set(
      (submitters ?? []).map((r: { user_id: string }) => r.user_id),
    ),
  ]

  // Score each user sequentially to avoid DB overload
  let scored = 0
  for (const userId of uniqueUserIds) {
    await scoreUser(userId, seasonId)
    scored++
  }

  // Assign global ranks by overall_score descending
  const { data: scores } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score')
    .eq('season_id', seasonId)
    .order('overall_score', { ascending: false })

  for (let i = 0; i < (scores ?? []).length; i++) {
    const s = (scores as Array<{ user_id: string; overall_score: number }>)[i]
    await db
      .from('accuracy_scores')
      .update({ global_rank: i + 1 })
      .eq('user_id', s.user_id)
      .eq('season_id', seasonId)
  }

  // Mark the season as scored
  await db
    .from('seasons')
    .update({ status: 'scored', scored_at: new Date().toISOString() })
    .eq('id', seasonId)

  return NextResponse.json({ ok: true, scored })
}
