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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={420} height={420} alt="" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <span style={{ color: '#DC2626', fontSize: '22px', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase' }}>
            2026 Oracle Challenge
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
            <span style={{ color: '#FFFFFF', fontSize: '72px', fontWeight: 900, lineHeight: 1.05 }}>
              Prove Your
            </span>
            <span style={{ color: '#FFFFFF', fontSize: '72px', fontWeight: 900, lineHeight: 1.05 }}>
              Fantasy IQ.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ color: '#6B7280', fontSize: '28px' }}>
              Rank every player before Week 1.
            </span>
            <span style={{ color: '#6B7280', fontSize: '28px' }}>
              Finish #1. Win $500. Free entry.
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
