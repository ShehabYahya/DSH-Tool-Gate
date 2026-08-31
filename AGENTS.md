# Agent Guidance

This repository implements capability-level progressive disclosure for DeepSeek Harness.

## Intent is source of truth

The plugin reduces standing tool-schema token cost while preserving normal native DSH/MCP tool behavior once a capability group is enabled.

## Required architectural constraints

- Use DSH's supported scoped tool visibility mechanism (`ctx.tools.restrict()`) for gating.
- Do not replace specialist tools with a generic proxy/search/call transport.
- Do not modify the process-global visible tool set for every session when one agent enables a capability.
- Keep enabled toolsets sticky for the current agent/session by default.
- The model must always receive a compact description of available optional capability groups so it knows what it can enable.
- MCP grouping may use DSH's documented `mcp__<serverName>__<tool>` public naming contract for server-level capability grouping.
- General plugin ownership must not be guessed. Current DSH ToolRuntime does not expose registration-owner provenance publicly, so non-MCP plugin groups use explicit public-name glob rules until a supported provenance API exists.
- Small/general tools remain visible unless an explicit policy group gates them.
- Preserve DSH's existing permission, lookup, execution, result, and hot-reload semantics.
- Hidden tools must be genuinely unavailable through DSH lookup/execution, not merely absent from prompt rendering.
- Keep registry-refresh operations synchronous around restriction replacement; do not insert an `await` while Tool Gate's own restriction is lifted.
- Suppress Tool Gate's own `tools/change` events from triggering recursive refresh.
- Any future automatic plugin grouping must be provenance-backed or explicitly configured, not a weak prefix heuristic.

## Verified DSH facts

- `ctx.tools.schemas(agent)` returns the model-visible schema set for that scope.
- `agent.ctx.tools.restrict()` returns the exact disposer for the scoped restriction.
- Restrictions intersect and scope-local tools survive the global/inherited restriction.
- `agent/session-start` occurs before the first driving request.
- `ctx.agents.list()` supports hot-load coverage of existing sessions.
- `tools/change` fires for registry and restriction changes.
- DSH MCP public names are deterministic and server-qualified.
- ToolRuntime currently has no public general registration-owner/provenance field.

## Development expectations

Before changing visibility semantics, extend the scoped runtime tests in `tests/gate.spec.ts`. Before changing grouping, extend `tests/catalog.spec.ts`. Keep `README.md` and `docs/ARCHITECTURE.md` aligned with behavior that actually exists.
