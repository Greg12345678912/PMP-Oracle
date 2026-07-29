'use client'
import { buildRosterSlots } from '@/lib/draft/lineup'
import type { RosterSlot } from '@/lib/draft/lineup'
import type { LineupConfig, PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface MyTeamProps {
  picks: PickSlot[]
  playerMap: Map<string, Player>
  lineup: LineupConfig
}

function assignToRoster(
  userPicks: { player: Player; pick: PickSlot }[],
  slots: RosterSlot[]
): ({ player: Player; pick: PickSlot } | null)[] {
  const used = new Set<number>()
  return slots.map(slot => {
    const match = userPicks.find(
      up => !used.has(up.pick.overallPick) &&
            slot.positions.includes(up.player.position)
    )
    if (match) used.add(match.pick.overallPick)
    return match ?? null
  })
}

export function MyTeam({ picks, playerMap, lineup }: MyTeamProps) {
  const userPicks = picks
    .filter(p => p.isUser && p.playerId !== null)
    .map(pick => {
      const player = playerMap.get(pick.playerId!)
      return player ? { player, pick } : null
    })
    .filter((x): x is { player: Player; pick: PickSlot } => x !== null)

  const slots = buildRosterSlots(lineup)
  const assigned = assignToRoster(userPicks, slots)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-pmp-gray-800">
        <h2 className="text-pmp-white text-sm font-bold">My Team</h2>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {slots.map((slot, idx) => {
          const entry = assigned[idx]
          if (entry) {
            return (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a0505] border border-pmp-red/20"
              >
                <span className="text-pmp-red text-[10px] font-bold w-8 shrink-0">{slot.label}</span>
                {entry.player.headshotUrl ? (
                  <img
                    src={entry.player.headshotUrl}
                    alt={entry.player.name}
                    className="w-8 h-8 rounded-full object-cover bg-[#2a2a2a] shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0">
                    <span className="text-pmp-gray-500 text-xs font-bold">
                      {entry.player.name.charAt(0)}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-pmp-white text-xs font-semibold truncate leading-tight">{entry.player.name}</p>
                  <p className="text-pmp-gray-600 text-[10px]">{entry.player.team}</p>
                </div>
              </div>
            )
          } else {
            return (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#111111] border border-dashed border-[#2a2a2a]"
              >
                <span className="text-pmp-gray-700 text-[10px] font-bold w-8 shrink-0">{slot.label}</span>
                <span className="text-pmp-gray-700 text-xs">—</span>
              </div>
            )
          }
        })}
      </div>
    </div>
  )
}
