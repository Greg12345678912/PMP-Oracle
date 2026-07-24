import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { sleeperProvider } from '@/lib/data/sleeper'
import type { Player, Position } from '@/lib/data/types'
import { TierBuilderPage } from '@/components/tier-builder/TierBuilderPage'

const VALID_SLUGS: Record<string, Position> = {
  'rb-tier-list': 'RB',
  'qb-tier-list': 'QB',
  'wr-tier-list': 'WR',
  'te-tier-list': 'TE',
  'flex-tier-list': 'FLEX',
}

const POSITION_LABELS: Record<Position, string> = {
  RB: 'Running Back',
  QB: 'Quarterback',
  WR: 'Wide Receiver',
  TE: 'Tight End',
  FLEX: 'Flex',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const position = VALID_SLUGS[slug]
  if (!position) return {}
  const label = POSITION_LABELS[position]
  return {
    title: `${label} Tier List Builder | Pretty Much Picks`,
    description: `Build and share your fantasy football ${label} tier list. Drag and drop, download a premium graphic, share instantly. No signup required.`,
    openGraph: {
      title: `${label} Tier List Builder | Pretty Much Picks`,
      description: `Build your ${label} rankings and share a premium graphic.`,
      url: `https://prettymuchpicks.com/${slug}`,
    },
  }
}

export async function generateStaticParams() {
  return Object.keys(VALID_SLUGS).map((slug) => ({ slug }))
}

export default async function TierListPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const position = VALID_SLUGS[slug]
  if (!position) notFound()

  let players: Player[]
  try {
    players = await sleeperProvider.getPlayers(position)
  } catch {
    players = []
  }

  return <TierBuilderPage players={players} position={position} />
}
