'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'

interface ReviewClientProps {
  rankings: Record<OraclePosition, RankingRow[]>
  locked: boolean
  isSubmitted: boolean
}

export function ReviewClient({ rankings, locked, isSubmitted }: ReviewClientProps) {
  const [entering, setEntering] = useState(false)
  const [entered, setEntered] = useState(isSubmitted)
  const [showWarning, setShowWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const incompletePositions = ORACLE_POSITIONS.filter(
    pos => (rankings[pos]?.length ?? 0) < POSITION_LIST_SIZE[pos]
  )

  const handleEnter = async (force = false) => {
    if (incompletePositions.length > 0 && !force) {
      setShowWarning(true)
      return
    }
    setEntering(true)
    setError(null)
    try {
      const res = await fetch('/api/oracle/rankings/enter', { method: 'POST' })
      if (!res.ok) {
        const { error: err } = await res.json().catch(() => ({ error: 'Failed to enter' }))
        throw new Error(err)
      }
      setEntered(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setEntering(false)
      setShowWarning(false)
    }
  }

  if (entered) {
    return (
      <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 text-center gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-4xl">🎉</p>
          <h1 className="text-pmp-white font-bold text-2xl">You&apos;re officially entered.</h1>
          <p className="text-pmp-gray-500 text-sm">
            Your rankings are saved for the 2026 Oracle Challenge.<br />
            You can edit them until September 9 at kickoff.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Link href="/challenge/rankings" className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white font-semibold py-3 rounded-xl text-sm text-center hover:border-pmp-gray-500 transition-colors">
            Edit My Rankings
          </Link>
          <Link href="/challenge" className="text-pmp-gray-600 text-sm text-center hover:text-pmp-gray-500 transition-colors">
            Back to Oracle Challenge
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col px-4 py-8 max-w-md mx-auto gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
        <h1 className="text-pmp-white font-bold text-xl">Review Your Entry</h1>
        <p className="text-pmp-gray-600 text-sm">Review everything before entering.</p>
      </div>

      {/* Checklist */}
      <div className="flex flex-col gap-2">
        {ORACLE_POSITIONS.map(pos => {
          const count = rankings[pos]?.length ?? 0
          const max = POSITION_LIST_SIZE[pos]
          const complete = count >= max
          return (
            <div key={pos} className="flex items-center justify-between bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-base">{complete ? '✅' : '⏳'}</span>
                <div>
                  <p className={['text-sm font-semibold', complete ? 'text-pmp-white' : 'text-pmp-gray-500'].join(' ')}>
                    {pos} Rankings
                  </p>
                  <p className="text-pmp-gray-600 text-xs">{count} / {max} players ranked</p>
                </div>
              </div>
              {!complete && !locked && (
                <Link href="/challenge/rankings" className="text-pmp-red text-xs font-semibold hover:opacity-80">
                  Complete &rarr;
                </Link>
              )}
            </div>
          )
        })}

        {/* Predictions — Phase 3 placeholder */}
        <div className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 opacity-50">
          <span className="text-base">⏳</span>
          <div>
            <p className="text-pmp-gray-500 text-sm font-semibold">Season Predictions</p>
            <p className="text-pmp-gray-600 text-xs">Coming soon</p>
          </div>
        </div>
      </div>

      {/* Lock date note */}
      <p className="text-pmp-gray-600 text-xs text-center">
        You can continue editing until September 9 at kickoff.<br />
        After that, rankings lock permanently.
      </p>

      {/* Incomplete warning */}
      {showWarning && incompletePositions.length > 0 && (
        <div className="bg-pmp-gray-900 border border-yellow-900/50 rounded-xl px-4 py-4 flex flex-col gap-3">
          <p className="text-yellow-400 text-sm font-semibold">
            ⚠️ You&apos;re entering without {incompletePositions.join(', ')} rankings.
          </p>
          <p className="text-pmp-gray-500 text-xs">
            You can still compete, but you&apos;ll score 0 points for {incompletePositions.length === 1 ? 'that position' : 'those positions'} unless you complete them before September 9 at kickoff.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowWarning(false)}
              className="flex-1 bg-pmp-gray-800 text-pmp-white font-semibold py-2.5 rounded-xl text-sm hover:bg-pmp-gray-700 transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={() => handleEnter(true)}
              disabled={entering}
              className="flex-1 bg-pmp-red text-pmp-white font-bold py-2.5 rounded-xl text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              Enter Anyway
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-pmp-red text-sm text-center">{error}</p>
      )}

      {/* Enter CTA */}
      {!showWarning && !locked && (
        <button
          onClick={() => handleEnter(false)}
          disabled={entering}
          className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm tracking-wide hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {entering ? 'Entering\u2026' : 'Enter the Oracle Challenge'}
        </button>
      )}

      {locked && (
        <p className="text-pmp-gray-600 text-sm text-center">Rankings are locked for the 2026 season.</p>
      )}

      <Link href="/challenge/rankings" className="text-pmp-gray-600 text-xs text-center hover:text-pmp-gray-500 transition-colors">
        &larr; Back to Rankings
      </Link>
    </div>
  )
}
