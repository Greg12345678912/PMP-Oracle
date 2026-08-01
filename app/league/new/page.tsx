'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getUserId, getDisplayName, setDisplayName } from '@/lib/league/identity'
import { DEFAULT_LINEUP } from '@/lib/draft/types'
import type { DraftSettings, LineupConfig } from '@/lib/draft/types'

const DEFAULT_SETTINGS: DraftSettings = {
  numTeams: 10, numRounds: 15, userSlot: 1, scoring: 'ppr', speed: 'normal',
  lineup: DEFAULT_LINEUP,
}

const LINEUP_PRESETS: Record<string, { label: string; lineup: LineupConfig }> = {
  espn:    { label: 'ESPN',    lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 } },
  sleeper: { label: 'Sleeper', lineup: { QB:1, RB:2, WR:3, TE:1, FLEX:1, K:0, DEF:1, BN:6 } },
  yahoo:   { label: 'Yahoo',   lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 } },
}

export default function LeagueNewPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [displayName, setDisplayNameState] = useState(getDisplayName() ?? '')
  const [inviteCode, setInviteCode] = useState('')
  const [scoring, setScoring] = useState<DraftSettings['scoring']>('ppr')
  const [numTeams, setNumTeams] = useState(10)
  const [lineup, setLineup] = useState<LineupConfig>(DEFAULT_LINEUP)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const userId = getUserId()

  const handleCreate = async () => {
    if (!name.trim() || !displayName.trim()) { setError('Name and display name required'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/league', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ name, displayName, settings: { ...DEFAULT_SETTINGS, scoring, numTeams, lineup } }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setDisplayName(displayName)
      router.push(`/league/${data.leagueId}`)
    } finally { setLoading(false) }
  }

  // Join flow state: null = step 1 (enter code), object = step 2 (pick slot)
  const [joinLeague, setJoinLeague] = useState<{ leagueId: string; numTeams: number; takenSlots: number[] } | null>(null)
  const [pickedSlot, setPickedSlot] = useState<number | null>(null)

  const handleFindLeague = async () => {
    if (!inviteCode.trim() || !displayName.trim()) { setError('Invite code and display name required'); return }
    setLoading(true); setError('')
    try {
      const resolveRes = await fetch(`/api/league/by-code/${inviteCode.toUpperCase().trim()}`)
      if (!resolveRes.ok) { const d = await resolveRes.json(); setError(d.error ?? 'Invalid invite code'); return }
      const data = await resolveRes.json()
      setJoinLeague(data)
      setPickedSlot(null)
    } finally { setLoading(false) }
  }

  const handleJoin = async () => {
    if (!joinLeague || !pickedSlot) { setError('Pick a draft position first'); return }
    setLoading(true); setError('')
    try {
      const joinRes = await fetch(`/api/league/${joinLeague.leagueId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ displayName, teamSlot: pickedSlot }),
      })
      const data = await joinRes.json()
      if (!joinRes.ok) { setError(data.error); return }
      setDisplayName(displayName)
      router.push(`/league/${joinLeague.leagueId}`)
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-pmp-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="relative text-center">
          <Link href="/" className="absolute left-0 top-1 flex items-center gap-1 text-pmp-gray-600 text-sm hover:text-pmp-gray-500 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back
          </Link>
          <h1 className="text-pmp-white text-2xl font-bold">Live Draft</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">Draft with friends in real time</p>
        </div>

        {/* Tab toggle */}
        <div className="flex border border-pmp-gray-800 rounded-lg overflow-hidden">
          {(['create', 'join'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                tab === t ? 'bg-pmp-red text-pmp-white' : 'text-pmp-gray-500 hover:text-pmp-gray-500'
              }`}
            >
              {t === 'create' ? 'Create League' : 'Join League'}
            </button>
          ))}
        </div>

        {/* Display name (shared between tabs) */}
        <label className="flex flex-col gap-1">
          <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Your Name</span>
          <input
            value={displayName}
            onChange={e => setDisplayNameState(e.target.value)}
            placeholder="e.g. Greg"
            className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm placeholder-pmp-gray-600"
          />
        </label>

        {tab === 'create' ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">League Name</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. The Boys 2026"
                className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm placeholder-pmp-gray-600"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Scoring</span>
              <select
                value={scoring}
                onChange={e => setScoring(e.target.value as DraftSettings['scoring'])}
                className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="ppr">PPR</option>
                <option value="half_ppr">Half PPR</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Teams</span>
              <select
                value={numTeams}
                onChange={e => setNumTeams(Number(e.target.value))}
                className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
              >
                {[8, 10, 12].map(n => <option key={n} value={n}>{n} Teams</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Lineup</span>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(LINEUP_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLineup(preset.lineup)}
                    className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${
                      JSON.stringify(lineup) === JSON.stringify(preset.lineup)
                        ? 'border-pmp-red bg-[#1a0505] text-pmp-white'
                        : 'border-pmp-gray-800 bg-pmp-gray-900 text-pmp-gray-500 hover:text-pmp-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create League'}
            </button>
          </>
        ) : joinLeague ? (
          <>
            <div className="text-center">
              <p className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-1">Pick your draft position</p>
              <p className="text-pmp-gray-600 text-xs">{joinLeague.numTeams} teams · pick a slot</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: joinLeague.numTeams }, (_, i) => i + 1).map(slot => {
                const taken = joinLeague.takenSlots.includes(slot)
                return (
                  <button
                    key={slot}
                    onClick={() => !taken && setPickedSlot(slot)}
                    disabled={taken}
                    className={`py-3 rounded-lg text-sm font-bold transition-colors ${
                      taken
                        ? 'bg-pmp-gray-900 text-pmp-gray-800 cursor-not-allowed'
                        : pickedSlot === slot
                          ? 'bg-pmp-red text-pmp-white'
                          : 'bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-gray-500 hover:text-pmp-white hover:border-pmp-gray-600'
                    }`}
                  >
                    #{slot}
                  </button>
                )
              })}
            </div>
            <button
              onClick={handleJoin}
              disabled={loading || !pickedSlot}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Joining...' : pickedSlot ? `Join as Pick #${pickedSlot}` : 'Select a position'}
            </button>
            <button onClick={() => { setJoinLeague(null); setError('') }} className="text-pmp-gray-600 text-xs text-center hover:text-pmp-gray-500">
              ← Back
            </button>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Invite Code</span>
              <input
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm placeholder-pmp-gray-600 font-mono text-center tracking-[0.3em] text-lg uppercase"
              />
            </label>
            <button
              onClick={handleFindLeague}
              disabled={loading}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Finding...' : 'Find League'}
            </button>
          </>
        )}

        {error && <p className="text-pmp-red text-sm text-center">{error}</p>}

        <p className="text-center">
          <a href="/mock-draft" className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500">
            Solo Mock Draft instead →
          </a>
        </p>
      </div>
    </div>
  )
}
