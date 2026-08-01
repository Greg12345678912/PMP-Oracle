import { getServiceClient } from '@/lib/league/db'

export interface UserProfile {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl: string | null
  isVerified: boolean
  isCreator: boolean
  isAdmin: boolean
  creatorLinks: Record<string, string>
  accuracyRating: number
  createdAt: string
}

/** Derive a URL-safe username from a display name. */
export function generateUsername(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20)
}

/** Append a numeric suffix to make username unique. */
export function uniqueUsername(base: string, suffix: number): string {
  const trimmed = base.slice(0, 16)
  return `${trimmed}${suffix}`
}

/** Fetch existing profile or return null. */
export async function getProfile(userId: string): Promise<UserProfile | null> {
  const db = getServiceClient()
  const { data } = await db
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return mapRow(data)
}

/** Create profile, handling username collisions with numeric suffix. */
export async function createProfile(params: {
  userId: string
  displayName: string
  avatarUrl: string | null
  desiredUsername?: string
}): Promise<UserProfile> {
  const db = getServiceClient()
  const base = (params.desiredUsername ?? generateUsername(params.displayName)) || 'user'

  for (let attempt = 0; attempt < 10; attempt++) {
    const username = attempt === 0 ? base : uniqueUsername(base, attempt)
    const { data, error } = await db
      .from('user_profiles')
      .insert({
        user_id: params.userId,
        username,
        display_name: params.displayName,
        avatar_url: params.avatarUrl,
      })
      .select()
      .single()

    if (!error && data) return mapRow(data)
    // If unique violation on username, try next suffix
    if (error?.code !== '23505') throw error
  }
  throw new Error('Could not generate unique username after 10 attempts')
}

/** Fetch or create a profile for the given user.
 *  Returns the profile and whether it was just created. */
export async function getOrCreateProfile(
  userId: string,
  googleDisplayName: string,
  avatarUrl: string | null,
): Promise<{ profile: UserProfile; isNew: boolean }> {
  const existing = await getProfile(userId)
  if (existing) return { profile: existing, isNew: false }
  const profile = await createProfile({ userId, displayName: googleDisplayName, avatarUrl })
  return { profile, isNew: true }
}

function mapRow(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    avatarUrl: row.avatar_url as string | null,
    isVerified: row.is_verified as boolean,
    isCreator: row.is_creator as boolean,
    isAdmin: row.is_admin as boolean,
    creatorLinks: (row.creator_links ?? {}) as Record<string, string>,
    accuracyRating: row.accuracy_rating as number,
    createdAt: row.created_at as string,
  }
}
