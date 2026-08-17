import { forwardRef } from 'react'
import type { Tier, Player, Position } from '@/lib/data/types'
import { getTeamColor } from '@/lib/team-colors'

interface TierImageProps {
  tiers: Tier[]
  players: Player[]
  position: Position
}

const LABEL_COLORS: Record<string, string> = {
  S: '#E10600', A: '#FF6B00', B: '#FFB800',
  C: '#9ACD32', D: '#4A90E2', E: '#8B5CF6', F: '#6B6B6B', G: '#475569',
}

export const TierImage = forwardRef<HTMLDivElement, TierImageProps>(
  ({ tiers, players, position }, ref) => {
    const playerMap = new Map(players.map(p => [p.id, p]))

    const tiersWithPlayers = tiers
      .map(tier => ({
        ...tier,
        players: tier.playerIds.map(id => playerMap.get(id)).filter(Boolean) as Player[],
      }))
      .filter(tier => tier.players.length > 0)

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1350,
          backgroundColor: '#0B0B0B',
          fontFamily: 'Inter, sans-serif',
          padding: '80px 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ color: '#E10600', fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 8 }}>
            Pretty Much Picks
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 52, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
            {position} Tier List
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 2, backgroundColor: '#1A1A1A', marginBottom: 40 }} />

        {/* Tiers */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {tiersWithPlayers.map(tier => (
            <div key={tier.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
              {/* Label */}
              <div style={{
                width: 64,
                height: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#111111',
                borderRadius: 12,
                flexShrink: 0,
              }}>
                <span style={{
                  color: LABEL_COLORS[tier.label.toUpperCase()] ?? '#E10600',
                  fontSize: 28,
                  fontWeight: 800,
                }}>
                  {tier.label}
                </span>
              </div>

              {/* Players */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, flex: 1 }}>
                {tier.players.map(player => (
                  <div key={player.id} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    width: 96,
                    padding: '8px 4px',
                    backgroundColor: '#111111',
                    borderRadius: 10,
                    borderTop: `3px solid ${getTeamColor(player.team)}`,
                  }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={player.headshotUrl}
                      alt={player.name}
                      width={56}
                      height={56}
                      style={{ objectFit: 'contain' }}
                      crossOrigin="anonymous"
                    />
                    <span style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                      {player.lastName}
                    </span>
                    <span style={{ color: '#555555', fontSize: 10, textAlign: 'center' }}>
                      {player.team} · {player.position}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, borderTop: '2px solid #1A1A1A', paddingTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#E10600', fontWeight: 700, fontSize: 18 }}>Pretty Much Picks</span>
          <span style={{ color: '#555555', fontSize: 14 }}>prettymuchpicks.ca</span>
        </div>
      </div>
    )
  }
)
TierImage.displayName = 'TierImage'
