import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  const logoData = readFileSync(join(process.cwd(), 'public/logo.png'))
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          background: '#000000',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '64px',
          padding: '80px',
        }}
      >
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={420} height={420} alt="Pretty Much Picks" />

        {/* Text */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              color: '#DC2626',
              fontSize: '22px',
              fontWeight: 700,
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
            }}
          >
            2026 Oracle Challenge
          </div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: '72px',
              fontWeight: 900,
              lineHeight: 1.05,
            }}
          >
            Prove Your<br />Fantasy IQ.
          </div>
          <div style={{ color: '#6B7280', fontSize: '30px', lineHeight: 1.4 }}>
            Rank every player before Week 1.<br />
            Finish #1. Win $500. Free entry.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
