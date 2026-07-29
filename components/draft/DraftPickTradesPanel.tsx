'use client'
import { useState, useMemo } from 'react'
import type { TradeRecord } from '@/lib/draft/types'

// ──────────────────────────────────────────────────────────
// Pure ownership helpers
// ──────────────────────────────────────────────────────────

function buildBaseMap(numTeams: number, numRounds: number): Map<string, number> {
  const map = new Map<string, number>()
  for (let r = 1; r <= numRounds; r++) {
    for (let s = 1; s <= numTeams; s++) {
      map.set(`${r}_${s}`, s)
    }
  }
  return map
}

function applyTradeToMap(
  map: Map<string, number>,
  trade: TradeRecord,
  userSlot: number,
): Map<string, number> {
  const next = new Map(map)
  for (const p of trade.youGive)    next.set(`${p.round}_${p.teamSlot}`, trade.opponentSlot)
  for (const p of trade.youReceive) next.set(`${p.round}_${p.teamSlot}`, userSlot)
  return next
}

export function buildOwnershipMapFromTrades(
  trades: TradeRecord[],
  numTeams: number,
  numRounds: number,
  userSlot: number,
): Map<string, number> {
  let map = buildBaseMap(numTeams, numRounds)
  for (const t of trades) map = applyTradeToMap(map, t, userSlot)
  return map
}

// ──────────────────────────────────────────────────────────
// OwnershipGrid inner component
// ──────────────────────────────────────────────────────────

