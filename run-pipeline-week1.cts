/**
 * One-off script: run the Oracle pipeline for Week 1.
 * Usage: npx tsx run-pipeline-week1.cts
 */
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local manually
const envFile = path.join(__dirname, '.env.local')
const envContents = fs.readFileSync(envFile, 'utf-8')
for (const line of envContents.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1).replace(/^"(.*)"$/, '$1')
  process.env[key] = val
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runWeeklyPipeline } = require('./lib/oracle/pipeline/pipeline')

async function main() {
  const result = await runWeeklyPipeline({ week: 1, dryRun: false })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(console.error)
