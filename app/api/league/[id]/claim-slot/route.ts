// app/api/league/[id]/claim-slot/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, broadcastEvent } from '@/lib/league/db'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const body = await request.json() as { teamSlot: number }
  const userId = request.headers.get('x-user-id')

  if (!userId) return NextResponse.json({ error: 'Missing x-user-id' }, { status: 400 })
  if (!body.teamSlot) return NextResponse.json({ error: 'Missing teamSlot' }, { status: 400 })

  const db = getServiceClient()

  const { data: league } = await db
    .from('leagues')
    .select('settings, status')
    .eq('id', id)
    .single()

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  if (league.status !== 'lobby') return NextResponse.json({ error: 'Draft already started' }, { status: 409 })

  const maxTeams = (league.settings as { numTeams?: number }).numTeams ?? 12
  if (body.teamSlot < 1 || body.teamSlot > maxTeams) {
    return NextResponse.json({ error: 'Invalid slot' }, { status: 400 })
  }

  // Check slot is not taken by someone else
  const { count } = await db
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', id)
    .eq('team_slot', body.teamSlot)
    .neq('user_id', userId)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Slot already taken' }, { status: 409 })
  }

  const { error: updateErr } = await db
    .from('league_members')
    .update({ team_slot: body.teamSlot })
    .eq('league_id', id)
    .eq('user_id', userId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await broadcastEvent(id, {
    id: crypto.randomUUID(),
    leagueId: id,
    version: 0,
    timestamp: new Date().toISOString(),
    type: 'slot_claimed',
    payload: { userId, teamSlot: body.teamSlot },
    userId,
  })

  return NextResponse.json({ ok: true })
}
