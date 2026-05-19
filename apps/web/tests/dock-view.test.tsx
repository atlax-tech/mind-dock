// @vitest-environment jsdom

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DockView from '@/app/workspace/features/dock/DockView'
import type { DockData } from '@/app/workspace/features/dock/useDockData'

const mockDockData: DockData = {
  entities: [
    { id: 'entry-1', type: 'document', title: 'Phase 3.3 PRD', subtitle: 'note', status: 'archived', updatedAt: new Date('2026-05-20T08:00:00Z'), createdAt: new Date('2026-05-18T08:00:00Z'), sourceLabel: 'Document', entryId: 1, tags: ['ai'], project: 'Phase 3.3', documentId: 1 },
    { id: 'entry-2', type: 'document', title: 'Archive Evidence Note', subtitle: 'note', status: 'archived', updatedAt: new Date('2026-05-18T08:00:00Z'), createdAt: new Date('2026-05-18T08:00:00Z'), sourceLabel: 'Document', entryId: 2, tags: ['归档'], project: 'Evidence Vault', documentId: 2 },
    { id: 'draft-3', type: 'draft', title: 'Scatter Draft', subtitle: 'New Draft', status: 'active', updatedAt: new Date('2026-05-20T09:00:00Z'), createdAt: new Date('2026-05-19T09:00:00Z'), sourceLabel: 'Draft', draftId: 3, tags: ['draft'], project: null },
    { id: 'tip-4', type: 'tip', title: 'Signal', subtitle: 'capture', status: 'active', updatedAt: new Date('2026-05-20T10:00:00Z'), createdAt: new Date('2026-05-20T10:00:00Z'), sourceLabel: 'Tip', tipId: 4, tags: [], project: null },
    { id: 'collection-1', type: 'collection', title: 'Phase 3.3', subtitle: 'project', status: 'active', updatedAt: new Date('2026-05-20T07:00:00Z'), createdAt: new Date('2026-05-18T07:00:00Z'), sourceLabel: 'Collection', collectionId: 'col-1', tags: [], project: 'Phase 3.3' },
    { id: 'collection-2', type: 'collection', title: 'Evidence Vault', subtitle: 'archive', status: 'active', updatedAt: new Date('2026-05-19T07:00:00Z'), createdAt: new Date('2026-05-18T07:00:00Z'), sourceLabel: 'Collection', collectionId: 'col-2', tags: [], project: 'Evidence Vault' },
  ],
  spaces: [],
  signals: [],
  recommendations: [],
  healthDetails: {
    isolatedNodes: [],
    stagnantItems: [],
    duplicateTags: [],
    weaklyClassifiedEntries: [],
    connectedRatio: 1,
    totalNodes: 0,
    connectedNodes: 0,
  },
  rawEntries: [
    { id: 1, userId: 'u1', workspaceId: 'default', sourceDockItemId: 1, title: 'Phase 3.3 PRD', content: 'Prompt orchestration architecture', contentJson: null, plainText: 'Prompt orchestration architecture', html: undefined, markdown: undefined, type: 'note', tags: ['ai'], project: 'Phase 3.3', actions: [], createdAt: new Date('2026-05-18T08:00:00Z'), archivedAt: new Date('2026-05-20T08:00:00Z') },
    { id: 2, userId: 'u1', workspaceId: 'default', sourceDockItemId: 2, title: 'Archive Evidence Note', content: 'Evidence payload', contentJson: null, plainText: 'Evidence payload', html: undefined, markdown: undefined, type: 'note', tags: ['归档'], project: 'Evidence Vault', actions: [], createdAt: new Date('2026-05-18T08:00:00Z'), archivedAt: new Date('2026-05-18T08:00:00Z') },
  ],
  rawDrafts: [
    { id: 3, draftKey: 3, userId: 'u1', workspaceId: 'default', title: 'Scatter Draft', content: 'draft body', contentJson: null, plainText: 'draft body', html: undefined, markdown: undefined, status: 'active', sourceEntryId: null, sourceType: null, tags: ['draft'], project: null, collectionId: null, createdAt: new Date('2026-05-19T09:00:00Z'), updatedAt: new Date('2026-05-20T09:00:00Z') },
  ],
  rawTips: [
    { id: 4, userId: 'u1', workspaceId: 'default', content: 'Signal body', sourceType: 'quick-capture', status: 'active', convertedDraftId: null, createdAt: new Date('2026-05-20T10:00:00Z'), updatedAt: new Date('2026-05-20T10:00:00Z') },
  ],
  rawMindNodes: [
    { id: 'node-project', userId: 'u1', workspaceId: 'default', nodeType: 'project', label: 'Phase 3.3', state: 'active', documentId: null, degreeScore: 0, recentActivityScore: 0, documentWeightScore: 0, userPinScore: 0, clusterCenterScore: 0, positionX: null, positionY: null, metadata: null, createdAt: new Date('2026-05-18T07:00:00Z'), updatedAt: new Date('2026-05-20T07:00:00Z') },
  ],
  rawMindEdges: [],
  rawCollections: [
    { id: 'col-1', userId: 'u1', workspaceId: 'default', name: 'Phase 3.3', description: 'Core project', icon: null, color: null, parentId: null, sortOrder: 0, collectionType: 'project', createdAt: new Date('2026-05-18T07:00:00Z'), updatedAt: new Date('2026-05-20T07:00:00Z') },
    { id: 'col-2', userId: 'u1', workspaceId: 'default', name: 'Evidence Vault', description: 'Archive evidence bucket', icon: null, color: null, parentId: null, sortOrder: 1, collectionType: 'archive', createdAt: new Date('2026-05-18T07:00:00Z'), updatedAt: new Date('2026-05-19T07:00:00Z') },
  ],
  rawTags: [],
  rawRecommendations: [],
}

