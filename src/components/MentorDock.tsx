import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { X, Bot, Bell, LayoutGrid, FileText, Inbox, CheckCheck, Trash2, Circle, ChevronDown, ChevronRight, GripVertical, Pencil, Trash, Loader2, AlertTriangle, Zap, PencilLine, GitCommit as GitCommitIcon, List, History, Info, RefreshCw, Search, Tags, Check, XCircle, Package, Eye } from 'lucide-react';

import { useNotifications } from '@/modules/notifications/NotificationProvider';
import { useCapture } from '@/modules/capture/CaptureProvider';
import { useVault } from '@/modules/vault/VaultProvider';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { useAISuggestions } from '@/modules/ai/AISuggestionsProvider';
import { ContextPackPanel } from '@/modules/context-pack/ContextPackPanel';
import { documentService, type DocumentMetadata } from '@/services/filesystem/documents';
import { gitService, type GitCommit } from '@/services/filesystem/git';
import { summaryTagsService, type SummaryTagsResult } from '@/services/index/summary-tags';
import { personalizationService } from '@/services/index/personalization';
import { metadataService, type KnowledgeTypeCandidate } from '@/services/index/metadata';
import type { ContextPack } from '@/services/index/context-pack';
import type { TriggerResult } from '@/services/index/mentor-triggers';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import { mentorSuggestionsService, type MentorSuggestion } from '@/services/mentor/mentor-suggestions';

export type PlatterTab = 'mentor' | 'notifications' | 'inbox' | 'widgets' | 'document-context' | 'context-pack';

interface PlatterProps {
  open: boolean;
  activeTab: PlatterTab;
  onTabChange: (tab: PlatterTab) => void;
  onClose: () => void;
  activeDocumentPath?: string;
  activeDocumentName?: string;
  activeDocumentContent?: string;
  onAIConfig?: () => void;
  onAICheckConnection?: () => void;
  onAIRuntimeLogs?: () => void;
  onScrollToHeading?: (heading: string) => void;
  onScrollToLine?: (line: number) => void;
  onOpenVersionDiff?: (commit: GitCommit) => void;
  onGeneratePrompt?: (pack: ContextPack) => void;
  onOpenInEditor?: (documentPath: string, sourceType: string) => void;
  onActivePackChange?: (packId: string | null) => void;
  triggerResults?: TriggerResult[];
  onDismissTrigger?: (triggerType: string) => void;
  onJudgeTrigger?: (trigger: TriggerResult) => Promise<string | null>;
  onAddTriggerToPack?: (trigger: TriggerResult) => Promise<boolean>;
  onDocumentUpdated?: () => void;
  pendingContextPackItem?: {
    documentPath: string;
    title: string | null;
    summary: string | null;
    tags: string | null;
    content: string | null;
    heading: string | null;
    start_line: number | null;
    end_line: number | null;
  } | null;
  onOpenSettings?: () => void;
  onFindRelated?: (docPath: string) => void;
  onExplain?: (docPath: string) => void;
  onSummarize?: (docPath: string) => void;
  relatedResults?: any[];
  onClearRelatedResults?: () => void;
  onDocSelect?: (docPath: string) => void;
  contextPackRefreshKey?: number;
}

const PLATTER_TABS: { id: PlatterTab; label: string; icon: typeof Bot }[] = [
  { id: 'mentor', label: 'Mentor', icon: Bot },
  { id: 'notifications', label: '通知', icon: Bell },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'widgets', label: 'Widgets', icon: LayoutGrid },
  { id: 'document-context', label: 'Context', icon: FileText },
  { id: 'context-pack', label: '上下文包', icon: Package },
];

function ExplorerSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  children,
  contentClassName,
}: {
  title: string;
  icon: typeof FileText;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="border-b border-[#e6e6dc] dark:border-[#2f2f2f] last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left hover:bg-stone-100/70 dark:hover:bg-stone-800/40 transition-colors"
      >
        <ChevronRight
          size={11}
          className={`shrink-0 text-[#7e7e78] dark:text-[#8e8e8e] transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <Icon size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
        <span className="text-[10px] font-mono uppercase font-bold tracking-wide text-[#2c2c2a] dark:text-[#e3e3e3]">
          {title}
        </span>
      </button>
      {expanded && children && <div className={contentClassName ?? 'pb-1'}>{children}</div>}
    </div>
  );
}

interface TocEntry {
  level: number;
  text: string;
  line: number;
  children: TocEntry[];
}

function buildTocTree(entries: Omit<TocEntry, 'children'>[]): TocEntry[] {
  const roots: TocEntry[] = [];
  const stack: TocEntry[] = [];

  for (const item of entries) {
    const entry: TocEntry = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
      stack.pop();
    }

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(entry);
    } else {
      roots.push(entry);
    }

    stack.push(entry);
  }

  return roots;
}

function extractNumberedHeading(line: string): { level: number; text: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const decimalMatch = trimmed.match(/^(\d+(?:\.\d+)+)\s+(.+)$/);
  if (decimalMatch) {
    return {
      level: decimalMatch[1].split('.').length,
      text: trimmed,
    };
  }

  const chineseMatch = trimmed.match(/^([一二三四五六七八九十]+)[、.．]\s*(.+)$/);
  if (chineseMatch) {
    return {
      level: 1,
      text: trimmed,
    };
  }

  return null;
}

function parseMarkdownToc(content: string): TocEntry[] {
  const flatEntries: Omit<TocEntry, 'children'>[] = [];
  const lines = content.split('\n');
  let minMarkdownLevel = Number.POSITIVE_INFINITY;

  for (let i = 0; i < lines.length; i++) {
    const markdownMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (markdownMatch) {
      minMarkdownLevel = Math.min(minMarkdownLevel, markdownMatch[1].length);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const markdownMatch = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (markdownMatch) {
      const normalizedLevel = Number.isFinite(minMarkdownLevel)
        ? markdownMatch[1].length - minMarkdownLevel + 1
        : markdownMatch[1].length;
      flatEntries.push({
        level: normalizedLevel,
        text: markdownMatch[2].trim(),
        line: i + 1,
      });
      continue;
    }

    const numberedHeading = extractNumberedHeading(lines[i]);
    if (numberedHeading) {
      flatEntries.push({
        level: numberedHeading.level,
        text: numberedHeading.text,
        line: i + 1,
      });
    }
  }

  return buildTocTree(flatEntries);
}

function TocTreeItem({
  entry,
  depth,
  onHeadingClick,
  onLineClick,
  ancestorHasNext = [],
  isLast = false,
}: {
  entry: TocEntry;
  depth: number;
  onHeadingClick?: (heading: string) => void;
  onLineClick?: (line: number) => void;
  ancestorHasNext?: boolean[];
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = entry.children.length > 0;
  const guideWidth = depth * 18;

  return (
    <div>
      <button
        onClick={() => {
          onLineClick?.(entry.line);
          onHeadingClick?.(entry.text);
        }}
        className="w-full flex items-center pr-3 py-1.5 text-left text-[#5a5a56] dark:text-[#a0a0a0] hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-colors"
      >
        <span
          className="relative shrink-0 h-7"
          style={{ width: `${guideWidth + 18}px` }}
        >
          {ancestorHasNext.map((hasNext, idx) => (
            hasNext ? (
              <span
                key={idx}
                className="absolute top-0 bottom-0 w-px bg-[#d8d5ca] dark:bg-[#343434]"
                style={{ left: `${idx * 18 + 9}px` }}
              />
            ) : null
          ))}
          {depth > 0 && (
            <>
              <span
                className="absolute w-px bg-[#d8d5ca] dark:bg-[#343434]"
                style={{
                  left: `${depth * 18 - 9}px`,
                  top: 0,
                  bottom: isLast ? '50%' : 0,
                }}
              />
              <span
                className="absolute h-px bg-[#d8d5ca] dark:bg-[#343434]"
                style={{
                  left: `${depth * 18 - 9}px`,
                  top: '50%',
                  width: '14px',
                }}
              />
            </>
          )}
          <span
            className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ left: `${guideWidth}px`, width: '14px', height: '14px' }}
          >
            {hasChildren ? (
              <ChevronRight
                size={10}
                className={`text-[#7e7e78] dark:text-[#8e8e8e] transition-transform ${expanded ? 'rotate-90' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(prev => !prev);
                }}
              />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-[#bdb8ab] dark:bg-[#505050]" />
            )}
          </span>
        </span>

        <span
          className={`truncate ${
            entry.level === 1
              ? 'text-[12px] font-semibold text-[#2c2c2a] dark:text-[#f1f1f1]'
              : entry.level === 2
                ? 'text-[11px] font-semibold text-[#3b3b38] dark:text-[#e3e3e3] pl-0.5'
                : entry.level === 3
                  ? 'text-[11px] font-medium text-[#4f4f4b] dark:text-[#cfcfcf] pl-1'
                  : 'text-[10px] text-[#6a6a66] dark:text-[#aaaaaa] pl-1.5'
          }`}
        >
          {entry.text}
        </span>
      </button>

      {hasChildren && expanded && entry.children.map((child, index) => (
        <TocTreeItem
          key={`${child.line}-${index}`}
          entry={child}
          depth={depth + 1}
          onHeadingClick={onHeadingClick}
          onLineClick={onLineClick}
          ancestorHasNext={[...ancestorHasNext, !isLast]}
          isLast={index === entry.children.length - 1}
        />
      ))}
    </div>
  );
}

