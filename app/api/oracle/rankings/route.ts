import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getRankings, upsertRankings, validateRankings } from '@/lib/oracle/rankings'
import type { OraclePosition } from '@/lib/oracle/constants'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'
import { getServiceClient } from '@/lib/league/db'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ rankings: [] })

  const position = request.nextUrl.searchParams.get('position') as OraclePosition | null
  if (!position || !ORACLE_POSITIONS.includes(position)) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
  }

  const targetUserId = request.nextUrl.searchParams.get('userId') ?? session.user.id
  const isOwner = targetUserId === session.user.id

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ rankings: [] })

  // Non-negotiable product rule: rankings are private until lock date
  if (!isOwner && !isLocked(season)) {
    return NextResponse.json({ error: 'Rankings are private until lock date' }, { status: 403 })
  }

  // After lock, non-owners can only view public rankings
  if (!isOwner) {
    const db = getServiceClient()
    const { data } = await db
      .from('challenge_rankings')
      .select('rankings, is_public')
      .eq('user_id', targetUserId)
      .eq('season_id', season.id)
      .eq('position', position)
      .maybeSingle()
    if (!data || !data.is_public) {
      return NextResponse.json({ error: 'Rankings not found or not public' }, { status: 404 })
    }
    return NextResponse.json({ rankings: data.rankings as RankingRow[] })
  }

  const rankings = await getRankings(session.user.id, season.id, position)
  return NextResponse.json({ rankings })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to save rankings' }, { status: 401 })

  let body: { position: OraclePosition; rankings: RankingRow[] }
  try {
    body = await request.json() as { position: OraclePosition; rankings: RankingRow[] }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.position || !ORACLE_POSITIONS.includes(body.position)) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
  }

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })

  // Single source of truth: DB season lock date
  if (isLocked(season)) {
    return NextResponse.json({ error: 'Rankings are locked' }, { status: 423 })
  }

  if (!Array.isArray(body.rankings)) {
    return NextResponse.json({ error: 'rankings must be an array' }, { status: 400 })
  }

  const validation = validateRankings(body.position, body.rankings)
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

  await upsertRankings(session.user.id, season.id, body.position, body.rankings)
  return NextResponse.json({ ok: true })
}
