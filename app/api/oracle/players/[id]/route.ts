import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { ORACLE_LOCK_DATE } from '@/lib/oracle/constants'
import { getPlayerStats } from '@/lib/oracle/playerStats'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  if (new Date() < ORACLE_LOCK_DATE) {
    return NextResponse.json({ error: 'Rankings not yet public' }, { status: 403 })
  }

  const { id } = await params
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })

  const stats = await getPlayerStats(id, season.id, session?.user.id ?? null)
  if (!stats) {
    return NextResponse.json({ error: 'Player not found in any rankings' }, { status: 404 })
  }

  return NextResponse.json(stats)
}
