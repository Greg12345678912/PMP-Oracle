'use client'
import { useState } from 'react'
import { SleeperProvider } from '@/lib/data/sleeper'
import type { DraftSettings, Player, LineupConfig } from '@/lib/draft/types'
import { DRAFT_TEAM_OPTIONS, DEFAULT_LINEUP } from '@/lib/draft/types'

const LINEUP_PRESETS: Record<string, { label: string; icon: string; lineup: LineupConfig }> = {
  espn: {
    label: 'ESPN Standard', icon: '🏈',
    lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 },
  },
  sleeper: {
    label: 'Sleeper Default', icon: '🔥',
    lineup: { QB:1, RB:2, WR:3, TE:1, FLEX:1, K:0, DEF:1, BN:6 },
  },
  yahoo: {
    label: 'Yahoo Default', icon: '👑',
    lineup: { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6 },
  },
}

type PickTrade = { roundA: number; slotA: number; roundB: number; slotB: number }

interface DraftSetupProps {
  onStart: (settings: DraftSettings, players: Player[], trades: PickTrade[]) => void
}

const SCORING_LABELS: Record<DraftSettings['scoring'], string> = {
  ppr: 'PPR',
  half_ppr: 'Half PPR',
  standard: 'Standard',
}

const SPEED_LABELS: Record<DraftSettings['speed'], string> = {
  instant: 'Instant (0s)',
  fast: 'Fast (0.5s)',
  normal: 'Normal (1s)',
}

