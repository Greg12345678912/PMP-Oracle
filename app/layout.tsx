import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'
import { PostHogProvider } from '@/components/PostHogProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Fantasy Football Tier List Builder | Pretty Much Picks',
  description: 'Build, download, and share your fantasy football tier list. No signup required.',
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