// ── Version History 组件 ──

function VersionHistoryView({ vaultPath, filePath, onOpenVersionDiff }: {
  vaultPath: string;
  filePath: string;
  onOpenVersionDiff?: (commit: GitCommit) => void;
}) {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vaultPath || !filePath) return;
    setLoading(true);
    setError(null);
    gitService.getLog(vaultPath, filePath, 15)
      .then(setCommits)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [vaultPath, filePath]);

  const formatTime = (ts: number): string => {
    try {
      return new Date(ts * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-1">
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={12} className="animate-spin text-stone-400" />
        </div>
      ) : error ? (
        <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] px-1">{error}</p>
      ) : commits.length === 0 ? (
        <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] px-1">无版本记录</p>
      ) : (
        <div className="space-y-0.5 max-h-[300px] overflow-y-auto pr-0.5">
          {commits.map(commit => {
            return (
              <div key={commit.hash}>
                <button
                  onClick={() => onOpenVersionDiff?.(commit)}
                  className="w-full flex items-start gap-1.5 p-1.5 rounded hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors text-left"
                >
                  <GitCommitIcon size={10} className="shrink-0 mt-0.5 text-[#7e7e78] dark:text-[#8e8e8e]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] truncate leading-tight">
                      {commit.subject}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">
                        {commit.short_hash}
                      </span>
                      <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
                        {commit.author}
                      </span>
                      <span className="text-[9px] text-stone-400 dark:text-stone-500">
                        {formatTime(commit.timestamp)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={9}
                    className="shrink-0 text-[#7e7e78] dark:text-[#8e8e8e] mt-1"
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Document Info 组件（折叠） ──

/* ---------- Mentor View ---------- */

function MentorView({
  onOpenSettings,
  activeDocumentPath,
  activeDocumentName,
  onFindRelated,
  onExplain,
  onSummarize,
  relatedResults,
  onClearRelatedResults,
  onDocSelect,
  triggerResults,
  onDismissTrigger,
  onJudgeTrigger,
  onAddTriggerToPack,
}: {
  onAIConfig?: () => void;
  onAICheckConnection?: () => void;
  onAIRuntimeLogs?: () => void;
  onOpenSettings?: () => void;
  activeDocumentPath?: string;
  activeDocumentName?: string;
  onFindRelated?: (docPath: string) => void;
  onExplain?: (docPath: string) => void;
  onSummarize?: (docPath: string) => void;
  relatedResults?: any[];
  onClearRelatedResults?: () => void;
  onDocSelect?: (docPath: string) => void;
  triggerResults?: TriggerResult[];
  onDismissTrigger?: (triggerType: string) => void;
  onJudgeTrigger?: (trigger: TriggerResult) => Promise<string | null>;
  onAddTriggerToPack?: (trigger: TriggerResult) => Promise<boolean>;
}) {
  const { status } = useAIRuntime();
  const { vault } = useVault();
  const { suggestions: legacySuggestions, loading: legacySuggestionsLoading, updateSuggestionStatus: updateLegacySuggestionStatus } = useAISuggestions();
  const [mentorSuggestions, setMentorSuggestions] = useState<MentorSuggestion[]>([]);
  const [mentorSuggestionsLoading, setMentorSuggestionsLoading] = useState(false);

  // 折叠状态：默认只展开最高优先级
  const hasTriggers = triggerResults && triggerResults.length > 0;
  const hasRelated = !!(relatedResults && relatedResults.length > 0);
  const hasDocument = !!activeDocumentPath;
  const [currentSuggestionOpen, setCurrentSuggestionOpen] = useState(!hasTriggers && hasDocument);
  const [pendingJudgmentOpen, setPendingJudgmentOpen] = useState(!!hasTriggers);
  const [availableActionsOpen, setAvailableActionsOpen] = useState(false);
  const [relatedMaterialsOpen, setRelatedMaterialsOpen] = useState(!hasTriggers && hasRelated);
  const [recentSuggestionsOpen, setRecentSuggestionsOpen] = useState(false);

  // 判断结果状态
  const [judgingType, setJudgingType] = useState<string | null>(null);
  const [addingTriggerType, setAddingTriggerType] = useState<string | null>(null);
  const [addedTriggerTypes, setAddedTriggerTypes] = useState<Set<string>>(new Set());
  const [judgmentResults, setJudgmentResults] = useState<Record<string, string>>({});
  const [dismissedRelated, setDismissedRelated] = useState<Set<number>>(new Set());
  const [knowledgeTypeCandidates, setKnowledgeTypeCandidates] = useState<KnowledgeTypeCandidate[]>([]);
  const [handledKnowledgeTypes, setHandledKnowledgeTypes] = useState<Set<string>>(new Set());

  const loadMentorSuggestions = useCallback(async () => {
    if (!vault) {
      setMentorSuggestions([]);
      return;
    }
    setMentorSuggestionsLoading(true);
    try {
      const entries = await mentorSuggestionsService.listSuggestions(
        vault.path,
        vault.path,
        undefined,
        undefined,
        undefined,
        undefined,
        20,
      );
      setMentorSuggestions(entries);
    } catch (err) {
      console.error('[MentorDock] 加载 mentor suggestions 失败:', err);
    } finally {
      setMentorSuggestionsLoading(false);
    }
  }, [vault]);

  useEffect(() => {
    loadMentorSuggestions();
  }, [loadMentorSuggestions]);

  useEffect(() => {
    const unsubs = [
      mentorEventBus.on('mentor_suggestion_created', () => {
        setRecentSuggestionsOpen(true);
        loadMentorSuggestions();
      }),
      mentorEventBus.on('mentor_suggestion_actioned', () => {
        loadMentorSuggestions();
      }),
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [loadMentorSuggestions]);

  // 当 trigger 或 relatedResults 变化时调整折叠优先级
  useEffect(() => {
    if (hasTriggers) {
      setPendingJudgmentOpen(true);
      setCurrentSuggestionOpen(false);
      setRelatedMaterialsOpen(false);
    } else {
      setPendingJudgmentOpen(false);
      setCurrentSuggestionOpen(hasDocument);
      setRelatedMaterialsOpen(hasRelated);
    }
  }, [hasTriggers]);

  // 当 relatedResults 变化时重置忽略状态
  useEffect(() => {
    setDismissedRelated(new Set());
  }, [relatedResults]);

  useEffect(() => {
    if (!activeDocumentPath || !vault) {
      setKnowledgeTypeCandidates([]);
      return;
    }
    let cancelled = false;
    metadataService.suggestKnowledgeTypeCandidates(vault.path, activeDocumentPath, 3)
      .then(candidates => {
        if (!cancelled) setKnowledgeTypeCandidates(candidates);
      })
      .catch(() => {
        if (!cancelled) setKnowledgeTypeCandidates([]);
      });
    return () => { cancelled = true; };
  }, [activeDocumentPath, vault]);

  useEffect(() => {
    setHandledKnowledgeTypes(new Set());
  }, [activeDocumentPath]);

  const handleJudge = async (trigger: TriggerResult) => {
    if (!onJudgeTrigger) return;
    setJudgingType(trigger.trigger_type);
    try {
      const result = await onJudgeTrigger(trigger);
      if (result) {
        setJudgmentResults(prev => ({ ...prev, [trigger.trigger_type]: result }));
      }
    } finally {
      setJudgingType(null);
    }
  };

  const handleAddTriggerToPack = async (trigger: TriggerResult) => {
    if (!onAddTriggerToPack) return;
    setAddingTriggerType(trigger.trigger_type);
    try {
      const ok = await onAddTriggerToPack(trigger);
      if (ok) {
        setAddedTriggerTypes(prev => new Set(prev).add(trigger.trigger_type));
      }
    } finally {
      setAddingTriggerType(null);
    }
  };

  const handleKnowledgeTypeSignal = async (candidate: KnowledgeTypeCandidate, accepted: boolean) => {
    if (!vault) return;
    const key = `${candidate.knowledge_type}:${candidate.chunk_id ?? candidate.document_path}`;
    setHandledKnowledgeTypes(prev => new Set(prev).add(key));
    personalizationService.recordSignal(vault.path, {
      action_type: accepted ? 'knowledge_type_accepted' : 'knowledge_type_rejected',
      document_path: candidate.document_path,
      chunk_id: candidate.chunk_id,
      search_query: null,
      output_type: null,
      knowledge_type: candidate.knowledge_type,
    }).catch(() => { /* 信号失败不影响 UI */ });
  };

  // 最近建议（新 MentorSuggestion store 优先，旧 AISuggestion 作为兼容兜底）
  const recentMentorSuggestions = mentorSuggestions.slice(0, 3);
  const recentLegacySuggestions = [...legacySuggestions].reverse().slice(0, Math.max(0, 3 - recentMentorSuggestions.length));
  const suggestionsLoading = mentorSuggestionsLoading || (recentMentorSuggestions.length === 0 && legacySuggestionsLoading);
  const visibleKnowledgeTypeCandidates = knowledgeTypeCandidates.filter(candidate => (
    !handledKnowledgeTypes.has(`${candidate.knowledge_type}:${candidate.chunk_id ?? candidate.document_path}`)
  ));

  const suggestionTypeLabel = (type: string): string => {
    switch (type) {
      case 'clarity_interview': return '结构建议';
      case 'writing': return '写作建议';
      case 'health': return '健康建议';
      default: return type;
    }
  };

  const mentorIntentLabel = (intent: string): string => {
    switch (intent) {
      case 'clarify': return '澄清';
      case 'classify': return '分类';
      case 'extract': return '提取';
      case 'summarize': return '总结';
      case 'review': return '复查';
      case 'connect': return '关联';
      case 'output': return '输出';
      case 'archive': return '归档';
      case 'resolve_conflict': return '冲突';
      default: return intent;
    }
  };

  const suggestionStatusBadge = (s: string) => {
    switch (s) {
      case 'pending': return <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">待处理</span>;
      case 'accepted': return <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">已采纳</span>;
      case 'dismissed':
      case 'rejected': return <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">已忽略</span>;
      case 'snoozed': return <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">稍后</span>;
      case 'expired': return <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">已过期</span>;
      case 'executed': return <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">已执行</span>;
      case 'edited': return <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">已编辑</span>;
      default: return null;
    }
  };

  const handleMentorSuggestionStatus = async (id: string, status: 'accepted' | 'dismissed') => {
    if (!vault) return;
    await mentorSuggestionsService.updateSuggestionStatus(vault.path, id, status);
    setMentorSuggestions(prev => prev.map(s => (
      s.id === id ? { ...s, status, updated_at: new Date().toISOString() } : s
    )));
    mentorEventBus.emit('mentor_suggestion_actioned', { suggestionId: id, status });
  };

  return (
    <div>
      {/* 轻量状态栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#e6e6dc] dark:border-[#2f2f2f]">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : 'bg-stone-300'}`} />
          <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
            {status === 'connected' ? 'AI 助手已连接' : 'AI 助手未连接'}
          </span>
        </div>
        {status !== 'connected' && onOpenSettings && (
          <button onClick={onOpenSettings} className="text-[9px] text-amber-600 dark:text-amber-400 hover:underline">
            去设置
          </button>
        )}
      </div>

      {/* 折叠抽屉区 */}
      <div className="border-b border-[#e6e6dc] dark:border-[#2f2f2f]">

        {/* ── 1. 当前建议 ── */}
        <ExplorerSection
          title="当前建议"
          icon={Zap}
          expanded={currentSuggestionOpen}
          onToggle={() => setCurrentSuggestionOpen(prev => !prev)}
          contentClassName="px-3 pb-2 space-y-2"
        >
          {activeDocumentName ? (
            hasRelated || visibleKnowledgeTypeCandidates.length > 0 ? (
              <>
                {hasRelated && (
                  <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Search size={11} className="text-blue-600 dark:text-blue-400" />
                      <span className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
                        发现相关材料
                      </span>
                    </div>
                    <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-normal">
                      当前文档「{activeDocumentName}」与 {relatedResults!.length} 条已索引内容相关。
                    </p>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => setRelatedMaterialsOpen(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        <Eye size={10} />
                        查看相关材料
                      </button>
                      <button
                        onClick={onClearRelatedResults}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                      >
                        忽略
                      </button>
                    </div>
                  </div>
                )}
                {visibleKnowledgeTypeCandidates.length > 0 && (
                  <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Tags size={11} className="text-purple-600 dark:text-purple-400" />
                      <span className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
                        类型候选
                      </span>
                    </div>
                    {visibleKnowledgeTypeCandidates.slice(0, 3).map(candidate => (
                      <div key={`${candidate.knowledge_type}-${candidate.chunk_id ?? candidate.document_path}`} className="space-y-1 border-t first:border-t-0 border-[#e6e6dc] dark:border-[#2f2f2f] pt-1.5 first:pt-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] text-[#2c2c2a] dark:text-[#e3e3e3]">
                            这{candidate.scope === 'document' ? '篇文档' : '段'}像
                            <span className="ml-1 px-1 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">{candidate.label}</span>
                          </p>
                          <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
                            {(candidate.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] line-clamp-2">
                          {candidate.snippet}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleKnowledgeTypeSignal(candidate, true)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-[10px] font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                          >
                            <Check size={10} />
                            应用类型
                          </button>
                          <button
                            onClick={() => handleKnowledgeTypeSignal(candidate, false)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                          >
                            忽略
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                暂无新建议。你可以使用下方"可用动作"操作当前文档。
              </p>
            )
          ) : (
            <div className="py-2 text-center space-y-1.5">
              <Bot size={20} className="mx-auto text-stone-300 dark:text-stone-600" />
              <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">AI 知识助手</p>
              <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                打开文档后，我可以帮你总结内容、查找相关知识、生成上下文包。
              </p>
            </div>
          )}
        </ExplorerSection>

        {/* ── 2. 待判断 ── */}
        <ExplorerSection
          title={`待判断${hasTriggers ? ` (${triggerResults!.length})` : ''}`}
          icon={AlertTriangle}
          expanded={pendingJudgmentOpen}
          onToggle={() => setPendingJudgmentOpen(prev => !prev)}
          contentClassName="px-3 pb-2 space-y-2"
        >
          {hasTriggers ? (
            triggerResults!.map((trigger, idx) => {
              const triggerConfig = TRIGGER_TYPE_CONFIG[trigger.trigger_type] ?? { label: trigger.trigger_type, icon: AlertTriangle, colorClass: 'text-amber-600 dark:text-amber-400' };
              const TriggerIcon = triggerConfig.icon;
              return (
                <div
                  key={`${trigger.trigger_type}-${idx}`}
                  className={`border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2 space-y-1.5 ${
                    trigger.status === 'threshold_exceeded' ? 'border-l-2 border-l-amber-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <TriggerIcon size={11} className={triggerConfig.colorClass} />
                      <span className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
                        {triggerConfig.label}
                      </span>
                      {trigger.status === 'threshold_exceeded' && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                          阈值已超
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onDismissTrigger?.(trigger.trigger_type)}
                      className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 shrink-0"
                      title="忽略"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-normal">
                    {trigger.reason}
                  </p>
                  {trigger.affected_count && trigger.affected_count > 1 && (
                    <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                      已聚合 {trigger.affected_count} 个同类片段
                    </p>
                  )}
                  {trigger.theme && (
                    <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                      主题: {trigger.theme}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      onClick={() => handleJudge(trigger)}
                      disabled={status !== 'connected' || judgingType === trigger.trigger_type}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={status === 'connected' ? '帮我判断' : '需连接 AI Reasoning'}
                    >
                      {judgingType === trigger.trigger_type ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Eye size={10} />
                      )}
                      {judgingType === trigger.trigger_type ? '判断中...' : status === 'connected' ? '帮我判断' : '需连接 AI'}
                    </button>
                    <button
                      onClick={() => handleAddTriggerToPack(trigger)}
                      disabled={addingTriggerType === trigger.trigger_type || addedTriggerTypes.has(trigger.trigger_type)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {addingTriggerType === trigger.trigger_type ? <Loader2 size={10} className="animate-spin" /> : addedTriggerTypes.has(trigger.trigger_type) ? <Check size={10} /> : <Package size={10} />}
                      {addedTriggerTypes.has(trigger.trigger_type) ? '已加入 Pack' : '加入 Pack'}
                    </button>
                    <button
                      onClick={() => onDismissTrigger?.(trigger.trigger_type)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                    >
                      稍后复查
                    </button>
                  </div>
                  {/* 判断结果卡片 */}
                  {judgmentResults[trigger.trigger_type] && (
                    <div className="mt-1.5 p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 space-y-1">
                      <div className="flex items-center gap-1">
                        <Check size={10} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[9px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400">
                          AI 判断结果
                        </span>
                      </div>
                      <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-normal whitespace-pre-wrap">
                        {judgmentResults[trigger.trigger_type]}
                      </p>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleAddTriggerToPack(trigger)}
                          disabled={addingTriggerType === trigger.trigger_type || addedTriggerTypes.has(trigger.trigger_type)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {addedTriggerTypes.has(trigger.trigger_type) ? <Check size={10} /> : <Package size={10} />}
                          {addedTriggerTypes.has(trigger.trigger_type) ? '已加入 Pack' : '加入 Pack'}
                        </button>
                        <button
                          onClick={() => onDismissTrigger?.(trigger.trigger_type)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                        >
                          稍后复查
                        </button>
                        <button
                          onClick={() => onDismissTrigger?.(trigger.trigger_type)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                        >
                          忽略
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">暂无待判断项</p>
          )}
        </ExplorerSection>

        {/* ── 3. 可用动作 ── */}
        <ExplorerSection
          title="可用动作"
          icon={Bot}
          expanded={availableActionsOpen}
          onToggle={() => setAvailableActionsOpen(prev => !prev)}
          contentClassName="px-3 pb-2 space-y-1.5"
        >
          {activeDocumentPath ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onSummarize?.(activeDocumentPath)}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <Tags size={10} /> 总结文档
              </button>
              <button
                onClick={() => onFindRelated?.(activeDocumentPath)}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <Search size={10} /> 查找相关
              </button>
              <button
                onClick={() => onExplain?.(activeDocumentPath)}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <Bot size={10} /> 解释内容
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">打开文档后可使用动作</p>
          )}
        </ExplorerSection>

        {/* ── 4. 相关材料 ── */}
        <ExplorerSection
          title={`相关材料${hasRelated ? ` (${relatedResults!.length})` : ''}`}
          icon={Search}
          expanded={relatedMaterialsOpen}
          onToggle={() => setRelatedMaterialsOpen(prev => !prev)}
          contentClassName="px-3 pb-2 space-y-1.5"
        >
          {hasRelated ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  {relatedResults!.length} 条材料，基于语义相似度召回
                </span>
                <button onClick={onClearRelatedResults} className="p-0.5 text-[#7e7e78] hover:text-stone-800">
                  <X size={10} />
                </button>
              </div>
              {relatedResults!.map((result, idx) => {
                if (dismissedRelated.has(idx)) return null;
                return (
                  <div
                    key={idx}
                    className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2 space-y-1 hover:border-stone-300 dark:hover:border-stone-600 transition-colors"
                  >
                    <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] truncate leading-normal">
                      {result.heading_path || result.document_path.split('/').pop()?.replace('.md', '')}
                    </p>
                    <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] truncate">
                      {result.document_path}
                      {result.similarity_score != null && (
                        <span className="ml-1 text-blue-600 dark:text-blue-400">
                          · 相关度 {(result.similarity_score * 100).toFixed(0)}%
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1 pt-0.5">
                      <button
                        onClick={() => onDocSelect?.(result.document_path)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-50 dark:bg-stone-800/50 text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-100 dark:hover:bg-stone-700/50 transition-colors"
                      >
                        <Eye size={10} />
                        查看
                      </button>
                      <button
                        onClick={() => setDismissedRelated(prev => new Set(prev).add(idx))}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                      >
                        忽略
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">暂无相关材料。打开文档后可使用"查找相关"触发检索。</p>
          )}
        </ExplorerSection>

        {/* ── 5. 最近建议 ── */}
        <ExplorerSection
          title="最近建议"
          icon={PencilLine}
          expanded={recentSuggestionsOpen}
          onToggle={() => setRecentSuggestionsOpen(prev => !prev)}
          contentClassName="px-3 pb-2 space-y-1.5"
        >
          {suggestionsLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 size={12} className="animate-spin text-stone-400" />
            </div>
          ) : recentMentorSuggestions.length === 0 && recentLegacySuggestions.length === 0 ? (
            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">暂无 AI 建议</p>
          ) : (
            <>
            {recentMentorSuggestions.map(s => (
              <div key={s.id} className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">
                    {mentorIntentLabel(s.intent)}
                  </span>
                  {suggestionStatusBadge(s.status)}
                </div>
                <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] line-clamp-2 leading-normal">
                  {s.short_message || s.message}
                </p>
                <p className="text-[9px] text-stone-400 dark:text-stone-500">
                  {new Date(s.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {s.status === 'pending' && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <button
                      onClick={() => handleMentorSuggestionStatus(s.id, 'accepted')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      <Check size={10} />
                      采纳
                    </button>
                    <button
                      onClick={() => handleMentorSuggestionStatus(s.id, 'dismissed')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                    >
                      <XCircle size={10} />
                      忽略
                    </button>
                  </div>
                )}
              </div>
            ))}
            {recentLegacySuggestions.map(s => (
              <div key={s.id} className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">
                    {suggestionTypeLabel(s.suggestion_type)}
                  </span>
                  {suggestionStatusBadge(s.status)}
                </div>
                <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] line-clamp-2 leading-normal">
                  {s.content}
                </p>
                <p className="text-[9px] text-stone-400 dark:text-stone-500">
                  {new Date(s.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {s.status === 'pending' && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <button
                      onClick={() => updateLegacySuggestionStatus(s.id, 'accepted')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      <Check size={10} />
                      采纳
                    </button>
                    <button
                      onClick={() => updateLegacySuggestionStatus(s.id, 'rejected')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                    >
                      <XCircle size={10} />
                      忽略
                    </button>
                  </div>
                )}
              </div>
            ))}
            </>
          )}
        </ExplorerSection>
      </div>
    </div>
  );
}

/* ---------- Notifications View ---------- */
function NotificationsView() {
  const { notifications, loading, error, markAsRead, markAllAsRead, clearNotification, clearAll } = useNotifications();

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
            {unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读'}
          </span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200"
                title="全部标记已读"
              >
                <CheckCheck size={12} />
              </button>
            )}
            <button
              onClick={clearAll}
              className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200"
              title="清空全部"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="text-center py-8">
          <Bell size={20} className="mx-auto text-stone-300 dark:text-stone-600 mb-2" />
          <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">暂无通知</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => { if (!n.read) markAsRead(n.id); }}
              className={`group relative bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2.5 cursor-pointer hover:border-stone-300 dark:hover:border-stone-600 transition-colors ${
                !n.read ? 'border-l-2 border-l-emerald-500' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {!n.read && (
                      <Circle size={6} className="text-emerald-500 fill-emerald-500 shrink-0" />
                    )}
                    <p className={`text-[11px] truncate ${!n.read ? 'font-semibold text-[#2c2c2a] dark:text-[#e3e3e3]' : 'text-[#7e7e78] dark:text-[#8e8e8e]'}`}>
                      {n.title}
                    </p>
                  </div>
                  <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] mt-0.5 line-clamp-2 leading-normal">
                    {n.content}
                  </p>
                  <p className="text-[9px] text-stone-400 dark:text-stone-500 mt-1">
                    {new Date(n.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); clearNotification(n.id); }}
                  className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="删除"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Inbox View (Capture Inbox) ---------- */
function InboxView() {
  const { captures, loading, error, deleteCapture, updateCapture } = useCapture();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entryId: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const sorted = [...captures].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return tb - ta;
  });

  const sourceBadgeLabel = (source: string): string => {
    switch (source) {
      case 'quick-capture': return '极速捕获';
      case 'sticky-note': return '便笺';
      case 'clipboard': return '剪贴板';
      case 'ai-mentor': return 'AI Mentor';
      default: return source;
    }
  };

  const formatTimestamp = (ts: string): string => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, entryId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entryId });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const startEdit = useCallback((entryId: string) => {
    const entry = captures.find(c => c.id === entryId);
    if (entry) {
      setEditingId(entryId);
      setEditContent(entry.content);
    }
    setContextMenu(null);
  }, [captures]);

  const saveEdit = useCallback(async () => {
    if (editingId && editContent.trim()) {
      await updateCapture(editingId, editContent.trim());
    }
    setEditingId(null);
    setEditContent('');
  }, [editingId, editContent, updateCapture]);

  const handleDelete = useCallback(async (entryId: string) => {
    await deleteCapture(entryId);
    setContextMenu(null);
  }, [deleteCapture]);

  if (loading && captures.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
            {sorted.length} 条捕获
          </span>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-8">
          <Inbox size={20} className="mx-auto text-stone-300 dark:text-stone-600 mb-2" />
          <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">暂无捕获内容</p>
          <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] opacity-60 mt-1">使用极速捕获记录灵感</p>
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map(entry => (
            <div
              key={entry.id}
              onContextMenu={(e) => handleContextMenu(e, entry.id)}
              className="bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2.5 hover:border-stone-300 dark:hover:border-stone-600 transition-colors"
            >
              {editingId === entry.id ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } }}
                  className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-relaxed bg-transparent resize-none outline-none border-b border-stone-200 dark:border-stone-700 pb-1"
                  autoFocus
                  rows={3}
                />
              ) : (
                <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-relaxed line-clamp-3">
                  {entry.content}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">
                  {sourceBadgeLabel(entry.source)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-[#2a2a2a] border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 z-50 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => startEdit(contextMenu.entryId)}
            className="w-full px-3 py-1.5 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center gap-2 text-left"
          >
            <Pencil size={10} />
            编辑
          </button>
          <button
            onClick={() => handleDelete(contextMenu.entryId)}
            className="w-full px-3 py-1.5 text-[11px] text-red-500 hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center gap-2 text-left"
          >
            <Trash size={10} />
            删除
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Widgets View ---------- */
function WidgetsView() {
  return (
    <div className="space-y-4">
      <div className={`bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl p-3.5 space-y-2`}>
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-stone-400" />
          <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
            Widgets
          </p>
        </div>
        <p className={`text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] leading-normal`}>
          小组件功能将在后续 Phase 扩展
        </p>
      </div>
    </div>
  );
}

// ── Document Info 内联版（底部面板用） ──

function DocumentInfoSectionInline({ documentPath, documentName }: {
  documentPath?: string;
  documentName?: string;
}) {
  const { vault } = useVault();
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (!vault || !documentPath) {
      setMetadata(null);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    documentService.getDocumentMetadata(vault.path, documentPath).then(meta => {
      if (!cancelled) {
        setMetadata(meta);
        setMetaLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [vault, documentPath]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (isoStr: string): string => {
    try {
      return new Date(isoStr).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return 'unavailable';
    }
  };

  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">文件名</p>
        <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] truncate">{documentName || 'unavailable'}</p>
      </div>
      <div>
        <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">路径</p>
        <p className="text-[11px] text-stone-500 dark:text-stone-400 break-all">{documentPath}</p>
      </div>
      <div>
        <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">大小</p>
        <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
          {metaLoading ? '...' : (metadata ? formatSize(metadata.size) : 'unavailable')}
        </p>
      </div>
      <div>
        <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">修改时间</p>
        <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
          {metaLoading ? '...' : (metadata ? formatTime(metadata.modified_at) : 'unavailable')}
        </p>
      </div>
    </div>
  );
}

// ── Summary/Tags 生成组件 ──

const SOURCE_LABELS: Record<string, { label: string; colorClass: string }> = {
  deterministic: { label: '规则', colorClass: 'bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]' },
  embedding_signal: { label: '向量', colorClass: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  local_llm: { label: 'LLM', colorClass: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  reasoning: { label: '推理', colorClass: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
};

function SummaryTagsSection({ documentPath, onDocumentUpdated }: { documentPath: string; onDocumentUpdated?: () => void }) {
  const { vault } = useVault();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SummaryTagsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 编辑状态
  const [editing, setEditing] = useState(false);
  const [editSummary, setEditSummary] = useState('');
  const [editTags, setEditTags] = useState('');

  // 生成摘要/标签
  const handleGenerate = useCallback(async () => {
    if (!vault || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setEditing(false);
    try {
      const res = await summaryTagsService.generateSummaryTags(vault.path, documentPath);
      setResult(res);
      // 预填编辑字段
      const mergedSummary = res.layers.map(l => l.summary).filter(Boolean).join('\n');
      const mergedTags = [...new Set(res.layers.flatMap(l => l.tags ?? []))];
      setEditSummary(mergedSummary);
      setEditTags(mergedTags.join(', '));
    } catch (err) {
      setError(String(err));
    } finally {
      setGenerating(false);
    }
  }, [vault, documentPath, generating]);

  // 接受：写入 metadata 和 frontmatter
  const handleAccept = useCallback(async (summary: string, tags: string[]) => {
    if (!vault) return;
    try {
      await summaryTagsService.updateDocumentSummaryTags(
        vault.path,
        documentPath,
        summary,
        tags,
        'user_accepted',
      );
      setResult(null);
      setEditing(false);

      // 通知父组件刷新编辑器内容
      onDocumentUpdated?.();

      // 记录 summary_tag_accepted 信号
      personalizationService.recordSignal(vault.path, {
        action_type: 'summary_tag_accepted',
        document_path: documentPath,
        chunk_id: null,
        search_query: null,
      }).catch(() => { /* 信号记录失败不影响操作 */ });
    } catch (err) {
      setError(`写入失败: ${err}`);
    }
  }, [vault, documentPath, onDocumentUpdated]);

  // 拒绝：保持原值
  const handleReject = useCallback(() => {
    setResult(null);
    setEditing(false);

    // 记录 summary_tag_rejected 信号
    if (vault) {
      personalizationService.recordSignal(vault.path, {
        action_type: 'summary_tag_rejected',
        document_path: documentPath,
        chunk_id: null,
        search_query: null,
      }).catch(() => { /* 信号记录失败不影响操作 */ });
    }
  }, [vault, documentPath]);

  // 合并后的摘要和标签
  const mergedSummary = result ? result.layers.map(l => l.summary).filter(Boolean).join('\n') : '';
  const mergedTags = result ? [...new Set(result.layers.flatMap(l => l.tags ?? []))] : [];

  return (
    <div className="space-y-2">
      {!result && !generating && (
        <button
          onClick={handleGenerate}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
        >
          <Tags size={10} />
          生成摘要/标签
        </button>
      )}

      {generating && (
        <div className="flex items-center justify-center gap-1.5 py-2">
          <Loader2 size={12} className="animate-spin text-stone-400" />
          <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">正在生成...</p>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-red-500 px-1">{error}</p>
      )}

      {result && !generating && (
        <div className="space-y-2">
          {/* 各层来源标记 */}
          <div className="flex flex-wrap gap-1">
            {result.layers.map((layer, idx) => {
              const src = SOURCE_LABELS[layer.source] ?? { label: layer.source, colorClass: 'bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]' };
              return (
                <span key={idx} className={`text-[9px] px-1 py-0.5 rounded ${src.colorClass}`}>
                  {src.label}
                  {layer.error ? ' ⚠' : ''}
                </span>
              );
            })}
          </div>

          {/* 摘要展示/编辑 */}
          {editing ? (
            <div className="space-y-1.5">
              <div>
                <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">摘要</p>
                <textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded p-1.5 resize-none outline-none focus:border-emerald-500"
                  rows={3}
                />
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">标签</p>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded p-1.5 outline-none focus:border-emerald-500"
                  placeholder="用逗号分隔标签"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const tags = editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
                    handleAccept(editSummary.trim(), tags);
                  }}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <Check size={10} />
                  确认写入
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <XCircle size={10} />
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {mergedSummary && (
                <div>
                  <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">摘要</p>
                  <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-normal">{mergedSummary}</p>
                </div>
              )}
              {mergedTags.length > 0 && (
                <div>
                  <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">标签</p>
                  <div className="flex flex-wrap gap-1">
                    {mergedTags.map((tag, idx) => (
                      <span key={idx} className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  onClick={() => handleAccept(mergedSummary, mergedTags)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  <Check size={10} />
                  采纳
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <Pencil size={10} />
                  修改
                </button>
                <button
                  onClick={handleReject}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <XCircle size={10} />
                  拒绝
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Platter Main Component ---------- */

type BottomPanel = 'none' | 'history' | 'info' | 'summary-tags';

const TRIGGER_TYPE_CONFIG: Record<string, { label: string; icon: typeof AlertTriangle; colorClass: string }> = {
  semantic_repeat: { label: '语义重复', icon: CheckCheck, colorClass: 'text-blue-600 dark:text-blue-400' },
  new_topic: { label: '新方向', icon: Zap, colorClass: 'text-emerald-600 dark:text-emerald-400' },
  context_drift: { label: '主题偏移', icon: AlertTriangle, colorClass: 'text-amber-600 dark:text-amber-400' },
  review: { label: '复查建议', icon: RefreshCw, colorClass: 'text-purple-600 dark:text-purple-400' },
};

export function MentorDock({
  open,
  activeTab,
  onTabChange,
  onClose,
  activeDocumentPath,
  activeDocumentName,
  activeDocumentContent,
  onAIConfig,
  onAICheckConnection,
  onAIRuntimeLogs,
  onScrollToHeading,
  onScrollToLine,
  onOpenVersionDiff,
  onGeneratePrompt,
  onOpenInEditor,
  onActivePackChange,
  triggerResults,
  onDismissTrigger,
  onJudgeTrigger,
  onAddTriggerToPack,
  onDocumentUpdated,
  pendingContextPackItem,
  onOpenSettings,
  onFindRelated,
  onExplain,
  onSummarize,
  relatedResults,
  onClearRelatedResults,
  onDocSelect,
  contextPackRefreshKey,
}: PlatterProps) {
  const [tabOrder, setTabOrder] = useState<PlatterTab[]>(PLATTER_TABS.map(t => t.id));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);
  const [tocExpanded, setTocExpanded] = useState(false);

  // 底部面板状态
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>('none');

  const VISIBLE_COUNT = 3;
  const visibleTabs = tabOrder.slice(0, VISIBLE_COUNT);
  const overflowTabs = tabOrder.slice(VISIBLE_COUNT);
  const isContextTab = activeTab === 'document-context';

  const getTabDef = (id: PlatterTab) => PLATTER_TABS.find(t => t.id === id)!;

  const handleDragStart = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    setDragIdx(idx);
    setDropIdx(idx);
    const parent = (e.target as HTMLElement).closest('[data-tab-idx]');
    dragNodeRef.current = parent as HTMLDivElement;
  }, []);

  useEffect(() => {
    if (dragIdx === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragNodeRef.current) return;
      const elements = document.querySelectorAll('[data-tab-idx]');
      let newDropIdx: number = tabOrder.length;
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const idx = parseInt(el.getAttribute('data-tab-idx')!, 10);
        if (e.clientY < midY && idx < newDropIdx) {
          newDropIdx = idx;
        }
      });
      if (newDropIdx === tabOrder.length) {
        let allBelow = true;
        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (e.clientY < rect.bottom) allBelow = false;
        });
        if (!allBelow) newDropIdx = tabOrder.length - 1;
      }
      setDropIdx(newDropIdx);
    };

    const handleMouseUp = () => {
      if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
        setTabOrder(prev => {
          const items = [...prev];
          const [moved] = items.splice(dragIdx, 1);
          const adjustedIdx = dragIdx < dropIdx ? dropIdx - 1 : dropIdx;
          items.splice(adjustedIdx, 0, moved);
          return items;
        });
      }
      setDragIdx(null);
      setDropIdx(null);
      dragNodeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragIdx, dropIdx, tabOrder.length]);

  // 切换 tab 时关闭底部面板
  useEffect(() => {
    setBottomPanel('none');
  }, [activeTab]);

  useEffect(() => {
    if (!isContextTab) {
      setTocExpanded(false);
    }
  }, [isContextTab]);

  if (!open) return null;

  const toggleBottomPanel = (panel: BottomPanel) => {
    setBottomPanel(prev => prev === panel ? 'none' : panel);
  };
  const showBottomContextSections = isContextTab && activeDocumentPath && tocExpanded;
  const showTopContextSections = isContextTab && activeDocumentPath && !tocExpanded;
  const toc = activeDocumentContent ? parseMarkdownToc(activeDocumentContent) : [];

  return (
    <aside className={`w-64 border-l border-[#e6e6dc] dark:border-[#2f2f2f] bg-[#f4f4ee] dark:bg-[#1f1f1f] flex flex-col min-h-0`}>
      <div className={`h-12 border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-4 flex items-center justify-between shrink-0`}>
        <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
          Platter
        </span>
        <button onClick={onClose} className="text-stone-400">
          <X size={14} />
        </button>
      </div>

      <div className={`border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-2 py-1 bg-transparent flex gap-0.5 items-center`}>
        {visibleTabs.map(tabId => {
          const tab = getTabDef(tabId);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 py-1 text-[10px] font-semibold rounded flex items-center justify-center gap-0.5 ${
                activeTab === tab.id
                  ? `bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] text-[#2c2c2a] dark:text-[#e3e3e3]`
                  : `text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200`
              }`}
            >
              <Icon size={10} />
              {tab.label}
            </button>
          );
        })}
        {overflowTabs.length > 0 && (
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`px-1.5 py-1 text-[10px] rounded flex items-center justify-center ${
              drawerOpen || overflowTabs.includes(activeTab)
                ? `bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] text-[#2c2c2a] dark:text-[#e3e3e3]`
                : `text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200`
            }`}
          >
            <ChevronDown size={12} className={`transition-transform ${drawerOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {drawerOpen && (
        <div className={`border-b border-[#e6e6dc] dark:border-[#2f2f2f] bg-white dark:bg-[#1a1a1a] px-2 py-1.5`}>
          {tabOrder.map((tabId, idx) => {
            const tab = getTabDef(tabId);
            const Icon = tab.icon;
            const isOverflow = overflowTabs.includes(tabId);
            const showInsertLine = dragIdx !== null && dropIdx === idx && dragIdx !== idx;
            return (
              <div key={tab.id}>
                {showInsertLine && (
                  <div className="h-[2px] bg-emerald-500 rounded-full mx-1 mb-0.5 transition-all" />
                )}
                <div
                  data-tab-idx={idx}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] transition-opacity ${
                    dragIdx === idx ? 'opacity-40' : ''
                  }`}
                >
                  <div
                    onMouseDown={(e) => handleDragStart(idx, e)}
                    className="cursor-grab active:cursor-grabbing text-stone-300 dark:text-stone-600 hover:text-stone-500 shrink-0"
                  >
                    <GripVertical size={10} />
                  </div>
                  <button
                    onClick={() => { onTabChange(tab.id); setDrawerOpen(false); }}
                    className={`flex-1 flex items-center gap-1.5 text-left ${
                      activeTab === tabId
                        ? 'font-semibold text-[#2c2c2a] dark:text-[#e3e3e3]'
                        : 'text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    <Icon size={10} />
                    <span className="flex-1">{tab.label}</span>
                    {!isOverflow && <span className="text-[8px] text-stone-400 dark:text-stone-600">固定</span>}
                  </button>
                </div>
              </div>
            );
          })}
          {dragIdx !== null && dropIdx === tabOrder.length && (
            <div className="h-[2px] bg-emerald-500 rounded-full mx-1 mt-0.5 transition-all" />
          )}
        </div>
      )}

      {/* 主内容区 */}
      {isContextTab ? (
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#1a1a1a]">
          {!activeDocumentPath ? (
            <div className="h-full flex items-center justify-center px-4">
              <div className="text-center">
                <FileText size={20} className="mx-auto text-stone-300 dark:text-stone-600 mb-2" />
                <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">No document selected</p>
              </div>
            </div>
          ) : (
            <>
              <ExplorerSection
                title="文档目录"
                icon={List}
                expanded={tocExpanded}
                onToggle={() => setTocExpanded(prev => !prev)}
                contentClassName="pb-1"
              >
                <div className="py-1">
                  {toc.length > 0 ? (
                    toc.map((entry, index) => (
                      <TocTreeItem
                        key={`${entry.line}-${index}`}
                        entry={entry}
                        depth={0}
                        onHeadingClick={onScrollToHeading}
                        onLineClick={onScrollToLine}
                      />
                    ))
                  ) : (
                    <p className="px-3 py-1 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
                      当前文档没有可解析的目录结构
                    </p>
                  )}
                </div>
              </ExplorerSection>

              {showTopContextSections && (
                <>
                  <ExplorerSection
                    title="摘要/标签"
                    icon={Tags}
                    expanded={bottomPanel === 'summary-tags'}
                    onToggle={() => toggleBottomPanel('summary-tags')}
                  >
                    <div className="px-2 pb-2">
                      <SummaryTagsSection documentPath={activeDocumentPath} onDocumentUpdated={onDocumentUpdated} />
                    </div>
                  </ExplorerSection>

                  <ExplorerSection
                    title="时间线"
                    icon={History}
                    expanded={bottomPanel === 'history'}
                    onToggle={() => toggleBottomPanel('history')}
                  >
                    <div className="max-h-[200px] overflow-y-auto px-2 pb-2">
                      <VersionHistoryView
                        vaultPath={activeDocumentPath.split('/documents/')[0] || ''}
                        filePath={activeDocumentPath}
                        onOpenVersionDiff={onOpenVersionDiff}
                      />
                    </div>
                  </ExplorerSection>

                  <ExplorerSection
                    title="文档信息"
                    icon={Info}
                    expanded={bottomPanel === 'info'}
                    onToggle={() => toggleBottomPanel('info')}
                  >
                    <div className="max-h-[200px] overflow-y-auto px-2 pb-2">
                      <DocumentInfoSectionInline documentPath={activeDocumentPath} documentName={activeDocumentName} />
                    </div>
                  </ExplorerSection>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className={activeTab === 'mentor' ? '' : 'hidden'}>
            <MentorView
              onAIConfig={onAIConfig}
              onAICheckConnection={onAICheckConnection}
              onAIRuntimeLogs={onAIRuntimeLogs}
              onOpenSettings={onOpenSettings}
              activeDocumentPath={activeDocumentPath}
              activeDocumentName={activeDocumentName}
              onFindRelated={onFindRelated}
              onExplain={onExplain}
              onSummarize={onSummarize}
              relatedResults={relatedResults}
              onClearRelatedResults={onClearRelatedResults}
              onDocSelect={onDocSelect}
              triggerResults={triggerResults}
              onDismissTrigger={onDismissTrigger}
              onJudgeTrigger={onJudgeTrigger}
              onAddTriggerToPack={onAddTriggerToPack}
            />
          </div>
          <div className={activeTab === 'notifications' ? '' : 'hidden'}>
            <NotificationsView />
          </div>
          <div className={activeTab === 'inbox' ? '' : 'hidden'}>
            <InboxView />
          </div>
          <div className={activeTab === 'widgets' ? '' : 'hidden'}>
            <WidgetsView />
          </div>
          <div className={activeTab === 'context-pack' ? '' : 'hidden'}>
            <ContextPackPanel onGeneratePrompt={onGeneratePrompt} onOpenInEditor={onOpenInEditor} onActivePackChange={onActivePackChange} pendingItem={pendingContextPackItem} refreshKey={contextPackRefreshKey} />
          </div>
        </div>
      )}

      {/* 底部面板 - 仅 Context tab 显示 */}
      {showBottomContextSections && (
        <div className="border-t border-[#e6e6dc] dark:border-[#2f2f2f] bg-white dark:bg-[#1a1a1a] shrink-0">
          <ExplorerSection
            title="摘要/标签"
            icon={Tags}
            expanded={bottomPanel === 'summary-tags'}
            onToggle={() => toggleBottomPanel('summary-tags')}
          >
            <div className="px-2 pb-2">
              <SummaryTagsSection documentPath={activeDocumentPath} />
            </div>
          </ExplorerSection>

          <ExplorerSection
            title="时间线"
            icon={History}
            expanded={bottomPanel === 'history'}
            onToggle={() => toggleBottomPanel('history')}
          >
            <div className="max-h-[200px] overflow-y-auto px-2 pb-2">
              <VersionHistoryView
                vaultPath={activeDocumentPath.split('/documents/')[0] || ''}
                filePath={activeDocumentPath}
                onOpenVersionDiff={onOpenVersionDiff}
              />
            </div>
          </ExplorerSection>

          <ExplorerSection
            title="文档信息"
            icon={Info}
            expanded={bottomPanel === 'info'}
            onToggle={() => toggleBottomPanel('info')}
          >
            <div className="max-h-[200px] overflow-y-auto px-2 pb-2">
              <DocumentInfoSectionInline documentPath={activeDocumentPath} documentName={activeDocumentName} />
            </div>
          </ExplorerSection>
        </div>
      )}
    </aside>
  );
}
