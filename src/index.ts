/**
 * DSH Tool Gate plugin scaffold.
 *
 * The runtime gating controller is intentionally not implemented yet. This
 * entrypoint establishes the Cordis/DeepSeek Harness package contract while
 * the first implementation spike verifies tool-registration provenance and
 * the exact scoped-restriction lifecycle to use.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export * from './types.js'

export const name = 'dsh-tool-gate'
export const inject = ['tools']

export interface Config {
  /** Master switch. The scaffold remains a no-op even when enabled. */
  enabled: boolean
  /** Emit diagnostic catalog/visibility information once implemented. */
  debug: boolean
}

export const DEFAULT_CONFIG: Readonly<Config> = Object.freeze({
  enabled: true,
  debug: false,
})

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled),
  debug: z.boolean().default(DEFAULT_CONFIG.debug),
}) as unknown as z<Config>

/**
 * Cordis plugin entrypoint.
 *
 * Scaffold invariant: do not alter tool visibility until discovery and scoped
 * restriction behavior are covered by tests against the supported DSH API.
 */
export function apply(ctx: Context, config: Config): void {
  void ctx
  void config
}
