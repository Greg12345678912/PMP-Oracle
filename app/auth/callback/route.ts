import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getOrCreateProfile } from '@/lib/oracle/profile'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/challenge'

  const redirectUrl = `${origin}${next}`

  if (code) {
    // Build the redirect response first so session cookies are written onto it
    const response = NextResponse.redirect(redirectUrl)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data?.session?.user) {
      const user = data.session.user
      await getOrCreateProfile(
        user.id,
        user.user_metadata?.full_name ?? 'User',
        user.user_metadata?.avatar_url ?? null
      )
    }

    return response
  }

  return NextResponse.redirect(redirectUrl)
}
