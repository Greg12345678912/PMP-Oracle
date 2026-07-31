'use client'
import { useState } from 'react'
import Link from 'next/link'
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
  const isHost = league.hostUserId === userId
  const settings = league.settings as { numTeams: number; scoring: string }

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

  const emptySlots = Math.max(0, settings.numTeams - members.length)

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* Header with back button */}
        <div className="relative text-center">
          <Link href="/league/new" className="absolute left-0 top-1 flex items-center gap-1 text-pmp-gray-600 text-sm hover:text-pmp-gray-500 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <h1 className="text-pmp-white text-xl font-bold">{league.name}</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">
            {settings.scoring?.toUpperCase()} · {settings.numTeams} teams · Snake
          </p>
        </div>

        {/* Invite code — premium feel */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-5 text-center">
          <p className="text-pmp-gray-600 text-[10px] uppercase tracking-[0.2em] mb-3">Invite Code</p>
          <p className="text-pmp-white text-4xl font-bold font-mono tracking-[0.5em] mb-4 select-all">
            {league.inviteCode}
          </p>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 bg-pmp-gray-800 hover:bg-pmp-gray-600 transition-colors text-pmp-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {copied ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-pmp-white"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Copied!
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                Copy Code
              </>
            )}
          </button>
        </div>

        {/* Members list */}
        <div>
          <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest mb-3">
            Players — {members.length} / {settings.numTeams} joined
          </p>
          <div className="flex flex-col gap-1.5">
            {members.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between bg-pmp-gray-900 rounded-lg px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base leading-none">👤</span>
                  <span className="text-pmp-white text-sm font-medium">{m.displayName}</span>
                  {m.userId === league.hostUserId && (
                    <span className="text-pmp-red text-[10px] font-semibold uppercase tracking-wide">Host</span>
                  )}
                </div>
                {m.userId === userId && (
                  <span className="text-pmp-gray-600 text-[10px]">You</span>
                )}
              </div>
            ))}
            {/* Empty slots */}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 border border-dashed border-pmp-gray-800"
              >
                <span className="text-pmp-gray-800 text-base leading-none">＋</span>
                <span className="text-pmp-gray-800 text-sm">Waiting...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Start button (host only) */}
        {isHost ? (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleStart}
              disabled={starting || members.length < 2}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {starting ? 'Starting...' : 'Start Draft'}
            </button>
            <p className="text-pmp-gray-600 text-xs text-center">
              {members.length < 2
                ? 'Need at least 2 players to start'
                : `${members.length} player${members.length === 1 ? '' : 's'} · empty slots will be CPU`}
            </p>
          </div>
        ) : (
          <p className="text-pmp-gray-600 text-sm text-center">
            Waiting for the host to start the draft...
          </p>
        )}
      </div>
    </div>
  )
}
