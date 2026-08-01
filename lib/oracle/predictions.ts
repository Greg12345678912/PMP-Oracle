import { ORACLE_LOCK_DATE } from './constants'
import type { SupabaseClient } from '@supabase/supabase-js'

export const PREDICTION_QUESTIONS = [
  { id: 'nfl_mvp',  label: 'NFL MVP',                       placeholder: 'e.g. Lamar Jackson' },
  { id: 'oroy',     label: 'Offensive Rookie of the Year',  placeholder: 'e.g. Caleb Williams' },
  { id: 'cpoy',     label: 'Comeback Player of the Year',   placeholder: 'e.g. Tua Tagovailoa' },
  { id: 'rb1',      label: 'RB1 Overall (PPR)',             placeholder: 'e.g. Christian McCaffrey' },
  { id: 'wr1',      label: 'WR1 Overall (PPR)',             placeholder: 'e.g. Tyreek Hill' },
  { id: 'te1',      label: 'TE1 Overall (PPR)',             placeholder: 'e.g. Travis Kelce' },
  { id: 'bust',     label: 'Biggest Bust',                  placeholder: 'e.g. CeeDee Lamb' },
  { id: 'breakout', label: 'Biggest Breakout',              placeholder: 'e.g. Rashee Rice' },
] as const

export type PredictionQuestionId = typeof PREDICTION_QUESTIONS[number]['id']

export interface PredictionRow {
  id: string
  questionId: PredictionQuestionId
  answer: string
  isCorrect: boolean | null
}

export function predictionsLocked(): boolean {
  return new Date() >= ORACLE_LOCK_DATE
}

export async function getPredictions(
  supabase: SupabaseClient,
  userId: string,
  seasonId: string,
): Promise<PredictionRow[]> {
  const { data } = await supabase
    .from('challenge_predictions')
    .select('id, question_id, answer, is_correct')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
  return (data ?? []).map(r => ({
    id: r.id as string,
    questionId: r.question_id as PredictionQuestionId,
    answer: r.answer as string,
    isCorrect: r.is_correct as boolean | null,
  }))
}

export async function upsertPrediction(
  supabase: SupabaseClient,
  userId: string,
  seasonId: string,
  questionId: PredictionQuestionId,
  answer: string,
): Promise<void> {
  if (predictionsLocked()) throw new Error('Predictions are locked')
  await supabase
    .from('challenge_predictions')
    .upsert(
      { user_id: userId, season_id: seasonId, question_id: questionId, answer, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,season_id,question_id' },
    )
}
