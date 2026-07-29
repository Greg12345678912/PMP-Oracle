'use client'
import { useReducer, useEffect, useRef, useState, useCallback } from 'react'

const ZOOM_WIDTHS = { compact: 60, normal: 76, large: 96 } as const
type ZoomLevel = keyof typeof ZOOM_WIDTHS
import {
  buildInitialState,
  makePick,
  assignPlayerToSlot,
  resetToADP,
  selectBestAvailable,
  computeDraftAnalytics,
} from '@/lib/draft/engine'
import { saveDraft } from '@/lib/draft/supabase'
import { DRAFT_SPEED_MS, DEFAULT_LINEUP } from '@/lib/draft/types'
import type { DraftState, DraftSettings, Player } from '@/lib/draft/types'
import { DraftControls } from './DraftControls'
import { PickGrid } from './PickGrid'
import { DraftPlayerPool } from './DraftPlayerPool'
import { MyTeam } from './MyTeam'
import { DraftSummary } from './DraftSummary'

type Action =
  | { type: 'MAKE_PICK'; playerId: string }
  | { type: 'ASSIGN'; pickIndex: number; playerId: string }
  | { type: 'RESET' }
  | { type: 'SET_STATUS'; status: DraftState['status'] }
  | { type: 'SET_SHARE_ID'; shareId: string }
  | { type: 'RESTORE'; state: DraftState }

function reducer(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'MAKE_PICK':    return makePick(state, action.playerId)
    case 'ASSIGN':       return assignPlayerToSlot(state, action.pickIndex, action.playerId)
    case 'RESET':        return resetToADP(state)
    case 'SET_STATUS':   return { ...state, status: action.status }
    case 'SET_SHARE_ID': return { ...state, shareId: action.shareId }
    case 'RESTORE':      return action.state
    default:             return state
  }
}

interface DraftBoardProps {
  settings: DraftSettings
  players: Player[]
  initialState: DraftState | null
  ownershipMap?: Map<string, number>  // keyed "${round}_${teamSlot}" → currentOwnerTeamSlot
}

