'use client'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/auth/client'

export function SignOutButton() {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    router.push('/challenge')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-pmp-gray-700 text-xs hover:text-pmp-gray-500 transition-colors"
    >
      Sign out
    </button>
  )
}
