import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getOrCreateProfile } from '@/lib/oracle/profile'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/challenge'

  if (!code) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Collect cookies to set on the final response
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(items) {
          items.forEach(item => cookiesToSet.push(item))
        },
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  let redirectTarget = next
  if (!error && data?.session?.user) {
    const user = data.session.user
    const displayName =
      user.user_metadata?.full_name
      ?? user.email?.split('@')[0]
      ?? 'user'
    const { isNew } = await getOrCreateProfile(
      user.id,
      displayName,
      user.user_metadata?.avatar_url ?? null,
    )
    // Send brand-new users through the username-claim onboarding
    if (isNew) {
      redirectTarget = '/challenge/onboarding'
    }
  }

  const response = NextResponse.redirect(`${origin}${redirectTarget}`)
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  )
  return response
}
