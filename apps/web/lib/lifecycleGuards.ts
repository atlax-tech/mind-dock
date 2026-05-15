import type { EntryRecord, DraftStatus, TipStatus } from './db'
import type { MindNodeState } from '@atlax/domain'

/**
 * @hidden - Node is hidden from current Mind view; does NOT delete the underlying document
 */
export const LIFECYCLE_HIDDEN = 'hidden' as const

/**
 * @archived - Removed from active workflow; data remains recoverable
 */
export const LIFECYCLE_ARCHIVED = 'archived' as const

/**
 * @deleted - Irreversible deletion; NOT available in production, only test environments
 */
export const LIFECYCLE_DELETED = 'deleted' as const

/**
 * @discarded - Draft/Tip is abandoned; does NOT delete the original document
 */
export const LIFECYCLE_DISCARDED = 'discarded' as const

export const LIFECYCLE_SEMANTICS = {
  [LIFECYCLE_HIDDEN]: {
    label: 'Hidden',
    description: 'Node is hidden from current Mind view; does NOT delete the underlying document',
  },
  [LIFECYCLE_ARCHIVED]: {
    label: 'Archived',
    description: 'Removed from active workflow; data remains recoverable',
  },
  [LIFECYCLE_DELETED]: {
    label: 'Deleted',
    description: 'Irreversible deletion; NOT available in production, only test environments',
  },
  [LIFECYCLE_DISCARDED]: {
    label: 'Discarded',
    description: 'Draft/Tip is abandoned; does NOT delete the original document',
  },
} as const

export function isArchived(entry: EntryRecord): boolean {
  return entry.archivedAt != null
}

export function isDiscarded(draftOrTip: { status: DraftStatus } | { status: TipStatus }): boolean {
  return draftOrTip.status === 'discarded'
}

export function isHidden(mindNode: { state: MindNodeState; metadata: Record<string, unknown> | null }): boolean {
  if (mindNode.state === 'archived') return true
  if (mindNode.metadata != null && 'hiddenAt' in mindNode.metadata && mindNode.metadata.hiddenAt != null) return true
  return false
}

export function assertNotIrreversible(action: string, confirmed: boolean): void {
  if (!confirmed) {
    throw new Error(`Irreversible action "${action}" requires explicit confirmation`)
  }
}
