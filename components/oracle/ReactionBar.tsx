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

  const toggle = async (emoji: Emoji) => {
    if (!isLoggedIn || pending) return

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

  const hasAny = EMOJIS.some(e => (counts[e] ?? 0) > 0)

  // Always render all four buttons; hide zero-count buttons when logged out
  // so the bar stays compact for users who can't react yet.
  const visibleEmojis = isLoggedIn ? EMOJIS : EMOJIS.filter(e => (counts[e] ?? 0) > 0)

  if (!isLoggedIn && !hasAny) return null

  return (
    <div className="flex gap-1.5 mt-2 flex-wrap">
      {visibleEmojis.map(emoji => {
        const count = counts[emoji] ?? 0
        const active = mine[emoji] ?? false
        const isPending = pending === emoji
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => { void toggle(emoji) }}
            disabled={isPending}
            title={!isLoggedIn ? 'Sign in to react' : undefined}
            className={[
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-60',
              active
                ? 'bg-pmp-red/20 border border-pmp-red/60 text-pmp-white'
                : 'bg-pmp-gray-800 border border-pmp-gray-700 text-pmp-gray-400 hover:border-pmp-gray-500 hover:text-pmp-gray-300',
            ].join(' ')}
          >
            <span>{emoji}</span>
            {count > 0 && <span>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
