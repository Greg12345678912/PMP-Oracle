// app/api/league/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/league/db'
import { generateInviteCode } from '@/lib/league/service'
import type { DraftSettings } from '@/lib/draft/types'

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    name: string
    settings: DraftSettings
    displayName: string
  }
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Missing x-user-id' }, { status: 400 })
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (!body.displayName?.trim()) return NextResponse.json({ error: 'Display name required' }, { status: 400 })

  const db = getServiceClient()
  const inviteCode = generateInviteCode()

  const { data: league, error: leagueErr } = await db
    .from('leagues')
    .insert({
      invite_code: inviteCode,
      name: body.name.trim(),
      host_user_id: userId,
      settings: body.settings,
      status: 'lobby',
    })
    .select('id, invite_code')
    .single()

  if (leagueErr || !league) {
    return NextResponse.json({ error: leagueErr?.message ?? 'Failed to create league' }, { status: 500 })
  }

  // Host auto-joins as first member
  const { error: memberErr } = await db.from('league_members').insert({
    league_id: league.id,
    user_id: userId,
    display_name: body.displayName.trim(),
    is_ready: true,
  })

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 })
  }

  return NextResponse.json({ leagueId: league.id, inviteCode: league.invite_code })
}
