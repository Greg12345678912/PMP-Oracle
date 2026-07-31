// app/api/league/[id]/start/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, broadcastEvent } from '@/lib/league/db'
import { DraftService } from '@/lib/league/service'
import { SleeperProvider } from '@/lib/data/sleeper'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Missing x-user-id' }, { status: 400 })

  const db = getServiceClient()

  const { data: league } = await db
    .from('leagues')
    .select('*')
    .eq('id', id)
    .single()

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  if (league.host_user_id !== userId) return NextResponse.json({ error: 'Only the host can start the draft' }, { status: 403 })
  if (league.status !== 'lobby') return NextResponse.json({ error: 'Draft already started' }, { status: 409 })

  const { data: members } = await db
    .from('league_members')
    .select('*')
    .eq('league_id', id)

  if (!members || members.length < 2) {
    return NextResponse.json({ error: 'At least 2 members required' }, { status: 400 })
  }

  // Fetch players server-side (same as solo draft setup)
  const provider = new SleeperProvider()
  const scoring = (league.settings as { scoring?: string }).scoring ?? 'ppr'
  const players = await provider.getDraftPlayers(scoring as 'ppr' | 'half_ppr' | 'standard')

  const { state, membersWithSlots } = DraftService.initializeDraft({
    settings: league.settings as Parameters<typeof DraftService.initializeDraft>[0]['settings'],
    players,
    members: members.map((m: Record<string, unknown>) => ({
      id: m.id as string,
      leagueId: m.league_id as string,
      userId: m.user_id as string,
      displayName: m.display_name as string,
      teamSlot: m.team_slot as number | null,
      isReady: m.is_ready as boolean,
      joinedAt: m.joined_at as string,
    })),
  })

  // Update team slots for all members
  await Promise.all(membersWithSlots.map(m =>
    db.from('league_members').update({ team_slot: m.teamSlot }).eq('id', m.id)
  ))

  // Write initial draft state (upsert to guard against double-click / concurrent requests)
  await db.from('league_drafts').upsert(
    { league_id: id, version: 0, state: JSON.stringify(state), pick_deadline: null },
    { onConflict: 'league_id', ignoreDuplicates: true }
  )

  // Update league status
  await db.from('leagues').update({ status: 'drafting', updated_at: new Date().toISOString() }).eq('id', id)

  // Insert draft_started event
  await db.from('draft_events').insert({
    league_id: id,
    version: 0,
    type: 'draft_started',
    payload: { members: membersWithSlots },
    user_id: userId,
  })

  await broadcastEvent(id, {
    id: crypto.randomUUID(),
    leagueId: id,
    version: 0,
    timestamp: new Date().toISOString(),
    type: 'draft_started',
    payload: { state, members: membersWithSlots },
    userId,
  })

  return NextResponse.json({ ok: true })
}
