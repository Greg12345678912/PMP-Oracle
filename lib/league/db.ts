// lib/league/db.ts
import { createClient } from '@supabase/supabase-js'

/** Server-side Supabase client using the service role key (bypasses RLS).
 *  Only import this in API routes — never in client components. */
export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Broadcast a DraftEvent to all subscribers of the league's Realtime channel.
 *  Creates a short-lived channel — no persistent subscription needed server-side. */
export async function broadcastEvent(leagueId: string, event: object): Promise<void> {
  const db = getServiceClient()
  const channel = db.channel(`draft:${leagueId}`)
  await channel.send({
    type: 'broadcast',
    event: (event as { type: string }).type,
    payload: event,
  })
  await db.removeChannel(channel)
}
