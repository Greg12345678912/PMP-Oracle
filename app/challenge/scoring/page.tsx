import Link from 'next/link'

export const metadata = {
  title: 'How Scoring Works — Oracle Challenge',
  description: 'A full explanation of how Oracle scores your pre-season rankings, including the formula, worked examples, tiebreaker rules, and FAQ.',
}

const EXAMPLES = [
  {
    label: 'Dead-on prediction',
    desc: 'You ranked a running back #2. He finishes #2 in PPR points.',
    your: 2,
    actual: 2,
    dist: 0,
    pts: 10,
  },
  {
    label: 'Close miss',
    desc: 'You ranked a wide receiver #4. He finishes #7 in PPR points.',
    your: 4,
    actual: 7,
    dist: 3,
    pts: 7,
  },
  {
    label: 'Missed the top 10',
    desc: 'You ranked a tight end #9. He finishes #13 in PPR points — outside the actual top 10.',
    your: 9,
    actual: null,
    dist: null,
    pts: 0,
  },
]

const TIEBREAKERS = [
  {
    rank: '1',
    label: 'Overall score',
    desc: 'Higher score wins. This resolves the vast majority of ties.',
  },
  {
    rank: '2',
    label: 'Top-10 hits',
    desc: 'How many of your 40 picks (10 per position) appeared in the actual top 10. More hits wins.',
  },
  {
    rank: '3',
    label: 'Total rank error',
    desc: 'The sum of all distances between your rank and the actual rank, for matched players only. Lower is more precise. Lower wins.',
  },
  {
    rank: '4',
    label: 'Entry number',
    desc: 'If all three above are identical, the earlier submission wins. This is the final tiebreaker and extremely rare.',
  },
]

const FAQS = [
  {
    q: 'Why do players outside the final top 10 receive 0 points?',
    a: 'Oracle is a ranking challenge, not a prediction market. The top 10 is the bracket that matters — picking a player who finishes 11th or lower means the prediction was wrong in a meaningful way. Giving partial credit for near-misses outside the top 10 would require arbitrary thresholds. Zero is the cleanest, most defensible rule.',
  },
  {
    q: 'When are scores updated?',
    a: 'Every Tuesday during the NFL regular season. The pipeline runs after Sleeper has finalized the previous week\'s stats (typically by Monday night). Scores and rankings update simultaneously — you will not see a period where scores have changed but ranks have not.',
  },
  {
    q: 'Where does the data come from?',
    a: 'All player stats are sourced from Sleeper\'s official NFL stats API. Sleeper is used by millions of fantasy managers and publishes the same data that powers the Sleeper Fantasy app. We do not manually enter or adjust any stats.',
  },
  {
    q: 'Can my score decrease after it is posted?',
    a: 'In rare cases, yes — if Sleeper issues a stat correction that changes which players finish in the top 10 for a given position. Minor corrections (a point or two) are absorbed automatically the following Tuesday. We do not manually re-run the pipeline for small corrections. See our stat corrections policy for the exact threshold.',
  },
  {
    q: 'Are there any hidden adjustments or subjective scoring decisions?',
    a: 'No. Every score is calculated by the same deterministic formula applied identically to every entry. There are no bonus points, no penalties, no manual overrides, and no human judgment in the scoring process. The formula, the data source, and the tiebreaker chain are fully documented on this page.',
  },
]

