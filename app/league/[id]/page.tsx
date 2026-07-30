'use client'
import { use } from 'react'
import { useLeagueDraft } from '@/lib/league/useLeagueDraft'
import { getUserId } from '@/lib/league/identity'
import { LeagueLobby } from '@/components/league/LeagueLobby'
import { LiveDraftBoard } from '@/components/league/LiveDraftBoard'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function LeaguePage({ params }: PageProps) {
  const { id } = use(params)
  const userId = getUserId()
  const { league, members, draft, isPicking, submitPick, myTeamSlot } = useLeagueDraft(id)

  if (!league) {
    return (
      <div className="min-h-screen bg-pmp-black flex items-center justify-center">
        <p className="text-pmp-gray-500 text-sm">Loading...</p>
      </div>
    )
  }

  const handleStartDraft = async () => {
    await fetch(`/api/league/${id}/start`, {
      method: 'POST',
      headers: { 'x-user-id': userId },
    })
  }

  if (league.status === 'lobby') {
    return (
      <LeagueLobby
        league={league}
        members={members}
        userId={userId}
        onStartDraft={handleStartDraft}
      />
    )
  }

  if (draft && (league.status === 'drafting' || league.status === 'paused' || league.status === 'complete')) {
    return (
      <LiveDraftBoard
        leagueId={id}
        draft={draft}
        members={members}
        myTeamSlot={myTeamSlot}
        isPicking={isPicking}
        onPickPlayer={submitPick}
        settings={league.settings}
      />
    )
  }

  return (
    <div className="min-h-screen bg-pmp-black flex items-center justify-center">
      <p className="text-pmp-gray-500 text-sm">Loading draft...</p>
    </div>
  )
}
