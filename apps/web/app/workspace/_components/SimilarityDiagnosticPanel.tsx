'use client'

import React, { useState, useCallback } from 'react'
import {
  Activity,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FlaskConical,
  ArrowRightLeft,
} from 'lucide-react'
import { similarityComparison, type ComparisonReport, type ComparisonResultItem } from '@/lib/similarityComparison'
import { getCurrentUser } from '@/lib/auth'
import { listAuditLogs } from '@/lib/intelligenceRepository'
import { DEFAULT_WORKSPACE_ID } from '@atlax/domain'
import type { AlgorithmAuditLog } from '@atlax/domain'

type SourceType = 'tip' | 'draft' | 'document'

interface DiffSummary {
  overlapRate: number
  rankDifference: number
  scoreDifference: number
  fallbackUsed: boolean
}

interface AuditLogEntry {
  capability: string
  success: boolean
  fallbackUsed: boolean
  providerId: string
  modelId: string
  durationMs: number
  createdAt: string
}

export default function SimilarityDiagnosticPanel() {
  const [sourceType, setSourceType] = useState<SourceType>('draft')
  const [targetId, setTargetId] = useState('')
  const [topK, setTopK] = useState(10)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<ComparisonReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [expandedPanel, setExpandedPanel] = useState<'core' | 'semantic' | null>(null)

  const handleRunComparison = useCallback(async () => {
    if (!targetId.trim()) {
      setError('请输入目标 ID')
      return
    }
    const user = getCurrentUser()
    if (!user) {
      setError('无法获取用户信息')
      return
    }
    setRunning(true)
    setError(null)
    setReport(null)
    try {
      const result = await similarityComparison.runComparison({
        userId: user.id,
        workspaceId: DEFAULT_WORKSPACE_ID,
        sourceTargetType: sourceType,
        sourceTargetId: targetId.trim(),
        topK,
      })
      setReport(result)

      const logs = await listAuditLogs(user.id, undefined, DEFAULT_WORKSPACE_ID)
      const recentLogs = logs
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10)
        .map((l: AlgorithmAuditLog) => ({
          capability: l.capability,
          success: l.success,
          fallbackUsed: l.fallbackUsed,
          providerId: l.providerId,
          modelId: l.modelId,
          durationMs: l.durationMs,
          createdAt: l.createdAt,
        }))
      setAuditLogs(recentLogs)
    } catch (e) {
      setError(e instanceof Error ? e.message : '比较执行失败')
    } finally {
      setRunning(false)
    }
  }, [sourceType, targetId, topK])

  const semanticUnavailable = report !== null && report.fallbackUsed

  return (
    <div className="bg-[#1c2023]/40 backdrop-blur-[16px] border border-white/5 rounded-[16px] p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <FlaskConical className="w-4 h-4 text-[#c8a0f0]" />
        <h2 className="text-base font-medium text-white">相似度诊断面板</h2>
        <span className="text-[9px] font-semibold tracking-wider uppercase text-[#c8a0f0] bg-[#c8a0f0]/10 border border-[#c8a0f0]/20 px-1.5 py-0.5 rounded-full">DEV</span>
      </div>

      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase block mb-1">源类型</label>
            <div className="relative">
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e0e3e6] focus:outline-none focus:border-[#86d7ff]/50 appearance-none cursor-pointer"
              >
                <option value="tip">Tip</option>
                <option value="draft">Draft</option>
                <option value="document">Document</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#899298] pointer-events-none" />
            </div>
          </div>
          <div className="flex-[2] min-w-0">
            <label className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase block mb-1">目标 ID</label>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="输入 Tip / Draft / Document ID"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e0e3e6] placeholder:text-[#899298]/50 focus:outline-none focus:border-[#86d7ff]/50"
            />
          </div>
          <div className="w-20 shrink-0">
            <label className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase block mb-1">Top K</label>
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(Math.max(1, Math.min(50, Number(e.target.value))))}
              min={1}
              max={50}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e0e3e6] focus:outline-none focus:border-[#86d7ff]/50"
            />
          </div>
          <button
            onClick={handleRunComparison}
            disabled={running || !targetId.trim()}
            className={`shrink-0 px-4 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
              running || !targetId.trim()
                ? 'bg-white/5 border-white/10 text-[#899298] opacity-40 cursor-not-allowed'
                : 'bg-[#86d7ff]/10 border-[#86d7ff]/30 text-[#86d7ff] hover:bg-[#86d7ff]/20'
            }`}
          >
            {running ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                执行中
              </span>
            ) : (
              '运行比较'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 rounded-lg p-3">
          <p className="text-xs text-[#ffb4ab]">{error}</p>
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <ResultPanel
              title="Core Mode"
              iconColor="text-[#86d7ff]"
              borderColor="border-[#86d7ff]/20"
              accentBg="bg-[#86d7ff]/5"
              results={report.coreModeResults}
              expanded={expandedPanel === 'core'}
              onToggle={() => setExpandedPanel(expandedPanel === 'core' ? null : 'core')}
            />
            <ResultPanel
              title="Semantic Core"
              iconColor="text-[#c8a0f0]"
              borderColor="border-[#c8a0f0]/20"
              accentBg="bg-[#c8a0f0]/5"
              results={report.semanticCoreResults}
              unavailable={semanticUnavailable}
              expanded={expandedPanel === 'semantic'}
              onToggle={() => setExpandedPanel(expandedPanel === 'semantic' ? null : 'semantic')}
            />
          </div>

          <DiffSummarySection
            overlapRate={report.overlapRate}
            rankDifference={report.rankDifference}
            scoreDifference={report.scoreDifference}
            fallbackUsed={report.fallbackUsed}
          />

          {auditLogs.length > 0 && <AuditLogSection logs={auditLogs} />}
        </>
      )}
    </div>
  )
}

