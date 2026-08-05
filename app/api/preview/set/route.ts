import { NextRequest, NextResponse } from 'next/server'
import type { PreviewState } from '@/lib/oracle/dev-preview'

const VALID_STATES: PreviewState[] = ['locked', 'week1', 'midseason', 'scored']

export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get('state')
  const redirect = req.nextUrl.searchParams.get('redirect') ?? '/challenge'

  const res = NextResponse.redirect(new URL(redirect, req.url))

  if (state === 'off') {
    res.cookies.delete('__oracle_preview')
  } else if (VALID_STATES.includes(state as PreviewState)) {
    res.cookies.set('__oracle_preview', state!, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // No maxAge — session cookie, cleared when browser closes
    })
  }

  return res
}
