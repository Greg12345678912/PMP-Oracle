'use client'
import { useState } from 'react'
import { SleeperProvider } from '@/lib/data/sleeper'
import type { DraftSettings, Player } from '@/lib/draft/types'
import { DRAFT_TEAM_OPTIONS } from '@/lib/draft/types'

interface DraftSetupProps {
  onStart: (settings: DraftSettings, players: Player[]) => void
}

const SCORING_LABELS: Record<DraftSettings['scoring'], string> = {
  ppr: 'PPR',
  half_ppr: 'Half PPR',
  standard: 'Standard',
}

const SPEED_LABELS: Record<DraftSettings['speed'], string> = {
  instant: 'Instant (0s)',
  fast: 'Fast (0.5s)',
  normal: 'Normal (1s)',
}

export function DraftSetup({ onStart }: DraftSetupProps) {
  const [numTeams, setNumTeams] = useState(10)
  const [userSlot, setUserSlot] = useState(1)
  const [scoring, setScoring] = useState<DraftSettings['scoring']>('ppr')
  const [speed, setSpeed] = useState<DraftSettings['speed']>('normal')
  const [loading, setLoading] = useState(false)

  const handleTeamsChange = (v: number) => {
    setNumTeams(v)
    if (userSlot > v) setUserSlot(1)
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      const provider = new SleeperProvider()
      const players = await provider.getDraftPlayers()
      const settings: DraftSettings = { numTeams, numRounds: 15, userSlot, scoring, speed }
      onStart(settings, players)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-pmp-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-pmp-white text-2xl font-bold">Mock Draft</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">15 rounds · Snake format</p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Teams</span>
            <select
              aria-label="Teams"
              value={numTeams}
              onChange={e => handleTeamsChange(Number(e.target.value))}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {DRAFT_TEAM_OPTIONS.map(n => (
                <option key={n} value={n}>{n} Teams</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Your Pick Slot</span>
            <select
              aria-label="Your pick slot"
              value={userSlot}
              onChange={e => setUserSlot(Number(e.target.value))}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {Array.from({ length: numTeams }, (_, i) => i + 1).map(slot => (
                <option key={slot} value={slot}>Slot {slot}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Scoring</span>
            <select
              aria-label="Scoring"
              value={scoring}
              onChange={e => setScoring(e.target.value as DraftSettings['scoring'])}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(SCORING_LABELS) as [DraftSettings['scoring'], string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Draft Speed</span>
            <select
              aria-label="Draft Speed"
              value={speed}
              onChange={e => setSpeed(e.target.value as DraftSettings['speed'])}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(SPEED_LABELS) as [DraftSettings['speed'], string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Loading players...' : 'Start Draft'}
        </button>
      </div>
    </div>
  )
}
