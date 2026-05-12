'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Database, Trash2, ArrowLeft } from 'lucide-react'

import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { upsertMindNode, upsertMindEdge } from '@/lib/repository'
import type { MindNodeType, MindNodeState, MindEdgeType } from '@atlax/domain'

interface SeedResult {
  nodesCreated: number
  edgesCreated: number
  errors: string[]
}

interface MindNodeDef {
  nodeType: MindNodeType
  label: string
  state: MindNodeState
  degreeScore: number
  metadata?: Record<string, unknown>
}

interface MindEdgeDef {
  sourceLabel: string
  sourceType: MindNodeType
  targetLabel: string
  targetType: MindNodeType
  edgeType: MindEdgeType
  strength: number
  source: 'user' | 'system' | 'import'
  confidence: number | null
  reason: string | null
}

const SEED_NODES: MindNodeDef[] = [
  { nodeType: 'root', label: '知识宇宙', state: 'anchored', degreeScore: 10 },

  { nodeType: 'domain', label: '技术架构', state: 'active', degreeScore: 9 },
  { nodeType: 'domain', label: '产品设计', state: 'active', degreeScore: 7 },
  { nodeType: 'domain', label: '个人成长', state: 'active', degreeScore: 6 },
  { nodeType: 'domain', label: '商业运营', state: 'active', degreeScore: 5 },
  { nodeType: 'domain', label: '数据智能', state: 'active', degreeScore: 6 },

  { nodeType: 'project', label: 'MindDock', state: 'anchored', degreeScore: 10 },
  { nodeType: 'project', label: '搜索引擎', state: 'anchored', degreeScore: 6 },
  { nodeType: 'project', label: '同步服务', state: 'drifting', degreeScore: 3 },
  { nodeType: 'project', label: '推荐系统', state: 'suggested', degreeScore: 4 },
  { nodeType: 'project', label: '支付网关', state: 'dormant', degreeScore: 2 },

  { nodeType: 'topic', label: '物理引擎', state: 'active', degreeScore: 6 },
  { nodeType: 'topic', label: 'UX 指南', state: 'active', degreeScore: 5 },
  { nodeType: 'topic', label: 'API 设计', state: 'active', degreeScore: 4 },
  { nodeType: 'topic', label: 'RAG 架构', state: 'active', degreeScore: 5 },
  { nodeType: 'topic', label: 'CI/CD 流水线', state: 'dormant', degreeScore: 3 },
  { nodeType: 'topic', label: '用户研究', state: 'active', degreeScore: 4 },
  { nodeType: 'topic', label: 'A/B 测试', state: 'suggested', degreeScore: 2 },
  { nodeType: 'topic', label: '监控告警', state: 'dormant', degreeScore: 2 },
  { nodeType: 'topic', label: '设计系统', state: 'active', degreeScore: 4 },

  { nodeType: 'document', label: '图谱引擎物理模拟', state: 'anchored', degreeScore: 5 },
  { nodeType: 'document', label: '算法设计文档', state: 'anchored', degreeScore: 4 },
  { nodeType: 'document', label: 'RAG 架构优化笔记', state: 'anchored', degreeScore: 4 },
  { nodeType: 'document', label: '本地优先架构设计', state: 'anchored', degreeScore: 4 },
  { nodeType: 'document', label: 'Prompt 工程实践', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '设计心理学笔记', state: 'dormant', degreeScore: 2 },
  { nodeType: 'document', label: '思考快与慢', state: 'dormant', degreeScore: 2 },
  { nodeType: 'document', label: '黑客与画家', state: 'dormant', degreeScore: 2 },
  { nodeType: 'document', label: 'Dexie 查询优化', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: 'Next.js 缓存策略', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '向量数据库对比', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '语义分块策略', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '混合检索设计', state: 'suggested', degreeScore: 2 },
  { nodeType: 'document', label: '设计令牌系统', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '组件库规范', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '动效设计原则', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: 'GitHub Actions 工作流', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '用户访谈脚本', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '竞品分析报告', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: 'CRDT 冲突解决', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: '产品评审会议纪要', state: 'anchored', degreeScore: 3 },
  { nodeType: 'document', label: 'Dock 卡片交互对齐', state: 'anchored', degreeScore: 2 },
  { nodeType: 'document', label: 'Markdown 渲染支持', state: 'anchored', degreeScore: 2 },
  { nodeType: 'document', label: '双向链接概念', state: 'suggested', degreeScore: 3 },
  { nodeType: 'document', label: '智能分组概念', state: 'suggested', degreeScore: 2 },
  { nodeType: 'document', label: '每日回顾概念', state: 'suggested', degreeScore: 2 },
  { nodeType: 'document', label: 'Draft: 新功能构思', state: 'drifting', degreeScore: 1, metadata: { sourceType: 'draft' } },
  { nodeType: 'document', label: 'Draft: API 版本规划', state: 'drifting', degreeScore: 1, metadata: { sourceType: 'draft' } },
  { nodeType: 'document', label: 'Draft: 性能优化思路', state: 'drifting', degreeScore: 1, metadata: { sourceType: 'draft' } },
  { nodeType: 'document', label: 'Tip: Dexie 批量操作技巧', state: 'anchored', degreeScore: 2, metadata: { sourceType: 'tip' } },
  { nodeType: 'document', label: 'Tip: Canvas 渲染优化', state: 'anchored', degreeScore: 2, metadata: { sourceType: 'tip' } },
  { nodeType: 'document', label: 'Tip: IndexedDB 索引策略', state: 'anchored', degreeScore: 2, metadata: { sourceType: 'tip' } },

  { nodeType: 'fragment', label: 'chunk 策略比 embedding 模型更重要', state: 'anchored', degreeScore: 3 },
  { nodeType: 'fragment', label: '本地优先加 AI 是最佳组合', state: 'anchored', degreeScore: 3 },
  { nodeType: 'fragment', label: '知识管理在于连接而非存储', state: 'suggested', degreeScore: 2 },
  { nodeType: 'fragment', label: 'UI 应减少认知负荷', state: 'suggested', degreeScore: 2 },
  { nodeType: 'fragment', label: '混合检索优于纯向量检索', state: 'anchored', degreeScore: 2 },
  { nodeType: 'fragment', label: '可观测性是功能不是事后补充', state: 'suggested', degreeScore: 1 },

  { nodeType: 'source', label: '文本捕获', state: 'anchored', degreeScore: 8 },
  { nodeType: 'source', label: '对话捕获', state: 'anchored', degreeScore: 5 },
  { nodeType: 'source', label: '导入捕获', state: 'anchored', degreeScore: 4 },
  { nodeType: 'source', label: '语音捕获', state: 'anchored', degreeScore: 3 },

  { nodeType: 'tag', label: '技术', state: 'active', degreeScore: 9, metadata: { tagIds: ['tag_tech'] } },
  { nodeType: 'tag', label: '产品', state: 'active', degreeScore: 8, metadata: { tagIds: ['tag_product'] } },
  { nodeType: 'tag', label: '学习', state: 'active', degreeScore: 6, metadata: { tagIds: ['tag_learning'] } },
  { nodeType: 'tag', label: '前端', state: 'active', degreeScore: 5, metadata: { tagIds: ['tag_frontend'] } },
  { nodeType: 'tag', label: 'AI', state: 'active', degreeScore: 5, metadata: { tagIds: ['tag_ai'] } },
  { nodeType: 'tag', label: '架构', state: 'active', degreeScore: 4, metadata: { tagIds: ['tag_arch'] } },
  { nodeType: 'tag', label: '设计', state: 'dormant', degreeScore: 3, metadata: { tagIds: ['tag_design'] } },
  { nodeType: 'tag', label: '项目管理', state: 'dormant', degreeScore: 3, metadata: { tagIds: ['tag_pm'] } },
  { nodeType: 'tag', label: '支付', state: 'isolated', degreeScore: 1, metadata: { tagIds: ['tag_payment'] } },
  { nodeType: 'tag', label: '数据库', state: 'active', degreeScore: 4, metadata: { tagIds: ['tag_db'] } },
  { nodeType: 'tag', label: '测试', state: 'active', degreeScore: 3, metadata: { tagIds: ['tag_test'] } },
  { nodeType: 'tag', label: '安全', state: 'dormant', degreeScore: 2, metadata: { tagIds: ['tag_security'] } },

  { nodeType: 'question', label: '如何处理跨设备同步？', state: 'drifting', degreeScore: 2 },
  { nodeType: 'question', label: 'CRDT 还是事件溯源？', state: 'drifting', degreeScore: 2 },
  { nodeType: 'question', label: '最优定价模型是什么？', state: 'drifting', degreeScore: 1 },
  { nodeType: 'question', label: '何时引入协作功能？', state: 'drifting', degreeScore: 1 },
  { nodeType: 'question', label: '是否需要插件系统？', state: 'drifting', degreeScore: 1 },
  { nodeType: 'question', label: 'AI 自动化边界在哪里？', state: 'isolated', degreeScore: 0 },

  { nodeType: 'insight', label: '本地优先加 AI 是最佳组合', state: 'anchored', degreeScore: 4 },
  { nodeType: 'insight', label: 'Chunk 策略比 Embedding 模型更重要', state: 'anchored', degreeScore: 3 },
  { nodeType: 'insight', label: '知识管理在于连接而非存储', state: 'suggested', degreeScore: 3 },
  { nodeType: 'insight', label: '混合检索优于纯向量检索', state: 'anchored', degreeScore: 3 },
  { nodeType: 'insight', label: '可观测性是功能而非事后补充', state: 'suggested', degreeScore: 2 },
  { nodeType: 'insight', label: '用户研究应驱动产品决策', state: 'suggested', degreeScore: 2 },
  { nodeType: 'insight', label: '设计令牌支持跨平台一致性', state: 'anchored', degreeScore: 2 },

  { nodeType: 'time', label: '2026-Q2', state: 'active', degreeScore: 3 },
  { nodeType: 'time', label: '2026-05', state: 'active', degreeScore: 4 },
  { nodeType: 'time', label: '2026-Q3', state: 'suggested', degreeScore: 2 },
  { nodeType: 'time', label: '2026-04', state: 'active', degreeScore: 3 },
]

