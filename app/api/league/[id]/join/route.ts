// app/api/league/[id]/join/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, broadcastEvent } from '@/lib/league/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json() as { displayName: string }
  const userId = request.headers.get('x-user-id')

  if (!userId) return NextResponse.json({ error: 'Missing x-user-id' }, { status: 400 })
  if (!body.displayName?.trim()) return NextResponse.json({ error: 'Display name required' }, { status: 400 })

  const db = getServiceClient()

  const { data: league } = await db
    .from('leagues')
    .select('id, status, settings')
    .eq('id', id)
    .single()

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  if (league.status !== 'lobby') return NextResponse.json({ error: 'Draft already started' }, { status: 409 })

  // Check seat count against numTeams
  const { count } = await db
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', id)

  const maxTeams = (league.settings as { numTeams?: number }).numTeams ?? 12
  if ((count ?? 0) >= maxTeams) {
    return NextResponse.json({ error: 'League is full' }, { status: 409 })
  }

  // Upsert: if already a member (e.g. reconnect), just return existing record
  const { data: member, error: memberErr } = await db
    .from('league_members')
    .upsert(
      { league_id: id, user_id: userId, display_name: body.displayName.trim() },
      { onConflict: 'league_id,user_id', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (memberErr || !member) {
    return NextResponse.json({ error: memberErr?.message ?? 'Join failed' }, { status: 500 })
  }

  await broadcastEvent(id, {
    id: crypto.randomUUID(),
    leagueId: id,
    version: 0,
    timestamp: new Date().toISOString(),
    type: 'member_joined',
    payload: { userId, displayName: body.displayName.trim() },
    userId,
  })

  return NextResponse.json({ member })
}