export function DraftSetup({ onStart }: DraftSetupProps) {
  const [numTeams, setNumTeams] = useState(10)
  const [userSlot, setUserSlot] = useState(1)
  const [scoring, setScoring] = useState<DraftSettings['scoring']>('ppr')
  const [speed, setSpeed] = useState<DraftSettings['speed']>('normal')
  const [loading, setLoading] = useState(false)
  const [lineup, setLineup] = useState<LineupConfig>(DEFAULT_LINEUP)
  const [customizing, setCustomizing] = useState(false)
  const [customizePicks, setCustomizePicks] = useState(false)
  const [pickTrades, setPickTrades] = useState<PickTrade[]>([])

  const updateTrade = (i: number, field: string, value: number) =>
    setPickTrades(trades => trades.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  const removeTrade = (i: number) =>
    setPickTrades(trades => trades.filter((_, idx) => idx !== i))

  const handleTeamsChange = (v: number) => {
    setNumTeams(v)
    if (userSlot > v) setUserSlot(1)
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      const provider = new SleeperProvider()
      const players = await provider.getDraftPlayers()
      const settings: DraftSettings = { numTeams, numRounds: 15, userSlot, scoring, speed, lineup }
      onStart(settings, players, pickTrades)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-pmp-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-pmp-white text-2xl font-bold">Mock Draft</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">15 rounds · Snake format</p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Teams</span>
            <select
              aria-label="Teams"
              value={numTeams}
              onChange={e => handleTeamsChange(Number(e.target.value))}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {DRAFT_TEAM_OPTIONS.map(n => (
                <option key={n} value={n}>{n} Teams</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Your Pick Slot</span>
            <select
              aria-label="Your pick slot"
              value={userSlot}
              onChange={e => setUserSlot(Number(e.target.value))}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {Array.from({ length: numTeams }, (_, i) => i + 1).map(slot => (
                <option key={slot} value={slot}>Slot {slot}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Scoring</span>
            <select
              aria-label="Scoring"
              value={scoring}
              onChange={e => setScoring(e.target.value as DraftSettings['scoring'])}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(SCORING_LABELS) as [DraftSettings['scoring'], string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-pmp-gray-500 text-xs uppercase tracking-widest">Draft Speed</span>
            <select
              aria-label="Draft Speed"
              value={speed}
              onChange={e => setSpeed(e.target.value as DraftSettings['speed'])}
              className="bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white rounded-lg px-3 py-2 text-sm"
            >
              {(Object.entries(SPEED_LABELS) as [DraftSettings['speed'], string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Lineup preset selector */}
        <div className="w-full">
          <p className="text-pmp-gray-600 text-xs uppercase tracking-widest mb-2">LINEUP PRESET</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {Object.entries(LINEUP_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setLineup(preset.lineup); setCustomizing(false) }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  !customizing && JSON.stringify(lineup) === JSON.stringify(preset.lineup)
                    ? 'border-pmp-red bg-[#1a0505] text-pmp-white'
                    : 'border-[#2a2a2a] bg-[#111111] text-pmp-gray-400 hover:border-pmp-gray-600'
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomizing(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors col-span-2 ${
                customizing
                  ? 'border-pmp-red bg-[#1a0505] text-pmp-white'
                  : 'border-[#2a2a2a] bg-[#111111] text-pmp-gray-400 hover:border-pmp-gray-600'
              }`}
            >
              <span>⚙️</span><span>Custom</span>
            </button>
          </div>

          {/* Custom stepper rows — only shown when customizing */}
          {customizing && (() => {
            const total = Object.values(lineup).reduce((s, n) => s + n, 0)
            return (
              <div>
                <p className="text-pmp-gray-600 text-xs uppercase tracking-widest mb-3">LINEUP</p>
                {(['QB','RB','WR','TE','FLEX','K','DEF','BN'] as const).map(pos => (
                  <div key={pos} className="flex items-center justify-between py-1.5">
                    <span className="text-pmp-white text-sm w-12">{pos}</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setLineup(l => ({ ...l, [pos]: Math.max(0, l[pos] - 1) }))}
                        className="w-7 h-7 rounded-full bg-[#1e1e1e] text-pmp-white text-lg leading-none flex items-center justify-center hover:bg-[#2a2a2a]"
                      >−</button>
                      <span className="text-pmp-white text-sm w-4 text-center">{lineup[pos]}</span>
                      <button
                        type="button"
                        onClick={() => setLineup(l => ({ ...l, [pos]: l[pos] + 1 }))}
                        className="w-7 h-7 rounded-full bg-[#1e1e1e] text-pmp-white text-lg leading-none flex items-center justify-center hover:bg-[#2a2a2a]"
                      >+</button>
                    </div>
                  </div>
                ))}
                <p className={`text-xs mt-2 ${total === 15 ? 'text-pmp-gray-600' : 'text-yellow-500'}`}>
                  {total} / 15 slots {total !== 15 ? '— adjust to match 15 rounds' : '✓'}
                </p>
              </div>
            )
          })()}
        </div>

        {/* Customize Draft Order — pre-draft pick trading */}
        <div className="w-full">
          <button
            type="button"
            onClick={() => setCustomizePicks(v => !v)}
            className="flex items-center gap-2 text-pmp-gray-500 text-sm hover:text-pmp-gray-300 transition-colors"
          >
            <span className={`text-xs transition-transform ${customizePicks ? 'rotate-90' : ''}`}>▶</span>
            Customize Draft Order
          </button>

          {customizePicks && (
            <div className="mt-3 space-y-2">
              <p className="text-pmp-gray-600 text-xs">
                Trade pick slots before the draft — e.g. trade your 1.01 to T4 and receive their 1.04.
              </p>

              {pickTrades.map((trade, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* Round A */}
                  <select value={trade.roundA} onChange={e => updateTrade(i, 'roundA', +e.target.value)}
                    className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
                    {Array.from({length: 15}, (_, r) => (
                      <option key={r+1} value={r+1}>Rd {r+1}</option>
                    ))}
                  </select>
                  {/* Slot A */}
                  <select value={trade.slotA} onChange={e => updateTrade(i, 'slotA', +e.target.value)}
                    className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
                    {Array.from({length: numTeams}, (_, s) => (
                      <option key={s+1} value={s+1}>{s+1 === userSlot ? 'YOU' : `T${s+1}`}</option>
                    ))}
                  </select>
                  <span className="text-pmp-gray-500 text-xs">↔</span>
                  {/* Round B */}
                  <select value={trade.roundB} onChange={e => updateTrade(i, 'roundB', +e.target.value)}
                    className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
                    {Array.from({length: 15}, (_, r) => (
                      <option key={r+1} value={r+1}>Rd {r+1}</option>
                    ))}
                  </select>
                  {/* Slot B */}
                  <select value={trade.slotB} onChange={e => updateTrade(i, 'slotB', +e.target.value)}
                    className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-pmp-white text-xs">
                    {Array.from({length: numTeams}, (_, s) => (
                      <option key={s+1} value={s+1}>{s+1 === userSlot ? 'YOU' : `T${s+1}`}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeTrade(i)}
                    className="text-pmp-gray-600 hover:text-pmp-red text-xs">✕</button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setPickTrades(t => [...t, { roundA: 1, slotA: userSlot, roundB: 1, slotB: userSlot === 1 ? 2 : 1 }])}
                className="text-pmp-red text-xs hover:text-red-400 transition-colors"
              >
                + Add Pick Trade
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Loading players...' : 'Start Draft'}
        </button>
      </div>
    </div>
  )
}
