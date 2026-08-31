import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  matchGlob,
  mcpServerFromPublicName,
  renderCapabilityCatalog,
} from '../src/catalog.js'
import type { ToolSchemaLike } from '../src/types.js'

function schema(name: string, description = `Description for ${name}`): ToolSchemaLike {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'string', description: 'test parameter' },
      },
    },
  }
}

describe('catalog discovery', () => {
  it('parses the documented DSH MCP public-name server segment', () => {
    expect(mcpServerFromPublicName('mcp__blender__get_scene')).toBe('blender')
    expect(mcpServerFromPublicName('mcp__godot-ai__run_project')).toBe('godot-ai')
    expect(mcpServerFromPublicName('bash')).toBeUndefined()
  })

  it('groups MCP servers automatically while leaving ordinary tools ungated', () => {
    const catalog = buildCatalog([
      schema('bash'),
      schema('mcp__blender__get_scene'),
      schema('mcp__blender__pose_bone'),
      schema('mcp__godot-ai__run_project'),
    ], { autoMcp: true, rules: [] })

    expect(catalog.toolsets.map(toolset => [toolset.id, toolset.toolNames])).toEqual([
      ['blender', ['mcp__blender__get_scene', 'mcp__blender__pose_bone']],
      ['godot-ai', ['mcp__godot-ai__run_project']],
    ])
    expect(catalog.ungroupedToolNames).toEqual(['bash'])
    expect(catalog.lazyEstimatedTokens).toBeGreaterThan(0)
  })

  it('lets explicit plugin rules override automatic MCP grouping', () => {
    const catalog = buildCatalog([
      schema('mcp__blender__get_scene'),
      schema('github_search'),
      schema('github_issue'),
    ], {
      autoMcp: true,
      rules: [{
        id: 'developer-tools',
        description: 'Developer integrations.',
        match: ['github_*', 'mcp__blender__*'],
        visibility: 'lazy',
      }],
    })

    expect(catalog.toolsets).toHaveLength(1)
    expect(catalog.toolsets[0]?.id).toBe('developer-tools')
    expect(catalog.toolsets[0]?.toolNames).toEqual([
      'mcp__blender__get_scene',
      'github_search',
      'github_issue',
    ])
  })

  it('supports always-visible policy groups without counting them as savings', () => {
    const catalog = buildCatalog([
      schema('cce_checkpoint'),
      schema('mcp__blender__get_scene'),
    ], {
      autoMcp: true,
      rules: [{
        id: 'continuity',
        match: ['cce_*'],
        visibility: 'always',
      }],
    })

    expect(catalog.toolsets.find(toolset => toolset.id === 'continuity')?.defaultVisibility).toBe('always')
    expect(catalog.lazySchemaBytes).toBe(catalog.toolsets.find(toolset => toolset.id === 'blender')?.stats.schemaBytes)
  })

  it('fails loud when explicit grouping rules overlap', () => {
    expect(() => buildCatalog([schema('github_search')], {
      autoMcp: false,
      rules: [
        { id: 'one', match: ['github_*'], visibility: 'lazy' },
        { id: 'two', match: ['*_search'], visibility: 'lazy' },
      ],
    })).toThrow(/matches multiple Tool Gate rules/)
  })

  it('renders a compact capability list with load state and savings estimate', () => {
    const catalog = buildCatalog([
      schema('mcp__blender__get_scene'),
      schema('mcp__godot-ai__run_project'),
    ], { autoMcp: true, rules: [] })
    const text = renderCapabilityCatalog(catalog, new Set(['blender']))

    expect(text).toContain('blender [loaded]')
    expect(text).toContain('godot-ai [available]')
    expect(text).toContain('schema tokens')
  })
})

describe('glob policy', () => {
  it('treats only star as a wildcard', () => {
    expect(matchGlob('github_search', 'github_*')).toBe(true)
    expect(matchGlob('github.search', 'github.*')).toBe(true)
    expect(matchGlob('githubXsearch', 'github.*')).toBe(false)
  })
})
