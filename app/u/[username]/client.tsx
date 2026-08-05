'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { PositionResult } from '@/lib/oracle/scoring'
import { ResultsShareCard } from '@/components/oracle/ResultsShareCard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileData {
  username: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  isCreator: boolean
}

interface RankingPickPreview {
  playerRank: number
  playerName: string
}

interface ProfileClientProps {
  profile: ProfileData
  isOwn: boolean
  isAfterLock: boolean
  isScored: boolean
  isSeasonComplete: boolean
  overallScore: number | null
  percentile: number | null
  rank: number | null
  totalParticipants: number
  positionResults: PositionResult[]
  summary: string | null
  rankingPreview: Record<string, RankingPickPreview[]>
  lockDateLabel: string
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName}
        className="w-20 h-20 rounded-full object-cover border-2 border-pmp-gray-700"
      />
    )
  }

  return (
    <div className="w-20 h-20 rounded-full bg-pmp-gray-800 border-2 border-pmp-gray-700 flex items-center justify-center">
      <span className="text-pmp-white text-2xl font-bold">{initials}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProfileClient({
  profile,
  isOwn,
  isAfterLock,
  isScored,
  isSeasonComplete,
  overallScore,
  percentile,
  rank,
  totalParticipants,
  positionResults,
  summary,
  rankingPreview,
  lockDateLabel,
}: ProfileClientProps) {
  const [activeTab, setActiveTab] = useState<OraclePosition>('QB')

  const activePositionResult = positionResults.find(pr => pr.position === activeTab) ?? null

  return (
    <div className="min-h-[100dvh] bg-pmp-black px-4 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-10">

        {/* ── 1. Profile header ── */}
        <div className="flex flex-col items-center gap-4 text-center">
          <Avatar avatarUrl={profile.avatarUrl} displayName={profile.displayName} />

          <div className="flex flex-col gap-1">
            <h1 className="text-pmp-white text-2xl font-bold">{profile.displayName}</h1>
            <p className="text-pmp-gray-500 text-sm">@{profile.username}</p>
          </div>

          {/* Badges */}
          {(profile.isVerified || profile.isCreator) && (
            <div className="flex gap-2">
              {profile.isVerified && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-pmp-gray-800 border border-pmp-gray-700 text-pmp-white text-xs font-semibold">
                  ✓ Verified
                </span>
              )}
              {profile.isCreator && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-pmp-gray-800 border border-pmp-gray-700 text-pmp-white text-xs font-semibold">
                  🎙️ Creator
                </span>
              )}
            </div>
          )}

          {isOwn && !isAfterLock && (
            <Link
              href="/challenge/rankings"
              className="text-pmp-red text-xs font-semibold hover:opacity-80"
            >
              Edit my rankings →
            </Link>
          )}
        </div>

        {/* ── 2. Oracle score hero (if scored) ── */}
        {isScored && overallScore !== null && (
          <div className="text-center flex flex-col items-center gap-2">
            {isSeasonComplete && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pmp-gray-800 border border-pmp-gray-700 text-pmp-white text-xs font-semibold">
                🏆 Season Complete
              </span>
            )}
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest mt-1">
              {isSeasonComplete ? 'Official Final 2026 Oracle Challenge Results' : '2026 Oracle Challenge'}
            </p>
            <p className="text-pmp-white text-[72px] font-black leading-none">
              {overallScore.toFixed(1)}
            </p>
            <p className="text-pmp-gray-500 text-sm">Overall Accuracy</p>
            {percentile !== null && (
              <span className="text-pmp-white font-bold text-sm">Top {percentile}%</span>
            )}
            {rank != null && totalParticipants > 0 && (
              <span className="text-pmp-gray-600 text-sm">#{rank.toLocaleString()} of {totalParticipants.toLocaleString()}</span>
            )}
          </div>
        )}

        {/* ── 3. Position score bar chart (if scored) ── */}
        {isScored && positionResults.length > 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
              Position Breakdown
            </p>
            <div className="flex flex-col gap-3">
              {positionResults.map(pr => (
                <div key={pr.position} className="flex items-center gap-3">
                  <span className="text-pmp-gray-500 text-sm w-6">{pr.position}</span>
                  <div className="flex-1 h-2 bg-pmp-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pmp-red rounded-full"
                      style={{ width: `${pr.normalizedScore}%` }}
                    />
                  </div>
                  <span className="text-pmp-white text-sm font-bold w-12 text-right">
                    {pr.normalizedScore.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. Season summary (if scored) ── */}
        {isScored && summary && (
          <div className="flex flex-col gap-3">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
              Season Summary
            </p>
            <p className="text-pmp-gray-500 text-sm leading-relaxed italic text-center">
              &ldquo;{summary}&rdquo;
            </p>
          </div>
        )}

        {/* ── 5. Share card (if scored and percentile known) ── */}
        {isScored && overallScore !== null && percentile !== null && (
          <ResultsShareCard overallScore={overallScore} percentile={percentile} username={profile.username} />
        )}

        {/* ── 6. Rankings preview ── */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
              {isAfterLock ? 'Locked Rankings' : 'Rankings'}
            </p>
            {isAfterLock && (
              <p className="text-pmp-gray-700 text-xs">Locked {lockDateLabel}</p>
            )}
          </div>

          {!isAfterLock ? (
            !isOwn ? (
              <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-5 text-center">
                <p className="text-pmp-gray-500 text-sm">
                  Rankings hidden until {lockDateLabel}
                </p>
              </div>
            ) : null
          ) : (
            <>
              {/* Position tab strip */}
              <div className="flex gap-2">
                {ORACLE_POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setActiveTab(pos)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      activeTab === pos
                        ? 'bg-pmp-red text-pmp-white'
                        : 'bg-pmp-gray-800 text-pmp-gray-500 hover:text-pmp-white'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>

              {/* Top 3 picks for active position */}
              <div className="flex flex-col gap-2">
                {(rankingPreview[activeTab] ?? []).length === 0 ? (
                  <p className="text-pmp-gray-500 text-sm text-center py-4">
                    No rankings submitted for {activeTab}.
                  </p>
                ) : (
                  (rankingPreview[activeTab] ?? []).map((pick, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3"
                    >
                      <span className="text-pmp-gray-500 text-sm font-bold w-5 text-center">
                        {pick.playerRank}
                      </span>
                      <span className="text-pmp-white text-sm flex-1">{pick.playerName}</span>
                    </div>
                  ))
                )}

              </div>
            </>
          )}
        </div>

        {/* Back link */}
        <div className="text-center pb-4">
          <Link
            href="/challenge"
            className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors"
          >
            ← Oracle Challenge
          </Link>
        </div>

      </div>
    </div>
  )
}
