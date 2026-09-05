import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { createCompatibilityResult, type CompatibilityCheck, type CompatibilityResult } from './types.js'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : undefined
}

function hasFunction(record: UnknownRecord | undefined, key: string): boolean {
  return typeof record?.[key] === 'function'
}

function required(id: string, ok: boolean, message: string): CompatibilityCheck {
  return { id, ok, required: true, message }
}

export function checkRootRuntime(ctx: Context): CompatibilityResult {
  const root = asRecord(ctx)
  const tools = asRecord(root?.tools)
  const agents = asRecord(root?.agents)

  return createCompatibilityResult([
    required('runtime.tools', tools !== undefined, 'ctx.tools service is unavailable'),
    required('runtime.tools.schemas', hasFunction(tools, 'schemas'), 'ctx.tools.schemas() is unavailable'),
    required('runtime.agents', agents !== undefined, 'ctx.agents service is unavailable'),
    required('runtime.agents.list', hasFunction(agents, 'list'), 'ctx.agents.list() is unavailable'),
    required('runtime.events', hasFunction(root, 'on'), 'ctx.on() is unavailable'),
    required('runtime.effects', hasFunction(root, 'effect'), 'ctx.effect() is unavailable'),
  ])
}

export function checkAgentRuntime(agent: Agent): CompatibilityResult {
  const candidate = asRecord(agent)
  const agentCtx = asRecord(candidate?.ctx)
  const tools = asRecord(agentCtx?.tools)
  const fiber = asRecord(agentCtx?.fiber)

  return createCompatibilityResult([
    required('runtime.agent.ctx', agentCtx !== undefined, 'agent.ctx is unavailable'),
    required('runtime.agent.tools', tools !== undefined, 'agent.ctx.tools is unavailable'),
    required('runtime.agent.tools.restrict', hasFunction(tools, 'restrict'), 'agent.ctx.tools.restrict() is unavailable'),
    required('runtime.agent.tools.register', hasFunction(tools, 'register'), 'agent.ctx.tools.register() is unavailable'),
    required('runtime.agent.effects', hasFunction(agentCtx, 'effect'), 'agent.ctx.effect() is unavailable'),
    required('runtime.agent.fiber', fiber !== undefined && 'uid' in fiber, 'agent.ctx.fiber.uid is unavailable'),
  ])
}
