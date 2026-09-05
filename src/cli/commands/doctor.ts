import { checkEnvironmentCompatibility, type ProcessRunner } from '../../compatibility/environment.js'
import type { CompatibilityResult } from '../../compatibility/types.js'
import { inspectProfile, type ProfileInspection } from '../profile.js'
import { renderCheck, type OutputWriter } from '../output.js'

export interface DoctorOptions {
  profile: string
  json: boolean
}

export interface DoctorReport {
  environment: CompatibilityResult
  profile: ProfileInspection
  dumpConfigOk: boolean | null
  bundleVisibleInDump: boolean | null
}

export interface DoctorDependencies {
  runner: ProcessRunner
  writer: OutputWriter
  inspect?: (profile: string) => ProfileInspection
}

export async function runDoctor(
  options: DoctorOptions,
  deps: DoctorDependencies,
): Promise<number> {
  const environment = await checkEnvironmentCompatibility(deps.runner)
  const inspect = deps.inspect ?? inspectProfile
  let profile: ProfileInspection
  try {
    profile = inspect(options.profile)
  } catch (error) {
    deps.writer.error(String(error))
    return 2
  }

  let dumpConfigOk: boolean | null = null
  let bundleVisibleInDump: boolean | null = null
  if (profile.exists && profile.bundleDeclared && environment.status !== 'incompatible') {
    const dump = await deps.runner.run('dsh', ['--profile', options.profile, '--dump-config'])
    dumpConfigOk = dump.code === 0
    bundleVisibleInDump = dump.code === 0 && dump.stdout.includes('dsh-tool-gate')
  }

  const report: DoctorReport = { environment, profile, dumpConfigOk, bundleVisibleInDump }
  if (options.json) {
    deps.writer.out(JSON.stringify(report, null, 2))
  } else {
    deps.writer.out('DSH Tool Gate Doctor')
    deps.writer.out('')
    for (const check of environment.checks) deps.writer.out(renderCheck(check.ok, check.message))
    deps.writer.out('')
    if (!profile.exists) {
      deps.writer.out(`○ Profile ${JSON.stringify(options.profile)} is not initialized; Tool Gate is not installed there.`)
    } else if (!profile.dependencyDeclared || !profile.bundleDeclared) {
      deps.writer.out(`○ Tool Gate is not installed in profile ${JSON.stringify(options.profile)}.`)
    } else {
      deps.writer.out(renderCheck(true, `Tool Gate dependency and bundle layer are declared in profile ${JSON.stringify(options.profile)}`))
      if (dumpConfigOk !== null) deps.writer.out(renderCheck(dumpConfigOk, dumpConfigOk ? 'DSH composed config successfully' : 'DSH failed to compose the profile config'))
      if (bundleVisibleInDump !== null) deps.writer.out(renderCheck(bundleVisibleInDump, bundleVisibleInDump ? 'Tool Gate appears in the composed config' : 'Tool Gate bundle is missing from the composed config'))
    }
    deps.writer.out('')
    if (environment.status === 'tested') deps.writer.out('Compatibility: TESTED')
    else if (environment.status === 'compatible-unverified') deps.writer.out('Compatibility: COMPATIBLE, UNVERIFIED DSH VERSION')
    else deps.writer.out('Compatibility: INCOMPATIBLE')
    deps.writer.out('The plugin performs a second fail-open API capability check when DSH starts.')
  }

  if (environment.status === 'incompatible') return 1
  if (dumpConfigOk === false || bundleVisibleInDump === false) return 1
  return 0
}
