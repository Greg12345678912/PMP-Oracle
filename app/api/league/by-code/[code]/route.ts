// app/api/league/by-code/[code]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/league/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const db = getServiceClient()

  const { data, error } = await db
    .from('leagues')
    .select('id, settings, status')
    .eq('invite_code', code.toUpperCase())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 })
  }

  if (data.status !== 'lobby') {
    return NextResponse.json({ error: 'Draft already started' }, { status: 409 })
  }

  const numTeams = (data.settings as { numTeams?: number }).numTeams ?? 12

  const { data: members } = await db
    .from('league_members')
    .select('team_slot')
    .eq('league_id', data.id)
    .not('team_slot', 'is', null)

  const takenSlots = (members ?? []).map((m: Record<string, unknown>) => m.team_slot as number)

  return NextResponse.json({ leagueId: data.id, numTeams, takenSlots })
}
