'use client'
import { useRouter } from 'next/navigation'
import { OracleSplashCTA } from './OracleSplashCTA'

interface ProfileGateProps {
  redirectTo?: string
  onDismiss: () => void
}

export function ProfileGate({ onDismiss }: ProfileGateProps) {
  const router = useRouter()

  const handleSignInSuccess = () => {
    onDismiss()
    router.refresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-6 sm:pb-0"
      onClick={e => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl w-full max-w-sm p-6 flex flex-col gap-5 overflow-y-auto max-h-[90dvh]">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">Pretty Much Picks</p>
          <h2 className="text-pmp-white font-bold text-xl leading-snug">
            Create your fantasy profile
          </h2>
          <p className="text-pmp-gray-500 text-sm">
            Your rankings are saved locally. Create a profile to lock them in permanently.
          </p>
        </div>

        {/* Benefits */}
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

        {/* Auth form */}
        <OracleSplashCTA onSignInSuccess={handleSignInSuccess} />

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
