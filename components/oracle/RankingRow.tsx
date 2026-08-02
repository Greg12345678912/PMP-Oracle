'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RankingRow as RankingRowData } from '@/lib/oracle/rankings'

interface RankingRowProps {
  row: RankingRowData
  rank: number
  locked: boolean
  onRemove: () => void
}

/** Individual ranked player row — drag handle is explicit (44px touch target), not whole-row. */
export function RankingRowItem({ row, rank, locked, onRemove }: RankingRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.playerId })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : 'auto',
      }}
      className="flex items-center gap-1 bg-pmp-gray-900 rounded-lg px-2 select-none"
    >
      {/* Explicit drag handle — 44×44px touch target */}
      {!locked ? (
        <button
          {...attributes}
          {...listeners}
          className="flex items-center justify-center w-11 h-11 shrink-0 text-pmp-gray-600 hover:text-pmp-gray-500 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
            <circle cx="9"  cy="6"  r="1.5" />
            <circle cx="15" cy="6"  r="1.5" />
            <circle cx="9"  cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9"  cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
      ) : (
        <span className="w-11 h-11 shrink-0" />
      )}

      {/* Rank number */}
      <span className="text-pmp-gray-500 text-xs font-bold w-5 text-right shrink-0">
        {rank}
      </span>

      {/* Player name */}
      <span className="text-pmp-white text-sm font-medium flex-1 truncate px-2">
        {row.playerName}
      </span>

      {/* Remove button — 44×44px touch target */}
      {!locked && (
        <button
          onClick={onRemove}
          className="flex items-center justify-center w-11 h-11 shrink-0 text-pmp-gray-600 hover:text-pmp-red transition-colors"
          aria-label={`Remove ${row.playerName}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