const SEED_EDGES: MindEdgeDef[] = [

  { sourceLabel: '知识宇宙', sourceType: 'root', targetLabel: '技术架构', targetType: 'domain', edgeType: 'parent_child', strength: 0.9, source: 'system', confidence: 1.0, reason: 'baseline-auto-connect' },
  { sourceLabel: '知识宇宙', sourceType: 'root', targetLabel: '产品设计', targetType: 'domain', edgeType: 'parent_child', strength: 0.85, source: 'system', confidence: 1.0, reason: 'baseline-auto-connect' },
  { sourceLabel: '知识宇宙', sourceType: 'root', targetLabel: '个人成长', targetType: 'domain', edgeType: 'parent_child', strength: 0.8, source: 'system', confidence: 1.0, reason: 'baseline-auto-connect' },
  { sourceLabel: '知识宇宙', sourceType: 'root', targetLabel: '商业运营', targetType: 'domain', edgeType: 'parent_child', strength: 0.75, source: 'system', confidence: 1.0, reason: 'baseline-auto-connect' },
  { sourceLabel: '知识宇宙', sourceType: 'root', targetLabel: '数据智能', targetType: 'domain', edgeType: 'parent_child', strength: 0.75, source: 'system', confidence: 1.0, reason: 'baseline-auto-connect' },

  { sourceLabel: '技术架构', sourceType: 'domain', targetLabel: 'MindDock', targetType: 'project', edgeType: 'parent_child', strength: 0.9, source: 'user', confidence: 0.9, reason: 'user-parent-link' },
  { sourceLabel: '技术架构', sourceType: 'domain', targetLabel: '搜索引擎', targetType: 'project', edgeType: 'parent_child', strength: 0.8, source: 'user', confidence: 0.85, reason: 'user-parent-link' },
  { sourceLabel: '技术架构', sourceType: 'domain', targetLabel: '同步服务', targetType: 'project', edgeType: 'parent_child', strength: 0.5, source: 'user', confidence: 0.6, reason: 'user-parent-link' },
  { sourceLabel: '技术架构', sourceType: 'domain', targetLabel: '推荐系统', targetType: 'project', edgeType: 'parent_child', strength: 0.6, source: 'user', confidence: 0.65, reason: 'user-parent-link' },

  { sourceLabel: '商业运营', sourceType: 'domain', targetLabel: '支付网关', targetType: 'project', edgeType: 'parent_child', strength: 0.7, source: 'user', confidence: 0.75, reason: 'user-parent-link' },

  { sourceLabel: '产品设计', sourceType: 'domain', targetLabel: 'UX 指南', targetType: 'topic', edgeType: 'parent_child', strength: 0.7, source: 'user', confidence: 0.8, reason: 'user-parent-link' },
  { sourceLabel: '产品设计', sourceType: 'domain', targetLabel: '用户研究', targetType: 'topic', edgeType: 'parent_child', strength: 0.6, source: 'user', confidence: 0.7, reason: 'user-parent-link' },
  { sourceLabel: '产品设计', sourceType: 'domain', targetLabel: 'A/B 测试', targetType: 'topic', edgeType: 'parent_child', strength: 0.5, source: 'user', confidence: 0.55, reason: 'user-parent-link' },
  { sourceLabel: '产品设计', sourceType: 'domain', targetLabel: '设计系统', targetType: 'topic', edgeType: 'parent_child', strength: 0.6, source: 'user', confidence: 0.7, reason: 'user-parent-link' },

  { sourceLabel: '个人成长', sourceType: 'domain', targetLabel: '设计心理学笔记', targetType: 'document', edgeType: 'parent_child', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: '个人成长', sourceType: 'domain', targetLabel: '思考快与慢', targetType: 'document', edgeType: 'parent_child', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: '个人成长', sourceType: 'domain', targetLabel: '黑客与画家', targetType: 'document', edgeType: 'parent_child', strength: 0.4, source: 'system', confidence: 0.5, reason: null },

  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: '物理引擎', targetType: 'topic', edgeType: 'parent_child', strength: 0.8, source: 'user', confidence: 0.85, reason: 'user-parent-link' },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: 'API 设计', targetType: 'topic', edgeType: 'parent_child', strength: 0.7, source: 'user', confidence: 0.8, reason: 'user-parent-link' },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: 'CI/CD 流水线', targetType: 'topic', edgeType: 'parent_child', strength: 0.6, source: 'user', confidence: 0.7, reason: 'user-parent-link' },

  { sourceLabel: '搜索引擎', sourceType: 'project', targetLabel: 'RAG 架构', targetType: 'topic', edgeType: 'parent_child', strength: 0.8, source: 'user', confidence: 0.85, reason: 'user-parent-link' },

  { sourceLabel: '物理引擎', sourceType: 'topic', targetLabel: '图谱引擎物理模拟', targetType: 'document', edgeType: 'parent_child', strength: 0.8, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '物理引擎', sourceType: 'topic', targetLabel: '算法设计文档', targetType: 'document', edgeType: 'parent_child', strength: 0.7, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: 'RAG 架构', sourceType: 'topic', targetLabel: 'RAG 架构优化笔记', targetType: 'document', edgeType: 'parent_child', strength: 0.8, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: 'RAG 架构', sourceType: 'topic', targetLabel: '向量数据库对比', targetType: 'document', edgeType: 'parent_child', strength: 0.7, source: 'system', confidence: 0.75, reason: null },
  { sourceLabel: 'RAG 架构', sourceType: 'topic', targetLabel: '语义分块策略', targetType: 'document', edgeType: 'parent_child', strength: 0.7, source: 'system', confidence: 0.75, reason: null },
  { sourceLabel: 'RAG 架构', sourceType: 'topic', targetLabel: '混合检索设计', targetType: 'document', edgeType: 'parent_child', strength: 0.6, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: 'RAG 架构', sourceType: 'topic', targetLabel: 'Prompt 工程实践', targetType: 'document', edgeType: 'parent_child', strength: 0.6, source: 'system', confidence: 0.65, reason: null },
  { sourceLabel: 'API 设计', sourceType: 'topic', targetLabel: '本地优先架构设计', targetType: 'document', edgeType: 'parent_child', strength: 0.7, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: 'API 设计', sourceType: 'topic', targetLabel: 'CRDT 冲突解决', targetType: 'document', edgeType: 'parent_child', strength: 0.6, source: 'system', confidence: 0.65, reason: null },
  { sourceLabel: 'UX 指南', sourceType: 'topic', targetLabel: '组件库规范', targetType: 'document', edgeType: 'parent_child', strength: 0.7, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: 'UX 指南', sourceType: 'topic', targetLabel: '动效设计原则', targetType: 'document', edgeType: 'parent_child', strength: 0.6, source: 'system', confidence: 0.65, reason: null },
  { sourceLabel: 'CI/CD 流水线', sourceType: 'topic', targetLabel: 'GitHub Actions 工作流', targetType: 'document', edgeType: 'parent_child', strength: 0.7, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '设计系统', sourceType: 'topic', targetLabel: '设计令牌系统', targetType: 'document', edgeType: 'parent_child', strength: 0.7, source: 'system', confidence: 0.7, reason: null },

  { sourceLabel: '产品设计', sourceType: 'domain', targetLabel: '用户访谈脚本', targetType: 'document', edgeType: 'parent_child', strength: 0.6, source: 'system', confidence: 0.65, reason: null },
  { sourceLabel: '产品设计', sourceType: 'domain', targetLabel: '竞品分析报告', targetType: 'document', edgeType: 'parent_child', strength: 0.6, source: 'system', confidence: 0.65, reason: null },
  { sourceLabel: '产品设计', sourceType: 'domain', targetLabel: '产品评审会议纪要', targetType: 'document', edgeType: 'parent_child', strength: 0.6, source: 'system', confidence: 0.65, reason: null },

  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: 'Dexie 查询优化', targetType: 'document', edgeType: 'parent_child', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: 'Next.js 缓存策略', targetType: 'document', edgeType: 'parent_child', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: 'Dock 卡片交互对齐', targetType: 'document', edgeType: 'parent_child', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: 'Markdown 渲染支持', targetType: 'document', edgeType: 'parent_child', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: '双向链接概念', targetType: 'document', edgeType: 'parent_child', strength: 0.4, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: '智能分组概念', targetType: 'document', edgeType: 'parent_child', strength: 0.4, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: 'MindDock', sourceType: 'project', targetLabel: '每日回顾概念', targetType: 'document', edgeType: 'parent_child', strength: 0.4, source: 'system', confidence: 0.5, reason: null },

  { sourceLabel: 'RAG 架构优化笔记', sourceType: 'document', targetLabel: '向量数据库对比', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: 'RAG 架构优化笔记', sourceType: 'document', targetLabel: '语义分块策略', targetType: 'document', edgeType: 'semantic', strength: 0.8, source: 'system', confidence: 0.85, reason: null },
  { sourceLabel: '本地优先架构设计', sourceType: 'document', targetLabel: 'CRDT 冲突解决', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.75, reason: null },
  { sourceLabel: 'Dexie 查询优化', sourceType: 'document', targetLabel: 'Next.js 缓存策略', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '设计令牌系统', sourceType: 'document', targetLabel: '组件库规范', targetType: 'document', edgeType: 'semantic', strength: 0.8, source: 'system', confidence: 0.85, reason: null },
  { sourceLabel: '设计令牌系统', sourceType: 'document', targetLabel: '动效设计原则', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '产品评审会议纪要', sourceType: 'document', targetLabel: '竞品分析报告', targetType: 'document', edgeType: 'semantic', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: 'Dock 卡片交互对齐', sourceType: 'document', targetLabel: 'Markdown 渲染支持', targetType: 'document', edgeType: 'semantic', strength: 0.4, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: '双向链接概念', sourceType: 'document', targetLabel: '智能分组概念', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.65, reason: null },
  { sourceLabel: '双向链接概念', sourceType: 'document', targetLabel: '每日回顾概念', targetType: 'document', edgeType: 'semantic', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: '设计心理学笔记', sourceType: 'document', targetLabel: '思考快与慢', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.75, reason: null },
  { sourceLabel: '思考快与慢', sourceType: 'document', targetLabel: '黑客与画家', targetType: 'document', edgeType: 'semantic', strength: 0.4, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: '图谱引擎物理模拟', sourceType: 'document', targetLabel: '算法设计文档', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },

  { sourceLabel: 'RAG 架构优化笔记', sourceType: 'document', targetLabel: '文本捕获', targetType: 'source', edgeType: 'source', strength: 0.8, source: 'system', confidence: 0.9, reason: null },
  { sourceLabel: '产品评审会议纪要', sourceType: 'document', targetLabel: '对话捕获', targetType: 'source', edgeType: 'source', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '向量数据库对比', sourceType: 'document', targetLabel: '导入捕获', targetType: 'source', edgeType: 'source', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '用户访谈脚本', sourceType: 'document', targetLabel: '语音捕获', targetType: 'source', edgeType: 'source', strength: 0.5, source: 'system', confidence: 0.6, reason: null },

  { sourceLabel: '技术', sourceType: 'tag', targetLabel: 'RAG 架构优化笔记', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '技术', sourceType: 'tag', targetLabel: '本地优先架构设计', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '技术', sourceType: 'tag', targetLabel: 'Dexie 查询优化', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '技术', sourceType: 'tag', targetLabel: 'CRDT 冲突解决', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '技术', sourceType: 'tag', targetLabel: 'GitHub Actions 工作流', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '产品', sourceType: 'tag', targetLabel: '产品评审会议纪要', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '产品', sourceType: 'tag', targetLabel: '竞品分析报告', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '产品', sourceType: 'tag', targetLabel: 'Dock 卡片交互对齐', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: 'AI', sourceType: 'tag', targetLabel: 'Prompt 工程实践', targetType: 'document', edgeType: 'semantic', strength: 0.8, source: 'system', confidence: 0.85, reason: null },
  { sourceLabel: 'AI', sourceType: 'tag', targetLabel: '向量数据库对比', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: 'AI', sourceType: 'tag', targetLabel: '语义分块策略', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '前端', sourceType: 'tag', targetLabel: 'Dexie 查询优化', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '前端', sourceType: 'tag', targetLabel: 'Next.js 缓存策略', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '架构', sourceType: 'tag', targetLabel: '本地优先架构设计', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '设计', sourceType: 'tag', targetLabel: '设计令牌系统', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '设计', sourceType: 'tag', targetLabel: '组件库规范', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '学习', sourceType: 'tag', targetLabel: '设计心理学笔记', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '学习', sourceType: 'tag', targetLabel: '思考快与慢', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '数据库', sourceType: 'tag', targetLabel: '向量数据库对比', targetType: 'document', edgeType: 'semantic', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '数据库', sourceType: 'tag', targetLabel: 'Dexie 查询优化', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '测试', sourceType: 'tag', targetLabel: 'GitHub Actions 工作流', targetType: 'document', edgeType: 'semantic', strength: 0.6, source: 'system', confidence: 0.7, reason: null },

  { sourceLabel: 'RAG 架构优化笔记', sourceType: 'document', targetLabel: 'chunk 策略比 embedding 模型更重要', targetType: 'fragment', edgeType: 'reference', strength: 0.8, source: 'system', confidence: 0.85, reason: null },
  { sourceLabel: '本地优先架构设计', sourceType: 'document', targetLabel: '本地优先加 AI 是最佳组合', targetType: 'fragment', edgeType: 'reference', strength: 0.7, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '设计心理学笔记', sourceType: 'document', targetLabel: 'UI 应减少认知负荷', targetType: 'fragment', edgeType: 'reference', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '混合检索设计', sourceType: 'document', targetLabel: '混合检索优于纯向量检索', targetType: 'fragment', edgeType: 'reference', strength: 0.7, source: 'system', confidence: 0.75, reason: null },

  { sourceLabel: '本地优先加 AI 是最佳组合', sourceType: 'insight', targetLabel: '本地优先架构设计', targetType: 'document', edgeType: 'reference', strength: 0.7, source: 'system', confidence: 0.75, reason: null },
  { sourceLabel: 'Chunk 策略比 Embedding 模型更重要', sourceType: 'insight', targetLabel: '语义分块策略', targetType: 'document', edgeType: 'reference', strength: 0.8, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '知识管理在于连接而非存储', sourceType: 'insight', targetLabel: '双向链接概念', targetType: 'document', edgeType: 'reference', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '混合检索优于纯向量检索', sourceType: 'insight', targetLabel: '混合检索设计', targetType: 'document', edgeType: 'reference', strength: 0.7, source: 'system', confidence: 0.75, reason: null },
  { sourceLabel: '可观测性是功能而非事后补充', sourceType: 'insight', targetLabel: 'GitHub Actions 工作流', targetType: 'document', edgeType: 'reference', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: '用户研究应驱动产品决策', sourceType: 'insight', targetLabel: '竞品分析报告', targetType: 'document', edgeType: 'reference', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '设计令牌支持跨平台一致性', sourceType: 'insight', targetLabel: '组件库规范', targetType: 'document', edgeType: 'reference', strength: 0.6, source: 'system', confidence: 0.7, reason: null },

  { sourceLabel: '如何处理跨设备同步？', sourceType: 'question', targetLabel: 'CRDT 冲突解决', targetType: 'document', edgeType: 'reference', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: 'CRDT 还是事件溯源？', sourceType: 'question', targetLabel: '本地优先架构设计', targetType: 'document', edgeType: 'reference', strength: 0.6, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '最优定价模型是什么？', sourceType: 'question', targetLabel: '竞品分析报告', targetType: 'document', edgeType: 'reference', strength: 0.4, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: '何时引入协作功能？', sourceType: 'question', targetLabel: '产品评审会议纪要', targetType: 'document', edgeType: 'reference', strength: 0.4, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: '是否需要插件系统？', sourceType: 'question', targetLabel: '每日回顾概念', targetType: 'document', edgeType: 'reference', strength: 0.3, source: 'system', confidence: 0.4, reason: null },

  { sourceLabel: '2026-Q2', sourceType: 'time', targetLabel: '产品评审会议纪要', targetType: 'document', edgeType: 'temporal', strength: 0.5, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '2026-05', sourceType: 'time', targetLabel: 'RAG 架构优化笔记', targetType: 'document', edgeType: 'temporal', strength: 0.6, source: 'system', confidence: 0.8, reason: null },
  { sourceLabel: '2026-05', sourceType: 'time', targetLabel: 'Dexie 查询优化', targetType: 'document', edgeType: 'temporal', strength: 0.5, source: 'system', confidence: 0.7, reason: null },
  { sourceLabel: '2026-Q3', sourceType: 'time', targetLabel: '智能分组概念', targetType: 'document', edgeType: 'temporal', strength: 0.3, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: '2026-04', sourceType: 'time', targetLabel: '思考快与慢', targetType: 'document', edgeType: 'temporal', strength: 0.4, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: '2026-Q2', sourceType: 'time', targetLabel: '竞品分析报告', targetType: 'document', edgeType: 'temporal', strength: 0.4, source: 'system', confidence: 0.6, reason: null },

  { sourceLabel: '图谱引擎物理模拟', sourceType: 'document', targetLabel: '算法设计文档', targetType: 'document', edgeType: 'suggested', strength: 0.5, source: 'system', confidence: 0.6, reason: null },
  { sourceLabel: '设计心理学笔记', sourceType: 'document', targetLabel: '动效设计原则', targetType: 'document', edgeType: 'suggested', strength: 0.4, source: 'system', confidence: 0.5, reason: null },
  { sourceLabel: '双向链接概念', sourceType: 'document', targetLabel: '智能分组概念', targetType: 'document', edgeType: 'suggested', strength: 0.5, source: 'system', confidence: 0.55, reason: null },
  { sourceLabel: '每日回顾概念', sourceType: 'document', targetLabel: '智能分组概念', targetType: 'document', edgeType: 'suggested', strength: 0.4, source: 'system', confidence: 0.45, reason: null },

  { sourceLabel: 'Prompt 工程实践', sourceType: 'document', targetLabel: '混合检索设计', targetType: 'document', edgeType: 'confirmed', strength: 0.6, source: 'user', confidence: 0.7, reason: null },
  { sourceLabel: '向量数据库对比', sourceType: 'document', targetLabel: '语义分块策略', targetType: 'document', edgeType: 'confirmed', strength: 0.7, source: 'user', confidence: 0.8, reason: null },
  { sourceLabel: '设计令牌系统', sourceType: 'document', targetLabel: '组件库规范', targetType: 'document', edgeType: 'confirmed', strength: 0.8, source: 'user', confidence: 0.85, reason: null },
  { sourceLabel: '产品评审会议纪要', sourceType: 'document', targetLabel: '竞品分析报告', targetType: 'document', edgeType: 'confirmed', strength: 0.5, source: 'user', confidence: 0.6, reason: null },

  { sourceLabel: '本地优先架构设计', sourceType: 'document', targetLabel: 'CRDT 还是事件溯源？', targetType: 'question', edgeType: 'conflict', strength: 0.3, source: 'system', confidence: 0.4, reason: 'conflicting_approach' },
  { sourceLabel: '竞品分析报告', sourceType: 'document', targetLabel: '最优定价模型是什么？', targetType: 'question', edgeType: 'conflict', strength: 0.25, source: 'system', confidence: 0.35, reason: 'pricing_conflict' },
  { sourceLabel: '产品评审会议纪要', sourceType: 'document', targetLabel: '何时引入协作功能？', targetType: 'question', edgeType: 'conflict', strength: 0.25, source: 'system', confidence: 0.3, reason: 'feature_priority_conflict' },
]

