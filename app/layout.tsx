import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { GeistSans } from 'geist/font/sans'
import { PostHogProvider } from '@/components/PostHogProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Pretty Much Picks — Oracle Challenge',
  description: 'Rank every NFL player before Week 1. Prove your fantasy knowledge against the field. Finish #1. Win $500. Free entry.',
  metadataBase: new URL('https://prettymuchpicks.com'),
  openGraph: {
    title: 'Pretty Much Picks — Oracle Challenge',
    description: 'Rank every NFL player before Week 1. Prove your fantasy knowledge. Finish #1. Win $500. Free entry.',
    url: 'https://prettymuchpicks.com/challenge',
    siteName: 'Pretty Much Picks',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pretty Much Picks — Oracle Challenge',
    description: 'Rank every NFL player before Week 1. Prove your fantasy knowledge. Win $500. Free.',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
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
