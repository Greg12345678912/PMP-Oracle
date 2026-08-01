import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getPredictions } from '@/lib/oracle/predictions'
import { getServiceClient } from '@/lib/league/db'
import { PredictionsClient } from '@/components/oracle/PredictionsClient'

export const dynamic = 'force-dynamic'

export default async function PredictionsPage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  const locked = season ? isLocked(season) : true

  const predictions = session && season
    ? await getPredictions(getServiceClient(), session.user.id, season.id)
    : []

  return (
    <PredictionsClient
      initialPredictions={predictions}
      locked={locked}
      isSignedIn={!!session}
    />
  )
}
