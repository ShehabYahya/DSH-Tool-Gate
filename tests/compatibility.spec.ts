import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { describe, expect, it } from 'vitest'
import { checkEnvironmentCompatibility, type CommandResult, type ProcessRunner } from '../src/compatibility/environment.js'
import { checkAgentRuntime, checkRootRuntime } from '../src/compatibility/runtime.js'

class FakeRunner implements ProcessRunner {
  constructor(private readonly results: Record<string, CommandResult>) {}

  async run(command: string, args: string[]): Promise<CommandResult> {
    return this.results[`${command} ${args.join(' ')}`] ?? { code: 127, stdout: '', stderr: 'missing' }
  }
}

describe('compatibility checks', () => {
  it('marks the locally certified DSH release as tested', async () => {
    const result = await checkEnvironmentCompatibility(new FakeRunner({
      'dsh --version': { code: 0, stdout: '0.1.0-rc.7\n', stderr: '' },
      'pnpm --version': { code: 0, stdout: '10.17.0\n', stderr: '' },
    }), '24.8.0')

    expect(result.status).toBe('tested')
    expect(result.metadata.dshVersion).toBe('0.1.0-rc.7')
  })

  it('allows an unknown future DSH release as unverified', async () => {
    const result = await checkEnvironmentCompatibility(new FakeRunner({
      'dsh --version': { code: 0, stdout: '0.1.2-rc.1\n', stderr: '' },
      'pnpm --version': { code: 0, stdout: '10.17.0\n', stderr: '' },
    }), '24.8.0')

    expect(result.status).toBe('compatible-unverified')
  })

  it('hard-fails when pnpm is unavailable', async () => {
    const result = await checkEnvironmentCompatibility(new FakeRunner({
      'dsh --version': { code: 0, stdout: '0.1.0-rc.7\n', stderr: '' },
      'pnpm --version': { code: 127, stdout: '', stderr: 'not found' },
    }), '24.8.0')

    expect(result.status).toBe('incompatible')
  })

  it('probes root and agent capabilities without invoking them', () => {
    let mutations = 0
    const root = {
      tools: { schemas: () => [] },
      agents: { list: () => [] },
      on: () => { mutations += 1 },
      effect: () => { mutations += 1 },
    } as unknown as Context
    const agent = {
      ctx: {
        tools: {
          restrict: () => { mutations += 1 },
          register: () => { mutations += 1 },
        },
        effect: () => { mutations += 1 },
        fiber: { uid: 'live' },
      },
    } as unknown as Agent

    expect(checkRootRuntime(root).status).toBe('compatible-unverified')
    expect(checkAgentRuntime(agent).status).toBe('compatible-unverified')
    expect(mutations).toBe(0)
  })

  it('rejects an agent runtime that has lost scoped restriction support', () => {
    const agent = {
      ctx: {
        tools: { register: () => undefined },
        effect: () => undefined,
        fiber: { uid: 'live' },
      },
    } as unknown as Agent

    expect(checkAgentRuntime(agent).status).toBe('incompatible')
  })
})