export default function ScoringPage() {
  return (
    <div className="min-h-[100dvh] bg-pmp-black">
      <div className="px-4 py-10 max-w-lg mx-auto flex flex-col gap-10">

        {/* Header */}
        <div className="flex flex-col gap-3">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">Oracle Challenge</p>
          <h1 className="text-pmp-white font-black text-3xl leading-tight">How Scoring Works</h1>
          <p className="text-pmp-gray-500 text-base leading-relaxed">
            Oracle is a season-long prediction challenge, not a fantasy league. You are not managing a roster — you are predicting how players will finish before a single game is played. The closer your pre-season rankings match how players actually performed, the higher your score. A perfect score is 100.
          </p>
        </div>

        {/* Simple explanation */}
        <section className="flex flex-col gap-4">
          <h2 className="text-pmp-white font-bold text-lg">The short version</h2>
          <div className="flex flex-col gap-3">
            {[
              { n: '1', text: 'Before the season, you rank the top 10 players at each position — QB, RB, WR, and TE.' },
              { n: '2', text: 'Throughout the season, we track cumulative full-PPR fantasy points for every player. Scores update every Tuesday. Final standings are determined after the NFL regular season ends.' },
              { n: '3', text: 'For every player you ranked who made the actual top 10, you earn points based on how accurate your rank was. The closer, the more points. Miss the top 10 entirely, and that pick scores zero.' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-4">
                <span className="text-pmp-red font-black text-sm w-4 shrink-0 mt-0.5">{n}</span>
                <p className="text-pmp-gray-400 text-sm leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The formula */}
        <section className="flex flex-col gap-4">
          <h2 className="text-pmp-white font-bold text-lg">The formula</h2>
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Per-player points</p>
              <p className="text-pmp-white font-mono text-sm mt-1">
                points = max(0, 10 &minus; |your rank &minus; actual rank|)
              </p>
            </div>
            <div className="h-px bg-pmp-gray-800" />
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <p className="text-pmp-gray-600 text-xs font-bold uppercase tracking-wider">Distance</p>
                <p className="text-pmp-gray-600 text-xs font-bold uppercase tracking-wider text-center">Formula</p>
                <p className="text-pmp-gray-600 text-xs font-bold uppercase tracking-wider text-right">Points</p>
              </div>
              {[0, 1, 2, 3, 5, 9].map(dist => (
                <div key={dist} className="grid grid-cols-3 gap-2 items-center">
                  <p className="text-pmp-gray-400 text-sm">{dist === 0 ? 'Exact match' : `Off by ${dist}`}</p>
                  <p className="text-pmp-gray-600 text-xs text-center font-mono">10 &minus; {dist}</p>
                  <p className={['text-sm font-bold text-right', dist === 0 ? 'text-pmp-red' : 'text-pmp-white'].join(' ')}>
                    {10 - dist}
                  </p>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 items-center border-t border-pmp-gray-800 pt-2 mt-1">
                <p className="text-pmp-gray-400 text-sm">Not top 10</p>
                <p className="text-pmp-gray-600 text-xs text-center font-mono">—</p>
                <p className="text-pmp-white text-sm font-bold text-right">0</p>
              </div>
            </div>
            <div className="h-px bg-pmp-gray-800" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="text-pmp-gray-500 text-sm">Position score</p>
                <p className="text-pmp-white text-sm font-mono">sum of 10 player scores (max 100)</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-pmp-gray-500 text-sm">Overall score</p>
                <p className="text-pmp-white text-sm font-mono">(QB + RB + WR + TE) &divide; 4</p>
              </div>
            </div>
          </div>
        </section>

        {/* Worked examples */}
        <section className="flex flex-col gap-4">
          <h2 className="text-pmp-white font-bold text-lg">Worked examples</h2>
          <div className="flex flex-col gap-3">
            {EXAMPLES.map(ex => (
              <div key={ex.label} className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-4 flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-pmp-white text-sm font-semibold">{ex.label}</p>
                  <p className="text-pmp-gray-500 text-sm">{ex.desc}</p>
                </div>
                <div className="h-px bg-pmp-gray-800" />
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    {ex.actual !== null ? (
                      <p className="text-pmp-gray-500 text-xs font-mono">
                        10 &minus; |{ex.your} &minus; {ex.actual}| = 10 &minus; {ex.dist}
                      </p>
                    ) : (
                      <p className="text-pmp-gray-500 text-xs">Not in actual top 10</p>
                    )}
                  </div>
                  <p className={['font-black text-xl', ex.pts > 0 ? 'text-pmp-red' : 'text-pmp-gray-600'].join(' ')}>
                    {ex.pts} pts
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why this system */}
        <section className="flex flex-col gap-4">
          <h2 className="text-pmp-white font-bold text-lg">Why this scoring system?</h2>
          <div className="flex flex-col gap-3 text-pmp-gray-400 text-sm leading-relaxed">
            <p>
              Oracle rewards both identifying the right players and ranking them accurately. It is not enough to have a player somewhere in your list — your specific rank matters. Ranking a player #1 who finishes #1 earns the maximum score. Ranking that same player #9 earns far less, because the prediction was imprecise.
            </p>
            <p>
              Every position is weighted equally. A great tight end call is worth exactly as much as a great quarterback call. Your overall score is the average of all four positions, so expertise in any one position cannot carry you to #1 alone.
            </p>
            <p>
              There are no hidden adjustments. No bonus points for popular picks, no penalties for bold fades, no manual overrides. Every score is the output of a single deterministic formula applied identically to every entry. The math on this page is the complete scoring logic — nothing else is involved.
            </p>
          </div>
        </section>

        {/* Tiebreakers */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-pmp-white font-bold text-lg">Tiebreakers</h2>
            <p className="text-pmp-gray-500 text-sm">Applied in order when two entries share the same overall score.</p>
          </div>
          <div className="flex flex-col gap-2">
            {TIEBREAKERS.map(tb => (
              <div key={tb.rank} className="flex items-start gap-4 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-4">
                <span className="text-pmp-red font-black text-sm w-4 shrink-0 mt-px">{tb.rank}</span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-pmp-white text-sm font-semibold">{tb.label}</p>
                  <p className="text-pmp-gray-500 text-sm">{tb.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="flex flex-col gap-4">
          <h2 className="text-pmp-white font-bold text-lg">FAQ</h2>
          <div className="flex flex-col gap-4">
            {FAQS.map(faq => (
              <div key={faq.q} className="flex flex-col gap-2 border-b border-pmp-gray-800 pb-4 last:border-0 last:pb-0">
                <p className="text-pmp-white text-sm font-semibold">{faq.q}</p>
                <p className="text-pmp-gray-500 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Back link + last updated */}
        <div className="flex flex-col items-center gap-3 pt-2 pb-6">
          <Link href="/challenge" className="text-pmp-gray-600 text-sm hover:text-pmp-gray-500 transition-colors">
            ← Back to Oracle Challenge
          </Link>
          <p className="text-pmp-gray-800 text-xs">Last updated: August 2026 · Official rules for the 2026 Oracle Challenge</p>
        </div>

      </div>
    </div>
  )
}
