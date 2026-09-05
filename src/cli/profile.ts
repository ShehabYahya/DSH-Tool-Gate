import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const PACKAGE_NAME = 'dsh-tool-gate'

export interface ProfileInspection {
  profile: string
  exists: boolean
  dependencyDeclared: boolean
  bundleDeclared: boolean
  path: string
}

function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME?.trim()
  return resolve(configured && configured.length > 0 ? configured : join(homedir(), '.dsh'))
}

export function validateProfileName(profile: string): void {
  if (
    profile.length === 0
    || profile === '.'
    || profile === '..'
    || profile === 'node_modules'
    || profile.includes('/')
    || profile.includes('\\')
  ) {
    throw new Error(`invalid DSH profile name ${JSON.stringify(profile)}`)
  }
}

export function inspectProfile(profile: string): ProfileInspection {
  validateProfileName(profile)
  const path = join(resolveDshHome(), 'profiles', profile)
  const manifestPath = join(path, 'package.json')
  if (!existsSync(manifestPath)) {
    return { profile, exists: false, dependencyDeclared: false, bundleDeclared: false, path }
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    return {
      profile,
      exists: true,
      dependencyDeclared: PACKAGE_NAME in (manifest.dependencies ?? {}),
      bundleDeclared: (manifest.dsh?.profile?.bundles ?? []).includes(PACKAGE_NAME),
      path,
    }
  } catch (error) {
    throw new Error(`failed to read DSH profile ${JSON.stringify(profile)}: ${String(error)}`)
  }
}