export function DraftBoard({ settings, players, initialState, ownershipMap }: DraftBoardProps) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => {
      const initial = initialState ?? buildInitialState(settings, players)
      if (!ownershipMap?.size) return initial
      return {
        ...initial,
        picks: initial.picks.map(p => {
          const key = `${p.round}_${p.teamSlot}`
          const owner = ownershipMap.get(key)
          return owner !== undefined ? { ...p, currentOwnerTeamSlot: owner } : p
        }),
      }
    }
  )
  const [undoStack, setUndoStack] = useState<DraftState[]>([])
  const [redoStack, setRedoStack] = useState<DraftState[]>([])
  const [selectedPoolPlayerId, setSelectedPoolPlayerId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playerMap = useRef(new Map(players.map(p => [p.id, p]))).current

  // Autosave on every state change (debounced 1000ms)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const shareId = await saveDraft(state)
        if (!state.shareId) dispatch({ type: 'SET_SHARE_ID', shareId })
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', `/mock-draft/${shareId}`)
        }
      } catch { /* silent */ }
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state])

  // CPU auto-pick effect
  useEffect(() => {
    if (state.status !== 'drafting') return
    const currentPick = state.picks[state.currentPickIndex]
    if (!currentPick) return

    if (currentPick.currentOwnerTeamSlot === state.settings.userSlot) {
      dispatch({ type: 'SET_STATUS', status: 'paused' })
      return
    }

    const delay = DRAFT_SPEED_MS[state.settings.speed]
    const timer = setTimeout(() => {
      const playerId = selectBestAvailable(state)
      if (playerId) dispatch({ type: 'MAKE_PICK', playerId })
    }, delay)
    return () => clearTimeout(timer)
  }, [state.currentPickIndex, state.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const pushUndo = useCallback((prev: DraftState) => {
    setUndoStack(s => [...s, prev])
    setRedoStack([])
  }, [])

  const handleUserPick = (playerId: string) => {
    pushUndo(state)
    dispatch({ type: 'MAKE_PICK', playerId })
    setSelectedPoolPlayerId(null)
    // Status stays 'paused' — user must click Continue Draft to resume CPU
  }

  const handleAssign = (pickIndex: number, playerId: string) => {
    pushUndo(state)
    dispatch({ type: 'ASSIGN', pickIndex, playerId })
  }

  const handleReset = () => {
    pushUndo(state)
    dispatch({ type: 'RESET' })
  }

  const handleUndo = () => {
    if (!undoStack.length) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(s => [...s, state])
    setUndoStack(s => s.slice(0, -1))
    dispatch({ type: 'RESTORE', state: prev })
  }

  const handleRedo = () => {
    if (!redoStack.length) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(s => [...s, state])
    setRedoStack(s => s.slice(0, -1))
    dispatch({ type: 'RESTORE', state: next })
  }

  const handleContinueDraft = () => {
    dispatch({ type: 'SET_STATUS', status: 'drafting' })
  }

  const handleShareCopyLink = async () => {
    const url = state.shareId
      ? `${window.location.origin}/mock-draft/${state.shareId}`
      : window.location.href
    await navigator.clipboard.writeText(url).catch(() => {})
  }

  const handleToggleLock = (playerId: string) => {
    dispatch({
      type: 'RESTORE',
      state: {
        ...state,
        lockedPlayerIds: state.lockedPlayerIds.includes(playerId)
          ? state.lockedPlayerIds.filter(id => id !== playerId)
          : [...state.lockedPlayerIds, playerId],
      },
    })
  }

  const analytics = state.status === 'complete'
    ? computeDraftAnalytics(state, playerMap)
    : null

  const currentPick = state.picks[state.currentPickIndex]
  const isUserTurn =
    currentPick?.currentOwnerTeamSlot === state.settings.userSlot &&
    state.status === 'paused'

  const [zoom, setZoom] = useState<ZoomLevel>('normal')
  const [shareLabel, setShareLabel] = useState('Copy Link')

  const handleShare = async () => {
    await handleShareCopyLink()
    setShareLabel('Copied!')
    setTimeout(() => setShareLabel('Copy Link'), 2000)
  }

  return (
    <div className="h-screen bg-[#0d0d0d] flex flex-col overflow-hidden">
      {state.status === 'complete' && analytics ? (
        <DraftSummary
          analytics={analytics}
          settings={state.settings}
          onPlayAgain={() => dispatch({ type: 'RESET' })}
        />
      ) : (
        <>
          <DraftProgressBar
            currentPickIndex={state.currentPickIndex}
            totalPicks={state.picks.length}
            numTeams={state.settings.numTeams}
          />

          {/* Continue Draft banner */}
          {isUserTurn && (
            <div className="bg-pmp-red px-4 py-3 flex items-center justify-center shrink-0">
              <button
                onClick={handleContinueDraft}
                className="text-white font-bold text-lg tracking-wide w-full text-center"
              >
                ▶ Continue Draft
              </button>
            </div>
          )}

          <DraftControls
            status={state.status}
            undoDisabled={undoStack.length === 0}
            redoDisabled={redoStack.length === 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onReset={handleReset}
            onShare={handleShare}
            shareLabel={shareLabel}
          />

          {/* Zoom toggle strip */}
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[#1e1e1e] bg-[#111111] shrink-0">
            <span className="text-pmp-gray-500 text-[10px] mr-1">Zoom</span>
            {(['compact', 'normal', 'large'] as const).map(z => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  zoom === z ? 'bg-pmp-red text-white' : 'text-pmp-gray-500 hover:text-pmp-gray-300'
                }`}
              >
                {z.charAt(0).toUpperCase() + z.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left panel: player pool */}
            <aside className="w-[264px] shrink-0 border-r border-[#1e1e1e] flex flex-col overflow-hidden">
              <DraftPlayerPool
                players={players}
                availablePlayerIds={state.availablePlayerIds}
                playerMap={playerMap}
                selectedPoolPlayerId={selectedPoolPlayerId}
                lockedPlayerIds={state.lockedPlayerIds}
                isUserTurn={isUserTurn}
                onPickPlayer={handleUserPick}
                onSelectPlayer={setSelectedPoolPlayerId}
                onToggleLock={handleToggleLock}
              />
            </aside>

            {/* Center: board */}
            <main className="flex-1 overflow-auto p-2">
              <PickGrid
                picks={state.picks}
                playerMap={playerMap}
                currentPickIndex={state.currentPickIndex}
                selectedPoolPlayerId={selectedPoolPlayerId}
                onAssign={handleAssign}
                onSelectCell={() => {}}
                numTeams={state.settings.numTeams}
                userSlot={state.settings.userSlot}
                zoom={zoom}
              />
            </main>

            {/* Right panel: my team */}
            <aside className="w-[220px] shrink-0 border-l border-[#1e1e1e] overflow-y-auto">
              <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest px-3 py-3 sticky top-0 bg-[#0d0d0d] border-b border-[#1e1e1e]">
                My Team
              </p>
              <div className="flex flex-col gap-1 p-2">
                <MyTeam
                  picks={state.picks}
                  playerMap={playerMap}
                  lineup={state.settings.lineup ?? DEFAULT_LINEUP}
                  userSlot={state.settings.userSlot}
                />
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function DraftProgressBar({
  currentPickIndex, totalPicks, numTeams,
}: { currentPickIndex: number; totalPicks: number; numTeams: number }) {
  const round = Math.min(Math.floor(currentPickIndex / numTeams) + 1, 15)
  const pct = Math.round((currentPickIndex / totalPicks) * 100)
  return (
    <div className="bg-[#111111] border-b border-[#1e1e1e] px-4 py-2 flex items-center gap-4 shrink-0">
      <span className="text-pmp-white text-sm font-bold">Round {round}</span>
      <span className="text-pmp-gray-500 text-xs">
        Pick {currentPickIndex + 1} / {totalPicks}
      </span>
      <div className="flex-1 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full bg-pmp-red rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-pmp-gray-600 text-xs">{pct}%</span>
    </div>
  )
}

// Export handlers type for child components
export type DraftBoardHandlers = {
  onUserPick: (playerId: string) => void
  onAssign: (pickIndex: number, playerId: string) => void
  onReset: () => void
  onUndo: () => void
  onRedo: () => void
  onContinueDraft: () => void
  onShareCopyLink: () => Promise<void>
  selectedPoolPlayerId: string | null
  setSelectedPoolPlayerId: (id: string | null) => void
}
