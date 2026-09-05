import type { ProcessRunner } from '../../compatibility/environment.js'
import { inspectProfile, type ProfileInspection } from '../profile.js'
import type { OutputWriter } from '../output.js'

export interface UninstallOptions {
  profile: string
}

export interface UninstallDependencies {
  runner: ProcessRunner
  writer: OutputWriter
  inspect?: (profile: string) => ProfileInspection
}

export async function runUninstall(
  options: UninstallOptions,
  deps: UninstallDependencies,
): Promise<number> {
  const inspect = deps.inspect ?? inspectProfile
  let before: ProfileInspection
  try {
    before = inspect(options.profile)
  } catch (error) {
    deps.writer.error(String(error))
    return 2
  }

  if (!before.exists || (!before.dependencyDeclared && !before.bundleDeclared)) {
    deps.writer.out(`Tool Gate is not installed in profile ${JSON.stringify(options.profile)}.`)
    return 0
  }

  const remove = await deps.runner.run('dsh', ['plugin', '--profile', options.profile, 'remove', 'dsh-tool-gate'])
  if (remove.code !== 0) {
    deps.writer.error('DSH plugin removal failed.')
    if (remove.stderr.trim()) deps.writer.error(remove.stderr.trim())
    return 1
  }

  let after: ProfileInspection
  try {
    after = inspect(options.profile)
  } catch (error) {
    deps.writer.error(String(error))
    return 1
  }
  if (after.dependencyDeclared || after.bundleDeclared) {
    deps.writer.error('Uninstall verification failed: Tool Gate is still declared in the profile.')
    return 1
  }

  const dump = await deps.runner.run('dsh', ['--profile', options.profile, '--dump-config'])
  if (dump.code === 0 && dump.stdout.includes('dsh-tool-gate')) {
    deps.writer.error('Uninstall verification failed: Tool Gate still appears in the composed DSH config.')
    return 1
  }

  deps.writer.out(`✓ Removed dsh-tool-gate from profile ${JSON.stringify(options.profile)}.`)
  return 0
}
