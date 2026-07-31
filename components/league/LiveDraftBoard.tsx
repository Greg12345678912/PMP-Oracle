'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MobileTabs } from '@/components/draft/MobileTabs'
import type { MobileTab } from '@/components/draft/MobileTabs'
import { PickGrid } from '@/components/draft/PickGrid'
import { DraftPlayerPool } from '@/components/draft/DraftPlayerPool'
import { MyTeam } from '@/components/draft/MyTeam'
import { DraftSummary } from '@/components/draft/DraftSummary'
import { computeDraftAnalytics } from '@/lib/draft/engine'
import { DEFAULT_LINEUP } from '@/lib/draft/types'
import type { DraftSettings, DraftState, Player } from '@/lib/draft/types'
import type { LeagueDraft, LeagueMember } from '@/lib/league/types'
import { SleeperProvider } from '@/lib/data/sleeper'

// 90-second draft clock. When it hits zero on your turn, auto-picks best available.
const CLOCK_SECONDS = 90

type ZoomLevel = 'compact' | 'normal' | 'large'

interface LiveDraftBoardProps {
  leagueId: string
  draft: LeagueDraft
  members: LeagueMember[]
  myTeamSlot: number | null
  isPicking: boolean
  onPickPlayer: (playerId: string, playerName: string) => Promise<void>
  settings: DraftSettings
}

