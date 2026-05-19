import { describe, expect, it } from 'vitest'

import {
  applyDockSharedFilters,
  buildDockItems,
  buildNavigationCounts,
  getNavigationItems,
} from '@/app/workspace/features/dock/dockPresentation'
import type { DockData } from '@/app/workspace/features/dock/useDockData'

function createDockData(): DockData {
  return {
    entities: [
      { id: 'entry-1', type: 'document', title: 'Phase 3.3 PRD', subtitle: 'note', status: 'archived', updatedAt: new Date('2026-05-20T08:00:00Z'), createdAt: new Date('2026-05-18T08:00:00Z'), sourceLabel: 'Document', entryId: 1, tags: ['ai', 'strategy'], project: 'Phase 3.3', documentId: 1 },
      { id: 'entry-2', type: 'document', title: 'Scatter Memo', subtitle: 'note', status: 'archived', updatedAt: new Date('2026-05-19T08:00:00Z'), createdAt: new Date('2026-05-18T09:00:00Z'), sourceLabel: 'Document', entryId: 2, tags: ['memo'], project: null, documentId: 2 },
      { id: 'entry-3', type: 'document', title: 'Archive Evidence Note', subtitle: 'note', status: 'archived', updatedAt: new Date('2026-05-18T08:00:00Z'), createdAt: new Date('2026-05-18T08:00:00Z'), sourceLabel: 'Document', entryId: 3, tags: ['归档'], project: 'Evidence Vault', documentId: 3 },
      { id: 'draft-4', type: 'draft', title: 'Phase 3.3 Draft', subtitle: 'New Draft', status: 'active', updatedAt: new Date('2026-05-20T09:00:00Z'), createdAt: new Date('2026-05-19T09:00:00Z'), sourceLabel: 'Draft', draftId: 4, tags: ['draft'], project: 'Phase 3.3' },
      { id: 'tip-5', type: 'tip', title: 'User signal', subtitle: 'capture', status: 'active', updatedAt: new Date('2026-05-20T10:00:00Z'), createdAt: new Date('2026-05-20T10:00:00Z'), sourceLabel: 'Tip', tipId: 5, tags: [], project: null },
      { id: 'mind-node-6', type: 'mindNode', title: 'Prompt Topic', subtitle: 'topic', status: 'isolated', updatedAt: new Date('2026-05-20T11:00:00Z'), createdAt: new Date('2026-05-18T08:00:00Z'), sourceLabel: 'Mind Node', mindNodeId: 'node-6', tags: [], project: 'Phase 3.3', documentId: 1 },
      { id: 'collection-1', type: 'collection', title: 'Phase 3.3', subtitle: 'project', status: 'active', updatedAt: new Date('2026-05-20T07:00:00Z'), createdAt: new Date('2026-05-18T07:00:00Z'), sourceLabel: 'Collection', collectionId: 'col-1', tags: [], project: 'Phase 3.3' },
      { id: 'collection-2', type: 'collection', title: 'Evidence Vault', subtitle: 'archive', status: 'active', updatedAt: new Date('2026-05-19T07:00:00Z'), createdAt: new Date('2026-05-18T07:00:00Z'), sourceLabel: 'Collection', collectionId: 'col-2', tags: [], project: 'Evidence Vault' },
      { id: 'tag-1', type: 'tag', title: 'ai', subtitle: 'Tag', status: 'active', updatedAt: new Date('2026-05-20T07:00:00Z'), createdAt: new Date('2026-05-18T07:00:00Z'), sourceLabel: 'Tag', tagId: 'tag-1', tags: ['ai'], project: 'Phase 3.3' },
    ],
    spaces: [],
    signals: [],
    recommendations: [
      {
        id: 'rec-1',
        type: 'link',
        action: '补充 Prompt 标签',
        target: 'tag_prompt',
        impact: '提升可检索性',
        confidence: '91%',
        status: 'generated',
        candidateType: 'tag',
        candidateId: 'tag_prompt',
        subjectType: 'entry',
        subjectId: 1,
        confidenceScore: 0.91,
        isShown: false,
        hasFeedback: false,
        reasonSummary: { reason: '文档与 Prompt 主题强相关' },
        scoreSummary: { score: 0.91, scoreReason: 'semantic' },
        evidenceSummary: { evidenceCount: 2, evidenceTypes: ['semantic'], matchedValues: ['prompt'] },
      },
    ],
    healthDetails: {
      isolatedNodes: [{ id: 'node-6', userId: 'u1', workspaceId: 'default', nodeType: 'topic', label: 'Prompt Topic', state: 'isolated', documentId: 1, degreeScore: 0, recentActivityScore: 0, documentWeightScore: 0, userPinScore: 0, clusterCenterScore: 0, positionX: null, positionY: null, metadata: null, createdAt: new Date('2026-05-18T08:00:00Z'), updatedAt: new Date('2026-05-20T11:00:00Z') }],
      stagnantItems: [{ id: 4, draftKey: 4, userId: 'u1', workspaceId: 'default', title: 'Phase 3.3 Draft', content: 'draft body', contentJson: null, plainText: 'draft body', html: undefined, markdown: undefined, status: 'active', sourceEntryId: null, sourceType: null, tags: ['draft'], project: 'Phase 3.3', collectionId: null, createdAt: new Date('2026-05-19T09:00:00Z'), updatedAt: new Date('2026-05-20T09:00:00Z') }],
      duplicateTags: [],
      weaklyClassifiedEntries: [],
      connectedRatio: 0.5,
      totalNodes: 2,
      connectedNodes: 1,
    },
    rawEntries: [
      { id: 1, userId: 'u1', workspaceId: 'default', sourceDockItemId: 1, title: 'Phase 3.3 PRD', content: 'Prompt orchestration architecture', contentJson: null, plainText: 'Prompt orchestration architecture', html: undefined, markdown: undefined, type: 'note', tags: ['ai', 'strategy'], project: 'Phase 3.3', actions: [], createdAt: new Date('2026-05-18T08:00:00Z'), archivedAt: new Date('2026-05-20T08:00:00Z') },
      { id: 2, userId: 'u1', workspaceId: 'default', sourceDockItemId: 2, title: 'Scatter Memo', content: 'Unsorted note', contentJson: null, plainText: 'Unsorted note', html: undefined, markdown: undefined, type: 'note', tags: ['memo'], project: null, actions: [], createdAt: new Date('2026-05-18T09:00:00Z'), archivedAt: new Date('2026-05-19T08:00:00Z') },
      { id: 3, userId: 'u1', workspaceId: 'default', sourceDockItemId: 3, title: 'Archive Evidence Note', content: 'Evidence payload', contentJson: null, plainText: 'Evidence payload', html: undefined, markdown: undefined, type: 'note', tags: ['归档'], project: 'Evidence Vault', actions: [], createdAt: new Date('2026-05-18T08:00:00Z'), archivedAt: new Date('2026-05-18T08:00:00Z') },
    ],
    rawDrafts: [
      { id: 4, draftKey: 4, userId: 'u1', workspaceId: 'default', title: 'Phase 3.3 Draft', content: 'draft body', contentJson: null, plainText: 'draft body', html: undefined, markdown: undefined, status: 'active', sourceEntryId: null, sourceType: null, tags: ['draft'], project: 'Phase 3.3', collectionId: null, createdAt: new Date('2026-05-19T09:00:00Z'), updatedAt: new Date('2026-05-20T09:00:00Z') },
    ],
    rawTips: [
      { id: 5, userId: 'u1', workspaceId: 'default', content: 'User signal from capture', sourceType: 'quick-capture', status: 'active', convertedDraftId: null, createdAt: new Date('2026-05-20T10:00:00Z'), updatedAt: new Date('2026-05-20T10:00:00Z') },
    ],
    rawMindNodes: [
      { id: 'node-project', userId: 'u1', workspaceId: 'default', nodeType: 'project', label: 'Phase 3.3', state: 'active', documentId: null, degreeScore: 0, recentActivityScore: 0, documentWeightScore: 0, userPinScore: 0, clusterCenterScore: 0, positionX: null, positionY: null, metadata: null, createdAt: new Date('2026-05-18T07:00:00Z'), updatedAt: new Date('2026-05-20T07:00:00Z') },
      { id: 'node-6', userId: 'u1', workspaceId: 'default', nodeType: 'topic', label: 'Prompt Topic', state: 'isolated', documentId: 1, degreeScore: 0, recentActivityScore: 0, documentWeightScore: 0, userPinScore: 0, clusterCenterScore: 0, positionX: null, positionY: null, metadata: null, createdAt: new Date('2026-05-18T08:00:00Z'), updatedAt: new Date('2026-05-20T11:00:00Z') },
    ],
    rawMindEdges: [],
    rawCollections: [
      { id: 'col-1', userId: 'u1', workspaceId: 'default', name: 'Phase 3.3', description: 'Core delivery project', icon: null, color: null, parentId: null, sortOrder: 0, collectionType: 'project', createdAt: new Date('2026-05-18T07:00:00Z'), updatedAt: new Date('2026-05-20T07:00:00Z') },
      { id: 'col-2', userId: 'u1', workspaceId: 'default', name: 'Evidence Vault', description: 'Archive evidence bucket', icon: null, color: null, parentId: null, sortOrder: 1, collectionType: 'archive', createdAt: new Date('2026-05-18T07:00:00Z'), updatedAt: new Date('2026-05-19T07:00:00Z') },
    ],
    rawTags: [{ id: 'tag-1', userId: 'u1', workspaceId: 'default', name: 'ai', createdAt: new Date('2026-05-18T07:00:00Z') }],
    rawRecommendations: [],
  }
}

