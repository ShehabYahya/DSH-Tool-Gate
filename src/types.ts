export type ToolOriginKind = 'core' | 'plugin' | 'mcp' | 'unknown'

/** Stable identity for the component that registered a tool. */
export interface ToolOrigin {
  kind: ToolOriginKind
  /** Stable origin id, e.g. `mcp:blender` or `plugin:deepseek-harness-cce`. */
  id: string
  /** Short human/model-facing capability label. */
  label: string
}

/** One lazy-loadable capability group exposed to the agent. */
export interface ToolsetDescriptor {
  id: string
  description: string
  origin: ToolOrigin
  toolNames: readonly string[]
  defaultVisibility: 'always' | 'lazy'
}

/** Agent/session-local state. Activations are additive and sticky by default. */
export interface ToolGateState {
  enabledToolsets: ReadonlySet<string>
}

/** Lightweight diagnostics used to prove token/context savings. */
export interface ToolsetSchemaStats {
  toolsetId: string
  toolCount: number
  schemaBytes: number
  estimatedTokens?: number
}
