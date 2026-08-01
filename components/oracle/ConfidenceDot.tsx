'use client'

const DOT_BG: Record<string, string> = {
  low:    'bg-pmp-gray-600',
  medium: 'bg-[#f97316]',
  high:   'bg-pmp-red',
}
const LABELS: Record<string, string> = { low: 'L', medium: 'M', high: 'H' }
const CYCLE: Record<string, 'low' | 'medium' | 'high'> = {
  low: 'medium',
  medium: 'high',
  high: 'low',
}

interface ConfidenceDotProps {
  confidence: 'low' | 'medium' | 'high'
  onChange: (next: 'low' | 'medium' | 'high') => void
  disabled?: boolean
}

/** Toggles L → M → H → L. Visual dot is 20px; touch target is 44×44px. */
export function ConfidenceDot({ confidence, onChange, disabled }: ConfidenceDotProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(CYCLE[confidence])}
      title={`Confidence: ${confidence} — tap to change`}
      aria-label={`Confidence ${confidence}, tap to cycle`}
      disabled={disabled}
      className="flex items-center justify-center w-11 h-11 shrink-0 disabled:cursor-not-allowed"
    >
      <span
        className={[
          'w-5 h-5 rounded-full text-[9px] font-bold text-pmp-white',
          'flex items-center justify-center transition-opacity',
          DOT_BG[confidence],
          disabled ? 'opacity-40' : 'opacity-100 active:scale-95',
        ].join(' ')}
      >
        {LABELS[confidence]}
      </span>
    </button>
  )
}
