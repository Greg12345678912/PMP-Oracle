import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'
import { predictionsLocked } from '@/lib/oracle/predictions'
import { getProfile } from '@/lib/oracle/profile'

// PUT /api/oracle/predictions/[id] — admin only, sets is_correct
// DELETE /api/oracle/predictions/[id] — owner only, deletes prediction (423 if locked)

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { isCorrect: boolean }
  try {
    body = await request.json() as { isCorrect: boolean }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.isCorrect !== 'boolean') {
    return NextResponse.json({ error: 'isCorrect must be a boolean' }, { status: 400 })
  }

  const { id } = await params
  const db = getServiceClient()
  const { error } = await db
    .from('challenge_predictions')
    .update({ is_correct: body.isCorrect, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (predictionsLocked()) {
    return NextResponse.json({ error: 'Predictions are locked' }, { status: 423 })
  }

  const { id } = await params
  const db = getServiceClient()

  // Verify ownership before deleting
  const { data: row } = await db
    .from('challenge_predictions')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.user_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db
    .from('challenge_predictions')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
