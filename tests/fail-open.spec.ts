import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply, DEFAULT_CONFIG } from '../src/index.js'

describe('fail-open runtime guard', () => {
  it('returns before any lifecycle or tool mutation when root capabilities are missing', () => {
    let onCalls = 0
    let effectCalls = 0
    const warnings: string[] = []
    const root = {
      tools: {},
      agents: { list: () => [] },
      on: () => { onCalls += 1 },
      effect: () => { effectCalls += 1 },
      logger: {
        warn: (message: unknown) => { warnings.push(String(message)) },
        error: () => undefined,
      },
    } as unknown as Context

    apply(root, { ...DEFAULT_CONFIG, toolsets: [] })

    expect(onCalls).toBe(0)
    expect(effectCalls).toBe(0)
    expect(warnings.join('\n')).toContain('disabled without changing tool visibility')
  })

  it('skips an incompatible agent without registering or restricting tools', () => {
    let registerCalls = 0
    let rootEffectCalls = 0
    const warnings: string[] = []
    const agent = {
      id: 'agent-1',
      ctx: {
        tools: {
          register: () => {
            registerCalls += 1
            return () => undefined
          },
        },
        effect: () => () => undefined,
        fiber: { uid: 'live' },
      },
    }
    const root = {
      tools: { schemas: () => [] },
      agents: { list: () => [agent] },
      on: () => () => undefined,
      effect: () => {
        rootEffectCalls += 1
        return () => undefined
      },
      logger: {
        warn: (message: unknown) => { warnings.push(String(message)) },
        error: () => undefined,
      },
    } as unknown as Context

    apply(root, { ...DEFAULT_CONFIG, toolsets: [] })

    expect(registerCalls).toBe(0)
    expect(rootEffectCalls).toBe(1)
    expect(warnings.join('\n')).toContain('incompatible agent runtime')
    expect(warnings.join('\n')).toContain('leaving native tool visibility unchanged')
  })
})
