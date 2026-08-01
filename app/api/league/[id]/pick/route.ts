// app/api/league/[id]/pick/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, broadcastEvent } from '@/lib/league/db'
import { DraftService } from '@/lib/league/service'
import { makePick } from '@/lib/draft/engine'
import type { DraftState } from '@/lib/draft/types'
import type { PickMadePayload } from '@/lib/league/types'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const body = await request.json() as { playerId: string; playerName: string; requestId: string }
  const userId = request.headers.get('x-user-id')

  if (!userId) return NextResponse.json({ error: 'Missing x-user-id' }, { status: 400 })
  if (!body.requestId) return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })
  if (!body.playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const db = getServiceClient()

  // Idempotency check: has this requestId already been processed?
  const { data: existingEvent } = await db
    .from('draft_events')
    .select('id')
    .eq('league_id', id)
    .filter('payload->>requestId', 'eq', body.requestId)
    .maybeSingle()

  if (existingEvent) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // Load league + members + current draft state
  const [{ data: league }, { data: members }, { data: draftRow }] = await Promise.all([
    db.from('leagues').select('*').eq('id', id).single(),
    db.from('league_members').select('*').eq('league_id', id),
    db.from('league_drafts').select('*').eq('league_id', id).single(),
  ])

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 })
  if (!draftRow) return NextResponse.json({ error: 'Draft not started' }, { status: 409 })

  const currentState = (typeof draftRow.state === 'string'
    ? JSON.parse(draftRow.state)
    : draftRow.state) as DraftState
  const currentVersion = draftRow.version as number
  const leagueMembers = (members ?? []).map((m: Record<string, unknown>) => ({
    id: m.id as string,
    leagueId: m.league_id as string,
    userId: m.user_id as string,
    displayName: m.display_name as string,
    teamSlot: m.team_slot as number | null,
    isReady: m.is_ready as boolean,
    joinedAt: m.joined_at as string,
  }))

  const validation = DraftService.validatePick({
    state: currentState,
    playerId: body.playerId,
    userId,
    members: leagueMembers,
    leagueStatus: league.status,
  })

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const newState: DraftState = { ...makePick(currentState, body.playerId), version: currentVersion + 1 }
  const currentPick = currentState.picks[currentState.currentPickIndex]

  // Optimistic concurrency: only update if version hasn't changed
  const { data: updatedRows } = await db
    .from('league_drafts')
    .update({
      state: JSON.stringify(newState),
      version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('league_id', id)
    .eq('version', currentVersion)
    .select('league_id')

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json(
      { error: 'Concurrent pick detected — please try again' },
      { status: 409 }
    )
  }

  const isComplete = newState.status === 'complete'

  if (isComplete) {
    await db.from('leagues').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', id)
  }

  const eventPayload: PickMadePayload = {
    overallPick: currentPick.overallPick,
    playerId: body.playerId,
    playerName: body.playerName,
    teamSlot: currentPick.currentOwnerTeamSlot,
    requestId: body.requestId,
    state: newState,
  }

  // Insert into immutable event log
  const eventType = isComplete ? 'draft_complete' : 'pick_made'
  await db.from('draft_events').insert({
    league_id: id,
    version: currentVersion + 1,
    type: eventType,
    payload: eventPayload,
    user_id: userId,
  })
  await broadcastEvent(id, {
    id: crypto.randomUUID(),
    leagueId: id,
    version: currentVersion + 1,
    timestamp: new Date().toISOString(),
    type: eventType,
    payload: eventPayload,
    userId,
  })

  // CPU auto-pick: chain picks for any slots with no real member until we hit a human turn
  if (!isComplete) {
    let chainState = newState
    let chainVersion = currentVersion + 1

    while (chainState.status !== 'complete') {
      const nextPick = chainState.picks[chainState.currentPickIndex]
      if (!nextPick) break
      const hasRealMember = leagueMembers.some(m => m.teamSlot === nextPick.currentOwnerTeamSlot)
      if (hasRealMember) break

      // CPU picks best available (first in ADP-sorted list)
      const bestPlayerId = chainState.availablePlayerIds[0]
      if (!bestPlayerId) break

      chainVersion++
      const cpuState: DraftState = { ...makePick(chainState, bestPlayerId), version: chainVersion }

      const { data: cpuRows } = await db
        .from('league_drafts')
        .update({ state: JSON.stringify(cpuState), version: chainVersion, updated_at: new Date().toISOString() })
        .eq('league_id', id)
        .eq('version', chainVersion - 1)
        .select('league_id')

      if (!cpuRows || cpuRows.length === 0) break // concurrent pick, stop chain

      const cpuComplete = cpuState.status === 'complete'
      if (cpuComplete) {
        await db.from('leagues').update({ status: 'complete', updated_at: new Date().toISOString() }).eq('id', id)
      }

      const cpuPayload: PickMadePayload = {
        overallPick: nextPick.overallPick,
        playerId: bestPlayerId,
        playerName: '',
        teamSlot: nextPick.currentOwnerTeamSlot,
        requestId: crypto.randomUUID(),
        state: cpuState,
      }
      const cpuEventType = cpuComplete ? 'draft_complete' : 'pick_made'
      await db.from('draft_events').insert({
        league_id: id, version: chainVersion, type: cpuEventType, payload: cpuPayload, user_id: 'cpu',
      })
      await broadcastEvent(id, {
        id: crypto.randomUUID(), leagueId: id, version: chainVersion,
        timestamp: new Date().toISOString(), type: cpuEventType, payload: cpuPayload, userId: 'cpu',
      })

      chainState = cpuState
      if (cpuComplete) break
    }
  }

  return NextResponse.json({ ok: true })
}
