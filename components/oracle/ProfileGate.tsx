'use client'
import { getBrowserClient } from '@/lib/auth/client'

interface ProfileGateProps {
  redirectTo?: string
  onDismiss: () => void
}

export function ProfileGate({ redirectTo = '/challenge/rankings', onDismiss }: ProfileGateProps) {
  const handleContinue = async () => {
    const supabase = getBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      onClick={e => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl w-full max-w-sm p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">Pretty Much Picks</p>
          <h2 className="text-pmp-white font-bold text-xl leading-snug">
            Create your fantasy profile
          </h2>
          <p className="text-pmp-gray-500 text-sm">
            Your rankings are saved locally. Create a profile to lock them in permanently.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {[
            'Enter the Oracle Challenge',
            'Save your rankings permanently',
            'Build your fantasy reputation',
            'Compare with friends',
          ].map(benefit => (
            <li key={benefit} className="flex items-center gap-2 text-pmp-white text-sm">
              <span className="text-pmp-red font-bold">✓</span>
              {benefit}
            </li>
          ))}
        </ul>

        <button
          onClick={handleContinue}
          className="w-full bg-pmp-white text-pmp-black font-bold py-3.5 rounded-xl text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84z"/>
          </svg>
          Enter with Google
        </button>

        <button
          onClick={onDismiss}
          className="text-pmp-gray-600 text-xs text-center hover:text-pmp-gray-500 transition-colors"
        >
          Keep building without saving
        </button>
      </div>
    </div>
  )
}
