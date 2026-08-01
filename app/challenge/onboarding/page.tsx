import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { OnboardingClient } from './client'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/challenge')

  const profile = await getProfile(session.user.id)
  if (!profile) redirect('/challenge')

  return (
    <OnboardingClient
      initialUsername={profile.username}
      displayName={profile.displayName}
    />
  )
}
