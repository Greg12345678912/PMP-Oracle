'use client'
import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import {
  buildInitialState,
  makePick,
  assignPlayerToSlot,
  resetToADP,
  selectBestAvailable,
  computeDraftAnalytics,
} from '@/lib/draft/engine'
import { saveDraft } from '@/lib/draft/supabase'
import { DRAFT_SPEED_MS } from '@/lib/draft/types'
import type { DraftState, DraftSettings, Player } from '@/lib/draft/types'

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
}

export function DraftBoard({ settings, players, initialState }: DraftBoardProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? buildInitialState(settings, players)
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

  const analytics = state.status === 'complete'
    ? computeDraftAnalytics(state, playerMap)
    : null

  const currentPick = state.picks[state.currentPickIndex]
  const isUserTurn = currentPick?.isUser && state.status === 'paused'

  return (
    <div className="min-h-screen bg-pmp-black flex flex-col">
      {/* DraftControls, PickGrid, DraftPlayerPool, MyTeam, DraftSummary are rendered here.
          They are implemented in subsequent tasks. This shell exposes the handlers as props. */}
      <div data-testid="draft-board">
        {isUserTurn && (
          <p className="text-pmp-red text-sm font-bold text-center py-2">Your pick</p>
        )}
        {state.status !== 'complete' && (
          <button
            onClick={handleContinueDraft}
            className="w-full bg-pmp-red text-pmp-white font-bold py-4 text-lg rounded-none"
          >
            &#9654; Continue Draft
          </button>
        )}
        {/* Child panels will be wired in Task 10 */}
      </div>
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
