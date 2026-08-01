import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/auth/server'
import { getOrCreateProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/challenge'

  if (code) {
    const supabase = await getServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data?.session?.user) {
      const user = data.session.user
      await getOrCreateProfile(
        user.id,
        user.user_metadata?.full_name ?? 'User',
        user.user_metadata?.avatar_url ?? null
      )
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
