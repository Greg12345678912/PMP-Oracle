'use client'
import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import {
  buildInitialState,
  makePick,
  assignPlayerToSlot,
  resetToADP,
  selectBestAvailable,
  computeDraftAnalytics,
  tradePickSlots,
} from '@/lib/draft/engine'
import { saveDraft } from '@/lib/draft/supabase'
import { DRAFT_SPEED_MS, DEFAULT_LINEUP } from '@/lib/draft/types'
import type { DraftState, DraftSettings, Player } from '@/lib/draft/types'
import { DraftControls } from './DraftControls'
import { MobileTabs, type MobileTab } from './MobileTabs'
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

type PickTrade = { roundA: number; slotA: number; roundB: number; slotB: number }

interface DraftBoardProps {
  settings: DraftSettings
  players: Player[]
  initialState: DraftState | null
  initialTrades?: PickTrade[]
}

export function DraftBoard({ settings, players, initialState, initialTrades }: DraftBoardProps) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => {
      let initial = initialState ?? buildInitialState(settings, players)
      for (const trade of (initialTrades ?? [])) {
        const idxA = initial.picks.findIndex(p => p.round === trade.roundA && p.teamSlot === trade.slotA)
        const idxB = initial.picks.findIndex(p => p.round === trade.roundB && p.teamSlot === trade.slotB)
        if (idxA !== -1 && idxB !== -1) initial = tradePickSlots(initial, idxA, idxB)
      }
      return initial
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

    if (currentPick.isUser) {
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

  const [mobileTab, setMobileTab] = useState<MobileTab>('players')

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
  const isUserTurn = currentPick?.isUser === true && state.status === 'paused'

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col">
      {state.status === 'complete' && analytics ? (
        <DraftSummary
          analytics={analytics}
          settings={state.settings}
          onPlayAgain={() => dispatch({ type: 'RESET' })}
        />
      ) : (
        <>
          <DraftControls
            status={state.status}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onContinueDraft={handleContinueDraft}
            onReset={handleReset}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onShare={handleShareCopyLink}
          />

          <MobileTabs active={mobileTab} onChange={setMobileTab} />

          {/* Desktop: 3-column layout */}
          <div className="flex-1 flex overflow-hidden">
            {/* Player pool — left on desktop, "Players" tab on mobile */}
            <div className={`w-full md:w-72 flex-shrink-0 border-r border-pmp-gray-800 ${mobileTab !== 'players' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
              <DraftPlayerPool
                availablePlayerIds={state.availablePlayerIds}
                playerMap={playerMap}
                selectedPoolPlayerId={selectedPoolPlayerId}
                lockedPlayerIds={state.lockedPlayerIds}
                isUserTurn={isUserTurn}
                onPickPlayer={handleUserPick}
                onSelectPlayer={setSelectedPoolPlayerId}
                onToggleLock={handleToggleLock}
              />
            </div>

            {/* Board — center on desktop, "Board" tab on mobile */}
            <div className={`flex-1 overflow-auto ${mobileTab !== 'board' ? 'hidden md:block' : 'block'}`}>
              <PickGrid
                picks={state.picks}
                playerMap={playerMap}
                currentPickIndex={state.currentPickIndex}
                selectedPoolPlayerId={selectedPoolPlayerId}
                onAssign={handleAssign}
                onSelectCell={() => {}}
                numTeams={state.settings.numTeams}
              />
            </div>

            {/* My Team — right on desktop, "My Team" tab on mobile */}
            <div className={`w-full md:w-64 flex-shrink-0 border-l border-pmp-gray-800 ${mobileTab !== 'team' ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}>
              <MyTeam
                picks={state.picks}
                playerMap={playerMap}
                lineup={state.settings.lineup ?? DEFAULT_LINEUP}
              />
            </div>
          </div>
        </>
      )}
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
