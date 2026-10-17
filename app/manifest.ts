import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pretty Much Picks',
    short_name: 'PMP',
    description: 'Rank NFL players before Week 1. Prove your fantasy knowledge. Win $500.',
    start_url: '/challenge',
    display: 'standalone',
    background_color: '#0B0B0B',
    theme_color: '#E10600',
    icons: [
      {
        src: '/logo.png',
        sizes: '1254x1254',
        type: 'image/png',
      },
    ],
  }
}
