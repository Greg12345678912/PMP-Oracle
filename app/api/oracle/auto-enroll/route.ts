import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'

export async function PUT(request: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { enrolled } = await request.json() as { enrolled: boolean }
  const db = getServiceClient()

  const { error } = await db
    .from('user_profiles')
    .update({ auto_enroll_2027: enrolled })
    .eq('user_id', session.user.id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
