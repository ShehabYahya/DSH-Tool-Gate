import { describe, expect, it } from 'vitest'
import type { CommandResult, ProcessRunner } from '../src/compatibility/environment.js'
import { runInstall } from '../src/cli/commands/install.js'
import { runUninstall } from '../src/cli/commands/uninstall.js'
import type { OutputWriter } from '../src/cli/output.js'
import type { ProfileInspection } from '../src/cli/profile.js'

class RecordingRunner implements ProcessRunner {
  readonly calls: string[] = []

  constructor(private readonly results: Record<string, CommandResult>) {}

  async run(command: string, args: string[]): Promise<CommandResult> {
    const key = `${command} ${args.join(' ')}`
    this.calls.push(key)
    return this.results[key] ?? { code: 127, stdout: '', stderr: `unexpected command: ${key}` }
  }
}

function writer(lines: string[]): OutputWriter {
  return {
    out: line => { lines.push(line) },
    error: line => { lines.push(line) },
  }
}

function profile(overrides: Partial<ProfileInspection> = {}): ProfileInspection {
  return {
    profile: 'web',
    exists: true,
    dependencyDeclared: true,
    bundleDeclared: true,
    path: '/tmp/dsh/profiles/web',
    ...overrides,
  }
}

describe('CLI install lifecycle', () => {
  it('installs through the official DSH plugin command and verifies dump-config', async () => {
    const lines: string[] = []
    const runner = new RecordingRunner({
      'dsh --version': { code: 0, stdout: '0.1.0-rc.7\n', stderr: '' },
      'pnpm --version': { code: 0, stdout: '10.17.0\n', stderr: '' },
      'dsh plugin --profile web add -w dsh-tool-gate': { code: 0, stdout: 'ok', stderr: '' },
      'dsh --profile web --dump-config': { code: 0, stdout: '# == dsh-tool-gate\n- id: dsh-tool-gate\n', stderr: '' },
    })

    const code = await runInstall(
      { profile: 'web', packageSpec: 'dsh-tool-gate' },
      { runner, writer: writer(lines), inspect: () => profile() },
    )

    expect(code).toBe(0)
    expect(runner.calls).toContain('dsh plugin --profile web add -w dsh-tool-gate')
    expect(lines.join('\n')).toContain('Bundle layer appears')
  })

  it('removes the package through DSH and verifies the declarations disappear', async () => {
    const lines: string[] = []
    const runner = new RecordingRunner({
      'dsh plugin --profile web remove -w dsh-tool-gate': { code: 0, stdout: 'ok', stderr: '' },
      'dsh --profile web --dump-config': { code: 0, stdout: '# base only\n', stderr: '' },
    })
    let inspections = 0

    const code = await runUninstall(
      { profile: 'web' },
      {
        runner,
        writer: writer(lines),
        inspect: () => {
          inspections += 1
          return inspections === 1
            ? profile()
            : profile({ dependencyDeclared: false, bundleDeclared: false })
        },
      },
    )

    expect(code).toBe(0)
    expect(runner.calls).toContain('dsh plugin --profile web remove -w dsh-tool-gate')
  })
})
