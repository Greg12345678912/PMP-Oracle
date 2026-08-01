import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'

interface RouteContext { params: Promise<{ year: string }> }

interface ImportRow {
  rank: number
  playerId: string
  playerName: string
  pprPoints?: number
}

interface ImportBody {
  position: string
  source: string
  rows: ImportRow[]
}

export async function POST(request: NextRequest, { params }: RouteContext) {
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

  const body = (await request.json()) as ImportBody

  // Delete existing ground truth for this position then re-insert
  await db
    .from('ground_truth')
    .delete()
    .eq('season_id', (season as { id: string }).id)
    .eq('position', body.position)

  await db.from('ground_truth').insert(
    body.rows.map(r => ({
      season_id: (season as { id: string }).id,
      position: body.position,
      rank: r.rank,
      player_id: r.playerId,
      player_name: r.playerName,
      ppr_points: r.pprPoints ?? null,
      source: body.source,
    })),
  )

  return NextResponse.json({ ok: true, imported: body.rows.length })
}
