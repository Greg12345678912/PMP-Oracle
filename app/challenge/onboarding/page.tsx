import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { getProfile, createProfile } from '@/lib/oracle/profile'
import { OnboardingClient } from './client'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/challenge')

  let profile = await getProfile(session.user.id)

  if (!profile) {
    const desiredUsername = (session.user.user_metadata?.desired_username as string | null) ?? null
    const displayName =
      session.user.user_metadata?.full_name
      ?? desiredUsername
      ?? session.user.email?.split('@')[0]
      ?? 'user'
    profile = await createProfile({
      userId: session.user.id,
      displayName,
      avatarUrl: session.user.user_metadata?.avatar_url ?? null,
      desiredUsername: desiredUsername ?? undefined,
    })
  }

  return (
    <OnboardingClient
      initialUsername={profile.username}
      displayName={profile.displayName}
    />
  )
}