function makeNodeId(userId: string, nodeType: MindNodeType, label: string): string {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40)
  return `${userId}_mn_${nodeType}_${normalized}`
}

export default function SeedMindPage() {
  const [seeding, setSeeding] = useState(false)
  const [result, setResult] = useState<SeedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSeed = async () => {
    const user = getCurrentUser()
    if (!user) {
      setError('请先登录')
      return
    }

    setSeeding(true)
    setError(null)
    setResult(null)

    const userId = user.id
    const errors: string[] = []
    let nodesCreated = 0
    let edgesCreated = 0

    try {
      for (const node of SEED_NODES) {
        try {
          await upsertMindNode({
            userId,
            nodeType: node.nodeType,
            label: node.label,
            state: node.state,
            degreeScore: node.degreeScore,
            metadata: node.metadata ?? null,
          })
          nodesCreated++
        } catch (e) {
          errors.push(`Node ${node.label}: ${e instanceof Error ? e.message : '未知错误'}`)
        }
      }

      for (const edge of SEED_EDGES) {
        const sourceNodeId = makeNodeId(userId, edge.sourceType, edge.sourceLabel)
        const targetNodeId = makeNodeId(userId, edge.targetType, edge.targetLabel)

        try {
          const created = await upsertMindEdge({
            userId,
            sourceNodeId,
            targetNodeId,
            edgeType: edge.edgeType,
            strength: edge.strength,
            source: edge.source,
            confidence: edge.confidence,
            reason: edge.reason,
          })
          if (created) {
            edgesCreated++
          } else {
            errors.push(`Edge ${edge.sourceLabel}→${edge.targetLabel}: guard rejected`)
          }
        } catch (e) {
          errors.push(`Edge ${edge.sourceLabel}→${edge.targetLabel}: ${e instanceof Error ? e.message : '未知错误'}`)
        }
      }

      setResult({ nodesCreated, edgesCreated, errors })
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误')
    } finally {
      setSeeding(false)
    }
  }

  const handleClear = async () => {
    const user = getCurrentUser()
    if (!user) {
      setError('请先登录')
      return
    }

    if (!confirm('确定要清除当前用户的所有 Mind 数据吗？此操作不可恢复。')) return

    setSeeding(true)
    setError(null)

    try {
      const userId = user.id
      const mindNodeIds = await db.table('mindNodes').where('userId').equals(userId).primaryKeys()
      if (mindNodeIds.length > 0) {
        await db.table('mindNodes').bulkDelete(mindNodeIds)
      }
      const mindEdgeIds = await db.table('mindEdges').where('userId').equals(userId).primaryKeys()
      if (mindEdgeIds.length > 0) {
        await db.table('mindEdges').bulkDelete(mindEdgeIds)
      }
      setResult({ nodesCreated: 0, edgesCreated: 0, errors: [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误')
    } finally {
      setSeeding(false)
    }
  }

  const nodeTypeCounts = SEED_NODES.reduce<Record<string, number>>((acc, n) => {
    acc[n.nodeType] = (acc[n.nodeType] || 0) + 1
    return acc
  }, {})

  const edgeTypeCounts = SEED_EDGES.reduce<Record<string, number>>((acc, e) => {
    acc[e.edgeType] = (acc[e.edgeType] || 0) + 1
    return acc
  }, {})

  const stateCounts = SEED_NODES.reduce<Record<string, number>>((acc, n) => {
    acc[n.state] = (acc[n.state] || 0) + 1
    return acc
  }, {})

  const orphanLabels = ['Draft: 新功能构思', 'Draft: API 版本规划', 'Draft: 性能优化思路', '是否需要插件系统？', 'AI 自动化边界在哪里？']
  const draftCount = SEED_NODES.filter(n => n.metadata?.sourceType === 'draft').length
  const tipCount = SEED_NODES.filter(n => n.metadata?.sourceType === 'tip').length
  const isolatedCount = SEED_NODES.filter(n => n.state === 'isolated').length
  const conflictedCount = SEED_EDGES.filter(e => e.edgeType === 'conflict').length

  return (
    <div className="min-h-screen bg-[#0b0f11] text-[#e0e3e6] p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/workspace" className="text-[#899298] hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Mind 数据种子 v2</h1>
        </div>

        <div className="bg-[#1c2023]/40 backdrop-blur-[20px] rounded-[22px] border border-white/5 p-6 space-y-4">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-white">数据概览</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-[#899298]">节点总数</div>
              <div className="text-white font-medium">{SEED_NODES.length}</div>
              <div className="text-[#899298]">边总数</div>
              <div className="text-white font-medium">{SEED_EDGES.length}</div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[#86d7ff]">NODE TYPES ({Object.keys(nodeTypeCounts).length}/11)</h3>
            <div className="flex flex-wrap gap-2">
              {(['root', 'domain', 'project', 'topic', 'document', 'fragment', 'source', 'tag', 'question', 'insight', 'time'] as MindNodeType[]).map(type => (
                <span key={type} className={`px-2 py-1 rounded-lg text-xs font-medium ${nodeTypeCounts[type] ? 'bg-[#86d7ff]/15 text-[#86d7ff]' : 'bg-white/5 text-[#899298]'}`}>
                  {type} {nodeTypeCounts[type] ?? 0}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[#c8a0f0]">EDGE TYPES ({Object.keys(edgeTypeCounts).length}/8)</h3>
            <div className="flex flex-wrap gap-2">
              {(['parent_child', 'semantic', 'reference', 'source', 'temporal', 'confirmed', 'suggested', 'conflict'] as MindEdgeType[]).map(type => (
                <span key={type} className={`px-2 py-1 rounded-lg text-xs font-medium ${edgeTypeCounts[type] ? 'bg-[#c8a0f0]/15 text-[#c8a0f0]' : 'bg-white/5 text-[#899298]'}`}>
                  {type} {edgeTypeCounts[type] ?? 0}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[#9cf4d4]">STATES / SPECIAL</h3>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[#9cf4d4]/10 text-[#9cf4d4]">anchored: {stateCounts['anchored'] ?? 0}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[#9cf4d4]/10 text-[#9cf4d4]">active: {stateCounts['active'] ?? 0}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-yellow-500/10 text-yellow-400">drifting: {stateCounts['drifting'] ?? 0}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-purple-500/10 text-purple-300">suggested: {stateCounts['suggested'] ?? 0}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-gray-500/10 text-gray-400">dormant: {stateCounts['dormant'] ?? 0}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-300">isolated: {isolatedCount}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-orange-500/10 text-orange-300">Drafts: {draftCount}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-300">Tips: {tipCount}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-[#ffb4ab]/10 text-[#ffb4ab]">Conflict: {conflictedCount}</span>
              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-300">Orphan: {orphanLabels.length}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#86d7ff]/10 text-[#86d7ff] border border-[#86d7ff]/30 hover:bg-[#86d7ff]/20 transition-all duration-200 disabled:opacity-50">
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            导入 Mind 数据
          </button>
          <button onClick={handleClear} disabled={seeding} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ffb4ab]/10 text-[#ffb4ab] border border-[#ffb4ab]/30 hover:bg-[#ffb4ab]/20 transition-all duration-200 disabled:opacity-50">
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            清除 Mind 数据
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 text-[#ffb4ab] text-sm">{error}</div>
        )}

        {result && (
          <div className="p-4 rounded-xl bg-[#9cf4d4]/10 border border-[#9cf4d4]/30 text-[#9cf4d4] space-y-2">
            <div className="font-medium">导入完成</div>
            <div className="text-sm space-y-1">
              <div>节点创建: {result.nodesCreated} / {SEED_NODES.length}</div>
              <div>边创建: {result.edgesCreated} / {SEED_EDGES.length}</div>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[#ffb4ab]">错误 ({result.errors.length}):</div>
                  {result.errors.slice(0, 10).map((e, i) => (
                    <div key={i} className="text-[#ffb4ab] text-xs">{e}</div>
                  ))}
                  {result.errors.length > 10 && (
                    <div className="text-[#ffb4ab] text-xs">...还有 {result.errors.length - 10} 条错误</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-[#899298] space-y-1">
          <p>使用真实 repository 函数写入 IndexedDB，遵循 Edge Guard 规则。</p>
          <p>访问 /workspace → Mind 视图查看结果。</p>
        </div>
      </div>
    </div>
  )
}
