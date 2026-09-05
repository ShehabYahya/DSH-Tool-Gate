import { gte, valid } from 'semver'
import { COMPATIBILITY_MANIFEST } from './manifest.js'
import { createCompatibilityResult, type CompatibilityCheck, type CompatibilityResult } from './types.js'

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface ProcessRunner {
  run(command: string, args: string[]): Promise<CommandResult>
}

function versionFromOutput(output: string): string | undefined {
  const match = output.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?/)
  return match?.[0]
}

function check(id: string, ok: boolean, required: boolean, message: string): CompatibilityCheck {
  return { id, ok, required, message }
}

export async function checkEnvironmentCompatibility(
  runner: ProcessRunner,
  nodeVersion = process.versions.node,
): Promise<CompatibilityResult> {
  const dsh = await runner.run('dsh', ['--version'])
  const pnpm = await runner.run('pnpm', ['--version'])
  const dshVersion = dsh.code === 0 ? versionFromOutput(`${dsh.stdout}\n${dsh.stderr}`) : undefined
  const pnpmVersion = pnpm.code === 0 ? versionFromOutput(`${pnpm.stdout}\n${pnpm.stderr}`) : undefined
  const parsedNode = valid(nodeVersion)
  const nodeOk = parsedNode !== null && gte(parsedNode, COMPATIBILITY_MANIFEST.node.minimum)
  const dshBlocked = dshVersion !== undefined
    && COMPATIBILITY_MANIFEST.dsh.blockedCliVersions.includes(dshVersion)
  const dshTested = dshVersion !== undefined
    && COMPATIBILITY_MANIFEST.dsh.testedCliVersions.includes(dshVersion)

  const checks: CompatibilityCheck[] = [
    check(
      'environment.node',
      nodeOk,
      true,
      nodeOk
        ? `Node.js ${nodeVersion} satisfies >=${COMPATIBILITY_MANIFEST.node.minimum}`
        : `Node.js ${nodeVersion} is unsupported; requires >=${COMPATIBILITY_MANIFEST.node.minimum}`,
    ),
    check(
      'environment.dsh',
      dsh.code === 0,
      true,
      dsh.code === 0 ? 'DSH CLI detected' : 'DSH CLI is not available on PATH',
    ),
    check(
      'environment.pnpm',
      pnpm.code === 0,
      true,
      pnpm.code === 0 ? 'pnpm detected' : 'pnpm is required by dsh plugin management but is not available on PATH',
    ),
    check(
      'environment.dsh.version',
      dshVersion !== undefined,
      false,
      dshVersion === undefined ? 'DSH version could not be parsed; runtime capability checks will be authoritative' : `DSH ${dshVersion} detected`,
    ),
    check(
      'environment.dsh.blocked',
      !dshBlocked,
      true,
      dshBlocked ? `DSH ${dshVersion} is explicitly blocked by the compatibility manifest` : 'DSH version is not explicitly blocked',
    ),
  ]

  return createCompatibilityResult(checks, {
    nodeVersion,
    dshVersion,
    pnpmVersion,
    testedDsh: dshTested,
  }, dshTested)
}
