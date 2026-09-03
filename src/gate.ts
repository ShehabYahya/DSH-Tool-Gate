import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools'
import { buildCatalog, renderCapabilityCatalog } from './catalog.js'
import type {
  EnableToolsetResult,
  ToolCatalogSnapshot,
  ToolSchemaLike,
  ToolsetRule,
} from './types.js'

export interface AgentGateOptions {
  autoMcp: boolean
  rules: readonly ToolsetRule[]
  launcherToolName: string
  debug: boolean
}

export type InternalMutation = <T>(operation: () => T) => T

function schemasForAgent(rootCtx: Context, agent: Agent): ToolSchemaLike[] {
  return rootCtx.tools.schemas(agent).map(schema => ({
    name: schema.name,
    description: schema.description,
    parameters: schema.parameters,
  }))
}

function remainingHidden(catalog: ToolCatalogSnapshot, enabled: ReadonlySet<string>): string[] {
  return catalog.toolsets
    .filter(toolset => toolset.defaultVisibility === 'lazy' && !enabled.has(toolset.id))
    .map(toolset => toolset.id)
}

function launcherDescription(catalog: ToolCatalogSnapshot, enabled: ReadonlySet<string>): string {
  return [
    'Load an optional native DSH toolset into this agent session only when the task needs that capability.',
    'Toolsets stay loaded for the rest of the session. After loading, call the newly visible native tools directly; this tool is not a proxy.',
    'Available capability groups:',
    renderCapabilityCatalog(catalog, enabled),
  ].join('\n')
}

function createLauncherDefinition(controller: AgentToolGate): ToolDefinition {
  return {
    name: controller.options.launcherToolName,
    description: launcherDescription(controller.catalog, controller.enabledToolsets),
    parameters: {
      type: 'object',
      properties: {
        toolset: {
          type: 'string',
          description: 'Capability/toolset id exactly as listed in this tool description.',
        },
      },
      required: ['toolset'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          toolset: { type: 'string' },
          status: { type: 'string' },
          toolCount: { type: 'integer' },
          estimatedSchemaTokensAdded: { type: 'integer' },
          remainingHiddenToolsets: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'toolset',
          'status',
          'toolCount',
          'estimatedSchemaTokensAdded',
          'remainingHiddenToolsets',
        ],
        additionalProperties: false,
      },
      render: (_args, value) => {
        const result = value as unknown as EnableToolsetResult
        const suffix = result.remainingHiddenToolsets.length === 0
          ? ' No optional toolsets remain hidden.'
          : ` Still hidden: ${result.remainingHiddenToolsets.join(', ')}.`
        return [{
          type: 'text',
          text: `${result.status === 'enabled' ? 'Enabled' : 'Already enabled'} toolset "${result.toolset}" (${result.toolCount} native tools, ~${result.estimatedSchemaTokensAdded} schema tokens).${suffix}`,
        }]
      },
    },
    async execute(args: unknown, exec: ToolExecution): Promise<EnableToolsetResult> {
      if (exec.agent !== undefined && exec.agent !== controller.agent) {
        throw new Error('enable_toolset was invoked from a different agent scope')
      }
      const candidate = typeof args === 'object' && args !== null && 'toolset' in args
        ? (args as { toolset?: unknown }).toolset
        : undefined
      if (typeof candidate !== 'string' || candidate.trim() === '') {
        throw new Error('toolset must be a non-empty string')
      }
      return controller.enable(candidate)
    },
  }
}

/**
 * Own one agent's sticky capability state and exact DSH restriction disposer.
 * The class performs no proxy execution: loading only changes native registry visibility.
 */
export class AgentToolGate {
  catalog: ToolCatalogSnapshot
  readonly enabledToolsets = new Set<string>()
  private restrictionDispose: (() => void) | undefined
  private launcherDispose: (() => void) | undefined
  private lifecycleDispose: (() => void) | undefined
  private disposed = false

  constructor(
    readonly rootCtx: Context,
    readonly agent: Agent,
    readonly options: AgentGateOptions,
    private readonly internalMutation: InternalMutation,
  ) {
    this.catalog = buildCatalog(schemasForAgent(rootCtx, agent), {
      autoMcp: options.autoMcp,
      rules: options.rules,
    })
  }

  /** Whether this controller still owns a live Cordis agent context. */
  get active(): boolean {
    return !this.disposed && this.contextActive()
  }

  install(): void {
    if (this.disposed) throw new Error('cannot install a disposed Tool Gate controller')
    if (!this.contextActive()) throw new Error('cannot install Tool Gate on an inactive agent context')

    // agent/disposed can lag behind scope/fiber teardown. Bind directly to the
    // context that owns restrict()/register() so this controller is invalidated
    // as soon as Cordis starts disposing that context.
    this.lifecycleDispose = this.agent.ctx.effect(() => () => {
      this.lifecycleDispose = undefined
      this.dispose()
    }, `dsh-tool-gate(${this.agent.id}).agent-lifecycle`)

    try {
      this.internalMutation(() => {
        this.replaceRestriction(false)
        this.replaceLauncher()
      })
    } catch (error) {
      this.dispose()
      throw error
    }
    this.logSavings('installed')
  }

