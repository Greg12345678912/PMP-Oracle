'use client'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface MyTeamProps {
  picks: PickSlot[]
  playerMap: Map<string, Player>
  numRounds: number
}

export function MyTeam({ picks, playerMap, numRounds }: MyTeamProps) {
  const userPicks = picks.filter(p => p.isUser)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-pmp-gray-800">
        <h2 className="text-pmp-white text-sm font-bold">My Team</h2>
      </div>
      {userPicks.map((pick, idx) => {
        const player = pick.playerId ? playerMap.get(pick.playerId) : undefined
        return (
          <div
            key={pick.overallPick}
            className="flex items-center gap-3 px-3 py-2.5 border-b border-pmp-gray-800"
          >
            <span className="text-pmp-gray-600 text-xs w-5 text-right">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              {player ? (
                <>
                  <p className="text-pmp-white text-sm font-semibold truncate">
                    {player.firstName} {player.lastName}
                  </p>
                  <p className="text-pmp-gray-500 text-xs">{player.position} · {player.team}</p>
                </>
              ) : (
                <p className="text-pmp-gray-700 text-sm">Round {pick.round}</p>
              )}
            </div>
            {player && (
              <span className="text-pmp-gray-600 text-[10px] shrink-0">
                {pick.round}.{String(pick.pickInRound).padStart(2, '0')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
