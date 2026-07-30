'use client'
import { useState } from 'react'
import type { League, LeagueMember } from '@/lib/league/types'

interface LeagueLobbyProps {
  league: League
  members: LeagueMember[]
  userId: string
  onStartDraft: () => Promise<void>
}

export function LeagueLobby({ league, members, userId, onStartDraft }: LeagueLobbyProps) {
  const [starting, setStarting] = useState(false)
  const isHost = league.hostUserId === userId
  const settings = league.settings as { numTeams: number; scoring: string }

  const handleStart = async () => {
    setStarting(true)
    try { await onStartDraft() }
    finally { setStarting(false) }
  }

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-pmp-white text-xl font-bold">{league.name}</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">
            {settings.scoring?.toUpperCase()} · {settings.numTeams} teams · Snake
          </p>
        </div>

        {/* Invite code */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 text-center">
          <p className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-2">Invite Code</p>
          <p className="text-pmp-white text-3xl font-bold font-mono tracking-[0.4em]">
            {league.inviteCode}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(league.inviteCode)}
            className="mt-2 text-pmp-gray-600 text-xs hover:text-pmp-gray-400 transition-colors"
          >
            Copy
          </button>
        </div>

        {/* Members list */}
        <div>
          <p className="text-pmp-gray-600 text-xs uppercase tracking-widest mb-2">
            Members ({members.length} / {settings.numTeams})
          </p>
          <div className="flex flex-col gap-2">
            {members.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between bg-pmp-gray-900 rounded-lg px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-pmp-white text-sm font-medium">{m.displayName}</span>
                  {m.userId === league.hostUserId && (
                    <span className="text-pmp-gray-600 text-[10px] uppercase">Host</span>
                  )}
                </div>
                {m.userId === userId && (
                  <span className="text-pmp-gray-600 text-[10px]">You</span>
                )}
              </div>
            ))}
            {/* Empty slots */}
            {Array.from({ length: Math.max(0, settings.numTeams - members.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-2 bg-pmp-gray-900 rounded-lg px-3 py-2.5 opacity-30"
              >
                <div className="w-2 h-2 rounded-full bg-pmp-gray-600" />
                <span className="text-pmp-gray-600 text-sm">Waiting...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Start button (host only) */}
        {isHost && (
          <button
            onClick={handleStart}
            disabled={starting || members.length < 2}
            className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {starting ? 'Starting...' : `Start Draft (${members.length} / ${settings.numTeams})`}
          </button>
        )}

        {!isHost && (
          <p className="text-pmp-gray-600 text-sm text-center">
            Waiting for the host to start the draft...
          </p>
        )}
      </div>
    </div>
  )
}
