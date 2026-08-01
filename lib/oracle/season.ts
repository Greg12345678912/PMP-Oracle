import { getServiceClient } from '@/lib/league/db'

export interface Season {
  id: string
  year: number
  name: string
  lock_at: string
  scored_at: string | null
  status: 'open' | 'locked' | 'scoring' | 'scored'
}

export async function getCurrentSeason(): Promise<Season | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('seasons')
    .select('*')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as Season | null
}

export function isLocked(season: Season): boolean {
  if (season.status !== 'open') return true
  return new Date(season.lock_at) <= new Date()
}
