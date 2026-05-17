import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import { db } from '@/lib/db'

export function computeContentHash(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i)
  }
  const hex = (hash >>> 0).toString(16)
  return `ch_${hex}`
}

export async function isContentDirty(
  userId: string,
  targetType: string,
  targetId: string,
  newHash: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<boolean> {
  const results = await db.table('localTextFeatureSnapshots')
    .where('[userId+workspaceId+targetType+targetId]')
    .equals([userId, workspaceId, targetType, targetId])
    .toArray()

  if (results.length === 0) {
    return true
  }

  return results[0].contentHash !== newHash
}