function OwnershipGrid({
  numTeams,
  numRounds,
  ownershipMap,
  userSlot,
  opponentSlot,
  pendingYouGive,
  pendingYouReceive,
  onPickClick,
}: {
  numTeams: number
  numRounds: number
  ownershipMap: Map<string, number>
  userSlot: number
  opponentSlot: number | null
  pendingYouGive: { round: number; teamSlot: number }[]
  pendingYouReceive: { round: number; teamSlot: number }[]
  onPickClick: (round: number, teamSlot: number) => void
}) {
  const cells: { round: number; teamSlot: number }[] = []
  for (let r = 1; r <= numRounds; r++) {
    for (let s = 1; s <= numTeams; s++) {
      cells.push({ round: r, teamSlot: s })
    }
  }

  return (
    <div className="overflow-auto">
      <div
        className="grid gap-0.5 min-w-max"
        style={{ gridTemplateColumns: `repeat(${numTeams}, minmax(56px, 1fr))` }}
      >
        {/* Column headers */}
        {Array.from({ length: numTeams }, (_, i) => (
          <div
            key={i}
            className="text-center py-1 text-[10px] font-semibold sticky top-0 bg-[#0d0d0d] border-b border-[#1e1e1e]"
            style={{ color: i + 1 === userSlot ? '#ef4444' : '#4b5563' }}
          >
            {i + 1 === userSlot ? '⭐ YOU' : `${i + 1}`}
          </div>
        ))}

        {cells.map(({ round, teamSlot }) => {
          const key = `${round}_${teamSlot}`
          const owner = ownershipMap.get(key) ?? teamSlot
          const isYourPick = owner === userSlot
          const isOpponentPick = opponentSlot !== null && owner === opponentSlot
          const inYouGive = pendingYouGive.some(p => p.round === round && p.teamSlot === teamSlot)
          const inYouReceive = pendingYouReceive.some(p => p.round === round && p.teamSlot === teamSlot)

          const bg = inYouGive
            ? 'bg-[#1a0505] border-pmp-red ring-1 ring-pmp-red'
            : inYouReceive
            ? 'bg-[#051a08] border-green-700 ring-1 ring-green-600'
            : isYourPick
            ? 'bg-[#1a0505] border-pmp-red/20'
            : isOpponentPick
            ? 'bg-[#1e1e1e] border-[#3a3a3a]'
            : 'bg-[#111111] border-[#1e1e1e]'

          const clickable = isYourPick || isOpponentPick
          const label = `${round}.${String(teamSlot).padStart(2, '0')}`
          const ownerLabel = owner === userSlot ? 'YOU' : `T${owner}`

          return (
            <button
              key={key}
              type="button"
              onClick={() => clickable ? onPickClick(round, teamSlot) : undefined}
              disabled={!clickable}
              className={`border rounded p-1 text-left transition-all ${bg} ${
                clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              }`}
            >
              <p className="text-pmp-gray-600 text-[9px] leading-none">{label}</p>
              <p className={`text-[9px] font-semibold mt-0.5 leading-none ${
                isYourPick ? 'text-pmp-red' : isOpponentPick ? 'text-pmp-gray-400' : 'text-pmp-gray-700'
              }`}>{ownerLabel}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────
// DraftPickTradesPanel
// ──────────────────────────────────────────────────────────

interface DraftPickTradesPanelProps {
  numTeams: number
  numRounds: number     // always 15
  userSlot: number
  trades: TradeRecord[]
  onTradesChange: (trades: TradeRecord[]) => void
}

export function DraftPickTradesPanel({
  numTeams,
  numRounds,
  userSlot,
  trades,
  onTradesChange,
}: DraftPickTradesPanelProps) {
  const [pendingOpponentSlot, setPendingOpponentSlot] = useState<number | null>(null)
  const [pendingYouGive, setPendingYouGive] = useState<{ round: number; teamSlot: number }[]>([])
  const [pendingYouReceive, setPendingYouReceive] = useState<{ round: number; teamSlot: number }[]>([])

  const committedMap = useMemo(
    () => buildOwnershipMapFromTrades(trades, numTeams, numRounds, userSlot),
    [trades, numTeams, numRounds, userSlot],
  )

  const previewMap = useMemo(() => {
    if (!pendingOpponentSlot) return committedMap
    const pending: TradeRecord = {
      id: 'pending',
      opponentSlot: pendingOpponentSlot,
      youGive: pendingYouGive,
      youReceive: pendingYouReceive,
    }
    return applyTradeToMap(committedMap, pending, userSlot)
  }, [committedMap, pendingOpponentSlot, pendingYouGive, pendingYouReceive, userSlot])

  const handlePickClick = (round: number, teamSlot: number) => {
    const key = `${round}_${teamSlot}`
    const owner = previewMap.get(key) ?? teamSlot

    if (owner === userSlot) {
      const already = pendingYouGive.some(p => p.round === round && p.teamSlot === teamSlot)
      if (already) {
        setPendingYouGive(prev => prev.filter(p => !(p.round === round && p.teamSlot === teamSlot)))
      } else {
        setPendingYouGive(prev => [...prev, { round, teamSlot }])
      }
    } else if (owner === pendingOpponentSlot) {
      const already = pendingYouReceive.some(p => p.round === round && p.teamSlot === teamSlot)
      if (already) {
        setPendingYouReceive(prev => prev.filter(p => !(p.round === round && p.teamSlot === teamSlot)))
      } else {
        setPendingYouReceive(prev => [...prev, { round, teamSlot }])
      }
    }
  }

  const handleCancel = () => {
    setPendingOpponentSlot(null)
    setPendingYouGive([])
    setPendingYouReceive([])
  }

  const handleApply = () => {
    if (!pendingOpponentSlot) return
    if (pendingYouGive.length === 0 && pendingYouReceive.length === 0) return
    const newTrade: TradeRecord = {
      id: `trade-${Date.now()}`,
      opponentSlot: pendingOpponentSlot,
      youGive: pendingYouGive,
      youReceive: pendingYouReceive,
    }
    onTradesChange([...trades, newTrade])
    handleCancel()
  }

  const canApply = pendingOpponentSlot !== null && (pendingYouGive.length > 0 || pendingYouReceive.length > 0)

  return (
    <div className="space-y-4">
      {/* Team selector */}
      <div>
        <p className="text-pmp-gray-600 text-xs uppercase tracking-widest mb-2">Trade With</p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: numTeams }, (_, i) => i + 1).filter(s => s !== userSlot).map(slot => (
            <button
              key={slot}
              type="button"
              onClick={() => { setPendingOpponentSlot(slot); setPendingYouGive([]); setPendingYouReceive([]) }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                pendingOpponentSlot === slot
                  ? 'bg-pmp-red text-white'
                  : 'bg-[#1e1e1e] text-pmp-gray-400 hover:bg-[#2a2a2a]'
              }`}
            >
              Team {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Ownership grid (always visible) */}
      <OwnershipGrid
        numTeams={numTeams}
        numRounds={numRounds}
        ownershipMap={previewMap}
        userSlot={userSlot}
        opponentSlot={pendingOpponentSlot}
        pendingYouGive={pendingYouGive}
        pendingYouReceive={pendingYouReceive}
        onPickClick={handlePickClick}
      />

      {/* Pending trade summary + actions */}
      {pendingOpponentSlot !== null && (
        <div className="border border-[#2a2a2a] rounded-lg p-3 space-y-3">
          <p className="text-pmp-white text-xs font-semibold">Pending trade with Team {pendingOpponentSlot}</p>

          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-pmp-red text-[10px] uppercase tracking-wider mb-1">You Give</p>
              {pendingYouGive.length === 0 ? (
                <p className="text-pmp-gray-700 text-xs">Click your picks above</p>
              ) : (
                pendingYouGive.map(p => (
                  <p key={`${p.round}_${p.teamSlot}`} className="text-pmp-white text-xs">
                    {p.round}.{String(p.teamSlot).padStart(2, '0')}
                  </p>
                ))
              )}
            </div>
            <div className="flex-1">
              <p className="text-green-500 text-[10px] uppercase tracking-wider mb-1">You Receive</p>
              {pendingYouReceive.length === 0 ? (
                <p className="text-pmp-gray-700 text-xs">Click their picks above</p>
              ) : (
                pendingYouReceive.map(p => (
                  <p key={`${p.round}_${p.teamSlot}`} className="text-pmp-white text-xs">
                    {p.round}.{String(p.teamSlot).padStart(2, '0')}
                  </p>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg text-xs text-pmp-gray-400 hover:text-pmp-white border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pmp-red text-white hover:opacity-90 disabled:opacity-30 transition-colors"
            >
              Apply Trade
            </button>
          </div>
        </div>
      )}

      {/* Trade history */}
      {trades.length > 0 && (
        <div>
          <p className="text-pmp-gray-600 text-[10px] uppercase tracking-widest mb-2">Trade History</p>
          {trades.map(trade => (
            <div key={trade.id} className="border border-[#1e1e1e] rounded-lg p-2.5 mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-pmp-white text-xs font-semibold mb-1">Team {trade.opponentSlot}</p>
                {trade.youGive.length > 0 && (
                  <p className="text-pmp-red text-[10px]">
                    Give: {trade.youGive.map(p => `${p.round}.${String(p.teamSlot).padStart(2, '0')}`).join(', ')}
                  </p>
                )}
                {trade.youReceive.length > 0 && (
                  <p className="text-green-500 text-[10px]">
                    Receive: {trade.youReceive.map(p => `${p.round}.${String(p.teamSlot).padStart(2, '0')}`).join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onTradesChange(trades.filter(t => t.id !== trade.id))}
                className="text-pmp-gray-700 hover:text-pmp-red text-xs shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
