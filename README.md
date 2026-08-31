# DSH Tool Gate

**Dynamic capability gating for DeepSeek Harness that reduces token usage and context bloat by keeping large MCP/plugin tool schemas hidden by default, then exposing full native toolsets only when an agent needs them.**

## Goal

DeepSeek Harness normally sends every visible tool definition to the model. Large MCP and plugin suites can therefore consume tens of thousands of input tokens before the user says anything.

DSH Tool Gate is intended to keep specialist capability groups hidden until the agent explicitly needs one.

```text
Normal session
  core tools
  CCE / other always-on tools
  enable_toolset

Agent needs Blender
  enable_toolset("blender")
  -> all native Blender tools become visible for that agent/session

Agent later needs Godot
  enable_toolset("godot")
  -> native Godot tools become visible too
```

The design deliberately preserves native DSH/MCP tools. It is not an MCP proxy and does not replace individual tool calls with a generic `mcp_call` wrapper.

## Design principles

- Use DSH's scoped tool visibility mechanism (`ctx.tools.restrict()`) rather than rewriting the agent loop.
- Keep activation sticky for the current agent/session to preserve a stable tool prefix after expansion.
- Discover and group toolsets by registration provenance where DSH exposes it.
- Do not guess provenance from tool-name prefixes unless an explicit fallback mapping is configured.
- Keep small, general-purpose tools visible; gate large specialist suites where token savings matter.
- Measure before/after visible schema size so token savings are observable.
- Never weaken DSH's normal tool lookup or execution policy: a hidden tool should be genuinely unavailable until its toolset is enabled.

## Status

**Scaffold only. Runtime gating is not implemented yet.**

The first implementation task is to verify the cleanest supported way to observe tool registration provenance for MCP servers and ordinary plugins, then build the catalog and session-scoped visibility controller around DSH's native registry.

## Repository layout

```text
src/
  index.ts          Cordis/DSH plugin entrypoint
  types.ts          capability/toolset domain types

tests/
  scaffold.spec.ts  basic package/plugin contract test

docs/
  ARCHITECTURE.md   intended runtime design and invariants

cordis.patch.yml    DSH bundle/profile insertion
package.json        package metadata and scripts
tsconfig.json       TypeScript configuration
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

Target runtime: modern DeepSeek Harness / Node.js 22.19+.
