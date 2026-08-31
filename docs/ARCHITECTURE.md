# Architecture

## Purpose

DSH Tool Gate reduces standing model-context cost from large tool suites without changing how the underlying tools execute.

The implemented behavior is capability-level progressive disclosure:

1. DSH and plugins register tools normally.
2. Tool Gate reads one agent's effective native tool surface before its first driving request.
3. MCP tools are grouped by DSH's documented `mcp__<serverName>__<tool>` public naming contract; non-MCP groups come from explicit policy rules.
4. Lazy groups are hidden with an agent-scoped `ctx.tools.restrict()` deny mask.
5. A tiny scoped `enable_toolset` tool tells the model which optional capability groups exist.
6. When the agent enables a group, Tool Gate replaces the restriction so that group's full native tools become visible on the next model step.
7. Enabled groups remain visible for that agent/session.
8. Real `tools/change` events trigger a coalesced catalog rebuild so MCP list changes and plugin HMR are re-gated.

## Why this shape

DeepSeek Harness already keeps tool presentation, lookup, and execution aligned through the tool registry. Its current extension cookbook explicitly identifies replacing a scoped `ctx.tools.restrict()` registration as the mechanism for ToolSearch/progressive disclosure.

This differs intentionally from MCP search/call gateways. Once a toolset is enabled, the model sees and calls the original native tool definitions directly.

## Verified DSH findings

The scaffold's discovery spike resolved the open questions against current DSH:

### Scoped restriction is the correct native seam

`ctx.tools.restrict({ allow?, deny? })`:

- requires an agent/scoped context;
- removes hidden global/inherited tools from presentation, lookup, and execution together;
- leaves scope-local registrations visible;
- returns an exact disposer;
- emits `tools/change` when the restriction changes.

This is exactly the behavior Tool Gate needs.

### Agent lifecycle is early enough

`agent/session-start` is emitted synchronously before the first driver request. Tool Gate installs there for new agents, and also enumerates `ctx.agents.list()` so plugin hot-load/reload can cover already-live agents.

### MCP identity has a public deterministic naming contract

DSH's MCP bridge registers every public MCP tool as:

```text
mcp__<serverName>__<rawName>
```

with normalization/hash behavior when needed for the provider's function-name constraints.

Tool Gate uses only the server-qualified public prefix for grouping. It does not reconstruct the raw MCP name and does not participate in MCP execution.

### General plugin registration provenance is not public

The current public ToolRuntime exposes visible schemas (`name`, `description`, `parameters`) but does not expose a general registration-owner field tying each tool definition to the Cordis plugin fiber that registered it.

Therefore V0 does not guess arbitrary plugin ownership. Non-MCP plugin groups use explicit public-name glob rules. This is preferable to fragile prefix heuristics that could silently hide unrelated core tools.

## Runtime model

```text
DSH tool registry
├── core tools
├── small plugin tools
├── Blender MCP tools
├── Godot MCP tools
└── explicitly grouped plugin suites
        │
        │ per-agent catalog
        ▼
Agent A initial restriction
├── core / ungrouped / always groups
└── enable_toolset

Agent A calls enable_toolset("blender")
        │
        ▼
Agent A
├── core / always groups
├── enable_toolset
└── original native Blender MCP tools

Agent B remains unchanged.
```

## Restriction replacement

The controller owns exactly one active Tool Gate restriction per agent.

For an ordinary enable operation, the new (less restrictive) mask is registered before the old mask is disposed. DSH restrictions intersect, so the old restriction continues protecting the surface until the new mask exists; disposing the old mask then reveals exactly the newly enabled suite.

For full catalog refresh, Tool Gate must briefly lift its own previous exact-name deny set so it can inspect the complete effective surface, including names added by MCP `tools/list_changed`. The lift → inspect → rebuild → re-restrict sequence is synchronous and contains no `await`, so no model request can interleave on the JavaScript event loop. Other independent DSH restrictions remain active throughout.

## `tools/change` recursion control

Restrictions and scoped launcher registrations themselves emit `tools/change`. The plugin maintains an internal-mutation depth counter. Changes produced by Tool Gate are ignored by its registry listener; external changes are coalesced into one microtask and refresh all live controllers.

This prevents self-refresh loops while still re-gating newly registered MCP tools before a later model request.

## Capability catalog

Each descriptor records:

```text
id
origin
model-facing description
member public tool names
default visibility
schema bytes
estimated schema tokens
```

Token estimation intentionally uses the same rough 4-bytes-per-token composition heuristic as DSH's context meter. It is a diagnostic estimate, not provider billing truth.

## Model-facing loader

`enable_toolset` is registered through `agent.ctx`, so the agent's own global restriction cannot remove it.

Its description contains the compact capability catalog, for example:

```text
- blender [available] — MCP capability "blender" (18 native tools). Examples: ... (~6500 schema tokens)
- godot-ai [available] — MCP capability "godot-ai" (25 native tools). Examples: ... (~9200 schema tokens)
```

The agent therefore knows that Blender/Godot capabilities exist without carrying every member schema.

After a successful load, the tool returns the number of native tools added, approximate schema tokens added, and the remaining hidden toolset ids.

## Core invariants

### Native execution remains authoritative

Tool Gate controls visibility only. It does not proxy, clone, rename, or reimplement specialist tool execution.

### Hidden means unavailable

A hidden tool is absent from model presentation and unavailable through the same scoped lookup/execution view.

### Agent/session scope

Visibility changes never mutate the process-global registry. One agent enabling a suite does not expose it to sibling sessions.

### Sticky expansion

Enabling a toolset is additive for the agent lifecycle. Automatic per-turn unloading is intentionally excluded because repeated tool-set churn hurts prefix/KV stability and creates unnecessary extra model steps.

### Trustworthy grouping

Automatic MCP grouping relies on DSH's documented public naming contract. General plugins require explicit rules until DSH exposes tool registration provenance as a supported API.

### Existing policy still wins

Tool Gate builds from the agent's effective pre-gate surface. Other ancestor/agent restrictions are not removed. Enabling a Tool Gate group cannot bypass a separate DSH restriction or permission policy.

### Savings are measurable

With debug logging enabled, Tool Gate reports the number of hidden tools, hidden toolsets, and estimated schema tokens removed per request.

## Configuration

```yaml
config:
  enabled: true
  autoMcp: true
  launcherToolName: enable_toolset
  debug: false
  toolsets:
    - id: github
      description: GitHub repository, issue, and pull-request operations.
      match: ["github_*"]
      visibility: lazy

    - id: continuity
      match: ["cce_*"]
      visibility: always
```

Explicit rules run before automatic MCP grouping. Overlapping explicit rules are rejected rather than resolved silently.

## Modules

```text
src/index.ts
  configuration, live-agent installation, registry refresh lifecycle

src/gate.ts
  one agent's catalog, restriction disposer, sticky state, enable_toolset

src/catalog.ts
  explicit grouping, automatic MCP grouping, descriptions, schema/token metrics

src/types.ts
  public domain types
```

## Current limitation / future upstream opportunity

A richer V1 could automatically group arbitrary DSH plugins if ToolRuntime exposes supported registration provenance such as:

```text
tool name -> registering plugin/fiber id
```

If DSH adds that API, Tool Gate can replace explicit non-MCP mappings with provenance-backed automatic groups without changing its restriction or loader architecture.

## Non-goals

- Replacing MCP clients.
- Searching individual tools one at a time.
- Wrapping calls in a generic proxy.
- Rewriting the DSH agent loop.
- Persisting enabled toolsets globally across unrelated sessions.
- Guessing arbitrary plugin ownership from weak naming heuristics.