export function LiveDraftBoard({
  draft, members, myTeamSlot, isPicking, onPickPlayer, settings,
}: LiveDraftBoardProps) {
  const router = useRouter()
  const state: DraftState = draft.state
  const [mobileTab, setMobileTab] = useState<MobileTab>('players')
  const [zoom, setZoom] = useState<ZoomLevel>('normal')
  const [selectedPoolPlayerId, setSelectedPoolPlayerId] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [clockSeconds, setClockSeconds] = useState(CLOCK_SECONDS)

  // playerMap is a stable ref — populated by the effect below.
  const playerMap = useRef(new Map<string, Player>()).current
  // Track which pick index the clock started for, so we reset on new picks.
  const clockPickRef = useRef(state.currentPickIndex)

  useEffect(() => {
    const provider = new SleeperProvider()
    provider.getDraftPlayers(settings.scoring).then(fetched => {
      fetched.forEach(p => playerMap.set(p.id, p))
      setPlayers(fetched)
    })
  }, [settings.scoring, playerMap])

  const isMyTurn =
    myTeamSlot !== null &&
    state.picks[state.currentPickIndex]?.currentOwnerTeamSlot === myTeamSlot &&
    state.status !== 'complete'

  // Auto-pick best available player (highest ADP rank = lowest index in availablePlayerIds)
  const autoPickBest = useCallback(() => {
    const bestId = state.availablePlayerIds[0]
    if (!bestId || isPicking) return
    const player = playerMap.get(bestId)
    onPickPlayer(bestId, player?.name ?? bestId)
  }, [state.availablePlayerIds, isPicking, playerMap, onPickPlayer])

  // Clock: reset on each new pick, tick down, auto-pick on your turn at 0
  useEffect(() => {
    if (state.status === 'complete') return
    // Reset clock when pick index changes
    if (clockPickRef.current !== state.currentPickIndex) {
      clockPickRef.current = state.currentPickIndex
      setClockSeconds(CLOCK_SECONDS)
      return
    }
    if (clockSeconds <= 0) {
      if (isMyTurn && !isPicking) autoPickBest()
      return
    }
    const timer = setTimeout(() => setClockSeconds(s => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [clockSeconds, state.currentPickIndex, state.status, isMyTurn, isPicking, autoPickBest])

  const currentPick = state.picks[state.currentPickIndex]

  const currentPickerName = members.find(
    m => m.teamSlot === currentPick?.currentOwnerTeamSlot
  )?.displayName ?? `Team ${currentPick?.currentOwnerTeamSlot}`

  const handlePickPlayer = async (playerId: string) => {
    const player = playerMap.get(playerId)
    await onPickPlayer(playerId, player?.name ?? playerId)
    setSelectedPoolPlayerId(null)
  }

  const analytics = state.status === 'complete' && myTeamSlot !== null
    ? computeDraftAnalytics(
        { ...state, settings: { ...state.settings, userSlot: myTeamSlot } },
        playerMap
      )
    : null

  const totalPicks = state.picks.length
  const pct = Math.round((state.currentPickIndex / totalPicks) * 100)
  const round = Math.min(Math.floor(state.currentPickIndex / settings.numTeams) + 1, 15)

  if (state.status === 'complete' && analytics) {
    return (
      <DraftSummary
        analytics={analytics}
        settings={{ ...settings, userSlot: myTeamSlot ?? 1 }}
        onPlayAgain={() => router.push('/')}
        playAgainLabel="Back to Home"
      />
    )
  }

  return (
    <div className="h-[100dvh] bg-[#0d0d0d] flex flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="bg-[#111111] border-b border-[#1e1e1e] px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-pmp-white text-sm font-bold">Round {round}</span>
        <span className="text-pmp-gray-500 text-xs">Pick {state.currentPickIndex + 1} / {totalPicks}</span>
        <div className="flex-1 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
          <div className="h-full bg-pmp-red rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        {/* Draft clock */}
        {state.status !== 'complete' && (
          <span className={`text-xs font-mono font-bold tabular-nums min-w-[2.5rem] text-right ${
            clockSeconds <= 10 ? 'text-pmp-red' : 'text-pmp-gray-500'
          }`}>
            {String(Math.floor(clockSeconds / 60)).padStart(2, '0')}:{String(clockSeconds % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      {/* Turn banner */}
      <div className="bg-pmp-red px-4 py-2.5 flex items-center justify-center shrink-0">
        {isMyTurn ? (
          <p className="text-white font-bold text-sm tracking-wide text-center">
            {isPicking ? 'Submitting...' : 'Your pick — select a player'}
          </p>
        ) : (
          <p className="text-white/80 text-sm text-center">
            Waiting for <span className="font-bold text-white">{currentPickerName}</span>
          </p>
        )}
      </div>

      {/* Mobile tab bar */}
      <MobileTabs active={mobileTab} onChange={setMobileTab} />

      {/* Desktop zoom strip (hidden on mobile) */}
      <div className="hidden md:flex items-center gap-1 px-2 py-1 border-b border-[#1e1e1e] bg-[#111111] shrink-0">
        <span className="text-pmp-gray-500 text-[10px] mr-1">Zoom</span>
        {(['compact', 'normal', 'large'] as const).map(z => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              zoom === z ? 'bg-pmp-red text-white' : 'text-pmp-gray-500 hover:text-pmp-white'
            }`}
          >
            {z.charAt(0).toUpperCase() + z.slice(1)}
          </button>
        ))}
        {/* Member list in header (desktop only) */}
        <div className="ml-auto flex items-center gap-2">
          {members.map(m => (
            <span
              key={m.id}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                m.teamSlot === currentPick?.currentOwnerTeamSlot
                  ? 'bg-pmp-red text-white font-bold'
                  : 'text-pmp-gray-600'
              }`}
            >
              {m.displayName}
            </span>
          ))}
        </div>
      </div>

      {/* Content: mobile shows one panel at a time; desktop shows all three */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: player pool */}
        <aside className={`
          shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-hidden
          ${mobileTab === 'players' ? 'flex' : 'hidden'}
          md:flex md:w-[264px]
        `}>
          <DraftPlayerPool
            players={players}
            availablePlayerIds={state.availablePlayerIds}
            playerMap={playerMap}
            selectedPoolPlayerId={selectedPoolPlayerId}
            lockedPlayerIds={state.lockedPlayerIds}
            isUserTurn={isMyTurn && !isPicking}
            onPickPlayer={handlePickPlayer}
            onSelectPlayer={setSelectedPoolPlayerId}
            onToggleLock={() => {}}
          />
        </aside>

        {/* Center: board */}
        <main className={`
          flex-1 overflow-auto p-2
          ${mobileTab === 'board' ? 'block' : 'hidden'}
          md:block
        `}>
          <PickGrid
            picks={state.picks}
            playerMap={playerMap}
            currentPickIndex={state.currentPickIndex}
            selectedPoolPlayerId={selectedPoolPlayerId}
            onAssign={() => {}}
            onSelectCell={() => {}}
            numTeams={settings.numTeams}
            userSlot={myTeamSlot ?? 1}
            zoom={zoom}
          />
        </main>

        {/* Right: my team */}
        <aside className={`
          shrink-0 border-l border-[#1e1e1e] overflow-y-auto
          ${mobileTab === 'team' ? 'flex flex-col w-full' : 'hidden'}
          md:flex md:flex-col md:w-[220px]
        `}>
          <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest px-3 py-3 sticky top-0 bg-[#0d0d0d] border-b border-[#1e1e1e]">
            My Team
          </p>
          <div className="flex flex-col gap-1 p-2">
            <MyTeam
              picks={state.picks}
              playerMap={playerMap}
              lineup={settings.lineup ?? DEFAULT_LINEUP}
              userSlot={myTeamSlot ?? 1}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
