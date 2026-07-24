import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sleepercdn.com',
        pathname: '/content/nfl/players/**',
      },
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