function ResultPanel({
  title,
  iconColor,
  borderColor,
  accentBg,
  results,
  unavailable = false,
  expanded,
  onToggle,
}: {
  title: string
  iconColor: string
  borderColor: string
  accentBg: string
  results: ComparisonResultItem[]
  unavailable?: boolean
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className={`bg-white/[0.02] border ${borderColor} rounded-[12px] overflow-hidden`}>
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <ArrowRightLeft className={`w-3.5 h-3.5 ${iconColor}`} />
          <span className="text-xs font-medium text-white">{title}</span>
          <span className="text-[9px] text-[#899298] font-mono">{results.length} 条</span>
        </div>
        <ChevronDown className={`w-3 h-3 text-[#899298] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {unavailable && (
        <div className="px-3 pb-2">
          <div className="bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 rounded-lg p-2">
            <p className="text-[10px] text-[#ffb4ab] font-medium">Unavailable / fallbackUsed=true / provider unavailable</p>
          </div>
        </div>
      )}

      {expanded && !unavailable && (
        <div className="px-3 pb-2 space-y-1 max-h-[240px] overflow-y-auto custom-scrollbar">
          {results.length === 0 ? (
            <p className="text-[10px] text-[#899298] py-2 text-center">无结果</p>
          ) : (
            results.map((r, i) => (
              <div key={`${r.targetType}-${r.targetId}-${i}`} className={`${accentBg} border border-white/5 rounded-lg px-2.5 py-1.5`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-white font-medium">
                    {r.targetType}:{r.targetId}
                  </span>
                  <span className="text-[10px] text-[#9cf4d4] font-mono">{r.score.toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-[#899298]">
                  <span>{r.generatedBy}</span>
                  <span className="text-white/10">|</span>
                  <span>{r.providerId}</span>
                  <span className="text-white/10">|</span>
                  <span>{r.modelId}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {expanded && unavailable && results.length > 0 && (
        <div className="px-3 pb-2 space-y-1 max-h-[240px] overflow-y-auto custom-scrollbar">
          {results.map((r, i) => (
            <div key={`${r.targetType}-${r.targetId}-${i}`} className={`${accentBg} border border-white/5 rounded-lg px-2.5 py-1.5 opacity-50`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-white font-medium">
                  {r.targetType}:{r.targetId}
                </span>
                <span className="text-[10px] text-[#899298] font-mono">{r.score.toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-[#899298]">
                <span className="text-[#ffb4ab]">{r.generatedBy} (fallback)</span>
                <span className="text-white/10">|</span>
                <span>{r.providerId}</span>
                <span className="text-white/10">|</span>
                <span>{r.modelId}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiffSummarySection({ overlapRate, rankDifference, scoreDifference, fallbackUsed }: DiffSummary) {
  const overlapPercent = (overlapRate * 100).toFixed(1)
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[12px] p-3">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-3.5 h-3.5 text-[#86d7ff]" />
        <span className="text-xs font-medium text-white">差异摘要</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <p className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase mb-0.5">重叠率</p>
          <p className={`text-sm font-medium ${overlapRate >= 0.8 ? 'text-[#9cf4d4]' : overlapRate >= 0.5 ? 'text-amber-400' : 'text-[#ffb4ab]'}`}>
            {overlapPercent}%
          </p>
        </div>
        <div>
          <p className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase mb-0.5">排名差异</p>
          <p className="text-sm font-medium text-[#e0e3e6]">{rankDifference.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase mb-0.5">分数差异</p>
          <p className="text-sm font-medium text-[#e0e3e6]">{scoreDifference.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase mb-0.5">Fallback</p>
          <div className="flex items-center gap-1.5">
            {fallbackUsed ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-[#ffb4ab]" />
                <span className="text-sm font-medium text-[#ffb4ab]">已触发</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#9cf4d4]" />
                <span className="text-sm font-medium text-[#9cf4d4]">未触发</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AuditLogSection({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-[12px] p-3">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-3.5 h-3.5 text-[#899298]" />
        <span className="text-xs font-medium text-white">最近审计日志</span>
        <span className="text-[9px] text-[#899298] font-mono">{logs.length} 条</span>
      </div>
      <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar">
        {logs.map((log, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/[0.02] transition-colors">
            {log.success ? (
              <CheckCircle2 className="w-3 h-3 text-[#9cf4d4] shrink-0" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-[#ffb4ab] shrink-0" />
            )}
            <span className="text-[10px] text-[#e0e3e6] shrink-0">{log.capability}</span>
            <span className="text-[9px] text-[#899298] truncate">{log.providerId}/{log.modelId}</span>
            {log.fallbackUsed && (
              <span className="text-[9px] text-[#ffb4ab] shrink-0">fallback</span>
            )}
            <span className="text-[9px] text-[#899298] ml-auto shrink-0 font-mono">{log.durationMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  )
}
