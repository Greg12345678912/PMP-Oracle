'use client'
import { useState } from 'react'
import Link from 'next/link'
import { getUserId } from '@/lib/league/identity'
import type { League, LeagueMember } from '@/lib/league/types'

interface LeagueLobbyProps {
  league: League
  members: LeagueMember[]
  userId: string
  onStartDraft: () => Promise<void>
}

export function LeagueLobby({ league, members, userId, onStartDraft }: LeagueLobbyProps) {
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [claimingSlot, setClaimingSlot] = useState(false)
  const isHost = league.hostUserId === userId
  const settings = league.settings as { numTeams: number; scoring: string }
  const numTeams = settings.numTeams

  const me = members.find(m => m.userId === userId)
  const mySlot = me?.teamSlot ?? null
  const takenSlots = new Set(members.map(m => m.teamSlot).filter(Boolean) as number[])
  const allReady = members.every(m => m.teamSlot !== null)

  const handleStart = async () => {
    setStarting(true)
    try { await onStartDraft() }
    finally { setStarting(false) }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(league.inviteCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleClaimSlot = async (slot: number) => {
    if (claimingSlot) return
    setClaimingSlot(true)
    try {
      await fetch(`/api/league/${league.id}/claim-slot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': getUserId() },
        body: JSON.stringify({ teamSlot: slot }),
      })
    } finally {
      setClaimingSlot(false)
    }
  }

  const memberBySlot = (slot: number) => members.find(m => m.teamSlot === slot)

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* Header */}
        <div className="relative text-center">
          <Link href="/league/new" className="absolute left-0 top-1 flex items-center gap-1 text-pmp-gray-600 text-sm hover:text-pmp-gray-500 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <h1 className="text-pmp-white text-xl font-bold">{league.name}</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">
            {settings.scoring?.toUpperCase()} · {numTeams} teams · Snake
          </p>
        </div>

        {/* Invite code */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 text-center">
          <p className="text-pmp-gray-600 text-[10px] uppercase tracking-[0.2em] mb-2">Invite Code</p>
          <p className="text-pmp-white text-3xl font-bold font-mono tracking-[0.4em] mb-3 select-all">
            {league.inviteCode}
          </p>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 bg-pmp-gray-800 hover:bg-pmp-gray-600 transition-colors text-pmp-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {copied ? '✓ Copied!' : 'Copy Code'}
          </button>
        </div>

        {/* Draft order grid */}
        <div>
          <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest mb-3">
            Draft Order — {members.length} / {numTeams} joined
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: numTeams }, (_, i) => i + 1).map(slot => {
              const occupant = memberBySlot(slot)
              const isMe = occupant?.userId === userId
              const isMine = mySlot === slot
              const available = !occupant && !mySlot

              return (
                <button
                  key={slot}
                  onClick={() => available && handleClaimSlot(slot)}
                  disabled={!!occupant || (!!mySlot && !isMine) || claimingSlot}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isMine
                      ? 'bg-pmp-red/10 border border-pmp-red'
                      : occupant
                        ? 'bg-pmp-gray-900 border border-transparent'
                        : available
                          ? 'bg-pmp-gray-900 border border-dashed border-pmp-gray-800 hover:border-pmp-gray-600 cursor-pointer'
                          : 'bg-pmp-gray-900 border border-dashed border-pmp-gray-800 opacity-40 cursor-not-allowed'
                  }`}
                >
                  <span className={`text-xs font-bold w-5 shrink-0 ${isMine ? 'text-pmp-red' : 'text-pmp-gray-600'}`}>
                    #{slot}
                  </span>
                  <span className={`text-sm truncate ${
                    occupant ? 'text-pmp-white font-medium' : 'text-pmp-gray-800'
                  }`}>
                    {occupant ? occupant.displayName : available ? 'Claim' : '—'}
                  </span>
                  {isMe && <span className="ml-auto text-[10px] text-pmp-red font-semibold">You</span>}
                  {occupant?.userId === league.hostUserId && occupant.userId !== userId && (
                    <span className="ml-auto text-[10px] text-pmp-gray-600">Host</span>
                  )}
                </button>
              )
            })}
          </div>
          {!mySlot && (
            <p className="text-pmp-gray-600 text-xs text-center mt-2">Tap a slot to claim your draft position</p>
          )}
        </div>

        {/* Start / waiting */}
        {isHost ? (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleStart}
              disabled={starting || members.length < 2 || !allReady}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {starting ? 'Starting...' : 'Start Draft'}
            </button>
            <p className="text-pmp-gray-600 text-xs text-center">
              {members.length < 2
                ? 'Need at least 2 players to start'
                : !allReady
                  ? 'Everyone must pick a slot first'
                  : `${members.length} player${members.length === 1 ? '' : 's'} · empty slots will be CPU`}
            </p>
          </div>
        ) : (
          <p className="text-pmp-gray-600 text-sm text-center">
            {mySlot ? `You have pick #${mySlot} · waiting for host to start` : 'Waiting for the host to start...'}
          </p>
        )}
      </div>
    </div>
  )
}