vi.mock('@/app/workspace/features/dock/useDockData', () => ({
  useDockData: () => ({ data: mockDockData, loading: false, error: null }),
  findRelatedMindNode: vi.fn().mockResolvedValue(null),
  executeDockEditorOpen: vi.fn(),
}))

vi.mock('@/lib/repository', () => ({
  convertTipToMindNode: vi.fn(),
  upsertMindNode: vi.fn(),
  getDockViewSettings: vi.fn().mockResolvedValue(null),
  saveDockViewSettings: vi.fn().mockResolvedValue(undefined),
}))

describe('DockView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to library overview database and keeps archive evidence out of the main table', () => {
    render(<DockView userId="u1" />)

    expect(screen.getByText('Dock / 全库总览')).toBeTruthy()
    expect(screen.getByRole('button', { name: /数据库/i })).toBeTruthy()
    expect(screen.queryByText('任务控制')).toBeNull()
    expect(screen.getByText('Phase 3.3 PRD')).toBeTruthy()
    expect(screen.queryByText('Archive Evidence Note')).toBeNull()
    expect(screen.queryByTestId('dock-inspector-panel')).toBeNull()
  })

  it('shows inspector only after row selection and allows closing it', () => {
    render(<DockView userId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: /归档证据/i }))
    expect(screen.getByText('Archive Evidence Note')).toBeTruthy()
    expect(screen.queryByTestId('dock-inspector-panel')).toBeNull()

    fireEvent.click(screen.getByText('Archive Evidence Note'))
    expect(screen.getByTestId('dock-inspector-panel')).toBeTruthy()
    expect(screen.getByText('Page 概览')).toBeTruthy()
    expect(screen.getAllByText('Archive Evidence Note').length).toBeGreaterThan(1)

    fireEvent.click(screen.getByRole('button', { name: '关闭 Inspector' }))
    expect(screen.queryByTestId('dock-inspector-panel')).toBeNull()

    fireEvent.click(screen.getByText('Archive Evidence Note'))
    expect(screen.getByTestId('dock-inspector-panel')).toBeTruthy()
    fireEvent.click(screen.getByTestId('dock-main-panel'))
    expect(screen.queryByTestId('dock-inspector-panel')).toBeNull()
  })
})
