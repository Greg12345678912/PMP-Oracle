declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void
    }
  }
}

function track(event: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.posthog?.capture(event, properties)
}

export const analytics = {
  positionSelected: (position: string) =>
    track('position_selected', { position }),
  tierListDownloaded: (position: string) =>
    track('tier_list_downloaded', { position }),
  tierListShared: (method: 'copy_link' | 'share_x', position: string) =>
    track('tier_list_shared', { method, position }),
  playerSearched: (query: string) =>
    track('player_searched', { query }),
  officialRankingsLoaded: (position: string) =>
    track('official_rankings_loaded', { position }),
  mockDraftStarted: (settings: { numTeams: number; scoring: string; speed: string }) => {
    track('mock_draft_started', settings)
  },
  mockDraftShared: () => {
    track('mock_draft_shared', {})
  },
}
