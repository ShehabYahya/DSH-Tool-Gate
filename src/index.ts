/**
 * Native capability-level progressive disclosure for DeepSeek Harness.
 *
 * Large MCP/configured toolsets stay in DSH's real registry but are hidden
 * from each agent by a scoped `ctx.tools.restrict()` mask until the agent calls
 * `enable_toolset`. Once enabled, the original native definitions become
 * visible and execute through the normal DSH pipeline.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { AgentToolGate } from './gate.js'
import type { ToolsetRule } from './types.js'

export * from './catalog.js'
export * from './gate.js'
export * from './types.js'

export const name = 'dsh-tool-gate'
export const inject = ['tools', 'agents']

export interface Config {
  /** Master switch. */
  enabled: boolean
  /** Automatically group DSH MCP tools by their documented server-qualified public name. */
  autoMcp: boolean
  /** Explicit groups for non-MCP plugins, overrides, or capabilities that should stay always visible. */
  toolsets: ToolsetRule[]
  /** Small scoped loader tool shown to every gated agent. */
  launcherToolName: string
  /** Emit per-agent schema/token savings diagnostics. */
  debug: boolean
}

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
  enabled: true,
  autoMcp: true,
  toolsets: [],
  launcherToolName: 'enable_toolset',
  debug: false,
})

const ToolsetRuleSchema = z.object({
  id: z.string().required(),
  description: z.string(),
  match: z.array(z.string()).required(),
  visibility: z.union(['always', 'lazy'] as const).default('lazy'),
})

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled),
  autoMcp: z.boolean().default(DEFAULT_CONFIG.autoMcp),
  toolsets: z.array(ToolsetRuleSchema).default([]),
  launcherToolName: z.string().default(DEFAULT_CONFIG.launcherToolName),
  debug: z.boolean().default(DEFAULT_CONFIG.debug),
}) as unknown as z<Config>

/** Install lifecycle listeners and one controller per live agent. */
export function apply(ctx: Context, rawConfig: Config): void {
  const config: Config = {
    enabled: rawConfig.enabled ?? DEFAULT_CONFIG.enabled,
    autoMcp: rawConfig.autoMcp ?? DEFAULT_CONFIG.autoMcp,
    toolsets: rawConfig.toolsets ?? [],
    launcherToolName: rawConfig.launcherToolName ?? DEFAULT_CONFIG.launcherToolName,
    debug: rawConfig.debug ?? DEFAULT_CONFIG.debug,
  }
  if (!config.enabled) return

  const controllers = new Map<Agent, AgentToolGate>()
  let internalMutationDepth = 0
  let refreshScheduled = false
  let active = true

  const internalMutation = <T>(operation: () => T): T => {
    internalMutationDepth += 1
    try {
      return operation()
    } finally {
      internalMutationDepth -= 1
    }
  }

  const install = (agent: Agent): void => {
    if (!active || controllers.has(agent)) return
    const controller = new AgentToolGate(ctx, agent, {
      autoMcp: config.autoMcp,
      rules: config.toolsets,
      launcherToolName: config.launcherToolName,
      debug: config.debug,
    }, internalMutation)
    controller.install()
    controllers.set(agent, controller)
  }

  const disposeAgent = (agent: Agent): void => {
    const controller = controllers.get(agent)
    if (controller === undefined) return
    controllers.delete(agent)
    controller.dispose()
  }

  const refreshAll = (): void => {
    refreshScheduled = false
    if (!active) return
    for (const controller of controllers.values()) controller.refresh()
  }

  // Hot-load/reload: cover sessions that already existed before this plugin.
  for (const agent of ctx.agents.list()) install(agent)

  // session-start is synchronous and precedes the first driving request, while
  // unlike agent/created it is a notification rather than a publication veto.
  ctx.on('agent/session-start', ({ agent }) => {
    try {
      install(agent)
    } catch (error: unknown) {
      ctx.logger.error(`dsh-tool-gate(${agent.id}): failed to install gate: ${String(error)}`)
    }
  })

  ctx.on('agent/disposed', ({ agent }) => { disposeAgent(agent) })

  // MCP list-changed / plugin HMR can mutate the registry after session start.
  // Our own scoped restriction/launcher edits also emit tools/change; suppress
  // those synchronously and coalesce real registry changes into one microtask.
  ctx.on('tools/change', () => {
    if (!active || internalMutationDepth > 0 || refreshScheduled) return
    refreshScheduled = true
    queueMicrotask(refreshAll)
  })

  ctx.effect(() => () => {
    active = false
    for (const controller of controllers.values()) controller.dispose()
    controllers.clear()
  }, 'dsh-tool-gate.lifecycle')
}
