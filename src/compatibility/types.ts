export type CompatibilityStatus = 'tested' | 'compatible-unverified' | 'incompatible'

export interface CompatibilityCheck {
  id: string
  ok: boolean
  required: boolean
  message: string
}

export interface CompatibilityIssue {
  id: string
  message: string
  required: boolean
}

export interface CompatibilityMetadata {
  nodeVersion?: string
  dshVersion?: string
  pnpmVersion?: string
  testedDsh?: boolean
}

export interface CompatibilityResult {
  status: CompatibilityStatus
  checks: CompatibilityCheck[]
  issues: CompatibilityIssue[]
  metadata: CompatibilityMetadata
}

export function createCompatibilityResult(
  checks: CompatibilityCheck[],
  metadata: CompatibilityMetadata = {},
  tested = false,
): CompatibilityResult {
  const issues = checks
    .filter(check => !check.ok)
    .map(check => ({ id: check.id, message: check.message, required: check.required }))
  const incompatible = checks.some(check => check.required && !check.ok)
  return {
    status: incompatible ? 'incompatible' : tested ? 'tested' : 'compatible-unverified',
    checks,
    issues,
    metadata,
  }
}

export function issueSummary(result: CompatibilityResult): string {
  return result.issues
    .filter(issue => issue.required)
    .map(issue => `${issue.id}: ${issue.message}`)
    .join('; ')
}
