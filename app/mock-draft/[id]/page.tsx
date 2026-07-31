import { loadDraft } from '@/lib/draft/supabase'
import { notFound } from 'next/navigation'
import { SleeperProvider } from '@/lib/data/sleeper'
import MockDraftClientPage from './client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MockDraftSharePage({ params }: PageProps) {
  const { id } = await params
  const state = await loadDraft(id)
  if (!state) notFound()

  const provider = new SleeperProvider()
  const players = await provider.getDraftPlayers(state.settings.scoring)

  return <MockDraftClientPage initialState={state} players={players} />
}
