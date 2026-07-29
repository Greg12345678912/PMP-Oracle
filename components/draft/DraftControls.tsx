'use client'
import { useState } from 'react'

interface DraftControlsProps {
  status: 'drafting' | 'paused' | 'complete'
  canUndo: boolean
  canRedo: boolean
  onContinueDraft: () => void
  onReset: () => void
  onUndo: () => void
  onRedo: () => void
  onShare: () => Promise<void>
}

export function DraftControls({
  status, canUndo, canRedo, onContinueDraft, onReset, onUndo, onRedo, onShare,
}: DraftControlsProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    await onShare()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-2 p-3 border-b border-pmp-gray-800">
      {status === 'paused' && (
        <button
          onClick={onContinueDraft}
          className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-base hover:opacity-90 transition-opacity"
        >
          ▶ Continue Draft
        </button>
      )}

      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white text-xs font-semibold py-2 rounded-lg disabled:opacity-30 hover:border-pmp-gray-600 transition-colors"
        >
          ↩ Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white text-xs font-semibold py-2 rounded-lg disabled:opacity-30 hover:border-pmp-gray-600 transition-colors"
        >
          ↪ Redo
        </button>
        <button
          onClick={onReset}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-gray-500 text-xs font-semibold py-2 rounded-lg hover:border-pmp-gray-600 hover:text-pmp-white transition-colors"
        >
          Reset
        </button>
        <button
          onClick={handleShare}
          className="flex-1 bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-gray-500 text-xs font-semibold py-2 rounded-lg hover:border-pmp-gray-600 hover:text-pmp-white transition-colors"
        >
          {copied ? '✓ Copied' : 'Share'}
        </button>
      </div>
    </div>
  )
}
