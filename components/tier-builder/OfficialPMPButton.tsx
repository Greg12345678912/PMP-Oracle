'use client'
import type { Tier, Position } from '@/lib/data/types'

interface OfficialPMPButtonProps {
  position: Position
  onLoad: (tiers: Tier[]) => void
}

export function OfficialPMPButton({ position, onLoad }: OfficialPMPButtonProps) {
  return null // stub — implemented in Task 12
}
