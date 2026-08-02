/**
 * DEPRECATED — replaced by /api/sync/weekly
 * Returns 410 Gone to surface any misconfigured cron jobs.
 */
export async function POST() {
  return new Response(
    'This endpoint has been replaced by /api/sync/weekly. Update your cron configuration.',
    { status: 410 },
  )
}
