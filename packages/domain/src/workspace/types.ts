export type WorkspaceId = string

export const DEFAULT_WORKSPACE_ID: WorkspaceId = 'default'

export type TabType =
  | 'home'
  | 'mind'
  | 'dock'
  | 'editor'
  | 'document'
  | 'node'
  | 'project'
  | 'review'
  | 'settings'

export interface WorkspaceOpenTab {
  id: string
  userId: string
  sessionId: string
  tabType: TabType
  title: string
  path: string
  documentId: number | null
  isPinned: boolean
  isActive: boolean
  sortOrder: number
  openedAt: Date
  updatedAt: Date
}

export interface WorkspaceSession {
  id: string
  userId: string
  activeTabId: string | null
  lastActivityAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface RecentDocument {
  id: string
  userId: string
  documentId: number
  title: string
  openCount: number
  lastOpenedAt: Date
  createdAt: Date
  updatedAt: Date
}

export function makeWorkspaceSessionId(userId: string): string {
  return `${userId}_ws_session`
}

export function makeWorkspaceTabId(userId: string, tabType: TabType, documentId?: number | null): string {
  if (documentId != null) {
    return `${userId}_wt_${tabType}_${documentId}`
  }
  return `${userId}_wt_${tabType}`
}

export function makeRecentDocumentId(userId: string, documentId: number): string {
  return `${userId}_rd_${documentId}`
}
