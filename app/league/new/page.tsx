'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getUserId, getDisplayName, setDisplayName } from '@/lib/league/identity'
import { DEFAULT_LINEUP } from '@/lib/draft/types'
import type { DraftSettings } from '@/lib/draft/types'

const DEFAULT_SETTINGS: DraftSettings = {
  numTeams: 10, numRounds: 15, userSlot: 1, scoring: 'ppr', speed: 'normal',
  lineup: DEFAULT_LINEUP,
}

export default function LeagueNewPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [displayName, setDisplayNameState] = useState(getDisplayName() ?? '')
  const [inviteCode, setInviteCode] = useState('')
  const [scoring, setScoring] = useState<DraftSettings['scoring']>('ppr')
  const [numTeams, setNumTeams] = useState(10)
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
        body: JSON.stringify({ name, displayName, settings: { ...DEFAULT_SETTINGS, scoring, numTeams } }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setDisplayName(displayName)
      router.push(`/league/${data.leagueId}`)
    } finally { setLoading(false) }
  }

  const handleJoin = async () => {
    if (!inviteCode.trim() || !displayName.trim()) { setError('Invite code and display name required'); return }
    setLoading(true); setError('')
    try {
      // Resolve invite code → league id
      const resolveRes = await fetch(`/api/league/by-code/${inviteCode.toUpperCase().trim()}`)
      if (!resolveRes.ok) { setError('Invalid invite code'); return }
      const { leagueId } = await resolveRes.json()
      const joinRes = await fetch(`/api/league/${leagueId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ displayName }),
      })
      const data = await joinRes.json()
      if (!joinRes.ok) { setError(data.error); return }
      setDisplayName(displayName)
      router.push(`/league/${leagueId}`)
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
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create League'}
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
              onClick={handleJoin}
              disabled={loading}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join League'}
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
