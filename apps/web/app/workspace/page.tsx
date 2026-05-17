'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getCurrentUser, listLocalUsers, registerUser, loginByUserId } from '@/lib/auth';
import DraftEditorView from './features/editor/DraftEditorView';
import { useTips } from './features/tips/useTips';
import QuickCapture from './features/tips/QuickCapture';
import TipsPanel from './features/tips/TipsPanel';
import { useHomeIntelligence, type HomeIntelligenceData } from './features/home/useHomeIntelligence';
import { useDailyBrief, type DailyBriefData } from './features/home/useDailyBrief';
import { useSpotlightSearch, type SpotlightSearchResult } from './features/home/useSpotlightSearch';
import { useMindGraph } from './features/mind/useMindGraph';
import { useMindGraphInteraction } from './features/mind/useMindGraphInteraction';
import { buildSimpleMindGraphSnapshot } from './features/mind/mindSnapshotBuilder';
import MindCanvasStage from './features/mind/MindCanvasStage';
import MindRecommendationInspector from './features/mind/MindRecommendationInspector';
import {
  listActiveTips,
  convertTipToMindNode,
  syncMindFirstScreen,
  listDrafts,
  generateMindNodeRecommendations,
  upsertMindNode,
  updateArchivedEntry,
  publishDraftToDocument,
  type StoredMindNode,
} from '@/lib/repository';
import { useDockData, type DockEntityType, type DockRecommendation, type DockEntity, type DockSpace, findRelatedMindNode, executeDockEditorOpen, executeRecommendationApply, executeRecommendationReject, executeRecommendationIgnore, executeDockDiscardDraft, executeDockDiscardTip } from './features/dock/useDockData';
import { useDockViewModel, type DockViewMode } from './features/dock/useDockViewModel';
import type { StoredDraft } from '@/lib/repository'
import { emit } from '@/lib/events';
import { isRecommendationPending, isRecommendationResolved, isSupportedCandidateType, describeRecommendationAction, describeRecommendationReason, describeApplyPreview, formatConfidenceLevel, STATUS_LABELS, CANDIDATE_TYPE_LABELS } from '@/lib/recommendation-i18n';
import { getLocalHealthReport, type LocalHealthReport } from '@/lib/localHealthReport'
import { getCapabilityStatus } from '@/lib/modelProvider'
import {
  Home,
  Brain,
  Archive,
  PenTool,
  BookOpen,
  Settings,
  Search,
  Database,
  Cloud,
  Download,
  Command,
  FileText,
  CheckCircle2,
  AlertCircle,
  FolderTree,
  Activity,
  HardDrive,
  Calendar,
  Sparkles,
  X,
  Bot,
  Puzzle,
  LayoutDashboard,
  Network,
  LayoutTemplate,
  FileSignature,
  Newspaper,
  ArrowRightLeft,
  Crown,
  Layers,
  ChevronRight,
  ChevronDown,
  Kanban,
  CheckSquare,
  Target,
  Trash2,
  PieChart,
  Clock,
  Tags,
  Filter,
  Plus,
  Wand2,
  Timer,
  LayoutGrid,
  Lock,
  EyeOff,
  RotateCcw,
  Send,
} from 'lucide-react';

