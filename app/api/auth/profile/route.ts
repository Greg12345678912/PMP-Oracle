import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile, createProfile } from '@/lib/oracle/profile'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ profile: null })

  const profile = await getProfile(session.user.id)
  return NextResponse.json({ profile })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // If profile already exists, return it
  const existing = await getProfile(session.user.id)
  if (existing) return NextResponse.json({ profile: existing })

  const body = await request.json() as { displayName?: string }
  const displayName =
    body.displayName ??
    session.user.user_metadata?.full_name ??
    session.user.email?.split('@')[0] ??
    'Anonymous'
  const avatarUrl = session.user.user_metadata?.avatar_url ?? null

  const profile = await createProfile({ userId: session.user.id, displayName, avatarUrl })
  return NextResponse.json({ profile }, { status: 201 })
}
