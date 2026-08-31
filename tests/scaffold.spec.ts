import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, inject, name } from '../src/index.js'

describe('plugin scaffold', () => {
  it('exports the expected Cordis plugin identity', () => {
    expect(name).toBe('dsh-tool-gate')
    expect(inject).toEqual(['tools'])
  })

  it('starts enabled without debug logging', () => {
    expect(DEFAULT_CONFIG).toEqual({ enabled: true, debug: false })
  })
})