describe('dock presentation adapter', () => {
  it('maps existing real entities into Dock presentation kinds', () => {
    const items = buildDockItems(createDockData())
    expect(items.some((item) => item.kind === 'project' && item.title === 'Phase 3.3')).toBe(true)
    expect(items.some((item) => item.kind === 'topic' && item.title === 'Prompt Topic')).toBe(true)
    expect(items.some((item) => item.kind === 'signal')).toBe(true)
    expect(items.some((item) => item.kind === 'recommendation')).toBe(true)
    expect(items.some((item) => item.kind === 'archiveEvidence')).toBe(true)
  })

  it('keeps archive evidence out of library overview by default and exposes it in archive view', () => {
    const items = buildDockItems(createDockData())
    const shared = applyDockSharedFilters(items, {
      query: '',
      itemKinds: [],
      statuses: [],
      tags: [],
      timeRange: 'any',
      moreFilter: 'all',
      selectedScope: null,
      includeArchive: false,
      healthFilter: null,
    })
    const libraryItems = getNavigationItems(shared, 'libraryOverview', false)
    const archiveItems = getNavigationItems(shared, 'archiveEvidence', false)

    expect(libraryItems.some((item) => item.title === 'Archive Evidence Note')).toBe(false)
    expect(archiveItems.some((item) => item.title === 'Archive Evidence Note')).toBe(true)
  })

  it('derives consistent nav counts from the same filtered item set', () => {
    const items = buildDockItems(createDockData())
    const shared = applyDockSharedFilters(items, {
      query: 'phase',
      itemKinds: [],
      statuses: [],
      tags: [],
      timeRange: 'any',
      moreFilter: 'all',
      selectedScope: null,
      includeArchive: false,
      healthFilter: null,
    })
    const counts = buildNavigationCounts(shared, false)
    const warRoomItems = getNavigationItems(shared, 'warRoom', false)

    expect(counts.warRoom).toBe(warRoomItems.length)
    expect(counts.libraryOverview).toBe(getNavigationItems(shared, 'libraryOverview', false).length)
  })

  it('marks recommendation-backed documents and risk items for war room derivation', () => {
    const items = buildDockItems(createDockData())
    const document = items.find((item) => item.title === 'Phase 3.3 PRD')
    const topic = items.find((item) => item.title === 'Prompt Topic')
    const draft = items.find((item) => item.title === 'Phase 3.3 Draft')

    expect(document?.isRecommendationBacked).toBe(true)
    expect(document?.warRoomStage).toBe('review')
    expect(topic?.isRisk).toBe(true)
    expect(topic?.warRoomStage).toBe('blocked')
    expect(draft?.warRoomStage).toBe('blocked')
  })
})
