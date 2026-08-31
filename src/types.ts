export type ToolOriginKind = 'mcp' | 'configured' | 'unknown'

/** Minimal model-facing schema shape needed by discovery and metrics. */
export interface ToolSchemaLike {
  readonly name: string
  readonly description?: string
  readonly parameters: unknown
}

/** Stable identity for the component/group that owns a gated capability. */
export interface ToolOrigin {
  kind: ToolOriginKind
  /** Stable origin id, e.g. `mcp:blender` or `configured:github`. */
  id: string
  /** Short human/model-facing capability label. */
  label: string
}

/** Explicit grouping rule for non-MCP plugins or policy overrides. */
export interface ToolsetRule {
  id: string
  /** Optional model-facing explanation. Generated from member tools when omitted. */
  description?: string
  /** `*` is the only wildcard; matching is against the complete public tool name. */
  match: readonly string[]
  visibility: 'always' | 'lazy'
}

/** Lightweight diagnostics used to prove token/context savings. */
export interface ToolsetSchemaStats {
  toolsetId: string
  toolCount: number
  schemaBytes: number
  /** Same intentionally rough heuristic DSH uses for its context-composition meter. */
  estimatedTokens: number
}

/** One capability group known to Tool Gate. */
export interface ToolsetDescriptor {
  id: string
  description: string
  origin: ToolOrigin
  toolNames: readonly string[]
  defaultVisibility: 'always' | 'lazy'
  stats: ToolsetSchemaStats
}

/** Snapshot produced from one agent's effective pre-gate tool surface. */
export interface ToolCatalogSnapshot {
  toolsets: readonly ToolsetDescriptor[]
  ungroupedToolNames: readonly string[]
  totalSchemaBytes: number
  totalEstimatedTokens: number
  lazySchemaBytes: number
  lazyEstimatedTokens: number
}

/** Agent/session-local state. Activations are additive and sticky by default. */
export interface ToolGateState {
  enabledToolsets: ReadonlySet<string>
}

/** Successful `enable_toolset` result returned to the model. */
export interface EnableToolsetResult {
  toolset: string
  status: 'enabled' | 'already_enabled'
  toolCount: number
  estimatedSchemaTokensAdded: number
  remainingHiddenToolsets: string[]
}
