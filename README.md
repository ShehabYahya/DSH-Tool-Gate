# DSH Tool Gate

**Dynamic capability gating for DeepSeek Harness that reduces token usage and context bloat by keeping large MCP/plugin tool schemas hidden by default, then exposing full native toolsets only when an agent needs them.**

## What it does

DeepSeek Harness sends every visible native tool definition to the model. Large MCP suites can therefore consume tens of thousands of input/context tokens even in a conversation that never uses them.

DSH Tool Gate keeps specialist capability groups in DSH's real registry but removes their schemas from one agent's visible surface until that agent explicitly loads the capability.

```text
Session starts
  bash / filesystem / normal tools
  CCE / other always-on tools
  enable_toolset

User asks for Blender work
  agent calls enable_toolset({ toolset: "blender" })
  -> every native Blender MCP tool becomes visible
  -> agent calls those native tools normally

Later the same session needs Godot
  agent calls enable_toolset({ toolset: "godot-ai" })
  -> Godot tools are added too
  -> Blender remains loaded
```

There is no `mcp_search` or generic `mcp_call` proxy. Once a toolset is enabled, the original native DSH/MCP definitions are what the model sees and executes.

## Why this saves tokens

DSH's own tool registry documents that native tool schema cost is proportional to the visible definitions and that scoped restrictions remove the entire hidden schema cost for that agent. Tool Gate uses that exact mechanism.

The plugin also estimates schema cost using the same rough 4-bytes-per-token composition heuristic used by DSH's context meter. With `debug: true`, it logs how many tools/toolsets are hidden and the approximate schema tokens removed per request.

## Discovery

### MCP — automatic

Current DSH gives every MCP tool a deterministic public name:

```text
mcp__<serverName>__<toolName>
```

Tool Gate uses that documented public naming contract only to group tools by MCP server. It never reconstructs raw MCP call names and never proxies MCP execution.

So these automatically become two optional toolsets:

```text
mcp__blender__get_scene
mcp__blender__pose_bone

mcp__godot-ai__run_project
mcp__godot-ai__inspect_scene
```

→ `blender`

→ `godot-ai`

### Ordinary plugins — explicit grouping

DSH's public tool registry currently exposes the final visible schemas but not a general "which Cordis plugin registered this tool" provenance field. Tool Gate therefore does **not** invent ownership heuristics for arbitrary plugins.

Non-MCP plugin suites can be grouped with public-tool globs:

```yaml
config:
  toolsets:
    - id: github
      description: GitHub repository, issue, and pull-request operations.
      match: ["github_*"]
      visibility: lazy
```

Explicit rules take precedence over automatic MCP grouping and can also mark a group `always`.

## Runtime behavior

Tool Gate installs one agent-scoped controller before the agent's first driving request. It:

1. Reads that agent's effective native tool surface.
2. Builds capability groups.
3. Applies `agent.ctx.tools.restrict({ deny: [...] })` for lazy groups.
4. Registers a tiny scoped `enable_toolset` tool.
5. Replaces the restriction when a toolset is enabled.
6. Keeps enabled groups sticky for the rest of that agent lifecycle.
7. Rebuilds the catalog after real `tools/change` events such as MCP list changes or plugin hot reload.

Other agents are unaffected.

## Configuration

```yaml
- id: dsh-tool-gate
  name: dsh-tool-gate
  config:
    enabled: true
    autoMcp: true
    launcherToolName: enable_toolset
    debug: false
    toolsets: []
```

Example with an additional plugin group:

```yaml
- id: dsh-tool-gate
  name: dsh-tool-gate
  config:
    enabled: true
    autoMcp: true
    debug: true
    toolsets:
      - id: github
        description: GitHub repository, issue, and pull-request operations.
        match: ["github_*"]
        visibility: lazy
      - id: continuity
        description: Small continuity tools that should always stay visible.
        match: ["cce_*"]
        visibility: always
```

`match` supports one wildcard: `*`.

## Design invariants

- **Native execution stays authoritative.** Tool Gate only controls visibility.
- **Hidden means unavailable.** DSH's same scoped registry view controls presentation, lookup, and execution.
- **Agent-local.** One agent loading Blender does not expose Blender to another agent.
- **Sticky expansion.** Enabled suites are not automatically unloaded each turn.
- **No fake provenance.** MCP grouping uses DSH's documented naming contract; arbitrary plugin grouping is explicit until DSH exposes registration ownership publicly.
- **Measurable savings.** Every toolset records tool count, serialized schema bytes, and estimated schema tokens.

## Repository layout

```text
src/
  index.ts          plugin config + agent/registry lifecycle
  gate.ts           per-agent restriction + enable_toolset controller
  catalog.ts        MCP/custom grouping + token/schema metrics
  types.ts          public domain types

tests/
  scaffold.spec.ts  plugin contract
  catalog.spec.ts   discovery/grouping/metrics
  gate.spec.ts      scoped visibility + native execution lifecycle

docs/
  ARCHITECTURE.md   design, DSH findings, and invariants

cordis.patch.yml    DSH bundle/profile insertion
```

## Development

```bash
npm install
npm run check
npm run build
```

Target runtime: modern DeepSeek Harness / Node.js 22.19+.

## Status

**MVP runtime implemented.** Automatic MCP grouping, per-agent native gating, sticky `enable_toolset`, explicit plugin groups, schema/token diagnostics, hot-change refresh, and scoped execution tests are present.
