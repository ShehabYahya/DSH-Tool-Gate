# Architecture

## Purpose

DSH Tool Gate reduces standing model-context cost from large tool suites without changing how the underlying tools execute.

The target behavior is capability-level progressive disclosure:

1. DSH and plugins register tools normally.
2. Tool Gate discovers the final registry and groups tools by trustworthy origin.
3. Large specialist groups are hidden from one agent's model-visible tool set using DSH's scoped restriction mechanism.
4. A tiny always-visible `enable_toolset` capability tells the model which optional capability groups exist.
5. When the agent enables a group, the scoped restriction is replaced so that group's full native tools become visible on the next model step.
6. Enabled groups remain visible for that agent/session unless explicitly disabled by future policy.

## Why this shape

DeepSeek Harness already keeps tool presentation, lookup, and execution aligned through the tool registry. Its documented progressive-disclosure mechanism is to replace a scoped `ctx.tools.restrict()` registration as the visible set changes. Tool Gate should use that seam rather than invent a second dispatch path.

This differs intentionally from MCP search/call gateways. Once a toolset is enabled, the model sees and calls the original native tool definitions directly.

## Runtime model

```text
Global DSH tool registry
├── core tools
├── CCE/plugin tools
├── Blender MCP tools
├── Godot MCP tools
└── other plugin/MCP tools
        │
        │ Tool Gate catalog + agent-scoped restriction
        ▼
Agent A, initial
├── selected always-on tools
└── enable_toolset

Agent A after enable_toolset("blender")
├── selected always-on tools
├── enable_toolset
└── all native Blender MCP tools

Agent B remains unchanged.
```

## Core invariants

### 1. Native execution remains authoritative

Tool Gate controls visibility only. It must not proxy, clone, rename, or reimplement specialist tool execution.

### 2. Hidden means unavailable

A hidden tool must be absent from model presentation and unavailable through the same scoped lookup/execution view. Do not create a presentation-only filter that leaves hidden tools callable by name.

### 3. Agent/session scope

Visibility changes must not mutate the process-global registry for every session. State is local to the agent/session whose capability set changed.

### 4. Sticky expansion

Enabling a toolset is additive by default. Do not automatically unload it after one call or one turn. Stable visibility after expansion is friendlier to KV-prefix reuse than constant load/unload churn.

### 5. Trustworthy grouping

Prefer explicit registration provenance supplied by DSH/MCP/plugin runtime metadata. If DSH does not expose sufficient provenance, add a narrow explicit mapping/configuration seam.

Do **not** silently infer ownership from names such as `blender_*` or `mcp__foo__*` as the primary mechanism.

### 6. Small tools need not be gated

The optimization target is large specialist schema bundles. A small, frequently useful plugin may remain always visible. Policy should eventually support thresholds and explicit overrides.

### 7. Savings are measurable

Diagnostics should report, at minimum:

```text
toolset id | tool count | schema bytes | estimated tokens | visibility
```

and total visible schema cost before/after gating.

## Discovery phase

The first implementation spike must answer these against the supported DSH version:

- Can the plugin enumerate the final tool registry after MCP/plugin registration?
- Is registration provenance/origin preserved anywhere in the registry?
- Can an MCP client's `serverName` be recovered without parsing tool names?
- What lifecycle hook is best for rebuilding the catalog when plugins hot-reload?
- What exact object/disposer is returned by `ctx.tools.restrict()` and how should a restriction be replaced atomically?
- What stable identifier should key per-agent/session Tool Gate state?

Do not implement heuristic discovery until these questions are resolved.

## Planned modules

```text
src/index.ts
  plugin entrypoint and configuration

src/discovery.ts
  inspect registry and produce provenance-backed tool records

src/catalog.ts
  group tool records into capability/toolset descriptors

src/visibility.ts
  own agent-scoped restriction lifecycle

src/tool-enable.ts
  register the tiny always-visible enable_toolset tool

src/metrics.ts
  schema byte/token diagnostics

src/types.ts
  shared domain types
```

Only `index.ts` and `types.ts` exist in the initial scaffold.

## Planned configuration direction

Exact config is intentionally deferred until the discovery spike. Expected policy concepts include:

```yaml
always:
  - core
  - plugin:deepseek-harness-cce

lazy:
  - mcp:*

overrides:
  mcp:blender:
    alias: blender
    description: Control Blender scenes, meshes, rigs, animation, materials, and rendering.
```

The plugin should auto-discover newly added MCP/plugin toolsets when reliable provenance exists; configuration should express policy, not duplicate every tool schema.

## Non-goals

- Replacing MCP clients.
- Searching individual tools one at a time.
- Wrapping every call in a generic proxy tool.
- Rewriting the DSH agent loop.
- Persisting enabled toolsets globally across unrelated sessions by default.
- Hiding capabilities from the model entirely; the model should know the optional groups it can enable.
