// lib/draft/supabase.ts
import { createClient } from '@supabase/supabase-js'
import { generateShareId } from './engine'
import type { DraftState } from './types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Save (upsert) draft state. If state.shareId is null, a new ID is generated.
 * Returns the shareId.
 */
export async function saveDraft(state: DraftState): Promise<string> {
  const shareId = state.shareId ?? generateShareId()
  const { error } = await supabase.from('drafts').upsert({
    share_id: shareId,
    state: JSON.stringify({ ...state, shareId }),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return shareId
}

/** Load draft state by shareId. Returns null if not found. */
export async function loadDraft(shareId: string): Promise<DraftState | null> {
  const { data, error } = await supabase
    .from('drafts')
    .select('state')
    .eq('share_id', shareId)
    .single()

  if (error || !data) return null
  return JSON.parse(data.state) as DraftState
}
