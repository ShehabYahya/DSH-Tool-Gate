import manifest from '../../compatibility.json' with { type: 'json' }

export interface CompatibilityManifest {
  schemaVersion: number
  node: {
    minimum: string
  }
  dsh: {
    testedCliVersions: string[]
    blockedCliVersions: string[]
  }
}

export const COMPATIBILITY_MANIFEST = manifest as CompatibilityManifest
