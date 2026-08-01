'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/auth/client'

type Mode = 'signup' | 'signin'
type View = 'form' | 'check-email'
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const USERNAME_RE = /^[a-z0-9_]{3,20}$/

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84z"/>
  </svg>
)

export function OracleSplashCTA() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signup')
  const [view, setView] = useState<View>('form')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (mode !== 'signup') return
    const val = username.trim().toLowerCase()
    if (!val) { setUsernameStatus('idle'); return }
    if (!USERNAME_RE.test(val)) { setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/oracle/username?u=${encodeURIComponent(val)}`)
        const data = await res.json()
        setUsernameStatus(data.available ? 'available' : 'taken')
      } catch {
        setUsernameStatus('idle')
      }
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [username, mode])

  const handleGoogle = async () => {
    const supabase = getBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/challenge`,
      },
    })
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'signup' && usernameStatus !== 'available') return
    setLoading(true)
    setError(null)
    const supabase = getBrowserClient()

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/challenge/onboarding`,
          data: { desired_username: username.trim().toLowerCase() },
        },
      })
      if (signUpError) {
        setError(signUpError.message)
      } else if (data.session) {
        // Email confirmation disabled — session returned immediately
        router.push('/challenge/onboarding')
      } else {
        setView('check-email')
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message)
      } else {
        router.push('/challenge')
        router.refresh()
      }
    }
    setLoading(false)
  }

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    setError(null)
    setUsername('')
    setUsernameStatus('idle')
  }

  if (view === 'check-email') {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-6 py-6 flex flex-col gap-3">
          <p className="text-pmp-white font-bold text-base">Check your email</p>
          <p className="text-pmp-gray-400 text-sm leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="text-pmp-white font-semibold">{email}</span>.
            Click it to activate your account and claim your username.
          </p>
          <p className="text-pmp-gray-700 text-xs mt-1">Didn&apos;t get it? Check your spam folder.</p>
        </div>
        <button
          onClick={() => { setView('form'); setMode('signin') }}
          className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  const usernameHint = () => {
    if (mode !== 'signup' || !username) return null
    if (usernameStatus === 'invalid') return <p className="text-pmp-red text-xs">3–20 chars · letters, numbers, underscores only</p>
    if (usernameStatus === 'checking') return <p className="text-pmp-gray-600 text-xs">Checking…</p>
    if (usernameStatus === 'available') return <p className="text-green-500 text-xs">✓ Available</p>
    if (usernameStatus === 'taken') return <p className="text-pmp-red text-xs">Already taken — try another</p>
    return null
  }

  const canSubmit = mode === 'signin' || usernameStatus === 'available'

  return (
    <div className="flex flex-col gap-3">
      {/* Google */}
      <button
        onClick={handleGoogle}
        className="w-full bg-pmp-white text-pmp-black font-bold py-4 rounded-2xl text-base hover:opacity-90 transition-opacity flex items-center justify-center gap-2.5 active:scale-[0.98]"
      >
        <GoogleIcon />
        Enter with Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-pmp-gray-800" />
        <span className="text-pmp-gray-700 text-xs">or</span>
        <div className="flex-1 h-px bg-pmp-gray-800" />
      </div>

      {/* Email / password form */}
      <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2.5">
        {mode === 'signup' && (
          <div className="flex flex-col gap-1">
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="Username"
              required
              maxLength={20}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="username"
              className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white rounded-xl px-4 py-3.5 text-sm placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-red transition-colors"
            />
            {usernameHint()}
          </div>
        )}
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          required
          autoComplete="email"
          className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white rounded-xl px-4 py-3.5 text-sm placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-red transition-colors"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={6}
          className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white rounded-xl px-4 py-3.5 text-sm placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-red transition-colors"
        />
        {error && <p className="text-pmp-red text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-2xl text-base hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-[0.98]"
        >
          {loading ? 'Loading\u2026' : mode === 'signup' ? 'Create Account' : 'Sign In'}
        </button>
      </form>

      {/* Mode toggle */}
      <p className="text-pmp-gray-600 text-xs text-center pt-1">
        {mode === 'signup' ? (
          <>
            Already have an account?{' '}
            <button
              onClick={() => switchMode('signin')}
              className="text-pmp-gray-400 hover:text-pmp-white underline transition-colors"
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <button
              onClick={() => switchMode('signup')}
              className="text-pmp-gray-400 hover:text-pmp-white underline transition-colors"
            >
              Create one
            </button>
          </>
        )}
      </p>
    </div>
  )
}