// ==========================================
// 设计系统组件 (Design System Components)
// ==========================================

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 毛玻璃面板基础组件
const GlassPanel = ({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={`bg-[#1c2023]/40 backdrop-blur-[20px] border-[0.5px] border-white/5 rounded-[22px] transition-all duration-200 hover:border-[#86d7ff]/30 hover:bg-[#1c2023]/60 ${className} ${onClick ? 'cursor-pointer' : ''}`}
  >
    {children}
  </div>
);

// 毛玻璃卡片组件 (内部层级)
const GlassCard = ({ children, className = "", hoverEffect = true }: { children: React.ReactNode; className?: string; hoverEffect?: boolean }) => (
  <div className={`bg-[#1c2023]/40 backdrop-blur-[16px] border-[0.5px] border-white/5 rounded-[16px] ${hoverEffect ? 'transition-all duration-200 hover:border-[#86d7ff]/30' : ''} ${className}`}>
    {children}
  </div>
);

// 标签胶囊组件
const Pill = ({ text, type = "default" }: { text: string; type?: 'design' | 'planning' | 'active' | 'research' | 'pro' | 'default' }) => {
  const styles = {
    design: "bg-[#86d7ff]/10 text-[#86d7ff] border border-[#86d7ff]/20",
    planning: "bg-[#a8c8ff]/10 text-[#a8c8ff] border border-[#a8c8ff]/20",
    active: "bg-[#9cf4d4]/10 text-[#9cf4d4] border border-[#9cf4d4]/20",
    research: "bg-[#c8a0f0]/10 text-[#c8a0f0] border border-[#c8a0f0]/20",
    pro: "bg-gradient-to-r from-[#c8a0f0]/20 to-[#86d7ff]/20 text-white border border-[#c8a0f0]/30 shadow-[0_0_10px_rgba(200,160,240,0.2)]",
    default: "bg-white/5 text-[#899298] border border-white/10"
  } as const;
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase ${styles[type]}`}>
      {text}
    </span>
  );
};

// ==========================================
// 页面视图组件 (Page Views)
// ==========================================

import type { StoredTip } from '@/lib/repository'

interface HomeViewProps {
  tips: StoredTip[]
  tipsLoading: boolean
  onConvertTipToDraft: (tipId: number) => Promise<{ tip: StoredTip | null; draftId: number | null }>
  onDiscardTip: (tipId: number) => Promise<boolean>
  onToast?: (msg: string) => void
  intelligence: HomeIntelligenceData
  intelligenceLoading: boolean
  onOpenDraft?: (draftId?: number) => void
  onOpenEntry?: (entryId?: number) => void
  onOpenDock?: () => void
  onOpenReview?: () => void
  onOpenBriefing?: () => void
  onOpenMind?: () => void
}

const HomeView = ({ tips, tipsLoading, onConvertTipToDraft, onDiscardTip, onToast, intelligence, intelligenceLoading, onOpenDraft, onOpenEntry, onOpenDock, onOpenReview, onOpenBriefing, onOpenMind }: HomeViewProps) => {
  const activeSessionCount = intelligence.mindNodeCount + intelligence.activeDraftCount + intelligence.activeTipCount
  return (
    <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* 头部标题区 */}
      <div className="mb-6 mt-2">
        <h1 className="text-3xl font-semibold mb-2 text-white tracking-tight">早上好。</h1>
        <p className="text-[#899298] text-sm">
          {intelligenceLoading
            ? '正在读取本地工作区...'
            : activeSessionCount > 0
              ? `您的本地工作区已同步。${activeSessionCount} 个活跃的思维会话。`
              : '您的本地工作区已同步。开始捕获想法吧。'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 左侧主列 */}
        <div className="col-span-1 lg:col-span-8 flex flex-col gap-4">

          {/* 活跃思维 面板 */}
          <GlassPanel className="p-5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#86d7ff]" />
                <h2 className="text-base font-medium text-white">活跃思维</h2>
              </div>
              <button onClick={onOpenDock} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold tracking-wider text-white hover:bg-white/10 transition-colors uppercase">
                新会话
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {intelligence.recentDrafts.length === 0 && intelligence.recentTips.length === 0 && intelligence.recentDocuments.length === 0 ? (
                <div className="col-span-full py-8 text-center rounded-[16px] border border-dashed border-white/5 bg-white/[0.01]">
                  <Brain className="w-6 h-6 text-[#899298]/30 mx-auto mb-2" />
                  <p className="text-[11px] text-[#899298]">暂无活跃思维</p>
                  <p className="text-[10px] text-[#899298]/60 mt-1">创建 Draft 或捕获 Tip 后将在此显示</p>
                </div>
              ) : (
                <>
                  {intelligence.recentDrafts.slice(0, 2).map((draft) => (
                    <div key={`draft-${draft.id}`} className="cursor-pointer" onClick={() => onOpenDraft?.(draft.id)}>
                    <GlassCard className="p-4 relative overflow-hidden group">
                      <div className="absolute top-3 right-3 w-1 h-1 rounded-full bg-[#9cf4d4] shadow-[0_0_6px_#9cf4d4]"></div>
                      <h3 className="text-sm text-white font-medium mb-1.5 group-hover:text-[#9cf4d4] transition-colors truncate">{draft.title || '无标题草稿'}</h3>
                      <p className="text-xs text-[#899298] mb-3 leading-relaxed truncate">{draft.content?.slice(0, 60) || '空内容'}</p>
                      <Pill text="草稿" type="active" />
                    </GlassCard>
                    </div>
                  ))}
                  {intelligence.recentTips.slice(0, 2).map((tip) => (
                    <div key={`tip-${tip.id}`} className="cursor-pointer" onClick={() => onOpenDock?.()}>
                    <GlassCard className="p-4 relative overflow-hidden group">
                      <div className="absolute top-3 right-3 w-1 h-1 rounded-full bg-[#86d7ff] shadow-[0_0_6px_#86d7ff]"></div>
                      <h3 className="text-sm text-white font-medium mb-1.5 group-hover:text-[#86d7ff] transition-colors truncate">{tip.content.slice(0, 40)}</h3>
                      <p className="text-xs text-[#899298] mb-3 leading-relaxed truncate">{tip.sourceType === 'quick-capture' ? 'Quick Capture' : '手动输入'}</p>
                      <Pill text="Tip" type="design" />
                    </GlassCard>
                    </div>
                  ))}
                  {intelligence.recentDocuments.slice(0, 2).map((doc) => (
                    <div key={`doc-${doc.id}`} className="cursor-pointer" onClick={() => onOpenEntry?.(doc.id)}>
                    <GlassCard className="p-4 relative overflow-hidden group">
                      <div className="absolute top-3 right-3 w-1 h-1 rounded-full bg-[#c8a0f0] shadow-[0_0_6px_#c8a0f0]"></div>
                      <h3 className="text-sm text-white font-medium mb-1.5 group-hover:text-[#c8a0f0] transition-colors truncate">{doc.title}</h3>
                      <p className="text-xs text-[#899298] mb-3 leading-relaxed truncate">{doc.type || '文档'}</p>
                      <Pill text="文档" type="research" />
                    </GlassCard>
                    </div>
                  ))}
                </>
              )}
            </div>
          </GlassPanel>

          {/* 最近草稿 面板 */}
          <GlassPanel className="p-5 relative">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-[#86d7ff]" />
              <h2 className="text-base font-medium text-white">最近草稿</h2>
              {!intelligenceLoading && intelligence.activeDraftCount > 0 && (
                <span className="ml-auto text-[10px] text-[#899298]">{intelligence.activeDraftCount} 篇</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {intelligenceLoading ? (
                <div className="py-4 text-center text-[9px] text-[#899298]">Loading...</div>
              ) : intelligence.recentDrafts.length === 0 ? (
                <div className="py-6 text-center rounded-[16px] border border-dashed border-white/5 bg-white/[0.01]">
                  <FileText className="w-5 h-5 text-[#899298]/30 mx-auto mb-2" />
                  <p className="text-[11px] text-[#899298]">暂无草稿</p>
                  <p className="text-[10px] text-[#899298]/60 mt-1">在 Editor 中创建 Draft 或从 Tip 转化</p>
                </div>
              ) : (
                intelligence.recentDrafts.slice(0, 3).map((draft) => (
                  <div key={draft.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => onOpenDraft?.(draft.id)}>
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#899298] group-hover:text-[#86d7ff] group-hover:border-[#86d7ff]/30 transition-all">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs text-white font-medium truncate">{draft.title || '无标题草稿'}</h4>
                      <p className="text-[10px] text-[#899298] mt-0.5">{formatRelativeTime(draft.updatedAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <TipsPanel
              tips={tips}
              loading={tipsLoading}
              onConvertToDraft={onConvertTipToDraft}
              onDiscard={onDiscardTip}
              onToast={onToast}
            />
          </GlassPanel>

        </div>

        {/* 右侧边栏列 */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-4">

          {/* 今日知识简报 */}
          <GlassPanel className="p-5">
            <h2 className="text-lg font-medium text-white mb-1">今日知识简报</h2>
            <p className="text-xs text-[#899298] mb-5">
              {intelligenceLoading
                ? '正在分析...'
                : intelligence.healthHints.length > 0
                  ? `来自分析的 ${intelligence.healthHints.length} 条建议`
                  : '工作区状态良好'}
            </p>

            <div className="flex flex-col gap-4 mb-6 relative">
              <div className="absolute left-[3px] top-2 bottom-2 w-px bg-white/5 z-0"></div>

              {intelligenceLoading ? (
                <div className="py-4 text-center text-[9px] text-[#899298]">Loading...</div>
              ) : intelligence.healthHints.length === 0 ? (
                <div className="relative z-10 pl-3 border-l-2 border-[#9cf4d4]">
                  <h4 className="text-xs text-white font-medium">一切就绪</h4>
                  <p className="text-[10px] text-[#899298] mt-0.5">当前无待处理事项</p>
                </div>
              ) : (
                intelligence.healthHints.map((hint, i) => (
                  <div key={i} className={`relative z-10 pl-3 border-l-2 ${i === 0 ? 'border-[#86d7ff]' : 'border-[#899298] opacity-70'}`}>
                    <h4 className="text-xs text-white font-medium">{hint}</h4>
                  </div>
                ))
              )}
            </div>

            <button onClick={onOpenBriefing} className="w-full py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold tracking-wider text-white hover:bg-white/10 transition-colors uppercase">
              打开每日简报
            </button>
          </GlassPanel>

          {/* 每周回顾提醒 */}
          <GlassPanel className="p-5 cursor-pointer group" onClick={onOpenReview}>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] font-semibold tracking-wider text-[#899298] uppercase mb-1">健康报告</p>
                <h3 className="text-base font-medium text-white mb-0.5 group-hover:text-[#86d7ff] transition-colors">健康报告</h3>
                <p className="text-[11px] text-[#899298]">查看工作区健康度与维护建议。</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#86d7ff]/20 transition-colors">
                <span className="text-white text-sm leading-none group-hover:text-[#86d7ff] transition-colors">→</span>
              </div>
            </div>
          </GlassPanel>

          {/* 思维图谱入口 */}
          {intelligence.mindNodeCount > 0 && (
            <GlassPanel className="p-5 cursor-pointer group" onClick={() => onOpenMind?.()}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[9px] font-semibold tracking-wider text-[#899298] uppercase mb-1">思维图谱</p>
                  <h3 className="text-base font-medium text-white mb-0.5 group-hover:text-[#86d7ff] transition-colors">Mind</h3>
                  <p className="text-[11px] text-[#899298]">{intelligence.mindNodeCount} 个节点 · {intelligence.mindEdgeCount} 条连线</p>
                </div>
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#86d7ff]/20 transition-colors">
                  <Brain className="w-4 h-4 text-[#899298] group-hover:text-[#86d7ff] transition-colors" />
                </div>
              </div>
            </GlassPanel>
          )}

          {/* 待处理数据包 */}
          <GlassPanel className="p-5 cursor-pointer group" onClick={onOpenDock}>
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-white" />
                <h2 className="text-base font-medium text-white">待处理数据包</h2>
              </div>
              <span className="w-4 h-4 rounded-full bg-white/10 text-[9px] flex items-center justify-center text-white">{intelligence.activeTipCount}</span>
            </div>
            <p className="text-[11px] text-[#899298] mb-4">传入的数据等待分拣到您的停靠区。</p>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center justify-center py-2 rounded-xl bg-white/5 border border-white/5 gap-1.5">
                <span className="text-sm font-bold text-white">{intelligence.activeTipCount}</span>
                <span className="text-[10px] font-medium text-[#899298]">Tips</span>
              </div>
              <div className="flex flex-col items-center justify-center py-2 rounded-xl bg-white/5 border border-white/5 gap-1.5">
                <span className="text-sm font-bold text-[#9cf4d4]">{intelligence.activeDraftCount}</span>
                <span className="text-[10px] font-medium text-[#899298]">Drafts</span>
              </div>
              <div className="flex flex-col items-center justify-center py-2 rounded-xl bg-white/5 border border-white/5 gap-1.5">
                <span className="text-sm font-bold text-[#86d7ff]">{intelligence.documentCount}</span>
                <span className="text-[10px] font-medium text-[#899298]">文档</span>
              </div>
            </div>
          </GlassPanel>

        </div>
      </div>
    </div>
  );
};

// 1.5 工具箱/扩展视图 (Toolbox View) - 应用市场/展位页
// 此处为Mock功能，等待后端接入 — 工具列表、订阅状态均为Mock数据
const ToolboxView = () => {
  const tools = [
    { id: 'llm', title: 'LLM 核心接入', desc: '配置 OpenAI, Anthropic 或本地开源大模型的 API 密钥，解锁全局 AI 辅助生成与总结。', icon: Bot, isPro: true },
    { id: 'plugins', title: '插件中心', desc: '浏览并安装由社区和官方提供的扩展应用，打造符合个人工作流的专属生态。', icon: Puzzle, isPro: false },
    { id: 'home_custom', title: '首页模块定制', desc: '自由拖拽排列今日视图卡片，添加数据仪表盘、习惯追踪等个性化组件。', icon: Layers, isPro: true },
    { id: 'mind_custom', title: 'Mind 视图引擎', desc: '升级神经图谱渲染算法，自定义节点引力场、连线逻辑及 3D 拓扑结构。', icon: Network, isPro: true },
    { id: 'dock_template', title: 'Dock 结构模板', desc: '一键导入行业标准的知识库结构模板，如 PARA, Zettelkasten 或 P.A.C.T。', icon: LayoutTemplate, isPro: true },
    { id: 'editor_paper', title: 'Editor 纸张材质', desc: '解锁羊皮纸、深色方格本、工程图纸等沉浸式书写背景主题和高阶排版。', icon: FileSignature, isPro: true },
    { id: 'brief_custom', title: '简报生成定制', desc: '自定义每日知识简报的 AI 总结 Prompt 和数据抓取源，精准聚焦核心信息。', icon: Newspaper, isPro: true },
    { id: 'widgets', title: '系统小组件', desc: '将 Atlax 核心数据与捕获入口直接嵌入到您的 OS 桌面或菜单栏中。', icon: LayoutDashboard, isPro: true },
    { id: 'io_control', title: '导入导出总控', desc: '完整的数据流控中心，支持批量 Markdown、PDF 甚至外部数据库级无损迁移。', icon: ArrowRightLeft, isPro: false },
  ];

  return (
    <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* 头部 Banner */}
      <GlassPanel className="p-8 mb-8 relative overflow-hidden bg-gradient-to-br from-[#1c2023] to-[#0b0f11]">
        <div className="absolute top-[-50%] right-[-10%] w-[50%] h-[200%] bg-gradient-to-b from-[#86d7ff]/10 via-[#c8a0f0]/10 to-transparent rotate-12 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-[#c8a0f0]" />
            <span className="text-[#c8a0f0] text-xs font-semibold tracking-widest uppercase">App Market & Plugins</span>
          </div>
          <h1 className="text-4xl font-semibold mb-4 text-white tracking-tight">Atlax 扩展引擎</h1>
          <p className="text-[#899298] text-sm leading-relaxed mb-6">
            这是您的数字基建指挥中心。浏览、安装并订阅高级模块，将默认工作区改造为您专属的终极生产力系统。强大的定制能力，只为更深度的思考。
          </p>
          <div className="flex gap-4">
            <button className="px-5 py-2 rounded-full bg-white text-[#0b0f11] text-xs font-semibold hover:bg-white/90 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              浏览所有插件
            </button>
            <button className="px-5 py-2 rounded-full bg-transparent border border-white/20 text-white text-xs font-semibold hover:bg-white/5 transition-colors">
              管理已订阅服务
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* 工具分类网格 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">精选模块与服务</h2>
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded-full bg-white/10 text-white text-[10px] font-medium cursor-pointer">全部</span>
          <span className="px-3 py-1 rounded-full text-[#899298] hover:text-white text-[10px] font-medium cursor-pointer transition-colors">UI 定制</span>
          <span className="px-3 py-1 rounded-full text-[#899298] hover:text-white text-[10px] font-medium cursor-pointer transition-colors">AI 服务</span>
          <span className="px-3 py-1 rounded-full text-[#899298] hover:text-white text-[10px] font-medium cursor-pointer transition-colors">数据与云</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tools.map((tool) => (
          <GlassPanel key={tool.id} className="p-5 flex flex-col h-full group hover:-translate-y-1 transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[#86d7ff]/10 group-hover:border-[#86d7ff]/30 group-hover:text-[#86d7ff] text-[#899298] transition-all">
                <tool.icon className="w-5 h-5" />
              </div>
              {tool.isPro && (
                <div className="flex items-center gap-1 bg-gradient-to-r from-[#c8a0f0]/20 to-[#86d7ff]/20 text-white border border-[#c8a0f0]/30 shadow-[0_0_10px_rgba(200,160,240,0.1)] px-2 py-1 rounded-full">
                  <Crown className="w-3 h-3 text-[#c8a0f0]" />
                  <span className="text-[9px] font-bold tracking-wider uppercase">Pro</span>
                </div>
              )}
            </div>

            <h3 className="text-base text-white font-medium mb-2 group-hover:text-[#86d7ff] transition-colors">{tool.title}</h3>
            <p className="text-xs text-[#899298] leading-relaxed mb-6 flex-1">
              {tool.desc}
            </p>

            <div className="mt-auto">
              <button disabled className={`w-full py-2 rounded-lg text-xs font-semibold transition-all cursor-not-allowed opacity-50 ${tool.isPro
                  ? 'bg-[#c8a0f0]/10 text-[#c8a0f0] border border-[#c8a0f0]/20'
                  : 'bg-white/5 text-[#899298] border border-white/10'
                }`}>
                {tool.isPro ? 'Pro · Preview' : 'Preview'}
              </button>
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
};


// ==========================================
// 2. 思维视图 (Mind View) - 专业图谱可视化系统
// 使用 MindCanvasStage + MindGraphView 渲染中心图谱
// ==========================================

interface DockQueueItem {
  key: string
  label: string
  color: string
  badge: string
  badgeIcon: string
  isSelected: boolean
  selectedBg: string
  hoverGroupBg: string
  hoverGroupText: string
  selectedText: string
  onClick: () => void
}

function DockQueueSection({ title, color, count, items, defaultOpen = true }: {
  title: string
  color: string
  count: number
  items: DockQueueItem[]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronRight className={`w-3 h-3 text-[#6b7280] transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{title}</span>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color: `${color}aa` }}>{count}</span>
      </button>
      {open && count > 0 && (
        <div className="space-y-1 pl-2 mt-1">
          {items.map(item => (
            <div key={item.key} onClick={item.onClick}
              className={`p-2.5 rounded-lg border cursor-pointer transition-all group ${item.isSelected ? item.selectedBg : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[9px] font-bold text-white/30 uppercase tracking-tight">{item.badge}</span>
                </div>
                <div className={`w-5 h-5 rounded flex items-center justify-center bg-white/5 border border-white/10 ${item.hoverGroupBg} ${item.hoverGroupText} transition-all`}>
                  <span className="text-[9px] font-bold text-[#8d989f]">{item.badgeIcon}</span>
                </div>
              </div>
              <h4 className={`text-[11px] font-medium leading-tight line-clamp-2 ${item.isSelected ? item.selectedText : 'text-white/70'}`}>{item.label}</h4>
            </div>
          ))}
        </div>
      )}
      {open && count === 0 && (
        <div className="pl-6 py-2 text-[10px] text-white/20">暂无</div>
      )}
    </div>
  )
}

const MindView = ({ userId, onToast, onSelectionChange, onOpenEditor, initialFocusNodeId, onFocusNodeConsumed }: { userId: string; onToast: (msg: string) => void, onSelectionChange: (selected: boolean) => void, onOpenEditor?: (documentId: number, sourceType: 'draft' | 'document') => void, initialFocusNodeId?: string | null, onFocusNodeConsumed?: () => void }) => {
  const { nodes: mindNodes, edges: mindEdges, loading, onNodeDragEnd, onDeleteEdge, onCreateEdge, onArchiveNode, onRestoreNode, onChangeParent, hiddenNodes, refresh: refreshMindGraph } = useMindGraph(userId);
  const interaction = useMindGraphInteraction();
  const { state: ixState, actions: ixActions } = interaction;
  const [showHiddenNodesPanel, setShowHiddenNodesPanel] = useState(false);

  useEffect(() => {
    onSelectionChange(!!ixState.selectedNodeId);
  }, [ixState.selectedNodeId, onSelectionChange]);

  useEffect(() => {
    if (!initialFocusNodeId) return
    if (loading || mindNodes.length === 0) return
    const nodeExists = mindNodes.some(n => n.id === initialFocusNodeId)
    if (nodeExists) {
      ixActions.setSelectedNode(initialFocusNodeId)
      ixActions.setFocusedNode(initialFocusNodeId)
      setSelectedNodeId(initialFocusNodeId)
    }
    onFocusNodeConsumed?.()
  }, [initialFocusNodeId, loading, mindNodes, ixActions, onFocusNodeConsumed])

  useEffect(() => {
    if (!userId) return;
    syncMindFirstScreen(userId).then((result) => {
      const hasNew = result.documentNodesCreated > 0
        || result.projectNodesCreated > 0
        || result.tagNodesCreated > 0
        || result.edgesCreated > 0
      if (hasNew) {
        emit({ type: 'mind_node_created', nodeId: `first-screen-sync-${Date.now()}` });
      }
    }).catch(() => {});
  }, [userId]);
  
  const [unlinkedThoughts, setUnlinkedThoughts] = useState<StoredTip[]>([]);
  const [dockDrafts, setDockDrafts] = useState<StoredDraft[]>([]);
  const [activeThought, setActiveThought] = useState<StoredTip | null>(null);
  const [activeDockDraft, setActiveDockDraft] = useState<StoredDraft | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    listActiveTips(userId).then(tips => setUnlinkedThoughts(tips)).catch(() => {});
    listDrafts(userId).then(drafts => setDockDrafts(drafts.filter(d => !d.sourceEntryId))).catch(() => {});
  }, [userId]);

  // Build snapshot from real data
  const snapshot = useMemo(() => {
    if (loading || mindNodes.length === 0) return null;
    return buildSimpleMindGraphSnapshot(mindNodes, mindEdges);
  }, [mindNodes, mindEdges, loading]);

  const viewScopeCounts = useMemo(() => {
    if (!snapshot) return { focusMap: 0, clusterMap: 0, linkReview: 0, driftDock: 0, timelineSnapshot: 0 };
    const parentTypes = new Set(['root', 'domain', 'project', 'topic']);
    const connectedNodeIds = new Set<string>();
    snapshot.edges.forEach(e => {
      connectedNodeIds.add(e.sourceNodeId);
      connectedNodeIds.add(e.targetNodeId);
    });
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return {
      focusMap: snapshot.nodes.length,
      clusterMap: snapshot.nodes.filter(n => parentTypes.has(n.nodeType)).length,
      linkReview: snapshot.edges.filter(e => e.edgeType === 'suggested').length,
      driftDock: snapshot.nodes.filter(n => !connectedNodeIds.has(n.id) && n.nodeType !== 'root').length,
      timelineSnapshot: snapshot.nodes.filter(n => {
        const ts = n.updatedAt ?? n.createdAt;
        if (ts != null) return now - ts < sevenDaysMs;
        return false;
      }).length,
    };
  }, [snapshot]);

  // Node color for right panel badges
  const getNodeColor = useCallback((nodeType: string) => {
    switch (nodeType) {
      case 'root': case 'world_tree': return '#c4b5fd';
      case 'domain': case 'project': return '#8b5cf6';
      case 'topic': return '#a78bfa';
      case 'document': return '#bbf7d0';
      default: return '#9ca3af';
    }
  }, []);

  // Get selected node info from snapshot
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !snapshot) return null;
    const node = snapshot.nodes.find(n => n.id === selectedNodeId);
    if (!node) return null;
    const connections = snapshot.edges
      .filter(e => e.sourceNodeId === selectedNodeId || e.targetNodeId === selectedNodeId)
      .map(e => {
        const otherId = e.sourceNodeId === selectedNodeId ? e.targetNodeId : e.sourceNodeId;
        const otherNode = snapshot.nodes.find(n => n.id === otherId);
        return {
          id: otherId,
          label: otherNode?.label ?? '',
          type: e.edgeType,
          nodeType: otherNode?.nodeType ?? '',
          edgeId: e.id,
          edgeType: e.edgeType,
          reason: e.reason,
          isBaseline: e.reason === 'baseline-auto-connect',
        };
      });
    return { ...node, connections };
  }, [selectedNodeId, snapshot]);

  const injectThought = useCallback(async () => {
    if (!activeThought) return;
    try {
      const result = await convertTipToMindNode(userId, activeThought.id);
      if (!result.mindNode || !result.tip) {
        onToast('注入失败');
        return;
      }
      emit({ type: 'mind_node_created', nodeId: result.mindNode.id });
      setUnlinkedThoughts(prev => prev.filter(t => t.id !== activeThought.id));
      setActiveThought(null);
      onToast('已注入图谱');
    } catch {
      onToast('注入失败');
    }
  }, [activeThought, userId, onToast]);

  const handleSuggest = useCallback(async () => {
    if (!snapshot || snapshot.nodes.length === 0) {
      onToast('图谱中暂无节点，无法生成推荐');
      return;
    }
    const targetId = ixState.selectedNodeId
      || ixState.focusedNodeId
      || ixState.scopeTargetId;
    const targetNode = targetId
      ? snapshot.nodes.find(n => n.id === targetId)
      : null;
    if (!targetNode || targetNode.nodeType === 'root') {
      onToast('请先选中或聚焦一个节点');
      return;
    }
    try {
      const recs = await generateMindNodeRecommendations(userId, targetNode.id, 5);
      if (recs.length === 0) {
        onToast('暂无新的推荐');
      } else {
        onToast(`已为「${targetNode.label}」生成 ${recs.length} 条推荐`);
        emit({ type: 'mind_edge_created', edgeId: `suggested-${targetNode.id}` });
      }
    } catch {
      onToast('推荐生成失败');
    }
  }, [snapshot, userId, onToast, ixState.selectedNodeId, ixState.focusedNodeId, ixState.scopeTargetId]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0b0f11] animate-in fade-in duration-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
            <Brain className="w-5 h-5 text-[#86d7ff]" />
          </div>
          <span className="text-xs text-[#899298]">加载思维图谱...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex animate-in fade-in duration-500 bg-[#0b0f11] text-[#e6eaed] overflow-hidden divide-x divide-white/[0.07] border-t border-white/[0.07]">

      {/* Left Pane: SCOPE / QUEUE */}
      <div className="w-[260px] bg-[#0d1215] flex flex-col shrink-0 overflow-hidden">
        {/* Upper Section: SCOPE */}
        <div className="p-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <div className="text-[10px] font-bold text-[#8d989f] uppercase tracking-widest">范围 / 队列</div>
              <h2 className="text-[16px] font-bold text-white leading-tight">知识图谱</h2>
            </div>
          </div>

          <div className="space-y-1">
            {[
              { id: 'focusMap', label: '聚焦视图', icon: <Sparkles size={14} />, count: viewScopeCounts.focusMap },
              { id: 'clusterMap', label: '聚类视图', icon: <LayoutGrid size={14} />, count: viewScopeCounts.clusterMap },
              { id: 'linkReview', label: '链接审核', icon: <Network size={14} />, count: viewScopeCounts.linkReview },
              { id: 'driftDock', label: '散点视图', icon: <AlertCircle size={14} />, count: viewScopeCounts.driftDock },
              { id: 'timelineSnapshot', label: '时间快照', icon: <Timer size={14} />, count: viewScopeCounts.timelineSnapshot },
            ].map(scope => {
              const isSelected = ixState.viewScope === scope.id;
              return (
                <div 
                  key={scope.id}
                  onClick={() => ixActions.setViewScope(scope.id as any)}
                  className={`flex items-center justify-between px-3 h-9 rounded-lg cursor-pointer transition-all ${
                    isSelected ? 'bg-[#86d7ff]/10 text-[#86d7ff] border border-[#86d7ff]/20' : 'text-[#8d989f] hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={isSelected ? 'text-[#86d7ff]' : 'text-[#8d989f]'}>{scope.icon}</div>
                    <span className="text-[12px] font-medium">{scope.label}</span>
                  </div>
                  <span className="text-[10px] font-bold opacity-60">{scope.count}</span>
                </div>
              );
            })}

            <div
              onClick={() => setShowHiddenNodesPanel(prev => !prev)}
              className={`flex items-center justify-between px-3 h-9 rounded-lg cursor-pointer transition-all ${
                showHiddenNodesPanel ? 'bg-[#8d989f]/10 text-[#8d989f] border border-[#8d989f]/20' : 'text-[#8d989f] hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <EyeOff size={14} />
                <span className="text-[12px] font-medium">隐藏节点</span>
              </div>
              <span className="text-[10px] font-bold opacity-60">{hiddenNodes?.length ?? 0}</span>
            </div>

            {showHiddenNodesPanel && hiddenNodes && hiddenNodes.length > 0 && (
              <div className="mt-1 space-y-0.5 max-h-[240px] overflow-y-auto custom-scrollbar rounded-lg bg-white/[0.02] border border-white/[0.05] p-1.5">
                {hiddenNodes.map(node => {
                  const hiddenAt = (node.metadata as Record<string, unknown> | null)?.hiddenAt as string | undefined
                  const isRecent = hiddenAt ? (Date.now() - new Date(hiddenAt).getTime()) < 24 * 60 * 60 * 1000 : false
                  return (
                    <div key={node.id} className={`flex flex-col gap-1 px-2.5 py-2 rounded-lg transition-colors ${isRecent ? 'bg-[#86d7ff]/5' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#e0e3e6] truncate">{node.label}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onRestoreNode?.(node.id).then((result) => {
                              if (result.success) onToast('节点已恢复到图谱')
                              else onToast(result.error || '恢复失败')
                            })
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#86d7ff]/10 hover:bg-[#86d7ff]/20 text-[#86d7ff] transition-colors"
                        >
                          <RotateCcw size={10} />
                          <span className="text-[9px] font-bold">恢复</span>
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] ${isRecent ? 'text-[#c8a0f0]' : 'text-[#4a5568]'}`}>
                          {node.nodeType}
                        </span>
                        {hiddenAt && (
                          <span className="text-[8px] text-[#4a5568]">
                            {new Date(hiddenAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {showHiddenNodesPanel && (!hiddenNodes || hiddenNodes.length === 0) && (
              <div className="mt-1 px-3 py-4 text-center">
                <EyeOff size={16} className="mx-auto mb-2 text-[#4a5568]" />
                <span className="text-[11px] text-[#4a5568]">暂无隐藏节点</span>
              </div>
            )}
          </div>
        </div>

        {/* Lower Section: QUEUE (Dock) — 折叠式 */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold text-[#4a5568] uppercase tracking-widest">待整理队列</span>
            <span className="text-[10px] text-[#4a5568]">{unlinkedThoughts.length + dockDrafts.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4 space-y-1">
            <DockQueueSection
              title="Drafts"
              color="#fbbf24"
              count={dockDrafts.length}
              items={dockDrafts.map(d => ({
                key: `draft-${d.id}`,
                label: d.title || 'Untitled',
                color: '#fbbf24',
                badge: 'draft',
                badgeIcon: '✎',
                isSelected: activeDockDraft?.id === d.id,
                selectedBg: 'bg-[#fbbf24]/10 border-[#fbbf24]/30',
                hoverGroupBg: 'group-hover:bg-[#fbbf24]/20 group-hover:border-[#fbbf24]/30',
                hoverGroupText: 'group-hover:text-[#fbbf24]',
                selectedText: 'text-[#fbbf24]',
                onClick: () => { setActiveDockDraft(d); setActiveThought(null); setSelectedNodeId(null) },
              }))}
            />
            <DockQueueSection
              title="Tips"
              color="#86d7ff"
              count={unlinkedThoughts.length}
              items={unlinkedThoughts.map(t => {
                const colorMap: Record<string, string> = { text: '#86d7ff', manual: '#9cf4d4', 'quick-capture': '#c8a0f0' };
                const c = colorMap[t.sourceType] || '#86d7ff';
                return {
                  key: `tip-${t.id}`,
                  label: t.content,
                  color: c,
                  badge: t.sourceType,
                  badgeIcon: '+1',
                  isSelected: activeThought?.id === t.id,
                  selectedBg: 'bg-[#86d7ff]/10 border-[#86d7ff]/30',
                  hoverGroupBg: 'group-hover:bg-[#86d7ff]/20 group-hover:border-[#86d7ff]/30',
                  hoverGroupText: 'group-hover:text-[#86d7ff]',
                  selectedText: 'text-[#86d7ff]',
                  onClick: () => { setActiveThought(t); setActiveDockDraft(null); setSelectedNodeId(null) },
                };
              })}
            />
          </div>
        </div>
      </div>

      {/* Center Pane: 专业图谱画布 (Mind Canvas) — 使用 MindCanvasStage */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0b0f11] relative">
        <MindCanvasStage
          nodes={mindNodes}
          edges={mindEdges}
          snapshot={snapshot}
          interaction={interaction}
          loading={loading}
          onOpenEditor={(documentId: number, sourceType: 'draft' | 'document') => {
            onOpenEditor?.(documentId, sourceType)
          }}
          onSelectNode={(id) => {
            setSelectedNodeId(id);
            if (id) setActiveThought(null);
          }}
          onToast={onToast}
          onNodeDragEnd={onNodeDragEnd}
          onDeleteEdge={onDeleteEdge}
          onCreateEdge={onCreateEdge}
          onArchiveNode={onArchiveNode}
          onRestoreNode={onRestoreNode}
          onChangeParent={onChangeParent}
          hiddenNodes={hiddenNodes?.map(n => ({ id: n.id, label: n.label, nodeType: n.nodeType, hiddenAt: (n.metadata as Record<string, unknown> | null)?.hiddenAt as string | undefined }))}
          onSuggest={handleSuggest}
          activeModule="mind"
        />
      </div>

      {/* Right Pane: 节点详情面板 (图五) 或 AI 蒸馏面板 */}
      {(selectedNode || activeThought || activeDockDraft) && (
        <div className="w-[300px] bg-[#0d1215] flex flex-col shrink-0 relative overflow-hidden border-l border-white/[0.07] animate-in slide-in-from-right duration-300">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#86d7ff] to-[#c8a0f0]"></div>

          {selectedNode ? (
            <div className="flex flex-col h-full min-h-0">
              <div className="shrink-0 p-5 border-b border-white/[0.07]">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Node Details
                  </div>
                  <button onClick={() => setSelectedNodeId(null)} className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                    <X className="w-3.5 h-3.5 text-[#8d989f]" />
                  </button>
                </div>
                <h3 className="text-[16px] font-semibold text-white leading-tight mb-2">{selectedNode.label}</h3>
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 rounded bg-gradient-to-r from-[#c8a0f0]/20 to-[#86d7ff]/20 text-[#c8a0f0] border border-[#c8a0f0]/30 text-[10px] font-medium capitalize">
                    {selectedNode.nodeType.replace('_', ' / ')}
                  </span>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="px-5 pt-4 pb-2">
                  <h4 className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider mb-2">Connected Nodes</h4>
                  {selectedNode.connections.length > 0 ? (
                    <div className="divide-y divide-white/[0.04]">
                      {selectedNode.connections.map(conn => (
                        <div key={conn.edgeId} className="group flex items-center gap-2.5 py-1.5 hover:bg-white/[0.03] transition-colors -mx-1 px-1 rounded">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getNodeColor(conn.nodeType) }}></div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[12px] text-[#e0e3e6] truncate block">{conn.label}</span>
                            <div className="flex items-center gap-1.5 mt-px">
                              <span className="text-[9px] text-[#6b7280] capitalize">{conn.edgeType.replace('_', '-')}</span>
                              {conn.isBaseline && (
                                <span className="text-[8px] text-[#86d7ff]/60">baseline</span>
                              )}
                            </div>
                          </div>
                          {conn.isBaseline ? (
                            <Lock className="w-3 h-3 text-white/10 shrink-0" />
                          ) : (
                            <button
                              onClick={() => {
                                if (onDeleteEdge) {
                                  onDeleteEdge(conn.edgeId)
                                }
                              }}
                              className="p-0.5 rounded text-white/0 group-hover:text-white/30 hover:!text-[#ffb4ab] transition-colors shrink-0"
                              title="取消链接"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#8d989f] py-4">暂无连接</div>
                  )}
                </div>

                <div className="px-5 pt-3 pb-4">
                  <MindRecommendationInspector
                    userId={userId}
                    nodeId={selectedNode.id}
                    onToast={onToast}
                    onRefreshGraph={refreshMindGraph}
                  />
                </div>
              </div>

              <div className="shrink-0 p-5 border-t border-white/[0.07] space-y-2">
                <button onClick={() => { if (selectedNode?.documentId != null) { const st = (selectedNode.metadata?.sourceType as 'draft' | 'document') ?? 'document'; onOpenEditor?.(selectedNode.documentId, st) } }} className="w-full h-[36px] rounded-lg bg-white text-[#0b0f11] text-[12px] font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                  <PenTool className="w-4 h-4" /> Open in Editor
                </button>
                <button onClick={() => setSelectedNodeId(null)} className="w-full h-[32px] rounded-lg bg-white/5 text-[#8d989f] text-[11px] font-medium hover:bg-white/10 transition-colors">
                  Close Details
                </button>
              </div>
            </div>
          ) : activeDockDraft ? (
            <div className="flex flex-col h-full p-5 overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#fbbf24' }}></div>
                  <span className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider">Draft</span>
                </div>
                <button onClick={() => setActiveDockDraft(null)} className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <X className="w-3.5 h-3.5 text-[#8d989f]" />
                </button>
              </div>

              <h3 className="text-[16px] font-semibold text-white leading-tight mb-2">{activeDockDraft.title || 'Untitled'}</h3>
              {activeDockDraft.content && (
                <p className="text-[12px] text-[#8d989f] leading-relaxed mb-4 line-clamp-4">{activeDockDraft.content.slice(0, 200)}</p>
              )}

              <div className="bg-[#fbbf24]/[0.05] border border-[#fbbf24]/20 rounded-[12px] p-4 mb-4">
                <h4 className="text-[10px] font-bold text-[#fbbf24] uppercase tracking-wider mb-2">草稿预览</h4>
                <p className="text-[11px] text-[#e0e3e6] leading-relaxed mb-4">
                  此草稿尚未发布为正式文档。发布后将自动在图谱中生成对应节点。
                </p>
                <button onClick={() => { if (activeDockDraft) { onOpenEditor?.(activeDockDraft.id, 'draft'); setActiveDockDraft(null) } }}
                  className="w-full h-[32px] rounded-[8px] bg-[#fbbf24]/20 border border-[#fbbf24]/30 text-white text-[12px] font-medium hover:bg-[#fbbf24]/30 transition-all flex items-center justify-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" /> 打开编辑器
                </button>
              </div>

              <div className="text-[11px] text-[#8d989f] leading-relaxed bg-[#151a1e] p-3 rounded-lg border border-white/5">
                提示：草稿不会出现在图谱中，发布为正式文档后才会生成图谱节点。您可以在编辑器中继续编写后发布。
              </div>
            </div>
          ) : (
            /* AI 蒸馏面板 */
            <div className="flex flex-col h-full p-5 overflow-y-auto custom-scrollbar">
              <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider flex items-center gap-1.5 mb-5 mt-1">
                <Wand2 className="w-3.5 h-3.5" /> Neural Distillation
              </div>

              <h3 className="text-[16px] font-semibold text-white leading-tight mb-2.5">{activeThought?.content.slice(0, 60)}</h3>
              <div className="flex gap-2 mb-6">
                <span className="px-2 py-0.5 rounded bg-white/5 border border-white/[0.07] text-[10px] text-[#8d989f]">{activeThought?.sourceType}</span>
              </div>

              <div className="bg-[#c8a0f0]/[0.05] border border-[#c8a0f0]/20 rounded-[12px] p-4 mb-4">
                <h4 className="text-[10px] font-bold text-[#c8a0f0] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" /> 知识库映射分析
                </h4>
                <p className="text-[11px] text-[#e0e3e6] leading-relaxed mb-4">
                  基于内容语义，此对象高度契合当前图谱。AI 推荐将其作为子节点挂载。
                </p>
                <button onClick={injectThought}
                  className="w-full h-[32px] rounded-[8px] bg-gradient-to-r from-[#86d7ff]/20 to-[#c8a0f0]/20 border border-[#c8a0f0]/30 text-white text-[12px] font-medium hover:from-[#86d7ff]/30 hover:to-[#c8a0f0]/30 transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(200,160,240,0.15)]">
                  <Plus className="w-3.5 h-3.5" /> 接受并注入图谱 (Inject)
                </button>
              </div>

              <div className="text-[11px] text-[#8d989f] leading-relaxed bg-[#151a1e] p-3 rounded-lg border border-white/5">
                提示：您也可以点击此面板外的空白处取消选中，或在左侧列表选取其他思绪。注入后将自动生成对应的结构化文档草稿。
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};




// ==========================================
// 停靠区子视图 (Dock Sub-views)
// ==========================================

// 3. 停靠区视图 (Dock View) — 知识结构控制台
// Phase 3.2 DOCK-REAL-002: 真实 Recommendation Queue + Apply/Reject/Ignore + Inspector Actions
const DockView = ({ userId, onOpenEditor, onToast, onFocusMindNode, initialHealthFilter }: {
  userId: string
  onOpenEditor?: (documentId: number, sourceType: 'draft' | 'document') => void
  onToast?: (msg: string) => void
  onFocusMindNode?: (nodeId: string) => void
  initialHealthFilter?: string | null
}) => {
  const { data: dockData, loading: dockLoading, error: dockError, refresh: dockRefresh } = useDockData(userId);
  const vm = useDockViewModel(userId);
  const [selectedEntityId, setSelectedEntityId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialHealthFilter) {
      vm.setDockMode('health', initialHealthFilter as any);
    }
  }, [initialHealthFilter]);
  const [selectedRecId, setSelectedRecId] = React.useState<string | null>(null);
  const [relatedMindNode, setRelatedMindNode] = React.useState<StoredMindNode | null>(null);
  const [recActionLoading, setRecActionLoading] = React.useState<string | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [proPreviewOpen, setProPreviewOpen] = React.useState(false);
  const [recPreviewOpen, setRecPreviewOpen] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const spaces = dockData.spaces;
  const selectedSpace = spaces.find(s => s.id === vm.filter.spaceId) || spaces[0] || null;

  const pendingRecs = dockData.recommendations.filter(r => isRecommendationPending(r.status));

  const recommendationsMap = React.useMemo(() => {
    const map = new Map<string, number>()
    dockData.recommendations.filter(r => isRecommendationPending(r.status)).forEach(r => {
      const key = String(r.subjectId)
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return map
  }, [dockData.recommendations])

  const recEntityIds = React.useMemo(() => {
    const ids = new Set<string>()
    const pendingRecs = dockData.recommendations.filter(r => isRecommendationPending(r.status))
    pendingRecs.forEach(r => {
      const sid = String(r.subjectId)
      dockData.entities.forEach(e => {
        const eid = String(e.entryId ?? e.draftId ?? e.tipId ?? e.mindNodeId ?? e.collectionId ?? e.tagId ?? '')
        if (eid && eid === sid) ids.add(e.id)
      })
    })
    return ids
  }, [dockData.recommendations, dockData.entities])

  const duplicateTagNames = React.useMemo(() => {
    return new Set(dockData.healthDetails.duplicateTags.map(t => t.name.toLowerCase()))
  }, [dockData.healthDetails.duplicateTags])

  const filteredEntities = React.useMemo(() => {
    let result = dockData.entities
    
    const targetSpace = vm.filter.spaceId !== null 
      ? dockData.spaces.find(s => s.id === vm.filter.spaceId) || null
      : null

    const matchesSpace = (e: DockEntity, space: DockSpace) => {
      if (e.type === 'document') return e.project === space.name
      if (e.type === 'collection') return e.collectionId === space.id || e.title === space.name
      if (e.type === 'mindNode') {
        if (e.subtitle === 'project') return e.title === space.name
        if (e.subtitle === 'document' && e.documentId) {
          const doc = dockData.rawEntries.find(entry => entry.id === e.documentId)
          return doc?.project === space.name
        }
        return false
      }
      if (e.type === 'tag' && e.title) {
        const tagName = e.title.toLowerCase()
        return dockData.rawEntries.some(doc => 
          doc.project === space.name && 
          doc.tags?.some(t => t.toLowerCase() === tagName)
        )
      }
      return false
    }

    if (vm.dockMode === 'unsorted') {
      result = result.filter(e =>
        e.type === 'tip' ||
        e.type === 'draft' ||
        (e.type === 'document' && (!e.project || e.project === ''))
      )
    } else if (vm.dockMode === 'spaces') {
      if (targetSpace) {
        result = result.filter(e => matchesSpace(e, targetSpace))
      } else {
        result = result.filter(e => e.type === 'collection' || e.type === 'tag' || (e.type === 'mindNode' && (e.subtitle === 'project' || e.subtitle === 'domain')))
      }
    } else if (vm.dockMode === 'recommendations') {
      result = result.filter(e => recEntityIds.has(e.id))
    } else if (vm.dockMode === 'health') {
      if (vm.filter.healthFilter === 'isolated') {
        const isolatedIds = new Set(dockData.healthDetails.isolatedNodes.map(n => `mind-${n.id}`))
        result = result.filter(e => isolatedIds.has(e.id))
      } else if (vm.filter.healthFilter === 'stagnant') {
        const stagnantDraftIds = new Set(dockData.healthDetails.stagnantItems.filter(i => 'title' in i).map(i => `draft-${(i as unknown as { id: number }).id}`))
        const stagnantTipIds = new Set(dockData.healthDetails.stagnantItems.filter(i => !('title' in i)).map(i => `tip-${(i as unknown as { id: number }).id}`))
        result = result.filter(e => stagnantDraftIds.has(e.id) || stagnantTipIds.has(e.id))
      } else if (vm.filter.healthFilter === 'duplicates') {
        result = result.filter(e => {
          if (e.type === 'tag' && e.title && duplicateTagNames.has(e.title.toLowerCase())) return true
          if (e.tags && e.tags.some(t => duplicateTagNames.has(t.toLowerCase()))) return true
          return false
        })
      } else if (vm.filter.healthFilter === 'weaklyClassified') {
        const weakEntryIds = new Set(dockData.healthDetails.weaklyClassifiedEntries.map(e => `entry-${e.id}`))
        result = result.filter(e => weakEntryIds.has(e.id))
      }
    }

    if (targetSpace && vm.dockMode !== 'spaces') {
      result = result.filter(e => matchesSpace(e, targetSpace))
    }
    result = vm.applyFilters(result, recommendationsMap)
    result = vm.sortEntities(result)
    return result
  }, [dockData.entities, dockData.healthDetails, dockData.spaces, dockData.rawEntries, vm, recommendationsMap, recEntityIds, duplicateTagNames])

  const modeTitle = React.useMemo(() => {
    switch (vm.dockMode) {
      case 'overview': return '总览'
      case 'taskControl': return '任务控制台'
      case 'unsorted': return '待整理'
      case 'spaces': return '空间管理'
      case 'recommendations': return '推荐队列'
      case 'health': return '结构健康'
      default: return 'Dock'
    }
  }, [vm.dockMode])

  const currentModeLabel = React.useMemo(() => {
    switch (vm.dockMode) {
      case 'overview': return '总览'
      case 'taskControl': return '项目控制'
      case 'unsorted': return '待整理'
      case 'spaces': return '空间'
      case 'recommendations': return '推荐'
      case 'health': return '结构健康'
      default: return '—'
    }
  }, [vm.dockMode])

  const selectedEntity = dockData.entities.find(e => e.id === selectedEntityId) || null;
  const selectedRec = dockData.recommendations.find(r => r.id === selectedRecId) || null;

  React.useEffect(() => {
    if (selectedEntity && userId) {
      findRelatedMindNode(userId, selectedEntity).then(node => setRelatedMindNode(node)).catch(() => setRelatedMindNode(null));
    } else {
      setRelatedMindNode(null);
    }
  }, [selectedEntity, userId]);

  const handleOpenEditor = React.useCallback(async () => {
    if (!selectedEntity || !onOpenEditor) return;
    await executeDockEditorOpen(selectedEntity, userId, onOpenEditor, onToast);
  }, [selectedEntity, onOpenEditor, userId, onToast]);

  const handleOpenInMind = React.useCallback(async () => {
    if (!selectedEntity) {
      onToast?.('请先选择一个实体')
      return
    }
    if (selectedEntity.type === 'mindNode' && selectedEntity.mindNodeId) {
      onFocusMindNode?.(selectedEntity.mindNodeId)
      return
    }
    if (relatedMindNode) {
      onFocusMindNode?.(relatedMindNode.id)
      return
    }
    try {
      const label = selectedEntity.title || 'Untitled'
      const documentId = selectedEntity.entryId ?? selectedEntity.documentId ?? null
      const node = await upsertMindNode({
        userId,
        nodeType: selectedEntity.type === 'document' ? 'document' : selectedEntity.type === 'tip' ? 'fragment' : 'topic',
        label,
        documentId,
        state: 'drifting',
      })
      emit({ type: 'mind_node_created', nodeId: node.id })
      onFocusMindNode?.(node.id)
    } catch {
      onToast?.('创建 Mind 节点失败')
    }
  }, [selectedEntity, relatedMindNode, userId, onFocusMindNode, onToast])

  const handleRecApply = React.useCallback(async (recId: string) => {
    if (recActionLoading) return;
    setRecActionLoading(recId);
    try {
      const result = await executeRecommendationApply(userId, recId, onToast);
      if (result.success) {
        onToast?.(result.detail || '建议已应用');
        dockRefresh();
      }
    } finally {
      setRecActionLoading(null);
    }
  }, [userId, recActionLoading, onToast, dockRefresh]);

  const handleRecReject = React.useCallback(async (recId: string) => {
    if (recActionLoading) return;
    setRecActionLoading(recId);
    try {
      const ok = await executeRecommendationReject(userId, recId, onToast);
      if (ok) {
        onToast?.('建议已拒绝');
        dockRefresh();
      }
    } finally {
      setRecActionLoading(null);
    }
  }, [userId, recActionLoading, onToast, dockRefresh]);

  const handleRecIgnore = React.useCallback(async (recId: string) => {
    if (recActionLoading) return;
    setRecActionLoading(recId);
    try {
      const ok = await executeRecommendationIgnore(userId, recId, onToast);
      if (ok) {
        onToast?.('建议已忽略');
        dockRefresh();
      }
    } finally {
      setRecActionLoading(null);
    }
  }, [userId, recActionLoading, onToast, dockRefresh]);

  const handleDiscardDraft = React.useCallback(async () => {
    if (!selectedEntity?.draftId) return;
    setConfirmDialog({
      open: true,
      title: '丢弃 Draft',
      message: '此操作不可恢复，Draft 将被永久删除。确定要丢弃吗？',
      confirmLabel: '确认丢弃',
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!selectedEntity?.draftId) return;
        const ok = await executeDockDiscardDraft(userId, selectedEntity.draftId, onToast);
        if (ok) {
          onToast?.('Draft 已丢弃');
          dockRefresh();
        }
      },
    });
  }, [selectedEntity, userId, onToast, dockRefresh]);

  const handleDiscardTip = React.useCallback(async () => {
    if (!selectedEntity?.tipId) return;
    setConfirmDialog({
      open: true,
      title: '丢弃 Tip',
      message: '此操作不可恢复，该 Tip 将被永久丢弃。确定要丢弃吗？',
      confirmLabel: '确认丢弃',
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!selectedEntity?.tipId) return;
        const ok = await executeDockDiscardTip(userId, selectedEntity.tipId, onToast);
        if (ok) {
          onToast?.('Tip 已丢弃');
          dockRefresh();
        }
      },
    });
  }, [selectedEntity, userId, onToast, dockRefresh]);

  const handleArchiveDocument = React.useCallback(async () => {
    if (!selectedEntity?.entryId) return
    try {
      await updateArchivedEntry(userId, selectedEntity.entryId, { archivedAt: new Date() })
      emit({ type: 'document_archived', entryId: selectedEntity.entryId })
      onToast?.('文档已归档')
      dockRefresh()
    } catch {
      onToast?.('归档失败')
    }
  }, [selectedEntity, userId, onToast, dockRefresh])

  const handleRestoreDocument = React.useCallback(async () => {
    if (!selectedEntity?.entryId) return
    try {
      await updateArchivedEntry(userId, selectedEntity.entryId, { archivedAt: null })
      emit({ type: 'document_restored', entryId: selectedEntity.entryId })
      onToast?.('文档已恢复')
      dockRefresh()
    } catch {
      onToast?.('恢复失败')
    }
  }, [selectedEntity, userId, onToast, dockRefresh])

  const handlePublishDraft = React.useCallback(async () => {
    if (!selectedEntity?.draftId) return
    try {
      const result = await publishDraftToDocument(userId, selectedEntity.draftId)
      if (result) {
        onToast?.('Draft 已发布为 Document')
        dockRefresh()
      } else {
        onToast?.('发布失败')
      }
    } catch {
      onToast?.('发布失败')
    }
  }, [selectedEntity, userId, onToast, dockRefresh])

  const handleTipOpenInMind = React.useCallback(async () => {
    if (!selectedEntity?.tipId) return
    try {
      const { mindNode } = await convertTipToMindNode(userId, selectedEntity.tipId)
      if (mindNode) {
        emit({ type: 'mind_node_created', nodeId: mindNode.id })
        onFocusMindNode?.(mindNode.id)
      } else {
        onToast?.('创建 Mind 节点失败')
      }
    } catch {
      onToast?.('创建 Mind 节点失败')
    }
  }, [selectedEntity, userId, onFocusMindNode, onToast])

  const getRecStatusBadge = (rec: DockRecommendation) => {
    const statusConfig = STATUS_LABELS[rec.status as keyof typeof STATUS_LABELS];
    const isUnsupported = !isSupportedCandidateType(rec.candidateType);
    const isResolved = isRecommendationResolved(rec.status);
    if (isResolved) {
      return <span className={`text-[9px] font-medium ${statusConfig?.color ?? 'text-gray-500'}`}>{statusConfig?.label ?? rec.status}</span>;
    }
    if (isUnsupported) {
      return <span className="text-[9px] font-medium text-yellow-400/80">暂不支持自动应用</span>;
    }
    return <span className={`text-[9px] font-medium ${statusConfig?.color ?? 'text-blue-400'}`}>{statusConfig?.label ?? rec.status}</span>;
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': case '活跃': return 'bg-[#9cf4d4]/10 text-[#9cf4d4] border-[#9cf4d4]/20';
      case 'archived': case '待确认': return 'bg-[#86d7ff]/10 text-[#86d7ff] border-[#86d7ff]/20';
      case 'published': case '可合并': return 'bg-[#c8a0f0]/10 text-[#c8a0f0] border-[#c8a0f0]/20';
      case 'drifting': case 'isolated': case '孤立': return 'bg-[#ffb4ab]/10 text-[#ffb4ab] border-[#ffb4ab]/20';
      default: return 'bg-white/10 text-[#8d989f] border-white/10';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return '活跃';
      case 'archived': return '已归档';
      case 'published': return '已发布';
      case 'discarded': return '已丢弃';
      case 'drifting': return '漂移';
      case 'isolated': return '孤立';
      case 'anchored': return '锚定';
      case 'dormant': return '休眠';
      default: return status;
    }
  };

  const getTypeIcon = (type: DockEntityType) => {
    switch (type) {
      case 'document': return <FileText className="w-4 h-4" />;
      case 'draft': return <PenTool className="w-4 h-4" />;
      case 'tip': return <Sparkles className="w-4 h-4" />;
      case 'mindNode': return <Brain className="w-4 h-4" />;
      case 'collection': return <FolderTree className="w-4 h-4" />;
      case 'tag': return <Layers className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: DockEntityType) => {
    switch (type) {
      case 'document': return 'Document';
      case 'draft': return 'Draft';
      case 'tip': return 'Tip';
      case 'mindNode': return 'Mind Node';
      case 'collection': return 'Collection';
      case 'tag': return 'Tag';
      default: return type;
    }
  };

  if (dockLoading) {
    return (
      <div className="flex w-full h-full bg-[#0b0f11] text-[#e6eaed] overflow-hidden items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
            <Archive className="w-5 h-5 text-[#86d7ff]" />
          </div>
          <span className="text-xs text-[#899298]">加载 Dock 数据...</span>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="flex w-full h-full min-w-0 bg-[#0b0f11] text-[#e6eaed] overflow-hidden">
      {/* B. Dock sidebar */}
      <div className="w-[224px] bg-[#0d1215] border-r border-white/[0.07] flex flex-col shrink-0">
        <div className="px-4 py-5">
          <h2 className="text-[26px] font-semibold leading-none mb-1">Dock</h2>
          <div className="text-[12px] text-[#8d989f]">知识结构控制台</div>
        </div>
        
        <div className="px-3 flex-1 space-y-1">
          {([
            { mode: 'taskControl' as DockViewMode, icon: LayoutDashboard, label: '任务控制' },
            { mode: 'unsorted' as DockViewMode, icon: Archive, label: '待整理', badge: dockData.rawTips.length },
            { mode: 'spaces' as DockViewMode, icon: FolderTree, label: '空间' },
            { mode: 'recommendations' as DockViewMode, icon: Sparkles, label: '推荐', badge: pendingRecs.length },
            { mode: 'health' as DockViewMode, icon: Activity, label: '结构健康', healthBadge: String(dockData.signals.find(s => s.key === 'health')?.value ?? '—') },
          ] as const).map(item => {
            const isActive = vm.dockMode === item.mode
            return (
	              <div
	                key={item.mode}
	                onClick={() => vm.setDockMode(item.mode)}
	                className={`h-[36px] px-2 rounded-[8px] border flex items-center gap-2 cursor-pointer transition-colors duration-150 ${isActive ? 'bg-[#86d7ff]/12 border-[#86d7ff]/30 text-[#86d7ff]' : 'border-transparent text-[#8d989f] hover:bg-white/5 hover:text-white'}`}
	              >
                <item.icon className="w-[14px] h-[14px]" />
                <span className="text-[12px] font-medium flex-1">{item.label}</span>
                {'badge' in item && item.badge > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${isActive ? 'bg-[#86d7ff]/20 text-[#86d7ff]' : 'bg-white/10 text-[#8d989f]'}`}>{item.badge}</span>
                )}
                {'healthBadge' in item && (
                  <span className="text-[10px] bg-[#9cf4d4]/20 text-[#9cf4d4] px-1.5 rounded-full">{item.healthBadge}</span>
                )}
              </div>
            )
          })}
        </div>

        <div className="p-3 mb-2">
          <div className="p-3 bg-[#111619] border border-white/[0.07] rounded-[12px] h-[110px] flex flex-col">
            <div className="text-[12px] font-semibold text-white mb-1">自动整理</div>
            <div className="text-[10px] text-[#8d989f] leading-relaxed flex-1 mt-1">{pendingRecs.length} 条待处理建议。确认后才写入结构层。</div>
            <button
              onClick={() => {
                vm.setDockMode('recommendations')
                if (pendingRecs.length > 0) setSelectedRecId(pendingRecs[0].id)
              }}
              className="w-full h-[28px] rounded-[8px] bg-white/10 text-[11px] font-medium text-white hover:bg-white/20 transition-colors mt-2"
            >查看建议</button>
          </div>
        </div>
      </div>

      {/* D. Central main workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* D1. Local toolbar */}
        <div className="h-[48px] bg-[#0d1215] border-b border-white/[0.07] px-4 flex items-center justify-between shrink-0">
          <div className="flex flex-col justify-center">
            <div className="text-[9px] text-[#8d989f] uppercase tracking-wider font-semibold">Dock / {selectedSpace?.name ?? '—'}</div>
            <div className="text-[14px] font-medium text-white mt-0.5">{modeTitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {dockError && (
              <span className="text-[10px] text-[#ffb4ab] bg-[#ffb4ab]/10 px-2 py-1 rounded border border-[#ffb4ab]/20">
                数据加载异常
              </span>
            )}
            {/* View selector */}
            <div className="relative">
              <button
                onClick={() => { setViewMenuOpen(!viewMenuOpen); setFilterOpen(false); setCustomizeOpen(false) }}
                className={`h-[32px] px-3 rounded-[8px] border text-[12px] text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center gap-1.5 ${viewMenuOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/[0.07]'}`}
              >
                <LayoutTemplate className="w-3.5 h-3.5" /> 视图：{currentModeLabel}
              </button>
              {viewMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setViewMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#1c2023]/90 backdrop-blur-[20px] border border-white/10 rounded-xl z-50 py-1 overflow-hidden">
                    {([
                      { mode: 'taskControl' as DockViewMode, label: '项目控制' },
                      { mode: 'unsorted' as DockViewMode, label: '待整理' },
                      { mode: 'spaces' as DockViewMode, label: '空间' },
                      { mode: 'recommendations' as DockViewMode, label: '推荐' },
                      { mode: 'health' as DockViewMode, label: '结构健康' },
                    ]).map(opt => (
                      <div
                        key={opt.mode}
                        onClick={() => { vm.setDockMode(opt.mode); setViewMenuOpen(false) }}
                        className={`h-[32px] px-3 flex items-center text-[12px] cursor-pointer transition-colors ${vm.dockMode === opt.mode ? 'bg-[#86d7ff]/10 text-white' : 'text-[#e0e3e6] hover:bg-white/5'}`}
                      >
                        {opt.label}
                        {vm.dockMode === opt.mode && <span className="ml-auto text-[#86d7ff]">✓</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Filter */}
            <div className="relative">
              <button
                onClick={() => { setFilterOpen(!filterOpen); setViewMenuOpen(false); setCustomizeOpen(false) }}
                className={`h-[32px] px-3 rounded-[8px] border text-[12px] text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center gap-1.5 ${filterOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/[0.07]'}`}
              >
                <Filter className="w-3.5 h-3.5" /> 筛选
                {(vm.filter.types.length > 0 || vm.filter.statuses.length > 0 || vm.filter.hasRecommendations !== null || vm.filter.spaceId !== null) && (
                  <span className="text-[9px] bg-[#86d7ff]/20 text-[#86d7ff] px-1.5 rounded-full ml-0.5">
                    {vm.filter.types.length + vm.filter.statuses.length + (vm.filter.hasRecommendations !== null ? 1 : 0) + (vm.filter.spaceId !== null ? 1 : 0)}
                  </span>
                )}
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-[#1c2023]/90 backdrop-blur-[20px] border border-white/10 rounded-xl z-50 py-2 px-3 overflow-hidden">
                    <div className="text-[10px] font-semibold text-[#899298] uppercase tracking-wider mb-1.5">类型</div>
                    {([
                      { type: 'document' as DockEntityType, label: 'Document' },
                      { type: 'draft' as DockEntityType, label: 'Draft' },
                      { type: 'tip' as DockEntityType, label: 'Tip' },
                      { type: 'mindNode' as DockEntityType, label: 'Mind Node' },
                      { type: 'collection' as DockEntityType, label: 'Collection' },
                      { type: 'tag' as DockEntityType, label: 'Tag' },
                    ]).map(opt => (
                      <label key={opt.type} className="h-[28px] flex items-center gap-2 text-[11px] text-[#e0e3e6] cursor-pointer hover:bg-white/5 rounded px-1">
                        <input
                          type="checkbox"
                          checked={vm.filter.types.includes(opt.type)}
                          onChange={() => vm.toggleTypeFilter(opt.type)}
                          className="accent-[#86d7ff]"
                        />
                        {opt.label}
                      </label>
                    ))}
                    <div className="h-px bg-white/10 my-2" />
                    <div className="text-[10px] font-semibold text-[#899298] uppercase tracking-wider mb-1.5">状态</div>
                    {([
                      { status: 'active', label: '活跃' },
                      { status: 'archived', label: '已归档' },
                      { status: 'published', label: '已发布' },
                      { status: 'discarded', label: '已丢弃' },
                      { status: 'drifting', label: '漂移' },
                      { status: 'isolated', label: '孤立' },
                    ]).map(opt => (
                      <label key={opt.status} className="h-[28px] flex items-center gap-2 text-[11px] text-[#e0e3e6] cursor-pointer hover:bg-white/5 rounded px-1">
                        <input
                          type="checkbox"
                          checked={vm.filter.statuses.includes(opt.status)}
                          onChange={() => vm.toggleStatusFilter(opt.status)}
                          className="accent-[#86d7ff]"
                        />
                        {opt.label}
                      </label>
                    ))}
                    <div className="h-px bg-white/10 my-2" />
                    <label className="h-[28px] flex items-center gap-2 text-[11px] text-[#e0e3e6] cursor-pointer hover:bg-white/5 rounded px-1">
                      <input
                        type="checkbox"
                        checked={vm.filter.hasRecommendations === true}
                        onChange={() => vm.setHasRecommendationsFilter(vm.filter.hasRecommendations === true ? null : true)}
                        className="accent-[#86d7ff]"
                      />
                      有待处理推荐
                    </label>
                    {spaces.length > 0 && (
                      <>
                        <div className="h-px bg-white/10 my-2" />
                        <div className="text-[10px] font-semibold text-[#899298] uppercase tracking-wider mb-1.5">空间 / 项目</div>
                        {spaces.map(space => (
                          <label key={space.id} className="h-[28px] flex items-center gap-2 text-[11px] text-[#e0e3e6] cursor-pointer hover:bg-white/5 rounded px-1">
                            <input
                              type="radio"
                              name="space-filter"
                              checked={vm.filter.spaceId === space.id}
                              onChange={() => vm.setSpaceFilter(space.id)}
                              className="accent-[#86d7ff]"
                            />
                            {space.name}
                          </label>
                        ))}
                        {vm.filter.spaceId !== null && (
                          <label className="h-[28px] flex items-center gap-2 text-[11px] text-[#86d7ff] cursor-pointer hover:bg-white/5 rounded px-1">
                            <input
                              type="radio"
                              name="space-filter"
                              checked={false}
                              onChange={() => vm.setSpaceFilter(null)}
                              className="accent-[#86d7ff]"
                            />
                            全部空间
                          </label>
                        )}
                      </>
                    )}
                    <div className="h-px bg-white/10 my-2" />
                    <button
                      onClick={() => vm.resetFilter()}
                      className="w-full h-[28px] rounded-[6px] text-[11px] text-[#899298] hover:bg-white/5 hover:text-white transition-colors"
                    >
                      重置筛选
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* Customize */}
            <div className="relative">
              <button
                onClick={() => { setCustomizeOpen(!customizeOpen); setViewMenuOpen(false); setFilterOpen(false) }}
                className={`h-[32px] px-3 rounded-[8px] border text-[12px] text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center gap-1.5 ${customizeOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/[0.07]'}`}
              >
                <Settings className="w-3.5 h-3.5" /> 自定义
              </button>
              {customizeOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCustomizeOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-[#1c2023]/90 backdrop-blur-[20px] border border-white/10 rounded-xl z-50 py-2 px-3 overflow-hidden">
                    <div className="text-[10px] font-semibold text-[#899298] uppercase tracking-wider mb-1.5">列可见性</div>
                    {([
                      { key: 'space' as const, label: '空间' },
                      { key: 'status' as const, label: '状态' },
                      { key: 'tags' as const, label: '标签' },
                      { key: 'recommendations' as const, label: '推荐' },
                      { key: 'score' as const, label: '分数' },
                    ]).map(col => (
                      <label key={col.key} className="h-[28px] flex items-center gap-2 text-[11px] text-[#e0e3e6] cursor-pointer hover:bg-white/5 rounded px-1">
                        <input
                          type="checkbox"
                          checked={vm.settings.columnVisibility[col.key]}
                          onChange={() => vm.updateSettings({ columnVisibility: { ...vm.settings.columnVisibility, [col.key]: !vm.settings.columnVisibility[col.key] } })}
                          className="accent-[#86d7ff]"
                        />
                        {col.label}
                      </label>
                    ))}
                    <div className="h-px bg-white/10 my-2" />
                    <div className="text-[10px] font-semibold text-[#899298] uppercase tracking-wider mb-1.5">密度</div>
                    <div className="flex gap-2 mb-2">
                      {(['compact', 'standard'] as const).map(d => (
                        <button
                          key={d}
                          onClick={() => vm.updateSettings({ density: d })}
                          className={`flex-1 h-[28px] rounded-[6px] text-[11px] transition-colors ${vm.settings.density === d ? 'bg-[#86d7ff]/10 text-white border border-[#86d7ff]/30' : 'bg-white/5 text-[#8d989f] hover:bg-white/10'}`}
                        >
                          {d === 'compact' ? '紧凑' : '标准'}
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] font-semibold text-[#899298] uppercase tracking-wider mb-1.5">默认排序</div>
                    <div className="flex gap-2">
                      {([
                        { key: 'updatedAt' as const, label: '更新时间' },
                        { key: 'healthScore' as const, label: '健康分' },
                        { key: 'type' as const, label: '类型' },
                      ]).map(s => (
                        <button
                          key={s.key}
                          onClick={() => vm.updateSettings({ defaultSort: s.key })}
                          className={`flex-1 h-[28px] rounded-[6px] text-[11px] transition-colors ${vm.settings.defaultSort === s.key ? 'bg-[#86d7ff]/10 text-white border border-[#86d7ff]/30' : 'bg-white/5 text-[#8d989f] hover:bg-white/10'}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* D2. Space switcher strip */}
        <div className="h-[78px] bg-[#0e1316] border-b border-white/[0.07] flex flex-col justify-center px-4 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <div className="text-[10px] text-[#8d989f] uppercase tracking-wider font-semibold">当前 Library / Space</div>
            <div className="text-[10px] text-[#86d7ff] cursor-pointer hover:underline" onClick={() => setProPreviewOpen(true)}>管理视图模板</div>
          </div>
          <div className="flex gap-3">
            {spaces.length > 0 ? spaces.map(space => (
              <div 
                key={space.id}
                onClick={() => vm.setSpaceFilter(space.id)}
                className={`flex-1 h-[54px] rounded-[8px] border p-2 cursor-pointer flex flex-col justify-between transition-colors ${selectedSpace?.id === space.id ? 'border-[#86d7ff]/40 bg-[#86d7ff]/5' : 'border-white/[0.07] hover:border-white/20 bg-white/[0.02]'}`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[13px] font-medium truncate ${selectedSpace?.id === space.id ? 'text-[#86d7ff]' : 'text-[#e6eaed]'}`}>{space.name}</span>
                  <span className="text-[10px] text-[#9cf4d4]">{space.health}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-[#8d989f]">
                  <span className="truncate">{space.type}</span>
                  {space.recs > 0 && <span className="bg-[#86d7ff]/20 text-[#86d7ff] px-1.5 rounded">{space.recs} 建议</span>}
                </div>
              </div>
            )) : (
              <div className="flex-1 h-[54px] rounded-[8px] border border-white/[0.07] p-2 flex items-center justify-center text-[12px] text-[#8d989f]">
                暂无 Space，创建 Collection 后自动出现
              </div>
            )}
          </div>
        </div>

        {/* D3. System signal strip */}
        <div className="h-[68px] border-b border-white/[0.07] flex shrink-0 divide-x divide-white/[0.07]">
          {[
            { key: 'unsorted', label: '待归类', val: String(dockData.signals.find(s => s.key === 'unsorted')?.value ?? 0), icon: Archive },
            { key: 'pendingRecs', label: '待确认建议', val: String(dockData.signals.find(s => s.key === 'pendingRecs')?.value ?? 0), icon: Sparkles },
            { key: 'isolated', label: '孤立节点', val: String(dockData.signals.find(s => s.key === 'isolated')?.value ?? 0), icon: Network },
            { key: 'duplicates', label: '重复主题', val: String(dockData.signals.find(s => s.key === 'duplicates')?.value ?? 0), icon: Layers },
            { key: 'stagnant', label: '停滞内容', val: String(dockData.signals.find(s => s.key === 'stagnant')?.value ?? 0), icon: Clock },
            { key: 'weaklyClassified', label: '弱归类', val: String(dockData.signals.find(s => s.key === 'weaklyClassified')?.value ?? 0), icon: Tags },
            { key: 'health', label: '结构健康', val: String(dockData.signals.find(s => s.key === 'health')?.value ?? '—'), icon: Activity }
          ].map(sig => (
            <div
              key={sig.key}
              onClick={() => {
                const signalActions: Record<string, () => void> = {
                  unsorted: () => vm.setDockMode('unsorted'),
                  pendingRecs: () => vm.setDockMode('recommendations'),
                  isolated: () => vm.setDockMode('health', 'isolated'),
                  duplicates: () => vm.setDockMode('health', 'duplicates'),
                  stagnant: () => vm.setDockMode('health', 'stagnant'),
                  weaklyClassified: () => vm.setDockMode('health', 'weaklyClassified'),
                  health: () => vm.setDockMode('health', 'summary'),
                }
                signalActions[sig.key]?.()
              }}
              className="flex-1 flex items-center justify-center gap-3 hover:bg-white/[0.02] cursor-pointer transition-colors"
            >
              <div className="w-[28px] h-[28px] flex items-center justify-center bg-white/[0.04] rounded-md border border-white/[0.05]">
                <sig.icon className="w-4 h-4 text-[#8d989f]" />
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-[18px] font-medium leading-none mb-1 text-[#e6eaed]">{sig.val}</div>
                <div className="text-[10px] text-[#8d989f] tracking-wide leading-none">{sig.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* D4. Structure worklist table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-[32px] border-b border-white/[0.055] flex items-center px-4 text-[11px] font-medium text-[#8d989f] bg-[#0b0f11] shrink-0">
            <div className="w-[32px]"></div>
            <div className="flex-1 min-w-[150px]">文档 / 节点</div>
            {vm.settings.columnVisibility.space && <div className="w-[120px]">空间</div>}
            {vm.settings.columnVisibility.status && <div className="w-[80px]">状态</div>}
            {vm.settings.columnVisibility.tags && <div className="w-[140px]">标签</div>}
            {vm.settings.columnVisibility.recommendations && <div className="w-[160px]">建议</div>}
            {vm.settings.columnVisibility.score && <div className="w-[60px] text-right">分数</div>}
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredEntities.length > 0 ? filteredEntities.map(entity => {
              const entityRecs = dockData.recommendations.filter(r =>
                isRecommendationPending(r.status) &&
                String(r.subjectId) === String(entity.entryId ?? entity.draftId ?? entity.tipId ?? entity.mindNodeId ?? entity.collectionId ?? entity.tagId)
              );
              return (
              <div 
                key={entity.id}
                onClick={() => setSelectedEntityId(entity.id)}
                className={`${vm.settings.density === 'compact' ? 'h-[40px]' : 'h-[54px]'} border-b border-white/[0.055] flex items-center px-4 cursor-pointer transition-colors ${selectedEntityId === entity.id ? 'bg-[#86d7ff]/[0.07]' : 'hover:bg-white/[0.02]'}`}
              >
                <div className="w-[32px] flex items-center justify-start text-[#8d989f]">
                  {getTypeIcon(entity.type)}
                </div>
                <div className="flex-1 min-w-[150px] pr-2 flex flex-col justify-center">
                  <div className="text-[12px] font-medium text-[#e6eaed] truncate mb-0.5">{entity.title}</div>
                  <div className="text-[10px] text-[#8d989f] truncate">{getTypeLabel(entity.type)}</div>
                </div>
                {vm.settings.columnVisibility.space && <div className="w-[120px] text-[12px] text-[#8d989f] truncate pr-2">{entity.project ?? '—'}</div>}
                {vm.settings.columnVisibility.status && <div className="w-[80px]">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getStatusStyle(entity.status)}`}>
                    {getStatusLabel(entity.status)}
                  </span>
                </div>}
                {vm.settings.columnVisibility.tags && <div className="w-[140px] text-[10px] text-[#8d989f] truncate pr-2">{entity.tags && entity.tags.length > 0 ? entity.tags.map(t => `#${t}`).join(' ') : '—'}</div>}
                {vm.settings.columnVisibility.recommendations && <div className="w-[160px] text-[11px] text-[#e6eaed] truncate pr-2">
                  {entityRecs.length > 0
                    ? describeRecommendationAction(entityRecs[0].candidateType, entityRecs[0].candidateId)
                    : '—'}
                </div>}
                {vm.settings.columnVisibility.score && <div className="w-[60px] text-right text-[12px] font-medium text-[#8d989f]">
                  {entityRecs.length > 0
                    ? `${Math.round(entityRecs[0].confidenceScore * 100)}%`
                    : '—'}
                </div>}
              </div>
              );
            }) : (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-[#8d989f]">
                {vm.dockMode === 'unsorted' ? (
                  <>
                    <Archive className="w-8 h-8 mb-3 opacity-30" />
                    <div className="text-[12px]">待整理区为空</div>
                    <div className="text-[10px] mt-1">所有内容都已归类，或尚未创建 Tip / Draft</div>
                  </>
                ) : vm.dockMode === 'spaces' ? (
                  <>
                    <FolderTree className="w-8 h-8 mb-3 opacity-30" />
                    {vm.filter.spaceId !== null ? (
                      <>
                        <div className="text-[12px]">当前空间无内容</div>
                        <div className="text-[10px] mt-1">该空间下暂无文档或相关实体</div>
                        <button onClick={() => vm.setSpaceFilter(null)} className="mt-2 text-[10px] text-[#86d7ff] hover:underline">返回全部空间</button>
                      </>
                    ) : (
                      <>
                        <div className="text-[12px]">暂无空间入口</div>
                        <div className="text-[10px] mt-1">创建 Collection 或为文档设置 Project 后将自动出现空间</div>
                      </>
                    )}
                  </>
                ) : vm.dockMode === 'recommendations' ? (
                  <>
                    <Sparkles className="w-8 h-8 mb-3 opacity-30" />
                    <div className="text-[12px]">暂无关联推荐的实体</div>
                    <div className="text-[10px] mt-1">使用 Mind 视图生成推荐后，相关实体将在此显示</div>
                  </>
                ) : vm.dockMode === 'health' ? (
                  <>
                    <Activity className="w-8 h-8 mb-3 opacity-30" />
                    {vm.filter.healthFilter === 'duplicates' ? (
                      <>
                        <div className="text-[12px]">无重复主题</div>
                        <div className="text-[10px] mt-1">所有标签命名唯一，无重复主题</div>
                      </>
                    ) : vm.filter.healthFilter === 'isolated' ? (
                      <>
                        <div className="text-[12px]">无孤立节点</div>
                        <div className="text-[10px] mt-1">所有 Mind 节点均已连接</div>
                      </>
                    ) : vm.filter.healthFilter === 'stagnant' ? (
                      <>
                        <div className="text-[12px]">无停滞内容</div>
                        <div className="text-[10px] mt-1">所有 Draft 和 Tip 近期均有更新</div>
                      </>
                    ) : vm.filter.healthFilter === 'weaklyClassified' ? (
                      <>
                        <div className="text-[12px]">无弱归类文档</div>
                        <div className="text-[10px] mt-1">所有文档均已归类到项目并添加标签</div>
                      </>
                    ) : (
                      <>
                        <div className="text-[12px]">结构健康，无异常</div>
                        <div className="text-[10px] mt-1">所有节点已连接，内容活跃，无重复主题</div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-[12px]">暂无内容</div>
                    <div className="text-[10px] mt-1">创建 Document、Draft 或 Tip 后将在此显示</div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* D5. Recommendation queue strip */}
        <div className="h-[110px] border-t border-white/[0.07] bg-[#0b0f11] flex flex-col justify-center px-4 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider">推荐队列</span>
              {pendingRecs.length > 0 && (
                <span className="text-[9px] text-[#86d7ff] bg-[#86d7ff]/10 px-1.5 rounded-full">{pendingRecs.length} 条待处理</span>
              )}
            </div>
            <div 
              onClick={() => setRecPreviewOpen(true)}
              className="text-[10px] text-[#86d7ff] cursor-pointer hover:underline"
            >全部预览</div>
          </div>
          <div className="flex gap-3 overflow-x-auto min-w-0">
            {dockData.recommendations.length > 0 ? dockData.recommendations.map(rec => {
              const isPending = isRecommendationPending(rec.status);
              const isResolved = isRecommendationResolved(rec.status);
              const isUnsupported = !isSupportedCandidateType(rec.candidateType);
              const isBusy = recActionLoading === rec.id;
              return (
              <div 
                key={rec.id}
                onClick={() => setSelectedRecId(rec.id)}
                className={`min-w-[200px] max-w-[280px] shrink-0 h-[86px] border-r border-white/[0.07] p-2 cursor-pointer flex flex-col justify-between transition-colors ${selectedRecId === rec.id ? 'bg-[#86d7ff]/5' : isResolved ? 'opacity-50' : 'hover:bg-white/[0.02]'}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <Sparkles className={`w-3 h-3 shrink-0 ${isUnsupported ? 'text-yellow-400' : isResolved ? 'text-[#8d989f]' : 'text-[#c8a0f0]'}`} />
                    <span className="text-[11px] font-medium text-[#e6eaed] truncate">{describeRecommendationAction(rec.candidateType, rec.candidateId)}</span>
                  </div>
                  <span className={`text-[9px] px-1 rounded border shrink-0 ml-1 ${isUnsupported ? 'bg-yellow-500/5 text-yellow-400 border-yellow-500/10' : 'bg-[#c8a0f0]/10 text-[#c8a0f0] border-[#c8a0f0]/20'}`}>
                    {rec.confidence}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-auto">
                  <div className="text-[10px] text-[#8d989f] truncate">
                    <span className="text-[#86d7ff]">{CANDIDATE_TYPE_LABELS[rec.candidateType] ?? rec.type}</span> • {rec.target}
                  </div>
                  {getRecStatusBadge(rec)}
                </div>
                {isPending && !isUnsupported && (
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRecApply(rec.id); }}
                      disabled={isBusy}
                      className="h-[20px] px-2 rounded text-[9px] font-medium bg-[#9cf4d4]/10 text-[#9cf4d4] border border-[#9cf4d4]/20 hover:bg-[#9cf4d4]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isBusy ? '...' : '接受'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRecReject(rec.id); }}
                      disabled={isBusy}
                      className="h-[20px] px-2 rounded text-[9px] font-medium bg-white/5 text-[#8d989f] border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      拒绝
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRecIgnore(rec.id); }}
                      disabled={isBusy}
                      className="h-[20px] px-2 rounded text-[9px] font-medium bg-white/5 text-[#8d989f] border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      忽略
                    </button>
                  </div>
                )}
                {isPending && isUnsupported && (
                  <div className="flex gap-1 mt-1">
                    <span className="text-[9px] text-yellow-400/80 flex items-center gap-0.5">
                      <AlertCircle className="w-2.5 h-2.5" /> 暂不支持自动应用
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRecIgnore(rec.id); }}
                      disabled={isBusy}
                      className="h-[20px] px-2 rounded text-[9px] font-medium bg-white/5 text-[#8d989f] border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      忽略
                    </button>
                  </div>
                )}
              </div>
              );
            }) : (
              <div className="min-w-[200px] shrink-0 h-[86px] border-r border-white/[0.07] p-2 flex items-center justify-center text-[11px] text-[#8d989f]">
                暂无推荐。使用 Mind 视图生成推荐后将在此显示。
              </div>
            )}
          </div>
        </div>

      </div>

      {/* E. Right inspector panel */}
      <div className="w-[min(318px,24vw)] min-w-[260px] max-w-[318px] bg-[#0d1215] border-l border-white/[0.07] flex flex-col shrink-0 relative overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 pb-3">
        {/* 1. Header */}
        <div className="mb-5">
          <div className="text-[9px] font-semibold text-[#8d989f] uppercase tracking-wider mb-2">Inspector</div>
          <div className="text-[16px] font-semibold text-white leading-tight mb-1">{selectedEntity?.title ?? '未选择'}</div>
          <div className="text-[11px] text-[#8d989f]">{selectedEntity ? `${getTypeLabel(selectedEntity.type)} · ${selectedEntity.project ?? '—'} · ${selectedEntity.updatedAt ? formatRelativeTime(selectedEntity.updatedAt) : '—'}` : '选择一个实体查看详情'}</div>
        </div>

        {/* 2. 当前建议 */}
        <div className="mb-5 p-3 bg-[#c8a0f0]/[0.08] border border-[#c8a0f0]/30 rounded-[12px]">
          <div className="flex items-center gap-1.5 mb-2 text-[#c8a0f0]">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[12px] font-medium">{selectedRec ? describeRecommendationAction(selectedRec.candidateType, selectedRec.candidateId) : '无选中推荐'}</span>
          </div>
          {selectedRec ? (
            <>
              <div className="text-[11px] text-[#e6eaed] mb-1">目标：{selectedRec.target}</div>
              <div className="text-[11px] text-[#e6eaed] mb-1">影响：{selectedRec.impact}</div>
              <div className="text-[11px] text-[#e6eaed] mb-1">原因：{describeRecommendationReason(selectedRec.candidateType, selectedRec.reasonSummary, selectedRec.evidenceSummary)}</div>
              <div className="text-[11px] text-[#e6eaed] mb-3">接受后：{describeApplyPreview(selectedRec.candidateType, selectedRec.candidateId)}</div>
              <div className="flex items-center gap-2 mb-3">
                {getRecStatusBadge(selectedRec)}
                <span className="text-[9px] text-[#8d989f]">可信度: {formatConfidenceLevel(selectedRec.confidenceScore)}</span>
              </div>
              <div className="flex gap-2">
                {isRecommendationPending(selectedRec.status) && isSupportedCandidateType(selectedRec.candidateType) ? (
                  <>
                    <button
                      onClick={() => handleRecApply(selectedRec.id)}
                      disabled={recActionLoading === selectedRec.id}
                      className="flex-1 h-[28px] rounded-[8px] bg-[#9cf4d4]/20 text-[#9cf4d4] text-[11px] font-medium hover:bg-[#9cf4d4]/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {recActionLoading === selectedRec.id ? '处理中...' : '接受建议'}
                    </button>
                    <button
                      onClick={() => handleRecReject(selectedRec.id)}
                      disabled={recActionLoading === selectedRec.id}
                      className="px-3 h-[28px] rounded-[8px] bg-white/5 text-[#8d989f] text-[11px] font-medium hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      拒绝
                    </button>
                    <button
                      onClick={() => handleRecIgnore(selectedRec.id)}
                      disabled={recActionLoading === selectedRec.id}
                      className="px-3 h-[28px] rounded-[8px] bg-white/5 text-[#8d989f] text-[11px] font-medium hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      忽略
                    </button>
                  </>
                ) : isRecommendationPending(selectedRec.status) && !isSupportedCandidateType(selectedRec.candidateType) ? (
                  <>
                    <span className="flex items-center gap-1 text-[11px] text-yellow-400/80">
                      <AlertCircle className="w-3 h-3" /> 暂不支持自动应用
                    </span>
                    <button
                      onClick={() => handleRecIgnore(selectedRec.id)}
                      disabled={recActionLoading === selectedRec.id}
                      className="px-3 h-[28px] rounded-[8px] bg-white/5 text-[#8d989f] text-[11px] font-medium hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      忽略
                    </button>
                    <button
                      onClick={() => handleRecReject(selectedRec.id)}
                      disabled={recActionLoading === selectedRec.id}
                      className="px-3 h-[28px] rounded-[8px] bg-white/5 text-[#8d989f] text-[11px] font-medium hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      不再推荐
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-[#8d989f]">该建议已处理</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] text-[#e6eaed] mb-3">选择推荐队列中的建议查看详情</div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if (pendingRecs.length > 0) {
                      setSelectedRecId(pendingRecs[0].id)
                      setRecPreviewOpen(true)
                    } else {
                      onToast?.('暂无可预览的推荐')
                    }
                  }}
                  className="flex-1 h-[28px] rounded-[8px] bg-[#c8a0f0]/20 text-[#c8a0f0] text-[11px] font-medium hover:bg-[#c8a0f0]/30 transition-colors"
                >预览方案</button>
              </div>
            </>
          )}
        </div>

        {/* 3. 属性 table */}
        <div className="mb-5">
          <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider mb-2">Properties</div>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Space</span>
              <span className="text-[#e6eaed]">{selectedEntity?.project ?? selectedSpace?.name ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Type</span>
              <span className="text-[#e6eaed]">{selectedEntity ? getTypeLabel(selectedEntity.type) : '—'}</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">State</span>
              <span className="text-[#86d7ff]">{selectedEntity ? getStatusLabel(selectedEntity.status) : '—'}</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Mind Node</span>
              <span className="text-[#9cf4d4]">{relatedMindNode ? relatedMindNode.label : '未关联'}</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Tags</span>
              <span className="text-[#e6eaed] truncate max-w-[150px]">{selectedEntity?.tags && selectedEntity.tags.length > 0 ? selectedEntity.tags.map(t => `#${t}`).join(' ') : '—'}</span>
            </div>
          </div>
        </div>

        {/* 4. Entity Actions */}
        {selectedEntity && (
          <div className="mb-5">
            <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider mb-2">Actions</div>
            <div className="space-y-1.5">
              {selectedEntity.type === 'document' && (
                <>
                  <button
                    onClick={handleOpenEditor}
                    disabled={!selectedEntity.entryId}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <PenTool className="w-3 h-3" /> 打开 Editor
                  </button>
                  <button
                    onClick={handleOpenInMind}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#8d989f] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Network className="w-3 h-3" /> 在 Mind 查看
                  </button>
                  <button
                    onClick={handleArchiveDocument}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#8d989f] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Archive className="w-3 h-3" /> 归档
                  </button>
                  <button
                    onClick={handleRestoreDocument}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#8d989f] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3" /> 恢复
                  </button>
                </>
              )}
              {selectedEntity.type === 'draft' && (
                <>
                  <button
                    onClick={handleOpenEditor}
                    disabled={!selectedEntity.draftId}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <PenTool className="w-3 h-3" /> 在 Editor 中继续
                  </button>
                  <button
                    onClick={handlePublishDraft}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#8d989f] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3 h-3" /> 发布
                  </button>
                  <button
                    onClick={handleDiscardDraft}
                    disabled={!selectedEntity.draftId}
                    className="w-full h-[28px] rounded-[8px] bg-[#ffb4ab]/10 text-[11px] font-medium text-[#ffb4ab] hover:bg-[#ffb4ab]/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3 h-3" /> 丢弃 Draft
                  </button>
                </>
              )}
              {selectedEntity.type === 'tip' && (
                <>
                  <button
                    onClick={handleOpenEditor}
                    disabled={!selectedEntity.tipId}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <PenTool className="w-3 h-3" /> 转 Draft 并打开 Editor
                  </button>
                  <button
                    onClick={handleTipOpenInMind}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#8d989f] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Network className="w-3 h-3" /> 在 Mind 查看
                  </button>
                  <button
                    onClick={handleDiscardTip}
                    disabled={!selectedEntity.tipId}
                    className="w-full h-[28px] rounded-[8px] bg-[#ffb4ab]/10 text-[11px] font-medium text-[#ffb4ab] hover:bg-[#ffb4ab]/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3 h-3" /> 丢弃 Tip
                  </button>
                </>
              )}
              {selectedEntity.type === 'mindNode' && (
                <>
                  {selectedEntity.documentId != null ? (
                    <button
                      onClick={handleOpenEditor}
                      className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <PenTool className="w-3 h-3" /> 打开关联文档
                    </button>
                  ) : (
                    <div className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] text-[#ffb4ab] flex items-center justify-center gap-1.5">
                      <AlertCircle className="w-3 h-3" /> 该节点未关联文档，无法打开 Editor
                    </div>
                  )}
                  <button
                    onClick={handleOpenInMind}
                    className="w-full h-[28px] rounded-[8px] bg-white/5 text-[11px] font-medium text-[#8d989f] hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Network className="w-3 h-3" /> 在 Mind 查看
                  </button>
                </>
              )}
              {selectedEntity.type === 'collection' && (
                <>
                  <div className="text-[11px] text-[#8d989f] mb-2">
                    相关内容：{dockData.entities.filter(e => e.type === 'document' && e.project === selectedEntity.title).length} 个文档
                  </div>
                  {dockData.entities.filter(e => e.type === 'document' && e.project === selectedEntity.title).slice(0, 5).map(e => (
                    <div key={e.id} onClick={() => setSelectedEntityId(e.id)} className="text-[11px] text-[#86d7ff] cursor-pointer hover:underline truncate">
                      {e.title}
                    </div>
                  ))}
                </>
              )}
              {selectedEntity.type === 'tag' && (
                <>
                  <div className="text-[11px] text-[#8d989f] mb-2">
                    相关内容：{dockData.entities.filter(e => e.tags?.includes(selectedEntity.title)).length} 个条目
                  </div>
                  {dockData.entities.filter(e => e.tags?.includes(selectedEntity.title)).slice(0, 5).map(e => (
                    <div key={e.id} onClick={() => setSelectedEntityId(e.id)} className="text-[11px] text-[#86d7ff] cursor-pointer hover:underline truncate">
                      {e.title}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* 5. 操作规则 */}
        <div className="p-3 bg-[#151a1e] border border-white/[0.07] rounded-[12px] mb-auto">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#8d989f] shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#8d989f] leading-relaxed">
              Dock 内默认只做预览、确认、整理和结构治理；点击“打开 Editor”才进入编辑器。点击 Space 不跳出 Dock，而是在当前 Dock 内切换 Space Scope 和 Lens。
            </div>
          </div>
        </div>
        </div>

        {/* 6. Bottom actions */}
        <div className="flex gap-2 p-3 border-t border-white/[0.07] bg-[#0d1215] shrink-0">
          <button
            onClick={() => {
              if (!selectedEntity) {
                onToast?.('请先选择一个实体')
                return
              }
              handleOpenEditor()
            }}
            className="flex-1 h-[32px] rounded-[8px] bg-white text-[#0b0f11] text-[12px] font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <PenTool className="w-3.5 h-3.5" /> 打开 Editor
          </button>
          <button
            onClick={handleOpenInMind}
            className="flex-1 h-[32px] rounded-[8px] bg-white/10 text-[12px] font-medium hover:bg-white/20 transition-colors flex items-center justify-center gap-1.5"
          >
            <Network className="w-3.5 h-3.5" /> 在 Mind 查看
          </button>
        </div>
      </div>
    </div>

    {proPreviewOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-[#0b0f11]/60 backdrop-blur-sm"
          onClick={() => setProPreviewOpen(false)}
        />
        <div className="relative w-[380px] bg-[#1c2023]/90 backdrop-blur-[40px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
            <h3 className="text-sm font-medium text-white">视图模板</h3>
            <button
              onClick={() => setProPreviewOpen(false)}
              className="p-1 rounded-md hover:bg-white/10 text-[#899298] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-6 flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c8a0f0]/20 to-[#86d7ff]/20 flex items-center justify-center">
              <Crown className="w-6 h-6 text-[#c8a0f0]" />
            </div>
            <div className="text-[14px] font-medium text-white">Atlax Pro 功能</div>
            <div className="text-[12px] text-[#899298] text-center leading-relaxed">视图模板是 Atlax Pro 订阅功能，可保存和复用自定义的 Dock 视图配置。</div>
          </div>
          <div className="px-5 py-3 border-t border-white/[0.07] flex gap-2">
            <button
              onClick={() => setProPreviewOpen(false)}
              className="flex-1 py-2 rounded-lg bg-white/5 text-[11px] text-[#899298] hover:text-white hover:bg-white/10 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    )}

    {recPreviewOpen && (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-[#0b0f11]/40 backdrop-blur-sm" onClick={() => setRecPreviewOpen(false)} />
        <div className="relative w-[480px] h-full bg-[#1c2023]/95 backdrop-blur-[40px] border-l border-white/10 flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
            <h3 className="text-sm font-medium text-white">推荐预览</h3>
            <button onClick={() => setRecPreviewOpen(false)} className="p-1 rounded-md hover:bg-white/10 text-[#899298] hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {pendingRecs.length > 0 ? pendingRecs.map(rec => (
              <div key={rec.id} className="p-3 bg-white/[0.03] border border-white/[0.07] rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#c8a0f0]" />
                  <span className="text-[12px] font-medium text-[#e6eaed]">{describeRecommendationAction(rec.candidateType, rec.candidateId)}</span>
                </div>
                <div className="text-[11px] text-[#8d989f] mb-1">目标：{rec.target}</div>
                <div className="text-[11px] text-[#8d989f] mb-1">原因：{describeRecommendationReason(rec.candidateType, rec.reasonSummary, rec.evidenceSummary)}</div>
                <div className="text-[11px] text-[#8d989f] mb-2">接受后：{describeApplyPreview(rec.candidateType, rec.candidateId)}</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] text-[#8d989f]">可信度: {formatConfidenceLevel(rec.confidenceScore)}</span>
                  {getRecStatusBadge(rec)}
                </div>
                {isRecommendationPending(rec.status) && isSupportedCandidateType(rec.candidateType) && (
                  <div className="flex gap-2">
                    <button onClick={() => handleRecApply(rec.id)} disabled={recActionLoading === rec.id} className="h-[24px] px-3 rounded text-[10px] font-medium bg-[#9cf4d4]/10 text-[#9cf4d4] border border-[#9cf4d4]/20 hover:bg-[#9cf4d4]/20 transition-colors disabled:opacity-30">{recActionLoading === rec.id ? '...' : '接受'}</button>
                    <button onClick={() => handleRecReject(rec.id)} disabled={recActionLoading === rec.id} className="h-[24px] px-3 rounded text-[10px] font-medium bg-white/5 text-[#8d989f] border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-30">拒绝</button>
                    <button onClick={() => handleRecIgnore(rec.id)} disabled={recActionLoading === rec.id} className="h-[24px] px-3 rounded text-[10px] font-medium bg-white/5 text-[#8d989f] border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-30">忽略</button>
                  </div>
                )}
                {isRecommendationPending(rec.status) && !isSupportedCandidateType(rec.candidateType) && (
                  <div className="flex gap-2">
                    <span className="text-[10px] text-yellow-400/80 flex items-center gap-0.5"><AlertCircle className="w-2.5 h-2.5" /> 暂不支持自动应用</span>
                    <button onClick={() => handleRecIgnore(rec.id)} disabled={recActionLoading === rec.id} className="h-[24px] px-3 rounded text-[10px] font-medium bg-white/5 text-[#8d989f] border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-30">忽略</button>
                  </div>
                )}
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-12 text-[#8d989f]">
                <Sparkles className="w-8 h-8 mb-3 opacity-30" />
                <div className="text-[12px]">暂无待处理推荐</div>
                <div className="text-[10px] mt-1">使用 Mind 视图生成推荐后将在此显示</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {confirmDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-[#0b0f11]/60 backdrop-blur-sm"
          onClick={() => setConfirmDialog(null)}
        />
        <div className="relative w-[380px] bg-[#1c2023]/90 backdrop-blur-[40px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
            <h3 className="text-sm font-medium text-white">{confirmDialog?.title}</h3>
            <button
              onClick={() => setConfirmDialog(null)}
              className="p-1 rounded-md hover:bg-white/10 text-[#899298] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-4">
            <p className="text-[12px] text-[#899298] leading-relaxed">{confirmDialog?.message}</p>
          </div>
          <div className="px-5 py-3 border-t border-white/[0.07] flex gap-2">
            <button
              onClick={() => setConfirmDialog(null)}
              className="flex-1 py-2 rounded-lg bg-white/5 text-[11px] text-[#899298] hover:text-white hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => confirmDialog?.onConfirm()}
              className="flex-1 py-2 rounded-lg bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 text-[11px] text-[#ffb4ab] hover:bg-[#ffb4ab]/20 transition-colors"
            >
              {confirmDialog?.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};


// 4. 编辑器视图 (Editor View) — 已替换为 DraftEditorView 组件
// 旧 mock EditorView 已移除，真实 Draft 编辑功能见 features/editor/DraftEditorView.tsx

// 5. 回顾视图 (Review View) - 高密度聚合仪表盘
// 已接入 LocalHealthReport，核心数据面板展示真实 IndexedDB 数据
const ReviewView = ({ onNavigateToMind, onNavigateToSuggestion }: { onNavigateToMind?: () => void; onNavigateToSuggestion?: (target: { tab: string; filter?: string }) => void }) => {
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [periodType, setPeriodType] = useState<'日' | '周' | '月' | '年'>('周');
  const [healthReport, setHealthReport] = useState<LocalHealthReport | null>(null)
  const [reportLoading, setReportLoading] = useState(true)

  useEffect(() => {
    const currentUser = getCurrentUser()
    if (currentUser) {
      getLocalHealthReport(currentUser.id).then(report => {
        setHealthReport(report)
        setReportLoading(false)
      }).catch(() => {
        setReportLoading(false)
      })
    } else {
      setReportLoading(false)
    }
  }, [])

  const periodOptions: ('日' | '周' | '月' | '年')[] = ['日', '周', '月', '年'];

  // 模拟各个周期维度的历史报告数据
  const historyData: Record<string, string[]> = {
    '日': ['今天 (05.07)', '昨天 (05.06)', '前天 (05.05)', '选择其他日期...'],
    '周': ['本周 (05.01-05.07)', '上周 (04.24-04.30)', '前周 (04.17-04.23)', '查看更多历史周报...'],
    '月': ['本月 (2026年5月)', '上月 (2026年4月)', '2026年3月', '查看更多历史月报...'],
    '年': ['今年 (2026)', '去年 (2025)', '2024', '查看更多历史年报...']
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-12">

      {/* 头部标题与控制区 */}
      <div className="mb-4 mt-2 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-white tracking-tight flex items-center gap-2.5">系统回顾与{periodType}报 <span className="text-[9px] bg-[#c8a0f0]/20 text-[#c8a0f0] px-2 py-0.5 rounded-full border border-[#c8a0f0]/30 font-semibold tracking-wider uppercase">Local Preview</span></h1>
          <p className="text-[#899298] text-[11px]">{healthReport ? `生成于 ${new Date(healthReport.generatedAt).toLocaleDateString('zh-CN')} · 基于 ${healthReport.source} 数据` : '加载中...'} • 维护您的数字花园健康与项目流转</p>
        </div>

        <div className="flex items-center gap-3">
          {/* 周期/历史视图切换器 */}
          <div className="relative">
            <button
              onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
              className={`px-3 py-1.5 rounded-full border text-[10px] text-white flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,255,255,0.05)] transition-colors ${isPeriodDropdownOpen ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            >
              <Calendar className="w-3 h-3" /> {periodType}视图 <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {/* 下拉历史报表选择面板 */}
            {isPeriodDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#1c2023]/95 backdrop-blur-[40px] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2">
                  {/* 顶部分类 Tabs */}
                  <div className="flex bg-black/20 rounded-lg p-1 mb-2">
                    {periodOptions.map(pt => (
                      <button
                        key={pt}
                        onClick={() => setPeriodType(pt)}
                        className={`flex-1 text-[10px] py-1.5 rounded-md transition-all duration-200 ${periodType === pt ? 'bg-[#86d7ff]/20 text-[#86d7ff] font-medium shadow-sm' : 'text-[#899298] hover:text-white hover:bg-white/5'}`}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>

                  {/* 历史记录列表 */}
                  <div className="px-2 py-1">
                    <div className="text-[9px] font-semibold tracking-wider text-[#899298] uppercase mb-2">往期{periodType}报告</div>
                    <div className="space-y-0.5">
                      {historyData[periodType].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => setIsPeriodDropdownOpen(false)}
                          className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors flex items-center justify-between ${idx === 0 ? 'bg-white/10 text-white' : 'text-[#e0e3e6] hover:bg-white/5 hover:text-white'}`}
                        >
                          <span>{item}</span>
                          {idx !== 0 && <span className="text-[8px] text-[#c8a0f0] ml-1">Preview</span>}
                          {/* 默认第一项为当前选中项 */}
                          {idx === 0 && <CheckCircle2 className="w-3 h-3 text-[#9cf4d4]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button disabled className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#899298] flex items-center gap-1.5 cursor-not-allowed opacity-50" title="需要 Health Bridge / ReviewService 接入后开放">
            <Download className="w-3 h-3" /> 导出报告
          </button>
        </div>
      </div>

      {/* ==========================================
          核心数据面板 (Core Data Panel) - 纯线条分割
          ========================================== */}
      <div className="bg-[#1c2023]/40 backdrop-blur-[20px] border border-white/5 rounded-[16px] overflow-hidden flex flex-col divide-y divide-white/5 mb-6 shadow-xl">
        <div className="px-4 py-2 bg-[#c8a0f0]/5 border-b border-[#c8a0f0]/10 flex items-center gap-1.5">
          <span className="text-[9px] font-semibold tracking-wider text-[#c8a0f0] uppercase">Preview Data</span>
          <span className="text-[9px] text-[#899298]">· 基于本地 IndexedDB 数据 · 本地只读健康报告</span>
          {reportLoading && <span className="text-[9px] text-[#86d7ff] animate-pulse ml-1">加载中...</span>}
        </div>

        {/* Row 1: 文本洞察与状态摘要 */}
        <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          {/* Col 1: 核心健康度 */}
          <div className="p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5 mb-3"><Activity className="w-3 h-3 text-[#9cf4d4]" /> 核心健康度</h3>
              <div className="flex items-end gap-1.5 mb-4">
                <span className="text-4xl font-bold text-white leading-none">{reportLoading ? '--' : (healthReport?.score ?? '--')}</span>
                <span className="text-xs text-[#899298] mb-1">/100</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#899298]">陈旧捕获</span>
                <span className="text-[#ffb4ab]">{healthReport ? `${healthReport.summary.staleDrafts + healthReport.summary.activeTips} 条待清` : '--'}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#899298]">标签冗余</span>
                <span className="text-[#a8c8ff]">{healthReport ? `${healthReport.signals.filter(s => s.type === 'duplicate_tags').length} 组建议合并` : '--'}</span>
              </div>
            </div>
          </div>

          {/* Col 2: 本周总结 */}
          <div className="p-4">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-3 flex items-center gap-1.5"><FileText className="w-3 h-3 text-[#86d7ff]" /> 本周总结</h3>
            <p className="text-[11px] text-[#e0e3e6] leading-relaxed text-justify">
              {healthReport ? (
                <>
                  知识库共有 <span className="text-[#9cf4d4] font-medium">{healthReport.summary.documentsTotal}</span> 篇文档，<span className="text-[#9cf4d4] font-medium">{healthReport.summary.draftsTotal}</span> 篇草稿，<span className="text-[#9cf4d4] font-medium">{healthReport.summary.activeTips}</span> 条待整理闪念。
                  {healthReport.signals.length > 0 ? `当前有 ${healthReport.signals.length} 个健康信号需要关注。` : '整体系统保持健康。'}
                </>
              ) : reportLoading ? '加载中...' : '暂无数据'}
            </p>
          </div>

          {/* Col 3: 本周复盘 */}
          <div className="p-4">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-3 flex items-center gap-1.5"><Target className="w-3 h-3 text-[#c8a0f0]" /> 本周复盘</h3>
            <ul className="space-y-2.5 text-[11px] text-[#e0e3e6]">
              {healthReport && healthReport.signals.length > 0 ? healthReport.signals.map((signal) => (
                <li key={signal.id} className="flex items-start gap-1.5">
                  {signal.severity === 'warning' || signal.severity === 'critical' ? <AlertCircle className="w-3 h-3 text-[#ffb4ab] shrink-0 mt-0.5" /> : signal.severity === 'info' ? <Sparkles className="w-3 h-3 text-[#86d7ff] shrink-0 mt-0.5" /> : <CheckCircle2 className="w-3 h-3 text-[#9cf4d4] shrink-0 mt-0.5" />}
                  {signal.title} — {signal.reason}
                </li>
              )) : (
                <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-[#9cf4d4] shrink-0 mt-0.5" /> 暂无需要复盘的事项。</li>
              )}
            </ul>
          </div>

          {/* Col 4: 知识库本周状态 */}
          <div className="p-4 flex flex-col">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-3 flex items-center gap-1.5"><Database className="w-3 h-3 text-white" /> 知识库周状态</h3>
            <div className="space-y-3 flex-1 justify-center flex flex-col">
              {healthReport && healthReport.projectDistribution.length > 0 ? healthReport.projectDistribution.slice(0, 3).map((proj, i) => (
                <div key={proj.name} className="flex justify-between items-center text-[11px]">
                  <span className="text-[#e0e3e6] flex items-center gap-1.5"><FolderTree className={`w-3 h-3 ${i === 0 ? 'text-[#86d7ff]' : i === 1 ? 'text-[#9cf4d4]' : 'text-[#c8a0f0]'}`} /> {proj.name}</span>
                  <span className="text-[#9cf4d4]">{proj.entryCount} 篇</span>
                </div>
              )) : (
                <div className="text-[11px] text-[#899298] text-center">{healthReport ? '暂无项目' : '--'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: 数据流转漏斗 (Quick Notes & Drafts) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          {/* Quick Notes 状态 */}
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><Command className="w-3 h-3 text-white" /> Quick Notes 周吞吐量</h3>
              <span className="text-[8px] text-[#899298] border border-white/10 px-1.5 py-0.5 rounded uppercase">本周</span>
            </div>
            <div className="flex items-center justify-between mt-2 bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-white">{healthReport ? healthReport.summary.activeTips + healthReport.summary.convertedTips + healthReport.summary.discardedTips : '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">记录</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#9cf4d4]">{healthReport?.summary.convertedTips ?? '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">落库</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#ffb4ab]">{healthReport?.summary.discardedTips ?? '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">丢弃</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#86d7ff]">{healthReport?.summary.activeTips ?? '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">未处理</span></div>
            </div>
          </div>

          {/* Drafts 状态 */}
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><PenTool className="w-3 h-3 text-white" /> Drafts 草稿箱流转</h3>
              <span className="text-[8px] text-[#899298] border border-white/10 px-1.5 py-0.5 rounded uppercase">本周</span>
            </div>
            <div className="flex items-center justify-between mt-2 bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-white">{healthReport?.summary.draftsTotal ?? '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">起草</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#9cf4d4]">{healthReport?.sections.drafts.published ?? '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">已发布</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#ffb4ab]">{healthReport?.sections.drafts.discarded ?? '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">废弃</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#a8c8ff]">{healthReport?.summary.staleDrafts ?? '--'}</span><span className="text-[9px] text-[#899298] mt-0.5">搁置中</span></div>
            </div>
          </div>
        </div>

        {/* Row 3: 可视化与清理任务 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          {/* 周 Mind 视图 (占2列) */}
          <div className="lg:col-span-2 p-4 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><Network className="w-3 h-3 text-[#86d7ff]" /> 周 Mind 视图拓扑</h3>
              <span className="text-[9px] text-[#86d7ff] bg-[#86d7ff]/10 border border-[#86d7ff]/20 px-2 py-0.5 rounded-full">{healthReport?.summary.mindEdges ?? 0} 边 / {healthReport?.summary.mindNodes ?? 0} 节点</span>
            </div>
            <div
              className="flex-1 bg-black/20 border border-white/5 rounded-xl relative overflow-hidden flex items-center justify-center min-h-[140px] group cursor-pointer"
              onClick={() => onNavigateToMind?.()}
            >
              <div className="absolute inset-0 opacity-20 transition-opacity group-hover:opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #86d7ff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              <span className="absolute z-20 text-[9px] text-white bg-black/50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">点击进入完整 Mind 视图</span>

              {healthReport && healthReport.mindGraphPreview.nodes.length > 0 ? (
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 140" preserveAspectRatio="xMidYMid meet">
                  {healthReport.mindGraphPreview.nodes.map((node, i) => {
                    const total = healthReport.mindGraphPreview.nodes.length
                    const angle = (2 * Math.PI * i) / total - Math.PI / 2
                    const cx = 150 + 55 * Math.cos(angle)
                    const cy = 70 + 45 * Math.sin(angle)
                    const nodeIdMap = new Map(healthReport.mindGraphPreview.nodes.map((n, idx) => [n.id, idx]))
                    return (
                      <g key={node.id}>
                        {healthReport.mindGraphPreview.edges
                          .filter(e => e.sourceId === node.id)
                          .map(e => {
                            const targetIdx = nodeIdMap.get(e.targetId)
                            if (targetIdx === undefined) return null
                            const targetAngle = (2 * Math.PI * targetIdx) / total - Math.PI / 2
                            const tx = 150 + 55 * Math.cos(targetAngle)
                            const ty = 70 + 45 * Math.sin(targetAngle)
                            const strokeColor = e.edgeType === 'confirmed' ? '#9cf4d4' : e.edgeType === 'suggested' ? '#c8a0f0' : '#86d7ff'
                            return <line key={`${e.sourceId}-${e.targetId}`} x1={cx} y1={cy} x2={tx} y2={ty} stroke={strokeColor} strokeWidth="1" opacity="0.5" />
                          })
                        }
                        <circle
                          cx={cx} cy={cy}
                          r={node.nodeType === 'root' ? 6 : node.isConnected ? 4 : 3}
                          fill={node.nodeType === 'root' ? '#9cf4d4' : node.isConnected ? '#86d7ff' : '#899298'}
                          opacity={node.isConnected ? 0.8 : 0.4}
                        />
                        {total <= 12 && (
                          <text x={cx} y={cy - 8} textAnchor="middle" fill="#899298" fontSize="6" fontWeight="500">{node.label.slice(0, 8)}</text>
                        )}
                      </g>
                    )
                  })}
                </svg>
              ) : (
                <div className="z-10 flex flex-col items-center gap-2">
                  <Network className="w-6 h-6 text-[#899298] opacity-30" />
                  <span className="text-[10px] text-[#899298]">暂无思维图谱数据</span>
                </div>
              )}
            </div>
          </div>

          {/* 待清理任务 */}
          <div className="p-4 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-[#ffb4ab]" /> 待清理建议</h3>
              <button disabled className="text-[9px] text-[#899298] opacity-50 cursor-not-allowed" title="需要 ReviewService 接入后开放">一键执行 ({healthReport?.suggestions.length ?? 0})</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-1.5">
              {healthReport && healthReport.suggestions.length > 0 ? healthReport.suggestions.map((sug) => (
                <div key={sug.id} className="bg-white/[0.02] hover:bg-white/5 border border-white/5 hover:border-[#86d7ff]/30 rounded-lg p-2.5 flex justify-between items-center group transition-all cursor-pointer" onClick={() => { if (sug.navigationTarget) onNavigateToSuggestion?.(sug.navigationTarget); }}>
                  <div className="overflow-hidden flex-1 pr-2">
                    <p className="text-[11px] text-white truncate mb-0.5">{sug.title}</p>
                    <p className="text-[9px] text-[#ffb4ab]">{sug.type}</p>
                  </div>
                  <span className="text-[9px] px-2 py-1 rounded bg-white/5 text-[#899298] opacity-50">
                    {sug.navigationTarget ? '前往 ↗' : sug.action}
                  </span>
                </div>
              )) : (
                <div className="text-[11px] text-[#899298] text-center py-4">暂无清理建议</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          扩展简报/定制看板 (Pro Feature Showcase)
          ========================================== */}
      <div className="bg-gradient-to-br from-[#c8a0f0]/10 to-transparent backdrop-blur-[20px] border border-[#c8a0f0]/20 rounded-[16px] overflow-hidden flex flex-col divide-y divide-[#c8a0f0]/10 shadow-lg">

        {/* 顶栏标识 */}
        <div className="px-5 py-2.5 bg-[#c8a0f0]/5 flex items-center justify-between border-b border-[#c8a0f0]/10">
          <h2 className="text-[10px] font-bold text-[#c8a0f0] uppercase tracking-widest flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" /> 定制简报模块 (Preview / Planned 外部工作流)
          </h2>
          <span className="text-[9px] bg-[#c8a0f0]/20 text-[#c8a0f0] px-2 py-0.5 rounded-full border border-[#c8a0f0]/30 cursor-not-allowed opacity-80" title="Planned connector preview; no external workflow is connected">Planned 展示位</span>
        </div>

        {/* 外部业务数据网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#c8a0f0]/10">
          {/* 周项目进度 */}
          <div className="p-5">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-4 flex items-center gap-1.5"><PieChart className="w-3 h-3 text-white" /> 周项目追踪 · Preview</h3>
            <div className="mb-4">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[11px] text-white font-medium">Atlax V2.0 Beta 冲刺</span>
                <span className="text-[10px] text-[#86d7ff] font-bold">78%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-[#86d7ff] rounded-full" style={{ width: '78%' }}></div></div>
            </div>
            <div>
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[11px] text-[#e0e3e6] font-medium">Q3 宣发物料准备</span>
                <span className="text-[10px] text-[#9cf4d4] font-bold">45%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-[#9cf4d4] rounded-full" style={{ width: '45%' }}></div></div>
            </div>
          </div>

          {/* 看板流转统计 */}
          <div className="p-5">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-4 flex items-center gap-1.5"><Kanban className="w-3 h-3 text-white" /> 周项目看板 (Linear Planned)</h3>
            <div className="flex gap-2.5 h-16">
              <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#9cf4d4]">12</span>
                <span className="text-[8px] text-[#899298] uppercase tracking-wider mt-0.5">已完成 (Done)</span>
              </div>
              <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#86d7ff]">5</span>
                <span className="text-[8px] text-[#899298] uppercase tracking-wider mt-0.5">进行中 (Doing)</span>
              </div>
              <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#ffb4ab]">2</span>
                <span className="text-[8px] text-[#899298] uppercase tracking-wider mt-0.5">已阻塞 (Blocked)</span>
              </div>
            </div>
          </div>

          {/* Todo List 进展 */}
          <div className="p-5">
            <div className="flex justify-between items-center mb-3.5">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><CheckSquare className="w-3 h-3 text-white" /> 个人 Todo 进展 · Preview</h3>
              <span className="text-[9px] text-[#9cf4d4] bg-[#9cf4d4]/10 px-1.5 py-0.5 rounded border border-[#9cf4d4]/20">45/52 完成</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#9cf4d4] shrink-0 mt-0.5" />
                <span className="text-[11px] text-[#e0e3e6] line-through">更新空间 UI 设计规范文档</span>
              </div>
              <div className="flex items-start gap-2 opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#9cf4d4] shrink-0 mt-0.5" />
                <span className="text-[11px] text-[#e0e3e6] line-through">修复编辑器左侧状态栏遮挡 Bug</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-3.5 h-3.5 border border-white/30 rounded shrink-0 mt-0.5 flex items-center justify-center hover:border-white transition-colors cursor-pointer"></div>
                <span className="text-[11px] text-white">筹备下周的同步架构技术评审</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 6. 设置视图 (Settings View)
// 此处为Mock功能，等待后端接入 — 金库路径、同步状态均为Mock数据
const SettingsView = () => (
  <div className="max-w-[600px] mx-auto animate-in fade-in duration-500">
    <div className="mb-6 mt-2">
      <h1 className="text-3xl font-semibold mb-2 text-white tracking-tight">系统设置</h1>
      <p className="text-[#899298] text-sm">本地模式 · 数据仅存储在当前设备</p>
    </div>

    <div className="space-y-4">
      <GlassPanel className="p-6">
        <h2 className="text-base font-medium text-white mb-4 border-b border-white/10 pb-3 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[#86d7ff]" /> 本地存储库 (Local Vault)
        </h2>

        <div className="space-y-5">
          <div>
            <label className="text-xs text-[#899298] block mb-1.5">存储模式</label>
            <p className="text-[9px] text-[#899298] mt-0.5">当前数据保存在浏览器本地 IndexedDB</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value="Browser Local Storage Mode"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e0e3e6] focus:outline-none focus:border-[#86d7ff]/50"
              />
              <button disabled className="px-3 py-1.5 bg-white/5 text-[#899298] rounded-lg text-xs cursor-not-allowed opacity-50" title="Desktop App 后开放真实本地金库路径">更改位置</button>
            </div>
            <p className="text-[9px] text-[#899298]/60 mt-1.5">Desktop 打包后再开放真实本地金库路径</p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-white text-xs font-medium">离线优先模式</p>
              <p className="text-[#899298] text-[10px] mt-0.5">始终启用（本地模式）· 所有数据保存在本地设备上</p>
            </div>
            <div className="w-8 h-5 bg-[#86d7ff] rounded-full relative opacity-70 cursor-not-allowed shadow-[0_0_10px_rgba(134,215,255,0.3)]">
              <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#0b0f11] rounded-full"></div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="p-6">
        <h2 className="text-base font-medium text-white mb-4 border-b border-white/10 pb-3 flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#c8a0f0]" /> 智能能力 (Intelligence)
        </h2>
        {(() => {
          try {
            const status = getCapabilityStatus();
            const modeLabel = status.mode === 'core'
              ? '核心模式'
              : status.mode === 'model_available'
                ? (status.embeddingProviderId === 'dev' || status.reasoningProviderId === 'dev' ? '开发模式' : '模型可用')
                : '降级模式';
            const modeDesc = status.mode === 'core'
              ? '仅本地规则引擎可用'
              : status.mode === 'model_available'
                ? (status.embeddingProviderId === 'dev' || status.reasoningProviderId === 'dev' ? 'Mock Provider 可用（仅供开发/测试，不代表真实模型能力）' : 'Provider 已就绪')
                : '模型不可用，系统以基础能力运行';
            const modeColor = status.mode === 'core'
              ? 'text-[#899298]'
              : status.mode === 'model_available'
                ? (status.embeddingProviderId === 'dev' || status.reasoningProviderId === 'dev' ? 'text-amber-400' : 'text-[#9cf4d4]')
                : 'text-[#ffb4ab]';
            const dotColor = status.mode === 'core'
              ? 'bg-[#899298]'
              : status.mode === 'model_available'
                ? (status.embeddingProviderId === 'dev' || status.reasoningProviderId === 'dev' ? 'bg-amber-400' : 'bg-[#9cf4d4]')
                : 'bg-[#ffb4ab]';
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <p className={`text-xs font-medium ${modeColor}`}>{modeLabel}</p>
                    </div>
                    <p className="text-[#899298] text-[10px] mt-1 ml-4">{modeDesc}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase mb-1">Embedding</p>
                    <p className="text-xs text-white">{status.embeddingAvailability === 'available' ? '可用' : status.embeddingAvailability === 'error' ? '错误' : '不可用'}</p>
                    {status.embeddingProviderId && <p className="text-[9px] text-[#899298] mt-0.5">{status.embeddingProviderId}</p>}
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[9px] text-[#899298] font-semibold tracking-wider uppercase mb-1">Reasoning</p>
                    <p className="text-xs text-white">{status.reasoningAvailability === 'available' ? '可用' : status.reasoningAvailability === 'error' ? '错误' : '不可用'}</p>
                    {status.reasoningProviderId && <p className="text-[9px] text-[#899298] mt-0.5">{status.reasoningProviderId}</p>}
                  </div>
                </div>
              </div>
            );
          } catch {
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#899298]" />
                  <p className="text-xs font-medium text-[#899298]">核心模式</p>
                </div>
                <p className="text-[#899298] text-[10px] ml-4">仅本地规则引擎可用</p>
              </div>
            );
          }
        })()}
      </GlassPanel>

      <GlassPanel className="p-6">
        <h2 className="text-base font-medium text-white mb-4 border-b border-white/10 pb-3 flex items-center gap-2">
          <Cloud className="w-4 h-4 text-[#899298]" /> 云端同步
        </h2>
        <p className="text-xs text-[#899298] leading-relaxed">云端存储不属于当前路线。Atlax 当前仅支持本地 IndexedDB 存储，所有数据保存在您的设备上。</p>
      </GlassPanel>
    </div>
  </div>
);

// 7. 每日简报视图 (Daily Briefing View)
// 真实数据接入：使用 useDailyBrief hook 聚合本地数据
const DailyBriefingView = ({ brief, briefLoading, onOpenDraft, onOpenEntry, onOpenDock, onOpenMind, onOpenReview }: { brief: DailyBriefData; briefLoading: boolean; onOpenDraft?: (draftId?: number) => void; onOpenEntry?: (entryId?: number) => void; onOpenDock?: () => void; onOpenMind?: () => void; onOpenReview?: () => void }) => {
  const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  return (
    <div className="max-w-[1200px] mx-auto animate-in fade-in duration-500 pb-12">
      {/* Newspaper Header */}
      <div className="border-b-[1.5px] border-white/20 pb-6 mb-8 pt-8">
        <h1 className="text-5xl font-bold tracking-tighter text-white uppercase text-center mb-4">Atlax Daily Briefing</h1>
        <div className="flex justify-between items-center text-[#899298] text-[10px] font-semibold tracking-widest uppercase border-y border-white/10 py-2.5">
          <span>Local Edition</span>
          <span>{currentDate}</span>
          <span>Personal</span>
        </div>
      </div>

      {/* Main Grid - Newspaper columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">

        {/* Left Column (Main Article) */}
        <div className="lg:col-span-8 flex flex-col gap-10">

          {/* 昨日Mind视图 */}
          <section>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-5">
              <Network className="w-5 h-5 text-[#86d7ff]" />
              <h2 className="text-xl font-bold text-white tracking-tight uppercase">今日概览</h2>
            </div>

            <div className="aspect-[21/9] border border-white/5 bg-[#1c2023]/40 rounded-sm relative overflow-hidden flex items-center justify-center group mb-5 cursor-pointer hover:border-[#86d7ff]/30 transition-colors" onClick={onOpenMind}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #86d7ff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
              <div className="absolute w-40 h-40 border border-[#86d7ff]/20 rounded-full animate-[spin_60s_linear_infinite]"></div>
              <div className="absolute w-60 h-60 border border-white/5 rounded-full animate-[spin_90s_linear_infinite_reverse]"></div>
              <div className="relative z-10 text-center">
                <div className="w-12 h-12 rounded-full bg-[#86d7ff]/10 border border-[#86d7ff]/30 backdrop-blur-md flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-6 h-6 text-[#86d7ff]" />
                </div>
                {briefLoading ? (
                  <p className="text-xs text-[#899298] tracking-widest uppercase">Loading...</p>
                ) : (
                  <p className="text-xs text-[#899298] tracking-widest uppercase">{brief.mindNodeCount} Nodes • {brief.mindEdgeCount} Edges</p>
                )}
              </div>
            </div>
            <p className="text-sm text-[#e0e3e6] leading-relaxed columns-1 md:columns-2 gap-8 text-justify">
              {briefLoading ? (
                '正在读取本地数据...'
              ) : brief.mindNodeCount === 0 ? (
                <span>您的思维图谱尚为空。开始捕获想法并归档文档后，图谱将自动构建。<span className="text-[#86d7ff] font-medium">本地优先</span>，所有数据仅存储在您的设备上。</span>
              ) : (
                <span>您的神经图谱目前有 <span className="text-[#86d7ff] font-medium">{brief.mindNodeCount} 个节点</span>和 <span className="text-[#86d7ff] font-medium">{brief.mindEdgeCount} 条连线</span>。{brief.todayCreatedCount > 0 ? `今日新增 ${brief.todayCreatedCount} 条内容。` : '今日暂无新增内容。'}{brief.activeTipCount > 0 ? `有 ${brief.activeTipCount} 条 Tips 等待整理。` : ''}所有数据<span className="text-[#86d7ff] font-medium">本地优先</span>，仅存储在您的设备上。</span>
              )}
            </p>
          </section>

          <hr className="border-t border-white/10 border-b-0" />

          {/* 待整理 Tips & 活跃 Drafts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <section className="md:border-r border-white/10 md:pr-10">
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#9cf4d4]" /> 待整理 Tips
              </h3>
              {briefLoading ? (
                <p className="text-sm text-[#899298]">Loading...</p>
              ) : brief.recentTips.length === 0 ? (
                <div className="py-6 text-center rounded-[16px] border border-dashed border-white/5 bg-white/[0.01]">
                  <p className="text-[11px] text-[#899298]">暂无待整理 Tips</p>
                  <p className="text-[10px] text-[#899298]/60 mt-1">通过 Quick Capture 捕获想法</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {brief.recentTips.slice(0, 4).map((tip) => (
                    <li key={tip.id} className="flex items-start gap-3 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition-colors" onClick={() => onOpenDock?.()}>
                      <CheckCircle2 className="w-4 h-4 text-[#9cf4d4] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-sm text-[#e0e3e6] leading-relaxed">{tip.content.slice(0, 80)}</span>
                        <p className="text-[10px] text-[#899298] mt-0.5">{formatRelativeTime(tip.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#c8a0f0]" /> 活跃 Drafts
              </h3>
              {briefLoading ? (
                <p className="text-sm text-[#899298]">Loading...</p>
              ) : brief.recentDrafts.length === 0 ? (
                <div className="py-6 text-center rounded-[16px] border border-dashed border-white/5 bg-white/[0.01]">
                  <p className="text-[11px] text-[#899298]">暂无活跃草稿</p>
                  <p className="text-[10px] text-[#899298]/60 mt-1">在 Editor 中创建新 Draft</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {brief.recentDrafts.slice(0, 3).map((draft) => (
                    <div key={draft.id} className="group cursor-pointer" onClick={() => onOpenDraft?.(draft.id)}>
                      <h4 className="text-sm font-semibold text-white group-hover:text-[#86d7ff] transition-colors mb-1">{draft.title || '无标题草稿'}</h4>
                      <p className="text-xs text-[#899298] leading-relaxed">
                        {draft.content ? `${draft.content.slice(0, 60)}...` : '空内容'} • {formatRelativeTime(draft.updatedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 最近 Documents */}
          <section>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-5 mt-6">
              <FileText className="w-4 h-4 text-[#86d7ff]" />
              <h2 className="text-lg font-bold text-white tracking-tight uppercase">最近 Documents</h2>
            </div>
            {briefLoading ? (
              <p className="text-sm text-[#899298]">Loading...</p>
            ) : brief.recentDocuments.length === 0 ? (
              <div className="py-8 text-center rounded-[16px] border border-dashed border-white/5 bg-white/[0.01]">
                <FileText className="w-6 h-6 text-[#899298]/30 mx-auto mb-2" />
                <p className="text-[11px] text-[#899298]">暂无已归档文档</p>
                <p className="text-[10px] text-[#899298]/60 mt-1">将 Draft 发布或从 Tip 转化后文档将在此显示</p>
              </div>
            ) : (
              <div className="space-y-3">
                {brief.recentDocuments.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => onOpenEntry?.(doc.id)}>
                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#899298] group-hover:text-[#86d7ff] group-hover:border-[#86d7ff]/30 transition-all">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs text-white font-medium">{doc.title}</h4>
                      <p className="text-[10px] text-[#899298] mt-0.5">{doc.type || '文档'} • {formatRelativeTime(doc.archivedAt || doc.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        {/* Vertical divider line for large screens */}
        <div className="hidden lg:block absolute left-[66.666%] top-0 bottom-0 w-px bg-white/10"></div>

        {/* Right Column (Side Panels) */}
        <div className="lg:col-span-4 flex flex-col gap-8 lg:pl-4">

          {/* Quick Notes & Drafts Status */}
          <section>
            <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-wider border-b border-white/10 pb-2">缓冲区载荷监控</h3>
            <div className="space-y-5">
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-xs text-[#899298] flex items-center gap-1.5"><Command className="w-3.5 h-3.5" /> Quick Notes</span>
                  <span className={`text-xs font-semibold ${brief.activeTipCount >= 5 ? 'text-[#ffb4ab]' : 'text-[#86d7ff]'}`}>{brief.activeTipCount} 待处理</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${brief.activeTipCount >= 5 ? 'bg-[#ffb4ab]' : 'bg-[#86d7ff]'}`} style={{ width: `${Math.min(100, Math.round((brief.activeTipCount / 10) * 100))}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-xs text-[#899298] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Drafts 积压</span>
                  <span className={`text-xs font-semibold ${brief.activeDraftCount >= 5 ? 'text-[#ffb4ab]' : 'text-[#a8c8ff]'}`}>{brief.activeDraftCount} 份草稿</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${brief.activeDraftCount >= 5 ? 'bg-[#ffb4ab]' : 'bg-[#a8c8ff]'}`} style={{ width: `${Math.min(100, Math.round((brief.activeDraftCount / 20) * 100))}%` }}></div>
                </div>
              </div>
            </div>
          </section>

          {/* 本地维护建议 */}
          <section>
            <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-wider border-b border-white/10 pb-2">本地维护建议</h3>
            {briefLoading ? (
              <p className="text-sm text-[#899298]">Loading...</p>
            ) : brief.briefHints.length === 0 ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="w-5 h-5 text-[#9cf4d4] mx-auto mb-2" />
                <p className="text-[11px] text-[#9cf4d4]">工作区状态良好</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {brief.briefHints.map((hint, i) => (
                  <div key={i} className="py-2.5 flex justify-between items-center group cursor-pointer hover:bg-white/5 rounded-lg px-2 -mx-2 transition-colors" onClick={() => {
                    switch (hint.type) {
                      case 'tip_pressure': onOpenDock?.(); break;
                      case 'draft_pressure': onOpenDraft?.(hint.targetId as number | undefined); break;
                      case 'document_empty': onOpenEntry?.(); break;
                      case 'mind_empty': onOpenMind?.(); break;
                      case 'collection_active':
                      case 'tag_suggestion': onOpenReview?.(); break;
                    }
                  }}>
                    <span className={`text-xs ${hint.priority === 'high' ? 'text-[#e0e3e6]' : 'text-[#899298]'} group-hover:text-white transition-colors`}>{hint.label}</span>
                    <span className={`text-[10px] font-mono ${hint.priority === 'high' ? 'text-[#ffb4ab]' : hint.priority === 'medium' ? 'text-[#86d7ff]' : 'text-[#899298]'}`}>{hint.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 金库统计 */}
          <section>
            <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-wider border-b border-white/10 pb-2">金库统计</h3>
            <div className="divide-y divide-white/5">
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#e0e3e6] group-hover:text-white transition-colors">Documents</span>
                <span className="text-[10px] text-[#9cf4d4] font-mono">{brief.documentCount}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#e0e3e6] group-hover:text-white transition-colors">Mind Nodes</span>
                <span className="text-[10px] text-[#9cf4d4] font-mono">{brief.mindNodeCount}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#899298] group-hover:text-white transition-colors">Tags</span>
                <span className="text-[10px] text-[#899298] font-mono">{brief.tagCount}</span>
              </div>
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#899298] group-hover:text-white transition-colors">Collections</span>
                <span className="text-[10px] text-[#899298] font-mono">{brief.collectionCount}</span>
              </div>
            </div>
          </section>

          {/* 定制化看板预留 (Pro Feature) */}
          <section className="mt-2 border border-dashed border-[#c8a0f0]/30 bg-gradient-to-b from-[#c8a0f0]/5 to-transparent rounded-lg p-5 relative overflow-hidden group cursor-pointer hover:border-[#c8a0f0]/50 transition-colors">
            <div className="absolute top-0 right-0 bg-[#c8a0f0]/20 text-[#c8a0f0] text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider flex items-center gap-1">
              <Crown className="w-3 h-3" /> Pro 模块
            </div>
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-[#c8a0f0]" /> 业务定制看板
            </h3>
            <p className="text-xs text-[#899298] mb-5 leading-relaxed">
              您的工作流不仅限于知识。将 Jira、Linear 或 GitHub Issues 无缝集成到您的每日简报中。
            </p>
            <div className="grid grid-cols-2 gap-3 opacity-40 group-hover:opacity-80 transition-opacity">
              <div className="h-14 bg-[#1c2023]/40 rounded-md border border-white/10 flex flex-col items-center justify-center">
                <CheckCircle2 className="w-4 h-4 mb-1.5 text-[#86d7ff]" />
                <span className="text-[9px] text-white">Todo-list</span>
              </div>
              <div className="h-14 bg-[#1c2023]/40 rounded-md border border-white/10 flex flex-col items-center justify-center">
                <Layers className="w-4 h-4 mb-1.5 text-[#9cf4d4]" />
                <span className="text-[9px] text-white">项目进度</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

// ==========================================
// 主应用壳 (Main App Shell)
// ==========================================

export default function WorkspacePage() {
  const [activeTab, setActiveTab] = useState('home');
  const [showSourcePacket, setShowSourcePacket] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isNodeSelected, setIsNodeSelected] = useState(false);
  const [pendingOpenDraftId, setPendingOpenDraftId] = useState<number | null>(null);
  const [pendingOpenEntryId, setPendingOpenEntryId] = useState<number | null>(null);
  const [pendingMindFocusNodeId, setPendingMindFocusNodeId] = useState<string | null>(null);
  const [pendingDockFilter, setPendingDockFilter] = useState<string | null>(null);
  const [activeEditorMeta, setActiveEditorMeta] = useState<{ id: number | null; title: string; status: string }>({ id: null, title: 'Untitled', status: 'idle' });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setIsNodeSelected(false);
  }, [activeTab]);

  useEffect(() => {
    let resolvedUser = getCurrentUser()

    if (!resolvedUser) {
      const existingUsers = listLocalUsers()
      if (existingUsers.length > 0) {
        resolvedUser = existingUsers[0]
        loginByUserId(resolvedUser.id)
      } else {
        resolvedUser = registerUser('Atlax User')
      }
    }

    if (resolvedUser) {
      setUserId(resolvedUser.id)
    }
  }, [])

  const effectiveUserId = userId || ''
  const tipsHook = useTips(effectiveUserId)
  const homeIntelligence = useHomeIntelligence(effectiveUserId)
  const dailyBriefHook = useDailyBrief(effectiveUserId)
  const spotlightSearch = useSpotlightSearch(effectiveUserId, searchQuery);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) {
      setTimeout(() => setSearchQuery(''), 200);
    }
  }, [isSearchOpen]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }, [])

  if (!userId) {
    return (
      <div className="min-h-screen bg-[#0b0f11] flex items-center justify-center">
        <div className="text-[#899298] text-sm">正在初始化用户...</div>
      </div>
    )
  }

  const navItems = [
    { id: 'home', icon: Home, label: '主页' },
    { id: 'mind', icon: Brain, label: '思维' },
    { id: 'dock', icon: Archive, label: '停靠区' },
    { id: 'editor', icon: PenTool, label: '编辑器' },
    { id: 'review', icon: BookOpen, label: '回顾' },
  ];

  return (
    <div className="min-h-screen bg-[#0b0f11] text-[#e0e3e6] font-sans selection:bg-[#86d7ff]/30 selection:text-white flex relative overflow-hidden">

      {/* A. Global Rail */}
      <aside className="fixed left-0 top-0 h-full z-50 bg-[#0b0f11] w-[48px] flex flex-col items-center py-4 border-r border-white/[0.07]">
        {/* Top logo mark */}
        <div className="mb-6 relative group cursor-pointer flex items-center justify-center w-8 h-8">
          <div className="absolute w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_10px_rgba(156,176,255,0.5),0_0_0_1.5px_rgba(156,176,255,0.7)] group-hover:scale-[1.02] z-0"></div>
          <div className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-[#9cb0ff] to-[#6a7efc] shadow-[inset_0_1.5px_4px_rgba(255,255,255,0.5),0_3px_8px_rgba(0,0,0,0.2)] flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02] z-10 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent"></div>
            <div className="relative w-1.5 h-1.5 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.3)]"></div>
          </div>
        </div>

        {/* Vertical icon navigation */}
        <nav className="flex flex-col gap-3 items-center flex-1 w-full">
          {navItems.map((item) => {
            const isActive = activeTab === item.id || (item.id === 'home' && activeTab === 'toolbox');
            return (
              <div
                key={item.id}
                onClick={() => {
                  if (item.id === 'editor') {
                    setShowSourcePacket(false)
                    setShowInspector(false)
                  }
                  setActiveTab(item.id)
                }}
                className={`group cursor-pointer flex items-center justify-center w-[32px] h-[32px] rounded-[8px] relative transition-all ${isActive ? 'text-[#86d7ff] bg-white/5' : 'text-[#8d989f] hover:text-white hover:bg-white/5'}`}
              >
                {isActive && (
                  <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[2px] h-[16px] bg-[#86d7ff] rounded-r-full shadow-[0_0_8px_#86d7ff]"></div>
                )}
                <item.icon className="w-[16px] h-[16px]" />
              </div>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center w-full gap-3">
          <div
            onClick={() => setIsSearchOpen(true)}
            className="group cursor-pointer flex items-center justify-center w-[32px] h-[32px] rounded-[8px] transition-all text-[#8d989f] hover:text-white hover:bg-white/5"
          >
            <Search className="w-[16px] h-[16px]" />
          </div>

          <div
            onClick={() => setActiveTab('settings')}
            className={`group cursor-pointer flex items-center justify-center w-[32px] h-[32px] rounded-[8px] relative transition-all ${activeTab === 'settings' ? 'text-[#86d7ff] bg-white/5' : 'text-[#8d989f] hover:text-white hover:bg-white/5'}`}
          >
             {activeTab === 'settings' && (
                  <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[2px] h-[16px] bg-[#86d7ff] rounded-r-full shadow-[0_0_8px_#86d7ff]"></div>
              )}
            <Settings className="w-[16px] h-[16px]" />
          </div>
        </div>
      </aside>

      {/* 顶部栏 & 主内容区 */}
      <div className="flex-1 ml-[48px] min-w-0 w-[calc(100vw-48px)] flex flex-col h-screen relative z-10 overflow-hidden">
        {/* C. Top bar */}
        <header className="flex justify-between items-center px-4 h-[44px] bg-[#0b0f11]/90 border-b border-white/[0.07] shrink-0 sticky top-0 z-40 backdrop-blur-md">
          {activeTab === 'editor' ? (
            <>
              {/* 编辑器特定面包屑导航 */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#899298]/75 hover:text-white cursor-pointer transition-colors">Atlax</span>
                <span className="text-[#899298]">/</span>
                <span className="text-[#899298]/75 hover:text-white cursor-pointer transition-colors">编辑器</span>
                <span className="text-[#899298]">/</span>
                <span className="max-w-[320px] truncate text-xs font-medium text-[#d8dde2] cursor-pointer" title={activeEditorMeta.title}>
                  {activeEditorMeta.title || 'Untitled'}
                </span>
              </div>

              <div />
            </>
          ) : (
            <>
              {/* Left tabs */}
              <div className="flex gap-6 text-[14px] font-medium h-full items-end pb-[10px]">
                <span
                  onClick={() => setActiveTab('home')}
                  className={`cursor-pointer transition-colors ${activeTab === 'home' ? 'text-white border-b-2 border-[#86d7ff] pb-1.5' : 'text-[#8d989f] hover:text-white'}`}
                >
                  今日
                </span>
                <span
                  onClick={() => setActiveTab('briefing')}
                  className={`cursor-pointer transition-colors ${activeTab === 'briefing' ? 'text-white border-b-2 border-[#86d7ff] pb-1.5' : 'text-[#8d989f] hover:text-white'}`}
                >
                  每日简报
                </span>
                <span
                  onClick={() => setActiveTab('toolbox')}
                  className={`cursor-pointer transition-colors ${activeTab === 'toolbox' ? 'text-white border-b-2 border-[#86d7ff] pb-1.5' : 'text-[#8d989f] hover:text-white'}`}
                >
                  Toolbox
                </span>
              </div>
              
              <div />
            </>
          )}
        </header>

        {/* 动态页面内容区 - 如果是 Dock 视图，彻底移除左右边距，实现无缝铺满 */}
        <main className={`flex-1 min-w-0 ${activeTab === 'editor' || activeTab === 'dock' || activeTab === 'mind' ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-12 custom-scrollbar'} ${activeTab === 'dock' || activeTab === 'mind' ? 'px-0' : 'px-8'}`}>
          {activeTab === 'home' && (
            <>
              <HomeView tips={tipsHook.tips} tipsLoading={tipsHook.loading} onConvertTipToDraft={async (tipId: number) => { const result = await tipsHook.convertTipToDraft(tipId); if (result.draftId) emit({ type: 'tip_converted', tipId, draftId: result.draftId }); return result; }} onDiscardTip={async (tipId: number) => { const result = await tipsHook.discardTip(tipId); emit({ type: 'tip_discarded', tipId }); return result; }} onToast={showToast} intelligence={homeIntelligence.data} intelligenceLoading={homeIntelligence.loading} onOpenDraft={(draftId) => { if (draftId) setPendingOpenDraftId(draftId); setActiveTab('editor'); }} onOpenEntry={(entryId) => { if (entryId) setPendingOpenEntryId(entryId); setActiveTab('editor'); }} onOpenDock={() => setActiveTab('dock')} onOpenReview={() => setActiveTab('review')} onOpenBriefing={() => setActiveTab('briefing')} onOpenMind={() => setActiveTab('mind')} />
            </>
          )}
          {activeTab === 'briefing' && <DailyBriefingView brief={dailyBriefHook.data} briefLoading={dailyBriefHook.loading} onOpenDraft={(draftId) => { if (draftId) setPendingOpenDraftId(draftId); setActiveTab('editor'); }} onOpenEntry={(entryId) => { if (entryId) setPendingOpenEntryId(entryId); setActiveTab('editor'); }} onOpenDock={() => setActiveTab('dock')} onOpenMind={() => setActiveTab('mind')} onOpenReview={() => setActiveTab('review')} />}
          {activeTab === 'toolbox' && <ToolboxView />}
          {activeTab === 'mind' && <MindView userId={userId} onToast={showToast} onSelectionChange={setIsNodeSelected} initialFocusNodeId={pendingMindFocusNodeId} onFocusNodeConsumed={() => setPendingMindFocusNodeId(null)} onOpenEditor={(documentId, sourceType) => { setShowSourcePacket(false); setShowInspector(false); if (sourceType === 'document') { setPendingOpenEntryId(documentId); setPendingOpenDraftId(null); } else { setPendingOpenDraftId(documentId); setPendingOpenEntryId(null); } setActiveTab('editor'); }} />}
          {activeTab === 'dock' && <DockView userId={userId} onOpenEditor={(documentId, sourceType) => { setShowSourcePacket(false); setShowInspector(false); if (sourceType === 'document') { setPendingOpenEntryId(documentId); setPendingOpenDraftId(null); } else { setPendingOpenDraftId(documentId); setPendingOpenEntryId(null); } setActiveTab('editor'); }} onToast={showToast} onFocusMindNode={(nodeId: string) => { setPendingMindFocusNodeId(nodeId); setActiveTab('mind'); }} initialHealthFilter={pendingDockFilter} />}
          {activeTab === 'editor' && <DraftEditorView userId={userId} showSourcePacket={showSourcePacket} showInspector={showInspector} onToggleSourcePacket={() => setShowSourcePacket(v => !v)} onToggleInspector={() => setShowInspector(v => !v)} onToast={showToast} initialDraftId={pendingOpenDraftId} initialEntryId={pendingOpenEntryId} onInitialDraftConsumed={() => setPendingOpenDraftId(null)} onInitialEntryConsumed={() => setPendingOpenEntryId(null)} onActiveDraftMetaChange={setActiveEditorMeta} />}
          {activeTab === 'review' && <ReviewView onNavigateToMind={() => setActiveTab('mind')} onNavigateToSuggestion={(target) => { setActiveTab(target.tab as any); if (target.filter) { setPendingDockFilter(target.filter); } }} />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* ==========================================
          全局 MacOS 聚焦搜索层 (Spotlight Search Overlay) 
          ========================================== */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[100] bg-[#0b0f11]/40 backdrop-blur-sm flex justify-center items-start pt-[15vh] transition-all"
          onClick={() => setIsSearchOpen(false)}
        >
          {/* 搜索主容器 */}
          <div
            className={`w-[640px] max-w-[90vw] flex flex-col relative animate-in fade-in zoom-in-95 duration-200 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${searchQuery ? 'rounded-[20px]' : 'rounded-full'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* 顶部搜索框 (输入时顶部圆角，无输入时完全圆角/胶囊) */}
            <div className={`flex items-center px-5 h-14 bg-[#1c2023]/70 backdrop-blur-[40px] border-[0.5px] border-white/10 relative z-10 transition-all duration-300 ${searchQuery ? 'rounded-t-[20px] border-b-0' : 'rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}>
              <Search className="w-5 h-5 text-[#86d7ff] mr-3 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索 MindDock，或输入命令..."
                className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder:text-[#899298]/70 font-medium"
              />
              {searchQuery ? (
                <button onClick={() => setSearchQuery('')} className="p-1 rounded-full hover:bg-white/10 text-[#899298] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-1 shrink-0 ml-3 opacity-50">
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono border border-white/10 text-white">⌘</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono border border-white/10 text-white">K</span>
                </div>
              )}
            </div>

            {/* 底部结果抽屉 (MacOS 液态毛玻璃效果) */}
            {searchQuery && (
              <div className="bg-[#1c2023]/70 backdrop-blur-[40px] border-[0.5px] border-white/10 border-t-0 rounded-b-[20px] overflow-hidden flex flex-col max-h-[60vh]">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mx-4"></div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
  {spotlightSearch.loading ? (
    <div className="py-8 text-center">
      <p className="text-[11px] text-[#899298]">搜索中...</p>
    </div>
  ) : spotlightSearch.results.length === 0 ? (
    <div className="py-8 text-center">
      <Search className="w-6 h-6 text-[#899298]/30 mx-auto mb-2" />
      <p className="text-[11px] text-[#899298]">未找到与「{searchQuery}」相关的结果</p>
      <p className="text-[10px] text-[#899298]/60 mt-1">尝试其他关键词</p>
    </div>
  ) : (
    <>
      {(() => {
        const grouped = spotlightSearch.results.reduce((acc, r) => {
          const key = r.type === 'draft' || r.type === 'document' ? 'knowledge' : r.type === 'mind_node' ? 'mind' : r.type === 'settings_command' ? 'settings' : 'capture'
          if (!acc[key]) acc[key] = []
          acc[key].push(r)
          return acc
        }, {} as Record<string, SpotlightSearchResult[]>)
        return (
          <>
            {grouped.knowledge && grouped.knowledge.length > 0 && (
              <div className="mb-4">
                <h4 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase px-3 mb-2">知识库</h4>
                <div className="space-y-1">
                  {grouped.knowledge.map((result) => (
                    <div key={`${result.type}-${result.id}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#86d7ff]/10 cursor-pointer group transition-colors" onClick={() => { if (result.type === 'draft') { setPendingOpenDraftId(result.targetId as number); } else if (result.type === 'document') { setPendingOpenEntryId(result.targetId as number); } setActiveTab(result.targetTab); setIsSearchOpen(false); }}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] ${result.type === 'draft' ? 'bg-[#9cf4d4]/20 text-[#9cf4d4]' : 'bg-[#86d7ff]/20 text-[#86d7ff]'}`}>
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-medium text-white truncate">{result.title}</h5>
                        <p className="text-[10px] text-[#899298] truncate">{result.snippet}</p>
                      </div>
                      <span className="text-[10px] text-[#899298] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">跳转 ↵</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {grouped.capture && grouped.capture.length > 0 && (
              <div className="mb-4">
                <h4 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase px-3 mb-2">闪念捕获</h4>
                <div className="space-y-1">
                  {grouped.capture.map((result) => (
                    <div key={`tip-${result.id}`} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 cursor-pointer group transition-colors" onClick={() => { setActiveTab(result.targetTab); setIsSearchOpen(false); }}>
                      <Activity className="w-4 h-4 text-[#899298] group-hover:text-[#86d7ff]" />
                      <h5 className="text-sm text-[#e0e3e6] group-hover:text-white flex-1 truncate">{result.title}</h5>
                      <span className="text-[10px] text-[#899298] shrink-0">Tip</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {grouped.mind && grouped.mind.length > 0 && (
              <div className="mb-4">
                <h4 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase px-3 mb-2">思维图谱</h4>
                <div className="space-y-1">
                  {grouped.mind.map((result) => (
                    <div key={`mind-${result.id}`} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 cursor-pointer group transition-colors" onClick={() => { setPendingMindFocusNodeId(result.targetId as string); setActiveTab(result.targetTab); setIsSearchOpen(false); }}>
                      <Brain className="w-4 h-4 text-[#899298] group-hover:text-[#a8c8ff]" />
                      <h5 className="text-sm text-[#e0e3e6] group-hover:text-white flex-1 truncate">{result.title}</h5>
                      <span className="text-[10px] text-[#899298] shrink-0">节点</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {grouped.settings && grouped.settings.length > 0 && (
              <div className="mb-2">
                <h4 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase px-3 mb-2">设置</h4>
                <div className="space-y-1">
                  {grouped.settings.map((result) => (
                    <div key={`settings-${result.id}`} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 cursor-pointer group transition-colors" onClick={() => { setActiveTab(result.targetTab); setIsSearchOpen(false); }}>
                      <Settings className="w-4 h-4 text-[#899298] group-hover:text-[#9cf4d4]" />
                      <h5 className="text-sm text-[#e0e3e6] group-hover:text-white flex-1">{result.title}</h5>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      })()}
    </>
  )}
</div>

                {/* 底部操作提示栏 */}
                <div className="bg-black/20 px-4 py-2 flex items-center justify-between text-[10px] text-[#899298] border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="px-1 py-0.5 rounded bg-white/10 border border-white/10">↑</span><span className="px-1 py-0.5 rounded bg-white/10 border border-white/10">↓</span> 导航</span>
                    <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10">↵</span> 确认</span>
                  </div>
                  <span>MindDock 本地搜索</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 全局 CSS (Tailwind 中无法直接定义的伪元素/动画) */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(134, 215, 255, 0.3);
        }
      `}} />

      {/* Toast 通知 */}

      {(activeTab === 'dock' || (!isNodeSelected && activeTab !== 'editor')) && (
        <QuickCapture
          hidden={activeTab === 'editor'}
          onSubmit={async (text: string) => {
            const tip = await tipsHook.createTip(text, 'quick-capture')
            if (tip) {
              emit({ type: 'tip_created', tipId: tip.id })
              showToast('Tip 已创建')
            }
          }}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="px-4 py-2.5 bg-[#1c2023]/90 backdrop-blur-[20px] border border-white/10 rounded-xl shadow-2xl text-sm text-white">
            {toastMsg}
          </div>
        </div>
      )}
    </div>
  );
}
