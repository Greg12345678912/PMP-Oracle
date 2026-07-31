'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getUserId } from '@/lib/league/identity'
import type {
  League,
  LeagueMember,
  LeagueDraft,
  DraftEvent,
  PickMadePayload,
  DraftStartedPayload,
  MemberJoinedPayload,
} from '@/lib/league/types'

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

interface LeagueDraftState {
  league: League | null
  members: LeagueMember[]
  draft: LeagueDraft | null
  isPicking: boolean
  myTeamSlot: number | null
  submitPick: (playerId: string, playerName: string) => Promise<void>
}

export function useLeagueDraft(leagueId: string): LeagueDraftState {
  const [league, setLeague] = useState<League | null>(null)
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [draft, setDraft] = useState<LeagueDraft | null>(null)
  const [isPicking, setIsPicking] = useState(false)
  const userId = getUserId()
  // Keep userId stable in refs so callbacks don't need to re-create on identity changes
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const myTeamSlot = members.find(m => m.userId === userId)?.teamSlot ?? null

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/league/${leagueId}`, {
      headers: { 'x-user-id': userIdRef.current },
    })
    if (!res.ok) return
    const data = await res.json() as {
      league: League
      members: LeagueMember[]
      draft: LeagueDraft | null
    }
    setLeague(data.league)
    setMembers(data.members)
    setDraft(data.draft)
  }, [leagueId])

  // Initial data fetch
  useEffect(() => {
    fetchState()
  }, [fetchState])

  // Realtime subscription
  useEffect(() => {
    const db = getAnonClient()
    const channel = db.channel(`draft:${leagueId}`)

    channel
      .on('broadcast', { event: '*' }, ({ payload }) => {
        const event = payload as DraftEvent

        if (event.type === 'pick_made') {
          const p = event.payload as PickMadePayload
          setDraft(prev =>
            prev && event.version > prev.version
              ? { ...prev, version: event.version, state: p.state }
              : prev,
          )
        }

        if (event.type === 'draft_started') {
          const p = event.payload as DraftStartedPayload
          // members now have assigned teamSlots from the server
          setMembers(p.members)
          setDraft({
            leagueId,
            version: event.version,
            state: p.state,
            pickDeadline: null,
            updatedAt: event.timestamp,
          })
          setLeague(prev => prev ? { ...prev, status: 'drafting' } : null)
        }

        if (event.type === 'member_joined') {
          const p = event.payload as MemberJoinedPayload
          // Deduplicate by userId — fires on every reconnect so we must not append blindly
          setMembers(prev => {
            const exists = prev.some(m => m.userId === p.userId)
            if (exists) {
              // Update display name in case it changed, keep other fields
              return prev.map(m =>
                m.userId === p.userId ? { ...m, displayName: p.displayName } : m,
              )
            }
            // New member — synthesise a LeagueMember with safe defaults;
            // the server will confirm full data on next fetchState
            const newMember: LeagueMember = {
              id: p.userId,
              leagueId,
              userId: p.userId,
              displayName: p.displayName,
              teamSlot: null,
              isReady: false,
              joinedAt: event.timestamp,
            }
            return [...prev, newMember]
          })
        }

        if (event.type === 'draft_complete') {
          const p = event.payload as PickMadePayload
          setDraft(prev =>
            prev && event.version > prev.version
              ? { ...prev, version: event.version, state: p.state }
              : prev,
          )
          setLeague(prev => prev ? { ...prev, status: 'complete' } : null)
          fetchState() // background cleanup
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Re-fetch on reconnect to patch any missed events
          fetchState()
        }
      })

    return () => {
      db.removeChannel(channel)
    }
  }, [leagueId, fetchState])

  const submitPick = useCallback(async (playerId: string, playerName: string) => {
    setIsPicking(true)
    try {
      const requestId = crypto.randomUUID()
      const res = await fetch(`/api/league/${leagueId}/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userIdRef.current,
        },
        body: JSON.stringify({ playerId, playerName, requestId }),
      })
      if (!res.ok) {
        const err = await res.json()
        console.error('Pick rejected:', err.error)
        // State self-corrects via next broadcast — no optimistic local update
      }
      // Do NOT update local state here; wait for server to broadcast pick_made
    } finally {
      setIsPicking(false)
    }
  }, [leagueId])

  return { league, members, draft, isPicking, myTeamSlot, submitPick }
}
