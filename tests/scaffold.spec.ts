import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, inject, name } from '../src/index.js'

describe('plugin contract', () => {
  it('exports the expected Cordis plugin identity', () => {
    expect(name).toBe('dsh-tool-gate')
    expect(inject).toEqual(['tools', 'agents'])
  })

  it('defaults to automatic MCP gating with a small native launcher', () => {
    expect(DEFAULT_CONFIG).toEqual({
      enabled: true,
      autoMcp: true,
      toolsets: [],
      launcherToolName: 'enable_toolset',
      debug: false,
    })
  })
})
