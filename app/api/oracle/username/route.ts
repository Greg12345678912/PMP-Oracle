import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/** GET /api/oracle/username?u=handle — check availability */
export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get('u') ?? ''
  if (!USERNAME_RE.test(u)) {
    return NextResponse.json({ available: false })
  }
  const db = getServiceClient()
  const { data } = await db
    .from('user_profiles')
    .select('user_id')
    .eq('username', u)
    .maybeSingle()
  return NextResponse.json({ available: !data })
}

/** POST /api/oracle/username — set username for authenticated user */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const username = typeof body.username === 'string' ? body.username : ''
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
  }

  const db = getServiceClient()
  const { error } = await db
    .from('user_profiles')
    .update({ username })
    .eq('user_id', session.user.id)

  if (error?.code === '23505') {
    return NextResponse.json({ error: 'Username taken' }, { status: 409 })
  }
  if (error) {
    return NextResponse.json({ error: 'Failed to update username' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
