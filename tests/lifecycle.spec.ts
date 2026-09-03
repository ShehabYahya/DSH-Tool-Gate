import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { AgentToolGate } from '../src/gate.js'

async function mount(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  return ctx
}

async function mintAgent(ctx: Context, id: string): Promise<Agent> {
  const agent = { id } as unknown as Agent
  let agentCtx!: Context
  await ctx.plugin(Object.assign((inner: Context) => {
    agentCtx = createScope(inner, agent).ctx
  }, { inject: ['tools', 'systemPrompt'] }))
  Object.defineProperty(agent, 'ctx', { value: agentCtx })
  return agent
}

function tool(name: string): ToolDefinition {
  return {
    name,
    description: `native ${name}`,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: async () => `ran:${name}`,
  }
}

function gate(ctx: Context, agent: Agent): AgentToolGate {
  return new AgentToolGate(ctx, agent, {
    autoMcp: true,
    rules: [],
    launcherToolName: 'enable_toolset',
    debug: false,
  }, operation => operation())
}

describe('AgentToolGate lifecycle', () => {
  it('does not create replacement effects after the owning agent context is inactive', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__blender__get_scene'))
    const agent = await mintAgent(ctx, 'stale-agent')
    const controller = gate(ctx, agent)
    controller.install()

    expect(controller.active).toBe(true)

    // Cordis Fiber.assertActive() rejects effect creation once uid is null.
    // This reproduces the state that previously made a queued refresh crash DSH.
    agent.ctx.fiber.uid = null

    expect(() => controller.refresh()).not.toThrow()
    expect(controller.active).toBe(false)
  })
})
