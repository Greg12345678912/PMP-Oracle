import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/auth/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/challenge'

  if (code) {
    const supabase = await getServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
