import { notFound } from 'next/navigation'
import { getPreviewState } from '@/lib/oracle/dev-preview'
import { setPreviewState } from './actions'

export const dynamic = 'force-dynamic'

const STATES = [
  {
    value: 'locked',
    label: 'Locked — Pre-scoring',
    description: 'Sep 9–15: Rankings locked, no scores yet',
    pages: [
      { href: '/challenge', label: '/challenge' },
      { href: '/challenge/leaderboard', label: '/challenge/leaderboard' },
      { href: '/challenge/results', label: '/challenge/results' },
    ],
  },
  {
    value: 'week1',
    label: 'Week 1 Scoring',
    description: 'After Sep 15: First scores published, no rank movement yet',
    pages: [
      { href: '/challenge/results', label: '/challenge/results' },
      { href: '/challenge/leaderboard', label: '/challenge/leaderboard' },
    ],
  },
  {
    value: 'midseason',
    label: 'Mid-season (Week 9)',
    description: 'Scores + rank movement ▲▼ visible',
    pages: [
      { href: '/challenge/results', label: '/challenge/results' },
      { href: '/challenge/leaderboard', label: '/challenge/leaderboard' },
    ],
  },
  {
    value: 'scored',
    label: 'Season Complete',
    description: 'Final results, share card, season summary',
    pages: [
      { href: '/challenge/results', label: '/challenge/results' },
      { href: '/challenge/leaderboard', label: '/challenge/leaderboard' },
    ],
  },
]

export default async function PreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  const current = await getPreviewState()

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-lg mx-auto flex flex-col gap-8">
        <div>
          <p className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-1">Dev Tool</p>
          <h1 className="text-2xl font-bold">Oracle Preview Mode</h1>
          <p className="text-gray-400 text-sm mt-1">
            Injects mock data into Oracle pages so you can review each season state without waiting for real dates.
          </p>
        </div>

        {/* Current state badge */}
        <div className="flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
          <span className={['w-2 h-2 rounded-full shrink-0', current ? 'bg-amber-400' : 'bg-gray-600'].join(' ')} />
          <div>
            <p className="text-sm font-semibold">
              {current ? `Preview: ${current}` : 'Preview off — showing live data'}
            </p>
            <p className="text-xs text-gray-500">Cookie: __oracle_preview</p>
          </div>
          {current && (
            <form action={setPreviewState} className="ml-auto">
              <input type="hidden" name="state" value="off" />
              <button
                type="submit"
                className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                Clear
              </button>
            </form>
          )}
        </div>

        {/* State cards */}
        <div className="flex flex-col gap-3">
          {STATES.map(s => {
            const isActive = current === s.value
            return (
              <div
                key={s.value}
                className={[
                  'border rounded-xl p-4 flex flex-col gap-3',
                  isActive ? 'border-amber-500 bg-amber-950/20' : 'border-gray-800 bg-gray-900',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={['text-sm font-semibold', isActive ? 'text-amber-400' : 'text-white'].join(' ')}>
                      {isActive ? '● ' : ''}{s.label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                  </div>
                  {!isActive && (
                    <form action={setPreviewState}>
                      <input type="hidden" name="state" value={s.value} />
                      <button
                        type="submit"
                        className="text-xs text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                      >
                        Activate
                      </button>
                    </form>
                  )}
                </div>

                {/* Page links */}
                <div className="flex flex-wrap gap-2">
                  {s.pages.map(p => (
                    <a
                      key={p.href}
                      href={p.href}
                      className="text-xs font-mono text-blue-400 hover:text-blue-300 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {p.label} →
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Notes</p>
          <ul className="text-xs text-gray-500 flex flex-col gap-1 list-disc list-inside">
            <li>Preview data is injected server-side — pages behave exactly as in production</li>
            <li>Profile pages (/u/username) use real profile data with mock scores overlaid</li>
            <li>Cookie expires after 24 hours automatically</li>
            <li>This page returns 404 in production</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
