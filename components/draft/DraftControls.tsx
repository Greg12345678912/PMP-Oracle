'use client'
import { useState } from 'react'

interface DraftControlsProps {
  status: 'drafting' | 'paused' | 'complete'
  undoDisabled: boolean
  redoDisabled: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onShare: () => Promise<void>
  shareLabel: string
}

export function DraftControls({
  undoDisabled, redoDisabled, onUndo, onRedo, onReset, onShare, shareLabel,
}: DraftControlsProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    await onShare()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const controls = [
    { label: 'Undo',                      icon: '↶', onClick: onUndo,    disabled: undoDisabled },
    { label: 'Redo',                      icon: '↷', onClick: onRedo,    disabled: redoDisabled },
    { label: 'Reset',                     icon: '⟳', onClick: onReset,   disabled: false },
    { label: copied ? '✓ Copied' : shareLabel, icon: '🔗', onClick: handleShare, disabled: false },
  ]

  return (
    <div className="flex border-b border-[#1e1e1e] bg-[#111111] shrink-0">
      {controls.map(c => (
        <button
          key={c.label}
          onClick={c.onClick}
          disabled={c.disabled}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-pmp-gray-400 hover:text-pmp-white hover:bg-[#1e1e1e] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span>{c.icon}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  )
}
