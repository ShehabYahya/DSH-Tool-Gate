import { checkEnvironmentCompatibility, type ProcessRunner } from '../../compatibility/environment.js'
import { inspectProfile, type ProfileInspection } from '../profile.js'
import type { OutputWriter } from '../output.js'

export interface InstallOptions {
  profile: string
  packageSpec: string
}

export interface InstallDependencies {
  runner: ProcessRunner
  writer: OutputWriter
  inspect?: (profile: string) => ProfileInspection
}

export async function runInstall(
  options: InstallOptions,
  deps: InstallDependencies,
): Promise<number> {
  const environment = await checkEnvironmentCompatibility(deps.runner)
  if (environment.status === 'incompatible') {
    deps.writer.error('Installation stopped: the local environment is incompatible.')
    for (const issue of environment.issues.filter(issue => issue.required)) deps.writer.error(`- ${issue.message}`)
    return 1
  }

  if (environment.status === 'compatible-unverified') {
    deps.writer.out(`Warning: DSH ${environment.metadata.dshVersion ?? '(unknown)'} is not in the tested-version manifest.`)
    deps.writer.out('Installation will continue; the plugin will perform a fail-open runtime API check at startup.')
  }

  // DSH forwards these arguments directly to pnpm inside the profile directory.
  // Explicit -w makes the intended profile workspace-root mutation reliable
  // across pnpm versions that otherwise reject add/remove at a workspace root.
  const install = await deps.runner.run('dsh', ['plugin', '--profile', options.profile, 'add', '-w', options.packageSpec])
  if (install.code !== 0) {
    deps.writer.error('DSH plugin installation failed.')
    if (install.stderr.trim()) deps.writer.error(install.stderr.trim())
    return 1
  }

  const inspect = deps.inspect ?? inspectProfile
  let profile: ProfileInspection
  try {
    profile = inspect(options.profile)
  } catch (error) {
    deps.writer.error(String(error))
    return 1
  }
  if (!profile.dependencyDeclared || !profile.bundleDeclared) {
    deps.writer.error('Installation verification failed: dsh-tool-gate is not present as both a dependency and bundle layer.')
    return 1
  }

  const dump = await deps.runner.run('dsh', ['--profile', options.profile, '--dump-config'])
  if (dump.code !== 0 || !dump.stdout.includes('dsh-tool-gate')) {
    deps.writer.error('Installation verification failed: Tool Gate is missing from the composed DSH config.')
    if (dump.stderr.trim()) deps.writer.error(dump.stderr.trim())
    return 1
  }

  deps.writer.out(`✓ Installed dsh-tool-gate in profile ${JSON.stringify(options.profile)}.`)
  deps.writer.out('✓ Bundle layer appears in the composed DSH config.')
  deps.writer.out('Runtime protection: if required DSH APIs are incompatible, Tool Gate disables itself and leaves native tool visibility unchanged.')
  return 0
}
