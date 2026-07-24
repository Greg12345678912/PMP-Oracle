'use client'
import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TierImage } from './TierImage'
import { analytics } from '@/lib/analytics/events'
import type { Tier, Player, Position } from '@/lib/data/types'

interface DownloadModalProps {
  open: boolean
  onClose: () => void
  tiers: Tier[]
  players: Player[]
  position: Position
  shareUrl: string
}

export function DownloadModal({ open, onClose, tiers, players, position, shareUrl }: DownloadModalProps) {
  const imageRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [exportError, setExportError] = useState(false)

  const handleDownload = async () => {
    if (!imageRef.current) return
    setDownloading(true)
    setExportError(false)
    try {
      const dataUrl = await toPng(imageRef.current, {
        width: 1080,
        height: 1350,
        pixelRatio: 1,
      })
      const link = document.createElement('a')
      link.download = `pmp-${position.toLowerCase()}-tier-list.png`
      link.href = dataUrl
      link.click()
      analytics.tierListDownloaded(position)
    } catch {
      setExportError(true)
    } finally {
      setDownloading(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      analytics.tierListShared('copy_link', position)
    } catch {
      // clipboard unavailable — fail silently
    }
  }

  const handleShareX = () => {
    const text = `My ${position} tier list for 2026 fantasy football 🏈`
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    analytics.tierListShared('share_x', position)
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Share Your Rankings">
        <div className="flex flex-col gap-3">
          <Button onClick={handleDownload} disabled={downloading} size="lg">
            {downloading ? 'Generating...' : 'Download PNG'}
          </Button>

          {exportError && (
            <div className="flex gap-2 items-center">
              <p className="text-pmp-red text-xs flex-1">Export failed.</p>
              <Button variant="ghost" size="sm" onClick={handleDownload}>Retry</Button>
            </div>
          )}

          <Button variant="ghost" onClick={handleCopyLink}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </Button>

          <Button variant="ghost" onClick={handleShareX}>
            Share to X
          </Button>
        </div>
      </Modal>

      {/* Off-screen render target */}
      {open && <TierImage ref={imageRef} tiers={tiers} players={players} position={position} />}
    </>
  )
}
