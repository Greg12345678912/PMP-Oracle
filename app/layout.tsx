import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'
import { PostHogProvider } from '@/components/PostHogProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'PMP Fantasy Platform | Pretty Much Picks',
  description: 'Oracle Challenge, Tier Builder, Mock Draft, and more. The PMP Fantasy Platform by Pretty Much Picks.',
  metadataBase: new URL('https://prettymuchpicks.com'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${GeistSans.variable} bg-pmp-black text-pmp-white antialiased`}
      >
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  )
}
