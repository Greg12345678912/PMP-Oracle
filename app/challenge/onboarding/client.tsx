'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

interface OnboardingClientProps {
  initialUsername: string
  displayName: string
  lockAt?: string
}

export function OnboardingClient({ initialUsername, displayName, lockAt }: OnboardingClientProps) {
  const router = useRouter()
  const [step, setStep] = useState<'username' | 'welcome'>('username')
  const [username, setUsername] = useState(initialUsername)
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(true) // own username is available by default
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const firstName = displayName.split(' ')[0]

  // Debounced availability check
  useEffect(() => {
    if (username === initialUsername) {
      setAvailable(true)
      setChecking(false)
      return
    }
    if (!USERNAME_RE.test(username)) {
      setAvailable(null)
      setChecking(false)
      return
    }
    setChecking(true)
    setAvailable(null)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/oracle/username?u=${encodeURIComponent(username)}`)
        const json = await res.json()
        setAvailable(json.available)
      } finally {
        setChecking(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [username, initialUsername])

  // Auto-advance from welcome screen to dashboard
  useEffect(() => {
    if (step !== 'welcome') return
    const t = setTimeout(() => router.replace('/challenge/rankings'), 2500)
    return () => clearTimeout(t)
  }, [step, router])

  const handleClaim = async () => {
    if (!USERNAME_RE.test(username) || available !== true) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/oracle/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (res.ok) {
        setStep('welcome')
      } else {
        const json = await res.json()
        setError(json.error ?? 'Something went wrong')
        if (res.status === 409) setAvailable(false)
      }
    } finally {
      setSaving(false)
    }
  }

  /* ── Welcome screen ──────────────────────────────────────────────── */
  if (step === 'welcome') {
    return (
      <div className="min-h-[calc(100dvh-120px)] flex flex-col items-center justify-center px-6 text-center gap-5">
        <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em]">Oracle Challenge</p>
        <h1 className="text-pmp-white font-black text-4xl leading-tight">
          Welcome, {firstName}.
        </h1>
        <p className="text-pmp-gray-400 text-base">
          Your fantasy profile is ready. Time to rank your players.
        </p>
        <button
          onClick={() => router.replace('/challenge/rankings')}
          className="mt-2 bg-pmp-red text-pmp-white font-bold py-4 px-8 rounded-xl text-sm hover:opacity-90 transition-opacity active:scale-[0.98]"
        >
          Start Ranking &rarr;
        </button>
        <p className="text-pmp-gray-700 text-xs">Taking you there automatically…</p>
      </div>
    )
  }

  /* ── Username claim form ─────────────────────────────────────────── */
  const isValid = USERNAME_RE.test(username)
  const canSubmit = isValid && available === true && !saving && !checking

  return (
    <div className="px-6 pt-10 pb-24 max-w-sm mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em]">Oracle Challenge</p>
        <h1 className="text-pmp-white font-black text-3xl leading-tight">
          Choose your username
        </h1>
        <p className="text-pmp-gray-500 text-sm leading-relaxed">
          This is how you&apos;ll appear on the leaderboard.
          Only one entry per season.
        </p>
      </div>

      {/* Input */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-pmp-gray-500 text-base font-semibold select-none">
            @
          </span>
          <input
            value={username}
            onChange={e =>
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
            }
            placeholder="yourhandle"
            maxLength={20}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white rounded-xl pl-9 pr-4 py-3.5 text-base font-semibold placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-red transition-colors"
          />
        </div>

        {/* Validation / availability feedback */}
        {username.length > 0 && (
          <p className={[
            'text-xs font-medium',
            checking
              ? 'text-pmp-gray-500'
              : !isValid
                ? 'text-pmp-gray-600'
                : available === true
                  ? 'text-green-400'
                  : available === false
                    ? 'text-pmp-red'
                    : 'text-pmp-gray-600',
          ].join(' ')}>
            {checking
              ? 'Checking…'
              : !isValid
                ? 'Letters, numbers, and underscores · 3–20 characters'
                : available === true
                  ? `\u2713 @${username} is available`
                  : available === false
                    ? `\u2717 @${username} is already taken`
                    : ''}
          </p>
        )}

        {error && <p className="text-pmp-red text-xs">{error}</p>}
      </div>

      {/* CTA */}
      <button
        onClick={handleClaim}
        disabled={!canSubmit}
        className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm tracking-wide hover:opacity-90 transition-opacity disabled:opacity-40 active:scale-[0.98]"
      >
        {saving ? 'Saving\u2026' : 'Set Username \u2192'}
      </button>

      {/* Fine print */}
      <p className="text-pmp-gray-700 text-xs text-center leading-relaxed">
        {lockAt
          ? <>Rankings lock {new Date(lockAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })} &middot; Your Oracle Rating starts after your first season</>
          : 'Your Oracle Rating starts after your first season'
        }
      </p>
    </div>
  )
}
