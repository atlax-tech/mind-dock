'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  listDrafts,
  listActiveTips,
  listArchivedEntries,
  listMindNodes,
  type StoredDraft,
  type StoredTip,
  type StoredEntry,
  type StoredMindNode,
} from '@/lib/repository'

export interface SpotlightSearchResult {
  type: 'draft' | 'tip' | 'document' | 'mind_node' | 'settings_command'
  id: number | string
  title: string
  snippet: string
  targetTab: 'editor' | 'dock' | 'mind' | 'settings'
  targetId?: number | string
}

const SETTINGS_COMMANDS = [
  { keyword: '设置', label: '系统设置', targetTab: 'settings' as const },
  { keyword: '存储', label: '本地存储设置', targetTab: 'settings' as const },
  { keyword: '路径', label: '金库路径设置', targetTab: 'settings' as const },
  { keyword: 'settings', label: 'Settings', targetTab: 'settings' as const },
]

function matchText(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  if (lowerText.includes(lowerQuery)) return true
  const terms = lowerQuery.split(/\s+/).filter(Boolean)
  if (terms.length > 1) {
    return terms.every(t => lowerText.includes(t))
  }
  return false
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

export function searchDrafts(drafts: StoredDraft[], query: string): SpotlightSearchResult[] {
  return drafts
    .filter(d => matchText(query, d.title) || matchText(query, d.content))
    .map(d => ({
      type: 'draft' as const,
      id: d.id,
      title: d.title || '无标题草稿',
      snippet: truncate(d.content, 80),
      targetTab: 'editor' as const,
      targetId: d.id,
    }))
}

export function searchDocuments(entries: StoredEntry[], query: string): SpotlightSearchResult[] {
  return entries
    .filter(e => matchText(query, e.title) || matchText(query, e.content))
    .map(e => ({
      type: 'document' as const,
      id: e.id,
      title: e.title || '无标题文档',
      snippet: truncate(e.content, 80),
      targetTab: 'editor' as const,
      targetId: e.id,
    }))
}

export function searchTips(tips: StoredTip[], query: string): SpotlightSearchResult[] {
  return tips
    .filter(t => matchText(query, t.content))
    .map(t => ({
      type: 'tip' as const,
      id: t.id,
      title: truncate(t.content, 40),
      snippet: truncate(t.content, 80),
      targetTab: 'dock' as const,
    }))
}

export function searchMindNodes(nodes: StoredMindNode[], query: string): SpotlightSearchResult[] {
  return nodes
    .filter(n => {
      if (matchText(query, n.label)) return true
      const metaTitle = (n.metadata as Record<string, unknown> | null)?.title
      if (typeof metaTitle === 'string' && matchText(query, metaTitle)) return true
      return false
    })
    .map(n => ({
      type: 'mind_node' as const,
      id: n.id,
      title: n.label || '未命名节点',
      snippet: (n.metadata as Record<string, unknown> | null)?.title
        ? truncate(String((n.metadata as Record<string, unknown>).title), 80)
        : truncate(n.label, 80),
      targetTab: 'mind' as const,
      targetId: n.id,
    }))
}

export function searchSettingsCommands(query: string): SpotlightSearchResult[] {
  return SETTINGS_COMMANDS
    .filter(cmd => matchText(query, cmd.keyword) || matchText(query, cmd.label))
    .map(cmd => ({
      type: 'settings_command' as const,
      id: cmd.keyword,
      title: cmd.label,
      snippet: cmd.keyword,
      targetTab: 'settings' as const,
    }))
}

export function useSpotlightSearch(userId: string, query: string) {
  const [results, setResults] = useState<SpotlightSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const doSearch = useCallback(async (uid: string, q: string) => {
    if (!q || q.trim().length === 0) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const [drafts, tips, entries, mindNodes] = await Promise.all([
        listDrafts(uid),
        listActiveTips(uid),
        listArchivedEntries(uid),
        listMindNodes(uid),
      ])

      const trimmed = q.trim()
      const draftResults = searchDrafts(drafts, trimmed)
      const documentResults = searchDocuments(entries, trimmed)
      const tipResults = searchTips(tips, trimmed)
      const mindNodeResults = searchMindNodes(mindNodes, trimmed)
      const settingsResults = searchSettingsCommands(trimmed)

      const all = [
        ...draftResults,
        ...documentResults,
        ...tipResults,
        ...mindNodeResults,
        ...settingsResults,
      ].slice(0, 20)

      setResults(all)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!query || query.trim().length === 0) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(() => {
      doSearch(userId, query)
    }, 150)

    return () => {
      clearTimeout(timer)
    }
  }, [userId, query, doSearch])

  return useMemo(() => ({ results, loading }), [results, loading])
}
