# Agent Guidance

This repository implements capability-level progressive disclosure for DeepSeek Harness.

## Intent is source of truth

The plugin should reduce standing tool-schema token cost while preserving normal native DSH/MCP tool behavior once a capability group is enabled.

## Required architectural constraints

- Use DSH's supported scoped tool visibility mechanism (`ctx.tools.restrict()`) for gating.
- Do not replace specialist tools with a generic proxy/search/call transport.
- Do not modify the process-global visible tool set for every session when one agent enables a capability.
- Keep enabled toolsets sticky for the current agent/session by default.
- The model must always receive a compact description of available optional capability groups so it knows what it can enable.
- Prefer trustworthy tool-registration provenance. Do not rely on name-prefix heuristics as the primary grouping mechanism.
- Small/general tools may remain always visible; optimize large specialist suites first.
- Preserve DSH's existing permission, lookup, execution, result, and hot-reload semantics.
- Add tests before enabling runtime restrictions by default.

## First implementation task

Investigate current DSH APIs and tests to determine:

1. how to enumerate visible/global registered tools,
2. whether tool registration provenance identifies MCP server/plugin origin,
3. how to observe registration/hot-reload changes,
4. how to replace one agent-scoped restriction safely,
5. how to key sticky state to the correct agent/session lifetime.

Document findings before choosing fallback metadata or configuration.
