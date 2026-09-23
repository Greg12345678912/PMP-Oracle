import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'

const ALLOWED_EMOJIS = new Set(['🔥', '😂', '💀', '👀'])

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { targetUserId, seasonId, week, emoji } = body as Record<string, unknown>

  if (
    typeof targetUserId !== 'string' ||
    typeof seasonId !== 'string' ||
    typeof week !== 'number' ||
    typeof emoji !== 'string'
  ) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  if (!ALLOWED_EMOJIS.has(emoji)) {
    return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 })
  }

  // Prevent reacting to yourself
  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: 'Cannot react to yourself' }, { status: 400 })
  }

  const db = getServiceClient()

  // Check for existing reaction (toggle: delete if exists, insert if not)
  const { data: existing } = await db
    .from('reactions')
    .select('id')
    .eq('reactor_id', session.user.id)
    .eq('target_id', targetUserId)
    .eq('season_id', seasonId)
    .eq('week', week)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    await db.from('reactions').delete().eq('id', (existing as { id: string }).id)
    return NextResponse.json({ action: 'removed' })
  }

  const { error } = await db.from('reactions').insert({
    reactor_id: session.user.id,
    target_id: targetUserId,
    season_id: seasonId,
    week,
    emoji,
  })

  if (error) {
    // UNIQUE violation means a concurrent insert beat us — treat as already added
    if (error.code === '23505') {
      return NextResponse.json({ action: 'added' })
    }
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ action: 'added' })
}
