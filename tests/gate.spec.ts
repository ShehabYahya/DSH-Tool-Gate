import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import type { Scope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import { AgentToolGate } from '../src/gate.js'

const signal = new AbortController().signal

async function mount(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  return ctx
}

async function mintAgent(ctx: Context, id: string): Promise<{ agent: Agent; scope: Scope }> {
  const key = { id } as unknown as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => {
    scope = createScope(inner, key)
  }, { inject: ['tools', 'systemPrompt'] }))
  Object.defineProperty(key, 'ctx', { value: scope.ctx })
  return { agent: key, scope }
}

function tool(name: string): ToolDefinition {
  return {
    name,
    description: `native ${name}`,
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value as string }],
    },
    execute: async () => `ran:${name}`,
  }
}

function names(ctx: Context, agent: Agent): string[] {
  return ctx.tools.schemas(agent).map(schema => schema.name).sort()
}

async function execute(ctx: Context, agent: Agent, name: string, args: unknown) {
  return ctx.tools.execute({
    signal,
    callId: 'test-call' as never,
    name,
    arguments: args,
    agent,
  })
}

function gate(ctx: Context, agent: Agent): AgentToolGate {
  return new AgentToolGate(ctx, agent, {
    autoMcp: true,
    rules: [],
    launcherToolName: 'enable_toolset',
    debug: false,
  }, operation => operation())
}

describe('AgentToolGate', () => {
  it('hides MCP suites only for the gated agent and leaves native core tools visible', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('bash'))
    ctx.tools.register(tool('mcp__blender__get_scene'))
    ctx.tools.register(tool('mcp__blender__pose_bone'))
    ctx.tools.register(tool('mcp__godot-ai__run_project'))

    const gated = await mintAgent(ctx, 'gated')
    const other = await mintAgent(ctx, 'other')
    const controller = gate(ctx, gated.agent)
    controller.install()

    expect(names(ctx, gated.agent)).toEqual(['bash', 'enable_toolset'])
    expect(names(ctx, other.agent)).toEqual([
      'bash',
      'mcp__blender__get_scene',
      'mcp__blender__pose_bone',
      'mcp__godot-ai__run_project',
    ])

    const launcher = ctx.tools.get('enable_toolset', gated.agent)
    expect(launcher?.description).toContain('blender [available]')
    expect(launcher?.description).toContain('godot-ai [available]')
  })

  it('loads one complete native MCP suite and keeps unrelated suites hidden', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('bash'))
    ctx.tools.register(tool('mcp__blender__get_scene'))
    ctx.tools.register(tool('mcp__blender__pose_bone'))
    ctx.tools.register(tool('mcp__godot-ai__run_project'))

    const { agent } = await mintAgent(ctx, 'a')
    const controller = gate(ctx, agent)
    controller.install()

    const result = await execute(ctx, agent, 'enable_toolset', { toolset: 'blender' })
    expect(result.isError).toBe(false)
    expect(names(ctx, agent)).toEqual([
      'bash',
      'enable_toolset',
      'mcp__blender__get_scene',
      'mcp__blender__pose_bone',
    ])

    const nativeCall = await execute(ctx, agent, 'mcp__blender__get_scene', {})
    expect(nativeCall.isError).toBe(false)
    expect(nativeCall.content[0]).toEqual({ type: 'text', text: 'ran:mcp__blender__get_scene' })

    const hiddenCall = await execute(ctx, agent, 'mcp__godot-ai__run_project', {})
    expect(hiddenCall.isError).toBe(true)
    expect(hiddenCall.content[0]).toEqual({ type: 'text', text: 'Error: unknown tool "mcp__godot-ai__run_project"' })
  })

  it('keeps activation sticky and idempotent', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__blender__get_scene'))
    const { agent } = await mintAgent(ctx, 'a')
    const controller = gate(ctx, agent)
    controller.install()

    expect(controller.enable('blender').status).toBe('enabled')
    expect(controller.enable('blender').status).toBe('already_enabled')
    expect(names(ctx, agent)).toContain('mcp__blender__get_scene')
  })

  it('re-gates newly registered MCP tools on refresh and preserves enabled suites', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__blender__get_scene'))
    const { agent } = await mintAgent(ctx, 'a')
    const controller = gate(ctx, agent)
    controller.install()

    ctx.tools.register(tool('mcp__blender__pose_bone'))
    // Exact-name restrictions intentionally do not hide a newly registered name until refresh.
    expect(names(ctx, agent)).toContain('mcp__blender__pose_bone')
    controller.refresh()
    expect(names(ctx, agent)).not.toContain('mcp__blender__pose_bone')

    controller.enable('blender')
    ctx.tools.register(tool('mcp__blender__animate'))
    controller.refresh()
    expect(names(ctx, agent)).toContain('mcp__blender__animate')
  })

  it('supports explicit lazy plugin groups without proxying their native tools', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('github_search'))
    ctx.tools.register(tool('github_issue'))
    ctx.tools.register(tool('bash'))
    const { agent } = await mintAgent(ctx, 'a')
    const controller = new AgentToolGate(ctx, agent, {
      autoMcp: true,
      rules: [{
        id: 'github',
        description: 'GitHub repository, issue, and pull-request operations.',
        match: ['github_*'],
        visibility: 'lazy',
      }],
      launcherToolName: 'enable_toolset',
      debug: false,
    }, operation => operation())
    controller.install()

    expect(names(ctx, agent)).toEqual(['bash', 'enable_toolset'])
    controller.enable('github')
    expect(names(ctx, agent)).toEqual(['bash', 'enable_toolset', 'github_issue', 'github_search'])
  })

  it('restores the pre-gate surface when disposed', async () => {
    const ctx = await mount()
    ctx.tools.register(tool('mcp__blender__get_scene'))
    const { agent } = await mintAgent(ctx, 'a')
    const controller = gate(ctx, agent)
    controller.install()

    expect(names(ctx, agent)).toEqual(['enable_toolset'])
    controller.dispose()
    expect(names(ctx, agent)).toEqual(['mcp__blender__get_scene'])
  })
})
