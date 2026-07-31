// app/api/league/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/league/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getServiceClient()

  const [leagueRes, membersRes, draftRes] = await Promise.all([
    db.from('leagues').select('*').eq('id', id).single(),
    db.from('league_members').select('*').eq('league_id', id).order('joined_at'),
    db.from('league_drafts').select('*').eq('league_id', id).maybeSingle(),
  ])

  if (leagueRes.error || !leagueRes.data) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 })
  }

  const rawLeague = leagueRes.data
  const league = {
    id: rawLeague.id,
    inviteCode: rawLeague.invite_code,
    name: rawLeague.name,
    hostUserId: rawLeague.host_user_id,
    settings: rawLeague.settings,
    status: rawLeague.status,
    createdAt: rawLeague.created_at,
    updatedAt: rawLeague.updated_at,
  }

  const members = (membersRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    leagueId: m.league_id as string,
    userId: m.user_id as string,
    displayName: m.display_name as string,
    teamSlot: m.team_slot as number | null,
    isReady: m.is_ready as boolean,
    joinedAt: m.joined_at as string,
  }))

  const rawDraft = draftRes.data
  const draft = rawDraft ? {
    leagueId: rawDraft.league_id,
    version: rawDraft.version,
    state: typeof rawDraft.state === 'string' ? JSON.parse(rawDraft.state) : rawDraft.state,
    pickDeadline: rawDraft.pick_deadline ?? null,
  } : null

  return NextResponse.json({ league, members, draft })
}