  /**
   * Re-discover after a real registry change. Tool Gate temporarily removes
   * only its own scoped launcher/restriction, snapshots the agent's underlying
   * effective surface, then rebuilds synchronously with no await point.
   */
  refresh(): void {
    if (!this.active) {
      this.dispose()
      return
    }
    this.internalMutation(() => {
      this.launcherDispose?.()
      this.launcherDispose = undefined
      this.restrictionDispose?.()
      this.restrictionDispose = undefined

      this.catalog = buildCatalog(schemasForAgent(this.rootCtx, this.agent), {
        autoMcp: this.options.autoMcp,
        rules: this.options.rules,
      })
      const knownIds = new Set(this.catalog.toolsets.map(toolset => toolset.id))
      for (const id of [...this.enabledToolsets]) {
        if (!knownIds.has(id)) this.enabledToolsets.delete(id)
      }

      // Disposing the old scoped effects can synchronously trigger other
      // lifecycle listeners. Never create replacement effects if that made the
      // owning agent context inactive.
      if (!this.contextActive()) return
      this.replaceRestriction(false)
      this.replaceLauncher()
    })

    if (!this.contextActive()) {
      this.dispose()
      return
    }
    this.logSavings('refreshed')
  }

  enable(toolsetId: string): EnableToolsetResult {
    if (!this.active) {
      this.dispose()
      throw new Error('Tool Gate controller is inactive')
    }
    const toolset = this.catalog.toolsets.find(candidate => candidate.id === toolsetId)
    if (toolset === undefined || toolset.defaultVisibility !== 'lazy') {
      const available = this.catalog.toolsets
        .filter(candidate => candidate.defaultVisibility === 'lazy')
        .map(candidate => candidate.id)
      throw new Error(`unknown optional toolset "${toolsetId}"; available: ${available.join(', ') || '(none)'}`)
    }

    const alreadyEnabled = this.enabledToolsets.has(toolset.id)
    if (!alreadyEnabled) {
      this.enabledToolsets.add(toolset.id)
      this.internalMutation(() => {
        this.replaceRestriction(true)
        this.replaceLauncher()
      })
      this.logSavings(`enabled ${toolset.id}`)
    }

    return {
      toolset: toolset.id,
      status: alreadyEnabled ? 'already_enabled' : 'enabled',
      toolCount: toolset.stats.toolCount,
      estimatedSchemaTokensAdded: toolset.stats.estimatedTokens,
      remainingHiddenToolsets: remainingHidden(this.catalog, this.enabledToolsets),
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    const lifecycleDispose = this.lifecycleDispose
    this.lifecycleDispose = undefined
    lifecycleDispose?.()

    this.internalMutation(() => {
      this.launcherDispose?.()
      this.launcherDispose = undefined
      this.restrictionDispose?.()
      this.restrictionDispose = undefined
    })
  }

  private contextActive(): boolean {
    // Cordis Fiber.assertActive() uses this exact condition before allowing a
    // new effect. tools.restrict()/register() ultimately create effects.
    return this.agent.ctx.fiber.uid !== null
  }

  private hiddenToolNames(): string[] {
    const names = new Set<string>()
    for (const toolset of this.catalog.toolsets) {
      if (toolset.defaultVisibility !== 'lazy' || this.enabledToolsets.has(toolset.id)) continue
      for (const name of toolset.toolNames) names.add(name)
    }
    return [...names].sort()
  }

  /**
   * Replace the active deny mask. During ordinary enable we register the new
   * mask before lifting the old one, so expansion has no transient overexposure.
   */
  private replaceRestriction(registerBeforeDispose: boolean): void {
    if (!this.contextActive()) return

    const denied = this.hiddenToolNames()
    const old = this.restrictionDispose

    if (registerBeforeDispose && denied.length > 0) {
      const next = this.agent.ctx.tools.restrict({ deny: denied })
      old?.()
      this.restrictionDispose = next
      return
    }

    old?.()
    this.restrictionDispose = denied.length === 0
      ? undefined
      : this.agent.ctx.tools.restrict({ deny: denied })
  }

  private replaceLauncher(): void {
    if (!this.contextActive()) return

    const old = this.launcherDispose
    old?.()
    this.launcherDispose = this.agent.ctx.tools.register(createLauncherDefinition(this))
  }

  private logSavings(reason: string): void {
    if (!this.options.debug) return
    const hidden = this.catalog.toolsets.filter(
      toolset => toolset.defaultVisibility === 'lazy' && !this.enabledToolsets.has(toolset.id),
    )
    const hiddenTokens = hidden.reduce((total, toolset) => total + toolset.stats.estimatedTokens, 0)
    const hiddenTools = hidden.reduce((total, toolset) => total + toolset.stats.toolCount, 0)
    this.rootCtx.logger.info(
      `dsh-tool-gate(${this.agent.id}): ${reason}; hiding ${hiddenTools} tools across ${hidden.length} toolsets (~${hiddenTokens} schema tokens/request)`,
    )
  }
}
