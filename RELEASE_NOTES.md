# DSH Tool Gate — Version 1

First stable release of DSH Tool Gate, a progressive capability-gating plugin for DeepSeek Harness.

Instead of exposing every large MCP schema to the model on every request, Tool Gate keeps specialist suites hidden until the agent actually needs them. Once enabled, the original native DSH/MCP tools become visible and execute normally — there is no generic `mcp_search` or `mcp_call` proxy layer.

## Measured on my DSH setup

With large Blender and Godot MCP servers installed:

- **Tool Gate OFF:** ~31.5K visible tool-schema tokens at fresh-session start
- **Tool Gate ON:** ~6.7K visible tool-schema tokens at fresh-session start
- **Reduction:** **78.7% (~80%)**
- Total initial context: ~37.1K → ~9.8K
- First-request input: ~37K → ~9.7K

These measurements are from my own DSH configuration; savings depend on the number and size of the tool suites in a given setup.

## Version 1 highlights

- Automatic MCP server grouping from DSH native MCP tool names
- `enable_toolset` progressive capability launcher
- Full native tools appear after activation
- Normal agent-preset tools remain visible immediately
- Per-agent/session tool visibility isolation
- Sticky activation for the live agent lifecycle
- Explicit lazy/always grouping for non-MCP plugin tools
- Hot tool-registry refresh handling
- Schema-size and estimated-token diagnostics
- Blender demo validated: `enable_toolset("blender")` exposes 22 native Blender MCP tools while Godot remains hidden

## Validation

The Version 1 implementation has been locally validated with TypeScript typecheck and the current test suite: **16/16 tests passing**.

This is an unofficial community plugin for DeepSeek Harness.
