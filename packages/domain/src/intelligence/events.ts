export type ContentSourceType = 'draft' | 'document' | 'tip' | 'mindNode' | 'importedItem'
export type ContentChangeType = 'created' | 'updated' | 'deleted' | 'imported' | 'restored'

export interface ContentChangedEvent {
  sourceType: ContentSourceType
  sourceId: string
  userId: string
  workspaceId: string
  contentHash: string
  changeType: ContentChangeType
  occurredAt: string
}
