'use client'
import { useState } from 'react'

export function AutoEnroll2027({ initialValue }: { initialValue: boolean }) {
  const [enrolled, setEnrolled] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    const next = !enrolled
    setEnrolled(next)
    setSaving(true)
    try {
      await fetch('/api/oracle/auto-enroll', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrolled: next }),
      })
    } catch {
      setEnrolled(!next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="h-px bg-pmp-gray-800" />
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="flex items-start gap-3 py-2 w-full text-left"
      >
        <span className="text-lg w-6 text-center shrink-0 mt-px">
          {enrolled ? '☑' : '☐'}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-pmp-white">
            I'm in for the 2027 Oracle Challenge
          </p>
          <p className="text-pmp-gray-600 text-xs leading-snug mt-0.5">
            Your 2026 rankings carry over as your starting picks — edit anytime before the 2027 lock.
          </p>
        </div>
      </button>
    </>
  )
}
