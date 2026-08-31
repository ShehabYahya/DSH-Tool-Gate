import type {
  ToolCatalogSnapshot,
  ToolOrigin,
  ToolSchemaLike,
  ToolsetDescriptor,
  ToolsetRule,
} from './types.js'

const MCP_PREFIX = 'mcp__'
const TOKEN_HEURISTIC_BYTES = 4
const MAX_GENERATED_DESCRIPTION = 360
const MAX_TOOL_DESCRIPTION = 90
const MAX_DESCRIPTION_SAMPLES = 3

export interface CatalogOptions {
  autoMcp: boolean
  rules: readonly ToolsetRule[]
}

/** Match a deliberately tiny glob language: only `*` has special meaning. */
export function matchGlob(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(value)
}

/**
 * Read the server segment from DSH's documented MCP public-name contract.
 * This is used only for capability grouping; Tool Gate never reconstructs a
 * raw MCP tool name or proxies an MCP call.
 */
export function mcpServerFromPublicName(name: string): string | undefined {
  if (!name.startsWith(MCP_PREFIX)) return undefined
  const rest = name.slice(MCP_PREFIX.length)
  const separator = rest.indexOf('__')
  if (separator <= 0) return undefined
  return rest.slice(0, separator)
}

/** Rough composition estimate compatible with DSH's display heuristic. */
export function estimateSchemaTokens(schema: ToolSchemaLike): number {
  return Math.ceil(schemaBytes(schema) / TOKEN_HEURISTIC_BYTES)
}

export function schemaBytes(schema: ToolSchemaLike): number {
  return Buffer.byteLength(JSON.stringify(schema), 'utf8')
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

function firstSentence(value: string | undefined): string {
  const compact = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (compact === '') return ''
  const boundary = compact.search(/[.!?](?:\s|$)/)
  return truncate(boundary >= 0 ? compact.slice(0, boundary + 1) : compact, MAX_TOOL_DESCRIPTION)
}

function generatedDescription(label: string, schemas: readonly ToolSchemaLike[]): string {
  const examples = schemas
    .map(schema => {
      const summary = firstSentence(schema.description)
      return summary === '' ? schema.name : `${schema.name}: ${summary}`
    })
    .slice(0, MAX_DESCRIPTION_SAMPLES)
  const suffix = examples.length === 0 ? '' : ` Examples: ${examples.join('; ')}`
  return truncate(`${label} (${schemas.length} native tool${schemas.length === 1 ? '' : 's'}).${suffix}`, MAX_GENERATED_DESCRIPTION)
}

function stats(toolsetId: string, schemas: readonly ToolSchemaLike[]) {
  const bytes = schemas.reduce((total, schema) => total + schemaBytes(schema), 0)
  return {
    toolsetId,
    toolCount: schemas.length,
    schemaBytes: bytes,
    estimatedTokens: Math.ceil(bytes / TOKEN_HEURISTIC_BYTES),
  }
}

function ensureUniqueRuleMatches(schemas: readonly ToolSchemaLike[], rules: readonly ToolsetRule[]): Map<string, ToolsetRule> {
  const assignments = new Map<string, ToolsetRule>()
  for (const schema of schemas) {
    const matching = rules.filter(rule => rule.match.some(pattern => matchGlob(schema.name, pattern)))
    if (matching.length > 1) {
      throw new Error(`tool "${schema.name}" matches multiple Tool Gate rules: ${matching.map(rule => rule.id).join(', ')}`)
    }
    if (matching[0] !== undefined) assignments.set(schema.name, matching[0])
  }
  return assignments
}

function uniqueMcpId(server: string, used: ReadonlySet<string>): string {
  if (!used.has(server)) return server
  const qualified = `mcp:${server}`
  if (!used.has(qualified)) return qualified
  let suffix = 2
  while (used.has(`${qualified}:${suffix}`)) suffix += 1
  return `${qualified}:${suffix}`
}

/**
 * Build stable capability groups from one agent's effective tool surface.
 * Explicit rules win. Remaining MCP tools are grouped automatically by DSH's
 * server-qualified public naming contract. Everything else remains ungated.
 */
export function buildCatalog(
  schemas: readonly ToolSchemaLike[],
  options: CatalogOptions,
): ToolCatalogSnapshot {
  const byName = new Map(schemas.map(schema => [schema.name, schema]))
  if (byName.size !== schemas.length) throw new Error('Tool Gate catalog received duplicate public tool names')

  const assignments = ensureUniqueRuleMatches(schemas, options.rules)
  const grouped = new Set<string>()
  const toolsets: ToolsetDescriptor[] = []
  const usedIds = new Set<string>()

  for (const rule of options.rules) {
    if (usedIds.has(rule.id)) throw new Error(`duplicate Tool Gate rule id "${rule.id}"`)
    usedIds.add(rule.id)
    const members = schemas.filter(schema => assignments.get(schema.name) === rule)
    if (members.length === 0) continue
    for (const member of members) grouped.add(member.name)
    const origin: ToolOrigin = {
      kind: 'configured',
      id: `configured:${rule.id}`,
      label: rule.id,
    }
    toolsets.push({
      id: rule.id,
      description: rule.description ?? generatedDescription(rule.id, members),
      origin,
      toolNames: members.map(member => member.name),
      defaultVisibility: rule.visibility,
      stats: stats(rule.id, members),
    })
  }

  if (options.autoMcp) {
    const byServer = new Map<string, ToolSchemaLike[]>()
    for (const schema of schemas) {
      if (grouped.has(schema.name)) continue
      const server = mcpServerFromPublicName(schema.name)
      if (server === undefined) continue
      const members = byServer.get(server) ?? []
      members.push(schema)
      byServer.set(server, members)
    }
    for (const [server, members] of [...byServer.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const id = uniqueMcpId(server, usedIds)
      usedIds.add(id)
      for (const member of members) grouped.add(member.name)
      toolsets.push({
        id,
        description: generatedDescription(`MCP capability "${server}"`, members),
        origin: { kind: 'mcp', id: `mcp:${server}`, label: server },
        toolNames: members.map(member => member.name),
        defaultVisibility: 'lazy',
        stats: stats(id, members),
      })
    }
  }

  toolsets.sort((left, right) => left.id.localeCompare(right.id))
  const totalSchemaBytes = schemas.reduce((total, schema) => total + schemaBytes(schema), 0)
  const lazy = toolsets.filter(toolset => toolset.defaultVisibility === 'lazy')
  const lazySchemaBytes = lazy.reduce((total, toolset) => total + toolset.stats.schemaBytes, 0)

  return {
    toolsets,
    ungroupedToolNames: schemas.filter(schema => !grouped.has(schema.name)).map(schema => schema.name),
    totalSchemaBytes,
    totalEstimatedTokens: Math.ceil(totalSchemaBytes / TOKEN_HEURISTIC_BYTES),
    lazySchemaBytes,
    lazyEstimatedTokens: Math.ceil(lazySchemaBytes / TOKEN_HEURISTIC_BYTES),
  }
}

/** Model-facing compact catalog for the single always-visible loader tool. */
export function renderCapabilityCatalog(catalog: ToolCatalogSnapshot, enabled: ReadonlySet<string>): string {
  const optional = catalog.toolsets.filter(toolset => toolset.defaultVisibility === 'lazy')
  if (optional.length === 0) return 'No optional toolsets are currently gated.'
  return optional.map(toolset => {
    const state = enabled.has(toolset.id) ? 'loaded' : 'available'
    return `- ${toolset.id} [${state}] — ${toolset.description} (~${toolset.stats.estimatedTokens} schema tokens)`
  }).join('\n')
}
