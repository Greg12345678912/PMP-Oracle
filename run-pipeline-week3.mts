import { runWeeklyPipeline } from './lib/oracle/pipeline/pipeline'

const result = await runWeeklyPipeline({ week: 3, dryRun: false })
console.log(JSON.stringify(result, null, 2))
