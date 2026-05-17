export interface ValidationResult {
  valid: boolean
  reason?: string
}

export interface PrivacyFirewall {
  validateProviderOutput(result: unknown): ValidationResult
  assertNoBusinessAccess(provider: unknown): void
}

const BUSINESS_ACCESS_PROPERTY_PATTERNS = [
  'db', 'database', 'repository', 'table', 'store', 'dexie',
  'indexedDB', 'localForage', 'sql', 'mongo',
]

function hasBusinessAccessProperty(obj: unknown): string | null {
  if (obj === null || obj === undefined || typeof obj !== 'object') return null
  const keys = Object.keys(obj as Record<string, unknown>)
  for (const pattern of BUSINESS_ACCESS_PROPERTY_PATTERNS) {
    if (keys.includes(pattern)) return pattern
  }
  const proto = Object.getPrototypeOf(obj)
  if (proto && proto !== Object.prototype) {
    const protoKeys = Object.getOwnPropertyNames(proto)
    for (const pattern of BUSINESS_ACCESS_PROPERTY_PATTERNS) {
      if (protoKeys.includes(pattern)) return pattern
    }
  }
  return null
}

function isAllowedResultType(result: unknown): boolean {
  if (result === null || result === undefined || typeof result !== 'object') return false
  const obj = result as Record<string, unknown>
  if (typeof obj.success !== 'boolean') return false
  if (typeof obj.modelProvider !== 'string') return false
  if (typeof obj.modelName !== 'string') return false
  if (typeof obj.modelVersion !== 'string') return false
  if (!obj.success) {
    return typeof obj.error === 'string' || obj.error === undefined
  }
  if (obj.data instanceof Float32Array && typeof obj.dim === 'number') return true
  if (typeof obj.summary === 'string') return true
  if (typeof obj.explanation === 'string') return true
  return false
}

export function createPrivacyFirewall(): PrivacyFirewall {
  return {
    validateProviderOutput(result: unknown): ValidationResult {
      if (isAllowedResultType(result)) {
        return { valid: true }
      }
      return {
        valid: false,
        reason: 'Provider output is not an allowed result type (EmbeddingResult, SummaryResult, or ExplanationResult)',
      }
    },
    assertNoBusinessAccess(provider: unknown): void {
      const found = hasBusinessAccessProperty(provider)
      if (found) {
        throw new Error(
          `Privacy violation: Provider contains business data access property "${found}". Providers must not hold direct references to business databases or repositories.`
        )
      }
    },
  }
}
