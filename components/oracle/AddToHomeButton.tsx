'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function AddToHomeButton() {
  const [mounted, setMounted] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    setMounted(true)

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
    setIsIOS(ios)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
        setDeferredPrompt(null)
      }
    } else {
      setShowModal(true)
    }
  }

  if (!mounted || isInstalled) return null
  if (!isIOS && !deferredPrompt) return null

  return (
    <>
      <button
        onClick={handleClick}
        className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-pmp-gray-500 hover:text-pmp-white bg-pmp-gray-800 hover:bg-pmp-gray-700 border border-pmp-gray-700 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
        aria-label="Install Pretty Much Picks as an app"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="2" width="14" height="20" rx="2" />
          <path d="M12 18h.01" />
        </svg>
        Install App
      </button>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add to Home Screen">
        <div className="flex flex-col gap-5">
          <p className="text-pmp-gray-500 text-sm">Add Pretty Much Picks to your home screen for quick access:</p>

          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-pmp-red text-pmp-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-pmp-white text-sm font-semibold">Tap the Share button</p>
                <p className="text-pmp-gray-500 text-xs mt-0.5 flex items-center gap-1 flex-wrap">
                  Tap the
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-pmp-gray-600 bg-pmp-gray-800 shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="12" y1="2" x2="12" y2="15" />
                      <polyline points="8 6 12 2 16 6" />
                      <path d="M8 12H5a2 2 0 00-2 2v5a2 2 0 002 2h14a2 2 0 002-2v-5a2 2 0 00-2-2h-3" />
                    </svg>
                  </span>
                  button at the bottom of Safari
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-pmp-red text-pmp-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-pmp-white text-sm font-semibold">Tap &ldquo;Add to Home Screen&rdquo;</p>
                <p className="text-pmp-gray-500 text-xs mt-0.5">
                  Scroll down in the share sheet and tap <span className="text-pmp-white font-semibold">Add to Home Screen</span>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-pmp-red text-pmp-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-pmp-white text-sm font-semibold">Tap &ldquo;Add&rdquo;</p>
                <p className="text-pmp-gray-500 text-xs mt-0.5">
                  Tap <span className="text-pmp-white font-semibold">Add</span> in the top-right corner to confirm
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowModal(false)}
            className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            Got it
          </button>
        </div>
      </Modal>
    </>
  )
}
