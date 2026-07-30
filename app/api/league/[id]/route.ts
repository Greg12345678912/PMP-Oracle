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

  return NextResponse.json({
    league: leagueRes.data,
    members: membersRes.data ?? [],
    draft: draftRes.data ?? null,
  })
}
