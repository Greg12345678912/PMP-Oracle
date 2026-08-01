'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { PREDICTION_QUESTIONS } from '@/lib/oracle/predictions'
import type { PredictionRow, PredictionQuestionId } from '@/lib/oracle/predictions'

interface PredictionsClientProps {
  initialPredictions: PredictionRow[]
  locked: boolean
  isSignedIn: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface QuestionState {
  answer: string
  editing: boolean
  saveState: SaveState
  errorMsg: string | null
}

function buildInitialState(
  initialPredictions: PredictionRow[],
): Record<PredictionQuestionId, QuestionState> {
  const byId = new Map(initialPredictions.map(p => [p.questionId, p]))
  return Object.fromEntries(
    PREDICTION_QUESTIONS.map(q => {
      const saved = byId.get(q.id)
      return [
        q.id,
        {
          answer: saved?.answer ?? '',
          editing: !saved,
          saveState: 'idle' as SaveState,
          errorMsg: null,
        },
      ]
    }),
  ) as Record<PredictionQuestionId, QuestionState>
}

function buildIsCorrectMap(
  initialPredictions: PredictionRow[],
): Record<PredictionQuestionId, boolean | null> {
  return Object.fromEntries(
    PREDICTION_QUESTIONS.map(q => {
      const saved = initialPredictions.find(p => p.questionId === q.id)
      return [q.id, saved?.isCorrect ?? null]
    }),
  ) as Record<PredictionQuestionId, boolean | null>
}

export function PredictionsClient({
  initialPredictions,
  locked,
  isSignedIn,
}: PredictionsClientProps) {
  const [state, setState] = useState(() => buildInitialState(initialPredictions))
  const [isCorrectMap] = useState(() => buildIsCorrectMap(initialPredictions))

  const setField = useCallback(
    (questionId: PredictionQuestionId, patch: Partial<QuestionState>) => {
      setState(prev => ({
        ...prev,
        [questionId]: { ...prev[questionId], ...patch },
      }))
    },
    [],
  )

  const handleSave = useCallback(
    async (questionId: PredictionQuestionId) => {
      const answer = state[questionId].answer.trim()
      if (!answer) return

      if (!isSignedIn) {
        // Redirect to sign-in; preserve return URL
        window.location.href = `/auth/signin?next=/challenge/predictions`
        return
      }

      setField(questionId, { saveState: 'saving', errorMsg: null })
      try {
        const res = await fetch('/api/oracle/predictions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId, answer }),
        })
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: 'Failed to save' }))
          throw new Error(error as string)
        }
        setField(questionId, { saveState: 'saved', editing: false })
      } catch (e) {
        setField(questionId, {
          saveState: 'error',
          errorMsg: e instanceof Error ? e.message : 'Something went wrong',
        })
      }
    },
    [state, isSignedIn, setField],
  )

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      {/* Sticky nav */}
      <div className="sticky top-0 z-10 bg-pmp-black border-b border-pmp-gray-800 px-4 py-3 flex items-center gap-3">
        <Link
          href="/challenge/rankings"
          className="text-pmp-gray-500 text-sm hover:text-pmp-white transition-colors"
        >
          &larr; My Rankings
        </Link>
        <div className="flex-1" />
        <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">
          Season Predictions
        </p>
      </div>

      <div className="flex flex-col gap-4 px-4 py-6 max-w-md mx-auto w-full">
        <div className="flex flex-col gap-1">
          <h1 className="text-pmp-white font-bold text-xl">Season Predictions</h1>
          <p className="text-pmp-gray-600 text-sm">
            {locked
              ? 'Predictions are locked for the 2026 season.'
              : 'Pick your answers before Week 1 kickoff. One pick per category.'}
          </p>
        </div>

        {PREDICTION_QUESTIONS.map(q => {
          const qs = state[q.id]
          const isCorrect = isCorrectMap[q.id]
          const hasSavedAnswer = !qs.editing && qs.answer.length > 0

          return (
            <div
              key={q.id}
              className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-4 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-pmp-white text-sm font-semibold">{q.label}</p>
                {isCorrect === true && (
                  <span className="text-base" title="Correct">✅</span>
                )}
                {isCorrect === false && (
                  <span className="text-base" title="Incorrect">❌</span>
                )}
              </div>

              {locked ? (
                /* Read-only when locked */
                <div className="min-h-[44px] flex items-center">
                  {qs.answer ? (
                    <p className="text-pmp-white text-sm">{qs.answer}</p>
                  ) : (
                    <p className="text-pmp-gray-600 text-sm italic">No prediction saved</p>
                  )}
                </div>
              ) : hasSavedAnswer ? (
                /* Saved state — show answer with Edit button */
                <div className="flex items-center justify-between gap-3 min-h-[44px]">
                  <p className="text-pmp-white text-sm flex-1">{qs.answer}</p>
                  <div className="flex items-center gap-2">
                    {qs.saveState === 'saved' && (
                      <span className="text-green-500 text-xs font-medium">Saved</span>
                    )}
                    <button
                      onClick={() => setField(q.id, { editing: true, saveState: 'idle' })}
                      className="text-pmp-red text-xs font-semibold hover:opacity-80 transition-opacity min-h-[44px] px-2"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit / input state */
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={qs.answer}
                      onChange={e => setField(q.id, { answer: e.target.value, saveState: 'idle', errorMsg: null })}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(q.id) }}
                      placeholder={q.placeholder}
                      maxLength={100}
                      className="flex-1 min-h-[44px] bg-pmp-gray-800 border border-pmp-gray-700 rounded-lg px-3 text-pmp-white text-sm placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-gray-500 transition-colors"
                    />
                    <button
                      onClick={() => handleSave(q.id)}
                      disabled={qs.saveState === 'saving' || !qs.answer.trim()}
                      className="min-h-[44px] px-4 bg-pmp-red text-pmp-white font-bold text-sm rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap"
                    >
                      {qs.saveState === 'saving' ? 'Saving\u2026' : 'Save'}
                    </button>
                  </div>
                  {qs.saveState === 'error' && qs.errorMsg && (
                    <p className="text-pmp-red text-xs">{qs.errorMsg}</p>
                  )}
                  {qs.saveState === 'saved' && (
                    <p className="text-green-500 text-xs">Saved</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {!locked && !isSignedIn && (
          <p className="text-pmp-gray-600 text-xs text-center">
            You&apos;ll be asked to sign in when you save your first prediction.
          </p>
        )}
      </div>
    </div>
  )
}
