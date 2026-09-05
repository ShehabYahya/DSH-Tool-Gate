import { checkEnvironmentCompatibility, type ProcessRunner } from '../../compatibility/environment.js'
import type { OutputWriter } from '../output.js'

export interface CheckOptions {
  json: boolean
}

export async function runCheck(
  options: CheckOptions,
  deps: { runner: ProcessRunner; writer: OutputWriter },
): Promise<number> {
  const result = await checkEnvironmentCompatibility(deps.runner)
  if (options.json) {
    deps.writer.out(JSON.stringify(result, null, 2))
  } else {
    deps.writer.out(`Compatibility: ${result.status}`)
    deps.writer.out(`Node: ${result.metadata.nodeVersion ?? 'unknown'}`)
    deps.writer.out(`DSH: ${result.metadata.dshVersion ?? 'unknown'}`)
    deps.writer.out(`pnpm: ${result.metadata.pnpmVersion ?? 'unknown'}`)
    for (const issue of result.issues) deps.writer.out(`${issue.required ? 'ERROR' : 'WARN'}: ${issue.message}`)
  }
  return result.status === 'incompatible' ? 1 : 0
}
