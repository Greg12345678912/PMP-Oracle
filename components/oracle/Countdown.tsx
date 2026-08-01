'use client'
import { useState, useEffect } from 'react'

interface CountdownProps {
  lockDate: string  // ISO string
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(lockDate: string): TimeLeft | null {
  const diff = new Date(lockDate).getTime() - Date.now()
  if (diff <= 0) return null
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
  }
}

export function Countdown({ lockDate }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => getTimeLeft(lockDate))

  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeLeft(lockDate)), 1_000)
    return () => clearInterval(interval)
  }, [lockDate])

  if (!timeLeft) {
    return (
      <p className="text-pmp-gray-500 text-sm font-medium tracking-wide">
        Rankings are locked
      </p>
    )
  }

  const parts = [
    { label: 'days',    value: timeLeft.days },
    { label: 'hours',   value: timeLeft.hours },
    { label: 'min',     value: timeLeft.minutes },
    { label: 'sec',     value: timeLeft.seconds },
  ]

  return (
    <div className="flex items-end gap-3">
      {parts.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center">
          <span className="text-pmp-white text-2xl font-bold font-mono tabular-nums w-10 text-center">
            {String(value).padStart(2, '0')}
          </span>
          <span className="text-pmp-gray-600 text-[10px] uppercase tracking-widest">{label}</span>
        </div>
      ))}
    </div>
  )
}
