const fs = require('fs')
const path = require('path')

// Load .env.local
const envFile = path.join(process.cwd(), '.env.local')
const lines = fs.readFileSync(envFile, 'utf-8').split('\n')
for (const line of lines) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const key = t.slice(0, eq)
  const val = t.slice(eq + 1).replace(/^"(.*)"$/, '$1')
  process.env[key] = val
}

const { sendWeeklyScoreEmails } = require('./lib/oracle/emails')

async function main() {
  console.log('Sending Week 1 score emails...')
  await sendWeeklyScoreEmails('e9929112-9137-4393-b983-3b52624712a2', 1)
  console.log('Done.')
}

main().catch(console.error)
