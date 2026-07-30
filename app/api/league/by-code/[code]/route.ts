// app/api/league/by-code/[code]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/league/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const db = getServiceClient()

  const { data, error } = await db
    .from('leagues')
    .select('id')
    .eq('invite_code', code.toUpperCase())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 })
  }

  return NextResponse.json({ leagueId: data.id })
}
