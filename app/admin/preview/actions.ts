'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function setPreviewState(formData: FormData) {
  if (process.env.NODE_ENV !== 'development') return

  const cookieStore = await cookies()
  const state = formData.get('state') as string | null

  if (state && state !== 'off') {
    cookieStore.set('__oracle_preview', state, {
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
      sameSite: 'lax',
      secure: false,
    })
  } else {
    cookieStore.delete('__oracle_preview')
  }

  redirect('/admin/preview')
}
