import { loadDraft } from '@/lib/draft/supabase'
import { notFound } from 'next/navigation'
import MockDraftClientPage from './client'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MockDraftSharePage({ params }: PageProps) {
  const { id } = await params
  const state = await loadDraft(id)
  if (!state) notFound()
  return <MockDraftClientPage initialState={state} />
}
