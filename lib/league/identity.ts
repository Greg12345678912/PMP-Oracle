// lib/league/identity.ts
const USER_ID_KEY = 'pmp_user_id'
const DISPLAY_NAME_KEY = 'pmp_display_name'

export function getUserId(): string {
  if (typeof window === 'undefined') return ''
  const existing = localStorage.getItem(USER_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(USER_ID_KEY, id)
  return id
}

export function getDisplayName(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(DISPLAY_NAME_KEY)
}

export function setDisplayName(name: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(DISPLAY_NAME_KEY, name)
}
