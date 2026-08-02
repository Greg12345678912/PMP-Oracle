'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'
import { Countdown } from '@/components/oracle/Countdown'

interface ReviewClientProps {
  rankings: Record<OraclePosition, RankingRow[]>
  locked: boolean
  isSubmitted: boolean
  username: string | null
  lockAt: string
}

export function ReviewClient({ rankings, locked, isSubmitted, username, lockAt }: ReviewClientProps) {
  const [entering, setEntering] = useState(false)
  // Always start on the review form — trophy screen only appears after actively submitting.
  // Submission is not a lock; the lock date controls editability.
  const [entered, setEntered] = useState(false)
  const [entryNumber, setEntryNumber] = useState<number | null>(null)
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
      const data = await res.json().catch(() => ({}))
      setEntryNumber((data as { entryNumber?: number }).entryNumber ?? null)
      setEntered(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setEntering(false)
      setShowWarning(false)
    }
  }

  const handleShare = async () => {
    const profileUrl = username
      ? `${window.location.origin}/u/${username}`
      : `${window.location.origin}/challenge`
    const shareText = entryNumber
      ? `I just entered the 2026 Oracle Challenge — Entry #${entryNumber.toLocaleString()}. $500 to the best ranker. Can you beat me?`
      : 'I just entered the 2026 Oracle Challenge. $500 to the best ranker. Can you beat me?'
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title: 'Pretty Much Picks — Oracle Challenge', text: shareText, url: profileUrl }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(`${shareText} ${profileUrl}`).catch(() => {})
    }
  }

  if (entered) {
    return (
      <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-xs flex flex-col gap-6">

          {/* Header */}
          <div className="text-center flex flex-col gap-1">
            <p className="text-3xl">{isSubmitted ? '✅' : '🏆'}</p>
            <h1 className="text-pmp-white font-black text-2xl mt-2">
              {isSubmitted ? 'Rankings Updated.' : 'You\u2019re officially in.'}
            </h1>
            <p className="text-pmp-gray-600 text-sm">
              {isSubmitted
                ? 'Your Oracle entry has been updated.'
                : '2026 Oracle Challenge'}
            </p>
          </div>

          {/* Entry receipt card */}
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl overflow-hidden">
            {/* Entry number — hero row */}
            <div className="px-5 py-6 border-b border-dashed border-pmp-gray-800 flex items-center justify-between">
              <span className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Entry</span>
              <span className="text-pmp-red font-black text-5xl leading-none">
                #{entryNumber ? entryNumber.toLocaleString() : '—'}
              </span>
            </div>

            {/* Receipt rows */}
            <div className="px-5 py-4 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <span className="text-pmp-gray-500 text-sm">Rankings locked</span>
                <span className="text-pmp-white text-sm font-semibold">Sep 9 · 5:00 PM ET</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-pmp-gray-500 text-sm">Standings update</span>
                <span className="text-pmp-white text-sm font-semibold">Every Tuesday after Week 1</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-pmp-gray-500 text-sm">First place</span>
                <span className="text-pmp-white text-sm font-semibold">$500</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-pmp-gray-500 text-sm">Entry fee</span>
                <span className="text-green-400 text-sm font-semibold">Free</span>
              </div>
            </div>
          </div>

          <p className="text-pmp-gray-600 text-xs text-center leading-relaxed">
            Your opinions become your reputation.
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleShare}
              className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm hover:opacity-90 transition-opacity active:scale-[0.98]"
            >
              Share Your Entry
            </button>
            <Link
              href="/challenge/leaderboard"
              className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white font-semibold py-3 rounded-xl text-sm text-center hover:border-pmp-gray-500 transition-colors"
            >
              See the Competition →
            </Link>
            {username && (
              <Link
                href={`/u/${username}`}
                className="text-pmp-gray-500 text-sm text-center hover:text-pmp-gray-300 transition-colors py-1"
              >
                View Your Profile →
              </Link>
            )}
            <Link
              href="/challenge/rankings"
              className="text-pmp-gray-700 text-xs text-center hover:text-pmp-gray-500 transition-colors py-1"
            >
              Edit Rankings (until Sep 9)
            </Link>
          </div>

        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col px-4 py-8 max-w-md mx-auto gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge (PPR)</p>
        <h1 className="text-pmp-white font-bold text-xl">Review Your Entry</h1>
        <p className="text-pmp-gray-600 text-sm">Review everything before entering.</p>
      </div>

      {/* Rankings checklist */}
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
              {!locked && (
                <Link href="/challenge/rankings" className="text-pmp-red text-xs font-semibold hover:opacity-80">
                  {complete ? 'Edit \u2192' : 'Complete \u2192'}
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {/* Entry details card */}
      <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex flex-col gap-4">
        <p className="text-pmp-white font-bold text-sm">Entry Details</p>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-pmp-gray-500 text-sm">Entry Fee</span>
            <span className="text-green-400 text-sm font-semibold">Free</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-pmp-gray-500 text-sm">Prize</span>
            <span className="text-pmp-white text-sm font-semibold">$500</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-pmp-gray-500 text-sm">Rankings Lock</span>
            <span className="text-pmp-white text-sm font-semibold">September 9 · 5:00 PM ET</span>
          </div>
        </div>
        {!locked && (
          <div className="pt-1 border-t border-pmp-gray-800">
            <p className="text-pmp-gray-600 text-xs mb-3">Time remaining to edit</p>
            <Countdown lockDate={lockAt} />
          </div>
        )}
      </div>

      {/* Lock date note */}
      <p className="text-pmp-gray-600 text-xs text-center">
        You can continue editing until September 9 at 5:00 PM ET.<br />
        After that, rankings lock permanently.
      </p>

      {/* Incomplete warning */}
      {showWarning && incompletePositions.length > 0 && (
        <div className="bg-pmp-gray-900 border border-yellow-900/50 rounded-xl px-4 py-4 flex flex-col gap-3">
          <p className="text-yellow-400 text-sm font-semibold">
            ⚠️ You&apos;re entering without {incompletePositions.join(', ')} rankings.
          </p>
          <p className="text-pmp-gray-500 text-xs">
            You can still compete, but you&apos;ll score 0 points for {incompletePositions.length === 1 ? 'that position' : 'those positions'} unless you complete them before September 9 at 5:00 PM ET.
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

      {/* Already-submitted status */}
      {isSubmitted && !locked && (
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-base">✅</span>
          <div>
            <p className="text-pmp-white text-sm font-semibold">You&apos;re already entered</p>
            <p className="text-pmp-gray-500 text-xs">Submitting again will update your picks.</p>
          </div>
        </div>
      )}

      {/* Enter / Update CTA */}
      {!showWarning && !locked && (
        <button
          onClick={() => handleEnter(false)}
          disabled={entering}
          className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm tracking-wide hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {entering
            ? 'Saving\u2026'
            : isSubmitted
              ? 'Update Your Entry'
              : 'Enter the Oracle Challenge'}
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
