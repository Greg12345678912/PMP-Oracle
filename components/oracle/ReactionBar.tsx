'use client'

import { useState } from 'react'

const EMOJIS = ['🔥', '😂', '💀', '👀'] as const
type Emoji = (typeof EMOJIS)[number]

interface ReactionBarProps {
  targetUserId: string
  seasonId: string
  week: number
  initialCounts: Record<string, number>
  myReactions: Record<string, boolean>
  isLoggedIn: boolean
}

export function ReactionBar({
  targetUserId,
  seasonId,
  week,
  initialCounts,
  myReactions,
  isLoggedIn,
}: ReactionBarProps) {
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts)
  const [mine, setMine] = useState<Record<string, boolean>>(myReactions)
  const [pending, setPending] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const toggle = async (emoji: Emoji) => {
    if (!isLoggedIn || pending) return

    setPickerOpen(false)
    setPending(emoji)
    const wasOn = mine[emoji] ?? false

    // Optimistic update
    setCounts(c => ({ ...c, [emoji]: Math.max(0, (c[emoji] ?? 0) + (wasOn ? -1 : 1)) }))
    setMine(m => ({ ...m, [emoji]: !wasOn }))

    try {
      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, seasonId, week, emoji }),
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      // Revert on error
      setCounts(c => ({ ...c, [emoji]: Math.max(0, (c[emoji] ?? 0) + (wasOn ? 1 : -1)) }))
      setMine(m => ({ ...m, [emoji]: wasOn }))
    } finally {
      setPending(null)
    }
  }

  const activeReactions = EMOJIS.filter(e => (counts[e] ?? 0) > 0)
  const hasAny = activeReactions.length > 0

  // Nothing to show if logged out and no reactions yet
  if (!isLoggedIn && !hasAny) return null

  return (
    <div className="flex items-center justify-between mt-2 min-h-[22px]">
      {/* Left: REACT button or inline emoji picker */}
      <div className="flex items-center gap-1">
        {isLoggedIn && !pickerOpen && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-pmp-gray-600 text-[10px] font-bold uppercase tracking-widest hover:text-pmp-gray-400 transition-colors px-1"
          >
            + React
          </button>
        )}
        {isLoggedIn && pickerOpen && (
          <>
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => { void toggle(emoji) }}
                disabled={pending === emoji}
                className="text-base leading-none px-1 py-0.5 rounded hover:bg-pmp-gray-700 transition-colors disabled:opacity-50"
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-pmp-gray-600 text-[10px] font-bold px-1 hover:text-pmp-gray-400 transition-colors"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Right: active reactions with counts (clickable to toggle off) */}
      {hasAny && (
        <div className="flex items-center gap-1">
          {activeReactions.map(emoji => {
            const count = counts[emoji] ?? 0
            const active = mine[emoji] ?? false
            return (
              <button
                key={emoji}
                type="button"
                onClick={isLoggedIn ? () => { void toggle(emoji) } : undefined}
                disabled={pending === emoji}
                className={[
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50',
                  active
                    ? 'bg-pmp-red/20 border border-pmp-red/50 text-pmp-white'
                    : 'bg-pmp-gray-800 border border-pmp-gray-700 text-pmp-gray-400',
                  isLoggedIn ? 'cursor-pointer hover:border-pmp-gray-500' : 'cursor-default',
                ].join(' ')}
              >
                <span>{emoji}</span>
                <span>{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
