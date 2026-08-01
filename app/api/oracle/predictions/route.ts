import { NextRequest, NextResponse } from 'next/server'
import { getSession, getServerClient } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import {
  getPredictions,
  upsertPrediction,
  predictionsLocked,
  PREDICTION_QUESTIONS,
} from '@/lib/oracle/predictions'
import type { PredictionQuestionId } from '@/lib/oracle/predictions'

const VALID_QUESTION_IDS = new Set<string>(PREDICTION_QUESTIONS.map(q => q.id))

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ predictions: [] })

  // Use service client to read own predictions (bypasses RLS edge cases)
  const db = getServiceClient()
  const predictions = await getPredictions(db, session.user.id, season.id)
  return NextResponse.json({ predictions })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (predictionsLocked()) {
    return NextResponse.json({ error: 'Predictions are locked' }, { status: 423 })
  }

  let body: { questionId: string; answer: string }
  try {
    body = await request.json() as { questionId: string; answer: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.questionId || !VALID_QUESTION_IDS.has(body.questionId)) {
    return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 })
  }

  if (!body.answer || typeof body.answer !== 'string' || body.answer.trim().length === 0) {
    return NextResponse.json({ error: 'Answer is required' }, { status: 400 })
  }

  if (body.answer.length > 100) {
    return NextResponse.json({ error: 'Answer must be 100 characters or fewer' }, { status: 400 })
  }

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })

  // Use user-scoped Supabase client so RLS insert check (auth.uid() = user_id) passes
  const supabase = await getServerClient()
  await upsertPrediction(supabase, session.user.id, season.id, body.questionId as PredictionQuestionId, body.answer.trim())

  return NextResponse.json({ ok: true })
}
