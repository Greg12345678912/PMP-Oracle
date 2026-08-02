import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function getServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}

export async function getSession() {
  const supabase = await getServerClient()
  // getUser() validates the JWT with the Supabase auth server on every call.
  // getSession() only reads from the cookie without server-side verification —
  // a forged or tampered cookie would pass. Always use getUser() in server code.
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return { user }
}
