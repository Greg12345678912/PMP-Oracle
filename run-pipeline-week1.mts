/**
 * One-off script: run the Oracle pipeline for Week 1.
 * Usage: npx tsx run-pipeline-week1.mts
 */
import { runWeeklyPipeline } from './lib/oracle/pipeline/pipeline.js'

const result = await runWeeklyPipeline({ week: 1, dryRun: false })
console.log(JSON.stringify(result, null, 2))
