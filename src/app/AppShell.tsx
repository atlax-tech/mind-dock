import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import { ChevronRight, Loader2, X, Copy, Check, Pencil, Save, FileText, Plus, CornerDownLeft } from 'lucide-react';

import { useVault } from '@/modules/vault/VaultProvider';
import { useStickyNotes } from '@/modules/sticky-notes/StickyNotesProvider';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceHeader, type WorkspaceView } from '@/components/WorkspaceHeader';
import { MentorDock, type PlatterTab } from '@/components/MentorDock';
import { DiffViewer } from '@/components/DiffViewer';
import { StatusBar } from '@/components/StatusBar';
import { PlaceholderView } from '@/components/PlaceholderView';
import { TabBar } from '@/components/TabBar';
import { EditorToolbar, type PreviewMode } from '@/modules/editor/EditorToolbar';
import { EditorTocScale, EditorView, type EditorViewHandle } from '@/modules/editor/EditorView';
import type { EditorSelectionAnchorRect, EditorSelectionPayload } from '@/modules/editor/editorContextMenu';
import { DocumentPreview } from '@/modules/editor/MarkdownPreview';
import { CommandPalette } from '@/modules/command-palette/CommandPalette';
import { QuickCapturePanel } from '@/modules/capture/QuickCapturePanel';
import { StickyNotesLayer } from '@/modules/sticky-notes/StickyNotesLayer';
import { ClarityInterviewPanel } from '@/modules/ai/ClarityInterviewPanel';
import { OnboardingPanel } from '@/modules/ai/OnboardingPanel';
import { OutputGenerator } from '@/modules/context-pack/OutputGenerator';
import type { OutputGeneratorType } from '@/modules/context-pack/OutputGenerator';
import { GenerateIntentModal, type GenerateIntentSource, type OutputType } from '@/modules/context-pack/GenerateIntentModal';
import { GeneratingOverlay } from '@/components/GeneratingOverlay';
import { SettingsPanel } from '@/modules/settings/SettingsPanel';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import { mentorEventsService } from '@/services/mentor/mentor-events';
import { onboardingService } from '@/services/ai/onboarding';
import { documentService } from '@/services/filesystem/documents';
import { gitService, type GitCommit, type GitDiffEntry } from '@/services/filesystem/git';
import { extractTitle } from '@/services/markdown/frontmatter';
import {
  buildSelectionGenerationMessages,
  buildSelectionQAMessages,
  buildSelectionReasoningMessages,
  type ClarityInterviewResult,
} from '@/modules/ai/MentorSkills';
import type { DocEntry } from '@/types/vault';
import type { ContextPack } from '@/services/index/context-pack';
import { mentorTriggersService, type TriggerResult } from '@/services/index/mentor-triggers';
import type { SearchDocumentResult } from '@/services/index/search';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { setPostReindexHook } from '@/services/filesystem/documents';
import { chunkingService } from '@/services/index/chunking';
import { metadataService } from '@/services/index/metadata';
import { personalizationService } from '@/services/index/personalization';
import { vectorIndexService } from '@/services/index/vector';

interface MentorSourceRef {
  id: string;
  path: string;
  heading?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  content?: string | null;
  score?: number | null;
}

interface OpenTab {
  id: string;           // 文档绝对路径
  title: string;        // 文档标题
  content: string;      // 文档内容
  isDirty: boolean;     // 是否有未保存修改
  hasEdited: boolean;   // 本次打开期间是否发生过编辑，用于关闭标签时创建版本
}

interface DiffSelection {
  commit: GitCommit;
  diff: GitDiffEntry | null;
  loading: boolean;
  error: string | null;
}

interface QuickAskPlacement {
  style: CSSProperties;
  tailSide: 'left' | 'right' | 'none';
}

function getQuickAskPlacement(anchorRect?: EditorSelectionAnchorRect): QuickAskPlacement {
  if (!anchorRect || typeof window === 'undefined') {
    return {
      style: { right: 24, bottom: 24, width: 340 },
      tailSide: 'none',
    };
  }

  const margin = 16;
  const gap = 12;
  const width = Math.min(340, Math.max(280, window.innerWidth - margin * 2));
  const estimatedHeight = 390;
  const canPlaceRight = anchorRect.right + gap + width <= window.innerWidth - margin;
  const left = canPlaceRight
    ? anchorRect.right + gap
    : Math.max(margin, anchorRect.left - width - gap);
  const maxTop = Math.max(margin, window.innerHeight - estimatedHeight - margin);
  const top = Math.min(Math.max(margin, anchorRect.top - 18), maxTop);

  return {
    style: {
      left: Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin)),
      top,
      width,
    },
    tailSide: canPlaceRight ? 'left' : 'right',
  };
}

function toOutputGeneratorType(outputType: OutputType): OutputGeneratorType {
  return outputType === 'summary' ? 'custom' : outputType;
}

function flattenDocTree(entries: DocEntry[]): DocEntry[] {
  const result: DocEntry[] = [];
  for (const entry of entries) {
    result.push(entry);
    if (entry.children.length > 0) {
      result.push(...flattenDocTree(entry.children));
    }
  }
  return result;
}

function PackSelectorModal({ vaultPath, label, activePackId, onSelect, onCreateNew, onCancel }: {
  vaultPath: string;
  label: string;
  activePackId?: string;
  onSelect: (packId: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}) {
  const [packs, setPacks] = useState<{id: string; name: string; items: any[]}[]>([]);

  useEffect(() => {
    import('@/services/index/context-pack').then(({ contextPackService }) => {
      contextPackService.listContextPacks(vaultPath).then(setPacks).catch(() => setPacks([]));
    });
  }, [vaultPath]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[99999] flex items-start justify-center pt-[20vh]" onClick={onCancel}>
      <div className="max-w-sm w-full bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <p className="text-[11px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
          选择上下文包
        </p>
        <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
          将「{label}」添加到：
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {packs.map(pack => (
            <button
              key={pack.id}
              onClick={() => onSelect(pack.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                pack.id === activePackId
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50'
              }`}
            >
              <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">{pack.name}</p>
              <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">{pack.items.filter(i => !i.is_suggestion).length} 条内容</p>
            </button>
          ))}
          {packs.length === 0 && (
            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] text-center py-2">暂无上下文包</p>
          )}
        </div>
        <button
          onClick={onCreateNew}
          className="w-full px-3 py-2 rounded-lg border border-dashed border-[#e6e6dc] dark:border-[#2f2f2f] text-[11px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
        >
          + 创建新的上下文包
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const { vault, docTree, refreshDocTree } = useVault();
  const { notes, error: stickyNotesError, addNote, updateNote, deleteNote, convertToCapture } = useStickyNotes();
  const { status: aiStatus, embedAndStore, chat } = useAIRuntime();

  // Editor ref for TOC navigation
  const editorRef = useRef<EditorViewHandle>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);

  // Multi-tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 始终保持 ref 指向最新 activeTabId，避免 handleContentChange 闭包过期
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // 始终保持 ref 指向最新 openTabs
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;

  // 监听文档删除事件（来自 DocTree），关闭对应标签
  useEffect(() => {
    const handler = (e: Event) => {
      const docPath = (e as CustomEvent).detail.path as string;
      const timer = saveTimeoutsRef.current.get(docPath);
      if (timer) {
        clearTimeout(timer);
        saveTimeoutsRef.current.delete(docPath);
      }
      const newTabs = openTabsRef.current.filter(t => t.id !== docPath);
      setOpenTabs(newTabs);
      if (activeTabIdRef.current === docPath) {
        setActiveTabId(newTabs.length > 0 ? newTabs[0].id : '');
      }
    };
    window.addEventListener('minddock:doc-deleted', handler);
    return () => window.removeEventListener('minddock:doc-deleted', handler);
  }, []);

  // Layout state
  const [currentView, setCurrentView] = useState<WorkspaceView>('editor');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mentorDockOpen, setMentorDockOpen] = useState(true);
  const [mentorDockTab, setMentorDockTab] = useState<PlatterTab>('mentor');
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null);

  // Editor state
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split');

  // Command palette state
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // Quick Capture state
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [clarityInterviewOpen, setClarityInterviewOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Output Generator state
  const [outputGeneratorPack, setOutputGeneratorPack] = useState<ContextPack | null>(null);
  const [outputGeneratorInitialType, setOutputGeneratorInitialType] = useState<OutputGeneratorType | undefined>(undefined);
  const [outputGeneratorInitialIntent, setOutputGeneratorInitialIntent] = useState<string | undefined>(undefined);

  // Generate Intent Modal state
  const [generateIntentSource, setGenerateIntentSource] = useState<GenerateIntentSource | null>(null);

  // Generating overlay state
  const [generatingPack, setGeneratingPack] = useState(false);

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Context pack refresh key: 递增后驱动 ContextPackPanel 重新加载
  const [contextPackRefreshKey, setContextPackRefreshKey] = useState(0);

  // Reasoning result state (explain/summarize selection)
  const [reasoningResult, setReasoningResult] = useState<{
    type: 'explain' | 'summarize';
    title: string;
    content: string;
    documentPath: string;
    selectedText: string;
    selectionFrom: number;
    selectionTo: number;
    sources: MentorSourceRef[];
    loading: boolean;
    editing: boolean;
    copied: boolean;
    addedToPack: boolean;
  } | null>(null);

  const [quickAsk, setQuickAsk] = useState<{
    documentPath: string;
    selectedText: string;
    selectionFrom: number;
    selectionTo: number;
    anchorRect?: EditorSelectionAnchorRect;
    question: string;
    answer: string;
    loading: boolean;
    copied: boolean;
    inserted: boolean;
    sources: MentorSourceRef[];
  } | null>(null);

  // Generation result state (直接从文档/选区 AI 生成结果)
  const [generationResult, setGenerationResult] = useState<{
    title: string;
    content: string;
    outputType: OutputType;
    sourceName: string;
    sourcePath: string;
    selectedText?: string;
    selectionFrom?: number;
    selectionTo?: number;
    sources: MentorSourceRef[];
    loading: boolean;
    editing: boolean;
    saved: boolean;
    addedToPack: boolean;
  } | null>(null);

  // Generate from doc state (kept for compatibility, no longer used for pack generation)
  const [_generateFromDoc, _setGenerateFromDoc] = useState<string | null>(null);

  // Mentor trigger state
  const [triggerResults, setTriggerResults] = useState<TriggerResult[]>([]);

  // Context Pack pending item state
  const [pendingContextPackItem, _setPendingContextPackItem] = useState<{
    documentPath: string;
    title: string | null;
    summary: string | null;
    tags: string | null;
    content: string | null;
    heading: string | null;
    start_line: number | null;
    end_line: number | null;
  } | null>(null);

  // 注册 post-reindex 钩子：reindex 完成后执行 embedding + check_triggers
  const aiStatusRef = useRef(aiStatus);
  aiStatusRef.current = aiStatus;
  const embedAndStoreRef = useRef(embedAndStore);
  embedAndStoreRef.current = embedAndStore;

  useEffect(() => {
    setPostReindexHook(async (vaultPath: string, documentPath: string, changedChunks) => {
      // 步骤 4: 如果 AI 已连接，对每个 chunk 生成 embedding
      if (aiStatusRef.current === 'connected') {
        try {
          const chunks = await chunkingService.getDocumentChunks(vaultPath, documentPath);
          for (const chunk of chunks) {
            try {
              await embedAndStoreRef.current(chunk.id, chunk.content, chunk.content_hash);
            } catch (err) {
              console.error(`Embedding chunk ${chunk.id} 失败:`, err);
            }
          }
        } catch (err) {
          console.error('获取文档 chunks 失败:', err);
        }
      }

      // 步骤 7: 检查触发器（只检查 changed chunks，避免保存后高频刷屏）
      try {
        const allNewResults: TriggerResult[] = [];
        for (const chunk of changedChunks) {
          try {
            const results = await mentorTriggersService.checkTriggers(vaultPath, documentPath, chunk.id);
            allNewResults.push(...results.map(result => ({
              ...result,
              document_path: documentPath,
              affected_count: 1,
              chunk_id: chunk.id,
              chunk_heading: chunk.heading_path,
              start_line: chunk.start_line,
              end_line: chunk.end_line,
              chunk_content: chunk.content,
            })));
          } catch (err) {
            console.error(`触发器检查 chunk ${chunk.id} 失败:`, err);
          }
        }

        // 聚合同类 trigger：同一 trigger_type 只显示一张卡，保留可判断的代表 chunk。
        const grouped = new Map<string, TriggerResult>();
        for (const r of allNewResults) {
          const existing = grouped.get(r.trigger_type);
          if (!existing) {
            grouped.set(r.trigger_type, r);
            continue;
          }
          const shouldReplace = existing.status !== 'threshold_exceeded' && r.status === 'threshold_exceeded';
          grouped.set(r.trigger_type, {
            ...(shouldReplace ? r : existing),
            affected_count: (existing.affected_count ?? 1) + (r.affected_count ?? 1),
          });
        }
        const results = Array.from(grouped.values());
        if (results.length > 0) {
          setTriggerResults(prev => {
            const filtered = prev.filter(r => !results.some(nr => nr.trigger_type === r.trigger_type));
            return [...filtered, ...results];
          });
        }
      } catch (err) {
        console.error('触发器检查失败:', err);
      }
    });

    return () => {
      setPostReindexHook(null);
    };
  }, []);

  // Cmd+K 全局键盘监听：打开/关闭 Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 注册 MentorEvent 持久化处理器（fire-and-forget，不阻塞 UI）
  useEffect(() => {
    mentorEventBus.setPersistHandler((event, vaultPath, vaultId) => {
      mentorEventsService.createEvent(
        vaultPath,
        vaultId,
        event.type,
        (event.payload?.targetId as string) ?? null,
        (event.payload?.targetType as string) ?? null,
        event.payload ?? {},
      ).catch(err => {
        console.error(`[MentorEventBus] 持久化事件 ${event.type} 失败:`, err);
      });
    });
    return () => {
      mentorEventBus.setPersistHandler(null);
    };
  }, []);

  useEffect(() => {
    if (!vault) return;
    // 发出 app_started 事件
    mentorEventBus.emit('app_started', { vaultPath: vault.path }, { vaultPath: vault.path, vaultId: vault.path });
    (async () => {
      const status = await onboardingService.readStatus(vault.path);
      if (status.status === 'pending') {
        setOnboardingOpen(true);
        mentorEventBus.emit('first_open', { vaultPath: vault.path });
      }
    })().catch(err => {
      console.error('读取 onboarding 状态失败:', err);
    });
  }, [vault]);

  useEffect(() => {
    const unsubs = [
      mentorEventBus.on('onboarding_completed', () => refreshDocTree()),
      mentorEventBus.on('new_document_intent', () => setMentorDockTab('mentor')),
    ];
    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [refreshDocTree]);

  // Cmd/Ctrl+Shift+C 全局键盘监听：打开/关闭 Quick Capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setQuickCaptureOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-save debounce: 每个 tab 独立的保存计时器，避免切换 tab 时取消其他 tab 的保存
  const saveTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // 获取当前活跃标签
  const activeTab = openTabs.find(t => t.id === activeTabId);
  const editorText = activeTab?.content ?? '';
  const isDirty = activeTab?.isDirty ?? false;

  // 打开文档（使用函数式更新避免 openTabs 闭包过期问题）
  const handleDocSelect = useCallback(async (docPath: string) => {
    if (!vault) return;

    // 使用函数式更新检查文档是否已在标签中
    let alreadyOpen = false;
    setOpenTabs(prev => {
      const existing = prev.find(t => t.id === docPath);
      if (existing) {
        alreadyOpen = true;
      }
      return prev; // 不修改，只是检查
    });

    if (alreadyOpen) {
      setActiveTabId(docPath);
      setCurrentView('editor');
      mentorEventBus.emit('document_opened', {
        targetId: docPath,
        targetType: 'document',
        documentPath: docPath,
      }, { vaultPath: vault.path, vaultId: vault.path });
      personalizationService.recordSignal(vault.path, {
        action_type: 'document_opened',
        document_path: docPath,
        chunk_id: null,
        search_query: null,
      }).catch(() => { /* 个性化信号失败不影响打开 */ });
      return;
    }

    // 否则读取文件内容并创建新标签
    try {
      const content = await documentService.readDocument(vault.path, docPath);
      const title = extractTitle(content) || docPath.split('/').pop()?.replace('.md', '') || '无标题';

      const newTab: OpenTab = {
        id: docPath,
        title,
        content,
        isDirty: false,
        hasEdited: false,
      };

      setOpenTabs(prev => {
        // 再次检查，避免并发添加重复标签
        if (prev.find(t => t.id === docPath)) return prev;
        return [...prev, newTab];
      });
      setActiveTabId(docPath);
      setCurrentView('editor');
      mentorEventBus.emit('document_opened', {
        targetId: docPath,
        targetType: 'document',
        documentPath: docPath,
        contentLength: content.length,
      }, { vaultPath: vault.path, vaultId: vault.path });
      personalizationService.recordSignal(vault.path, {
        action_type: 'document_opened',
        document_path: docPath,
        chunk_id: null,
        search_query: null,
      }).catch(() => { /* 个性化信号失败不影响打开 */ });
    } catch (err) {
      console.error('读取文档失败:', err);
      alert(`读取文档失败: ${err}`);
    }
  }, [vault]);

  // 切换标签
  const handleTabSelect = (tabId: string) => {
    setActiveTabId(tabId);
    setCurrentView('editor');
  };

  // 关闭标签
  const handleTabClose = useCallback(async (tabId: string) => {
    const closingTab = openTabs.find(t => t.id === tabId);
    if (vault && closingTab) {
      const pendingTimer = saveTimeoutsRef.current.get(tabId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        saveTimeoutsRef.current.delete(tabId);
      }

      try {
        if (closingTab.isDirty) {
          await documentService.writeDocument(vault.path, tabId, closingTab.content);
        }

        if (closingTab.hasEdited) {
          const fileName = tabId.split('/').pop()?.replace(/\.md$/, '') || closingTab.title;
          await gitService.snapshotDocument(vault.path, tabId, `minddock: snapshot ${fileName}`);
        }
      } catch (err) {
        console.error('关闭文档时保存版本失败:', err);
        setSaveError(`版本保存失败: ${err}`);
      }
    }

    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId);
      const newTabs = prev.filter(t => t.id !== tabId);

      // 如果关闭的是当前活跃标签，切换到相邻标签
      if (tabId === activeTabId && newTabs.length > 0) {
        const newIdx = Math.min(idx, newTabs.length - 1);
        setActiveTabId(newTabs[newIdx].id);
      } else if (newTabs.length === 0) {
        setActiveTabId('');
      }

      return newTabs;
    });
  }, [activeTabId, openTabs, vault]);

  // 编辑内容变化
  const handleContentChange = useCallback((newContent: string) => {
    // 使用 ref 获取最新 activeTabId，避免闭包过期导致内容串写
    const currentTabId = activeTabIdRef.current;
    if (!currentTabId) return;

    setOpenTabs(prev => prev.map(tab =>
      tab.id === currentTabId
        ? { ...tab, content: newContent, isDirty: true, hasEdited: true }
        : tab
    ));

    // 自动保存 debounce：每个 tab 独立计时器
    const existingTimer = saveTimeoutsRef.current.get(currentTabId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      if (!vault || !currentTabId) return;
      try {
        setIsSaving(true);
        setSaveError(null);
        await documentService.writeDocument(vault.path, currentTabId, newContent);
        setOpenTabs(prev => prev.map(tab =>
          tab.id === currentTabId
            ? { ...tab, isDirty: false }
            : tab
        ));
        // 保存成功后刷新文档树，以同步 frontmatter title 变更
        refreshDocTree();
        mentorEventBus.emit('document_saved', {
          targetId: currentTabId,
          targetType: 'document',
          documentPath: currentTabId,
          contentLength: newContent.length,
        }, { vaultPath: vault.path, vaultId: vault.path });
        personalizationService.recordSignal(vault.path, {
          action_type: 'document_edited',
          document_path: currentTabId,
          chunk_id: null,
          search_query: null,
        }).catch(() => { /* 个性化信号失败不影响保存 */ });

        // 检测 frontmatter title 是否与文件名不同，提示用户是否同步重命名
        const newTitle = extractTitle(newContent);
        if (newTitle) {
          const currentFileName = currentTabId.split('/').pop()?.replace(/\.md$/, '') || '';
          if (currentFileName && newTitle !== currentFileName) {
            // 延迟弹窗，避免阻塞保存流程
            setTimeout(() => {
              const shouldRename = window.confirm(
                `文档标题已改为「${newTitle}」，是否同步重命名文件？\n\n当前文件名：${currentFileName}.md\n新文件名：${newTitle}.md`
              );
              if (shouldRename && vault) {
                documentService.renameDocument(vault.path, currentTabId, newTitle)
                  .then(newPath => {
                    setOpenTabs(prev => prev.map(tab =>
                      tab.id === currentTabId
                        ? { ...tab, id: newPath, title: newTitle }
                        : tab
                    ));
                    if (activeTabIdRef.current === currentTabId) {
                      setActiveTabId(newPath);
                    }
                    refreshDocTree();
                  })
                  .catch(err => {
                    alert(`重命名失败: ${err}`);
                  });
              }
            }, 100);
          }
        }
      } catch (err) {
        console.error('自动保存失败:', err);
        setSaveError(`保存失败: ${err}`);
      } finally {
        setIsSaving(false);
        saveTimeoutsRef.current.delete(currentTabId);
      }
    }, 1000);

    saveTimeoutsRef.current.set(currentTabId, timer);
  }, [vault, refreshDocTree]);

  // 文档重命名时更新 tab 的 id、title 和内容（Rust 端已同步更新 frontmatter title）
  const handleDocRenamed = useCallback(async (oldPath: string, newPath: string) => {
    const newTitle = newPath.split('/').pop()?.replace(/\.md$/, '') || '';
    // 重新读取文件内容以获取更新后的 frontmatter title
    let newContent: string | null = null;
    if (vault) {
      try {
        newContent = await documentService.readDocument(vault.path, newPath);
      } catch { /* 读取失败则保留原内容 */ }
    }
    setOpenTabs(prev => prev.map(tab =>
      tab.id === oldPath
        ? {
            ...tab,
            id: newPath,
            title: newTitle,
            ...(newContent !== null ? { content: newContent, isDirty: false } : {}),
          }
        : tab
    ));
    if (activeTabId === oldPath) {
      setActiveTabId(newPath);
    }
  }, [activeTabId, vault]);

  // 扁平化文档树
  const flatDocEntries = flattenDocTree(docTree);

  // Command Palette 回调
  const handleCmdOpenDoc = useCallback((docPath: string) => {
    handleDocSelect(docPath);
  }, [handleDocSelect]);

  const createDocumentFromClarityResult = useCallback(async (result: ClarityInterviewResult | null) => {
    if (!vault) return;
    try {
      const baseName = result?.filename?.trim() || result?.title?.trim() || '未命名文档';
      const existingNames = new Set(flatDocEntries.filter(e => !e.is_dir).map(e => e.name));
      let name = `${baseName}.md`;
      let counter = 1;
      while (existingNames.has(name)) {
        name = `${baseName}-${counter}.md`;
        counter++;
      }
      const filePath = `${vault.path}/documents/${name}`;

      // 构建 frontmatter
      const frontmatter: Record<string, unknown> = {};
      if (result?.title?.trim()) frontmatter.title = result.title.trim();
      if (result?.source) frontmatter.source = result.source;
      if (result?.created_at) frontmatter.created_at = result.created_at;

      // 构建正文内容
      const content = result?.markdown_body?.trim()
        ? `${result.title?.trim() ? `# ${result.title.trim()}\n\n` : ''}${result.markdown_body.trim()}\n`
        : '';

      await documentService.createDocumentWithMetadata({
        vaultPath: vault.path,
        filePath,
        content,
        frontmatter,
      });

      await refreshDocTree();
      handleDocSelect(filePath);
    } catch (err) {
      console.error('创建文档失败:', err);
      alert(`创建文档失败: ${err}`);
    }
  }, [vault, refreshDocTree, handleDocSelect, flatDocEntries]);

  const handleCmdCreateDoc = useCallback(async () => {
    setClarityInterviewOpen(true);
  }, []);

  const handleCmdSwitchTab = useCallback((tabId: string) => {
    handleTabSelect(tabId);
  }, []);

  const buildDocumentPackSnapshot = useCallback(async (docPath: string) => {
    if (!vault) {
      return {
        content: null,
        heading: null,
        start_line: null,
        end_line: null,
        chunk_id: null,
      };
    }

    try {
      const chunks = await chunkingService.getDocumentChunks(vault.path, docPath);
      const selectedChunks = chunks.slice(0, 3);
      if (selectedChunks.length === 0) {
        return {
          content: null,
          heading: null,
          start_line: null,
          end_line: null,
          chunk_id: null,
        };
      }

      const content = selectedChunks
        .map(chunk => chunk.content)
        .join('\n\n---\n\n')
        .slice(0, 6000);
      const firstChunk = selectedChunks[0];
      const lastChunk = selectedChunks[selectedChunks.length - 1];

      return {
        content,
        heading: firstChunk.heading_path ?? null,
        start_line: firstChunk.start_line,
        end_line: lastChunk.end_line,
        chunk_id: firstChunk.id,
      };
    } catch {
      return {
        content: null,
        heading: null,
        start_line: null,
        end_line: null,
        chunk_id: null,
      };
    }
  }, [vault]);

  const findChunkForLineRange = useCallback(async (docPath: string, startLine: number | null, endLine: number | null) => {
    if (!vault || startLine == null || endLine == null) return null;

    try {
      const chunks = await chunkingService.getDocumentChunks(vault.path, docPath);
      return chunks.find(chunk => chunk.start_line <= endLine && chunk.end_line >= startLine) ?? null;
    } catch {
      return null;
    }
  }, [vault]);

  const getSelectionLineContext = useCallback((content: string, selection: { from: number; to: number; text: string }) => {
    const lines = content.split('\n');
    let currentPos = 0;
    let startLine = 1;
    let endLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const lineEnd = currentPos + lines[i].length;
      if (lineEnd >= selection.from && startLine === 1) {
        startLine = i + 1;
      }
      if (lineEnd >= selection.to) {
        endLine = i + 1;
        break;
      }
      currentPos += lines[i].length + 1;
    }

    let heading: string | undefined;
    for (let i = startLine - 1; i >= 0; i--) {
      const line = lines[i];
      if (line?.trim().startsWith('#')) {
        heading = line.replace(/^#+\s*/, '').trim();
        break;
      }
    }

    return { startLine, endLine, heading };
  }, []);

  const formatSourceRefs = useCallback((sources: MentorSourceRef[]) => {
    if (sources.length === 0) return '';
    return sources.map((source, index) => {
      const label = source.id || `S${index + 1}`;
      const name = source.path.split('/').pop()?.replace('.md', '') ?? source.path;
      const heading = source.heading ? ` › ${source.heading}` : '';
      const line = source.startLine != null && source.endLine != null ? ` L${source.startLine}-${source.endLine}` : '';
      return `[${label}] ${name}${heading}${line}`;
    }).join('\n');
  }, []);

  const appendSourceReferences = useCallback((content: string, sources: MentorSourceRef[]) => {
    const refs = formatSourceRefs(sources);
    if (!refs) return content;
    return `${content.trim()}\n\n---\n来源引用：\n${refs}`;
  }, [formatSourceRefs]);

  const buildSelectionReasoningContext = useCallback(async (
    docPath: string,
    selection: { from: number; to: number; text: string },
  ) => {
    if (!vault) throw new Error('Vault 未就绪');
    const content = activeTab?.content ?? '';
    const lineContext = getSelectionLineContext(content, selection);
    const [meta, matchedChunk] = await Promise.all([
      metadataService.getDocumentDbMetadata(vault.path, docPath),
      findChunkForLineRange(docPath, lineContext.startLine, lineContext.endLine),
    ]);

    const related = matchedChunk?.id
      ? await vectorIndexService.suggestContextPackCandidates(vault.path, [matchedChunk.id], 5).catch(() => [])
      : [];

    const sourceRefs: MentorSourceRef[] = [
      {
        id: 'S1',
        path: docPath,
        heading: lineContext.heading ?? matchedChunk?.heading_path ?? null,
        startLine: lineContext.startLine,
        endLine: lineContext.endLine,
        content: selection.text,
        score: 1,
      },
      ...related.slice(0, 4).map((chunk, index) => ({
        id: `R${index + 1}`,
        path: chunk.document_path,
        heading: chunk.heading_path,
        startLine: chunk.start_line,
        endLine: chunk.end_line,
        content: chunk.content,
        score: chunk.similarity_score,
      })),
    ];

    const relatedText = related.length > 0
      ? related.slice(0, 4).map((chunk, index) => {
        const heading = chunk.heading_path ? ` / ${chunk.heading_path}` : '';
        return `[R${index + 1}] ${chunk.document_path}${heading} L${chunk.start_line}-${chunk.end_line} 相关度 ${(chunk.similarity_score * 100).toFixed(0)}%\n${chunk.content.slice(0, 1200)}`;
      }).join('\n\n')
      : '暂无可用相似片段。';

    const promptContext = [
      `当前文档: ${docPath}`,
      `当前章节: ${lineContext.heading ?? matchedChunk?.heading_path ?? '未识别'}`,
      `当前位置: L${lineContext.startLine}-${lineContext.endLine}`,
      `当前文档摘要: ${meta?.summary || '暂无摘要'}`,
      '',
      '[S1] 用户选区：',
      selection.text.slice(0, 6000),
      '',
      'Embedding 召回的相似片段：',
      relatedText,
      '',
      '可引用来源：',
      formatSourceRefs(sourceRefs),
    ].join('\n');

    return {
      ...lineContext,
      docSummary: meta?.summary ?? null,
      matchedChunk,
      related,
      sources: sourceRefs,
      promptContext,
    };
  }, [activeTab, findChunkForLineRange, formatSourceRefs, getSelectionLineContext, vault]);

  // Generate Pack from Folder callback
  const handleGeneratePackFromFolder = useCallback(async (folderPath: string) => {
    if (!vault) return;
    try {
      const { contextPackService } = await import('@/services/index/context-pack');
      const { metadataService } = await import('@/services/index/metadata');

      const folderName = folderPath.split('/').pop() || '未命名';
      const pack = await contextPackService.createContextPack(vault.path, folderName);

      // 获取文件夹下所有文档，过滤属于该文件夹的
      const allDocs = await metadataService.listDocumentsMetadata(vault.path);
      const folderDocs = allDocs.filter(doc => doc.path.startsWith(folderPath + '/') || doc.path === folderPath);

      for (const doc of folderDocs) {
        const snapshot = await buildDocumentPackSnapshot(doc.path);
        await contextPackService.addItem(vault.path, pack.id, {
          document_path: doc.path,
          title: doc.title ?? null,
          summary: doc.summary ?? null,
          tags: doc.tags ?? null,
          content: snapshot.content,
          heading: snapshot.heading,
          start_line: snapshot.start_line,
          end_line: snapshot.end_line,
          selected_reason: 'folder_collection',
          chunk_id: snapshot.chunk_id,
          source_type: 'folder',
          score: null,
          reasoning_note: null,
          is_suggestion: false,
        });
      }

      setMentorDockTab('context-pack');
      setMentorDockOpen(true);
      setContextPackRefreshKey(prev => prev + 1);
      mentorEventBus.emit('context_pack_generated', {
        targetId: pack.id,
        targetType: 'context_pack',
        packId: pack.id,
        packName: folderName,
        itemCount: folderDocs.length,
        source: 'folder',
      }, { vaultPath: vault.path, vaultId: vault.path });
    } catch (err) {
      console.error('生成上下文包失败:', err);
    }
  }, [vault, buildDocumentPackSnapshot]);

  // M4: 统一 PackSelector 入口 - 文档加入
  const handleAddToPack = useCallback((docPath: string) => {
    const label = docPath.split('/').pop()?.replace('.md', '') || docPath;
    setPackSelectorTarget({ label, type: 'doc', docPath });
  }, []);

  // M4: 统一 PackSelector 入口 - 选区加入
  const handleAddSelectionToPack = useCallback((docPath: string, selection: { from: number; to: number; text: string }) => {
    const label = '选区: ' + (selection.text.slice(0, 30) + (selection.text.length > 30 ? '...' : ''));
    setPackSelectorTarget({ label, type: 'selection', docPath, data: selection });
  }, []);

  // M4: 统一 PackSelector 入口 - 搜索结果加入
  const handleAddSearchResultToPack = useCallback((result: SearchDocumentResult) => {
    const label = result.document_path.split('/').pop()?.replace('.md', '') || '搜索结果';
    setPackSelectorTarget({ label, type: 'search', docPath: result.document_path, data: result });
  }, []);

  // M6: GenerateIntentModal 确认处理
  // document/selection → 直接 AI 生成后预览（不创建 Pack）
  // folder/vault → 创建 Pack 草稿
  const handleGenerateIntentConfirm = useCallback(async (intent: string, outputType: OutputType) => {
    if (!vault || !generateIntentSource) return;
    const source = generateIntentSource;

    // 立即关闭 modal
    setGenerateIntentSource(null);
    personalizationService.recordSignal(vault.path, {
      action_type: 'output_type_used',
      document_path: source.documentPath ?? source.folderPath ?? source.vaultPath ?? null,
      chunk_id: null,
      search_query: null,
      output_type: outputType,
    }).catch(() => { /* 个性化信号失败不影响生成 */ });

    // ── 文档 / 选区：直接 AI 生成，不创建 Pack ──
    if (source.type === 'document' || source.type === 'selection') {
      const docPath = source.documentPath || '';
      const docName = source.type === 'document'
        ? docPath.split('/').pop()?.replace('.md', '') || '文档'
        : (source.heading || '选区');

      const outputLabels: Record<OutputType, string> = {
        dev_agent_prompt: 'Dev Agent Prompt', prd: 'PRD', spec: 'SPEC',
        checklist: 'Checklist', summary: '摘要', custom: '自定义生成',
      };

      setGenerationResult({
        title: `${outputLabels[outputType]} · ${docName}`,
        content: '', outputType, sourceName: docName, sourcePath: docPath,
        selectedText: source.selectedText,
        selectionFrom: source.selectionFrom,
        selectionTo: source.selectionTo,
        sources: [],
        loading: true, editing: false, saved: false, addedToPack: false,
      });

      // 强制覆盖 webview 默认 loading 光标 + double rAF 确保面板先渲染
      document.documentElement.style.cursor = 'default';
      await new Promise(r => {
        requestAnimationFrame(() => {
          requestAnimationFrame(r);
        });
      });

      try {
        const content = source.type === 'document'
          ? await documentService.readDocument(vault.path, docPath)
          : (source.selectedText || '');
        const context = source.type === 'selection'
          ? await buildSelectionReasoningContext(docPath, {
            from: source.selectionFrom ?? 0,
            to: source.selectionTo ?? (source.selectedText?.length ?? 0),
            text: source.selectedText || '',
          })
          : null;
        const docMeta = source.type === 'document'
          ? await metadataService.getDocumentDbMetadata(vault.path, docPath)
          : null;
        const documentSources: MentorSourceRef[] = source.type === 'document'
          ? [{
            id: 'S1',
            path: docPath,
            heading: null,
            startLine: null,
            endLine: null,
            content: content.slice(0, 1200),
            score: 1,
          }]
          : [];
        const sources = context?.sources ?? documentSources;
        const contextText = context?.promptContext ?? [
          `当前文档: ${docPath}`,
          `当前文档摘要: ${docMeta?.summary || '暂无摘要'}`,
          '',
          '[S1] 文档内容：',
          content.slice(0, 12000),
          '',
          '可引用来源：',
          formatSourceRefs(documentSources),
        ].join('\n');
        setGenerationResult(prev => prev ? { ...prev, sources } : null);

        if (aiStatus === 'connected') {
          const result = await chat(
            buildSelectionGenerationMessages(outputType, intent, contextText),
            `gen_${outputType}`,
          );
          setGenerationResult(prev => prev ? { ...prev, content: appendSourceReferences(result.content || '生成失败', sources), sources, loading: false } : null);
        } else {
          setGenerationResult(prev => prev ? { ...prev, content: `AI Reasoning 未连接。\n\n来源「${docName}」内容已读取（${content.length} 字）。请在 Settings → AI Reasoning 中配置连接。加入 Pack、查找相关内容仍可继续使用。`, sources, loading: false } : null);
        }
      } catch (err) {
        setGenerationResult(prev => prev ? { ...prev, content: `生成失败: ${err}`, loading: false } : null);
      }

      // 恢复光标
      document.documentElement.style.cursor = '';
      return;
    }

    // ── 文件夹 / 主库：创建 Pack ──
    setGeneratingPack(true);
    await new Promise(r => setTimeout(r, 60));

    try {
      const { contextPackService } = await import('@/services/index/context-pack');

      const baseName = intent.slice(0, 30) + (intent.length > 30 ? '...' : '');
      const packName = `草稿: ${baseName}`;
      const pack = await contextPackService.createContextPack(vault.path, packName);

      if (source.type === 'folder' && source.folderPath) {
        const { metadataService } = await import('@/services/index/metadata');
        const allDocs = await metadataService.listDocumentsMetadata(vault.path);
        const folderDocs = allDocs.filter(d => d.path.startsWith(source.folderPath! + '/')).map(d => d.path);
        for (const doc of folderDocs.slice(0, 10)) {
          const docName = doc.split('/').pop()?.replace('.md', '') || '未命名';
          const fullContent = await documentService.readDocument(vault.path, doc);
          await contextPackService.addItem(vault.path, pack.id, {
            document_path: doc, title: docName, summary: null, tags: null,
            content: fullContent.slice(0, 10000),
            heading: null, start_line: null, end_line: null, chunk_id: null,
            source_type: 'folder', score: null, reasoning_note: null,
            selected_reason: 'folder_collection', is_suggestion: false,
          });
        }
      } else if (source.type === 'vault') {
        const { metadataService: mdSvc } = await import('@/services/index/metadata');
        const allDocs = await mdSvc.listDocumentsMetadata(vault.path);
        const docPaths = allDocs.map(d => d.path).slice(0, 20);
        for (const doc of docPaths) {
          const docName = doc.split('/').pop()?.replace('.md', '') || '未命名';
          const fullContent = await documentService.readDocument(vault.path, doc);
          await contextPackService.addItem(vault.path, pack.id, {
            document_path: doc, title: docName, summary: null, tags: null,
            content: fullContent.slice(0, 5000),
            heading: null, start_line: null, end_line: null, chunk_id: null,
            source_type: 'vault', score: null, reasoning_note: null,
            selected_reason: 'vault_collection', is_suggestion: false,
          });
        }
      }

      const renamedPack = await contextPackService.renameContextPack(vault.path, pack.id, packName);
      const finalPack = await contextPackService.getContextPack(vault.path, pack.id) ?? renamedPack;
      setGeneratingPack(false);
      setContextPackRefreshKey(prev => prev + 1);
      setMentorDockTab('context-pack');
      setMentorDockOpen(true);
      setOutputGeneratorInitialType(toOutputGeneratorType(outputType));
      setOutputGeneratorInitialIntent(intent);
      setOutputGeneratorPack(finalPack);
      mentorEventBus.emit('context_pack_generated', {
        targetId: finalPack.id,
        targetType: 'context_pack',
        packId: finalPack.id,
        packName: finalPack.name,
        itemCount: finalPack.items.length,
        source: source.type,
      }, { vaultPath: vault.path, vaultId: vault.path });
    } catch (err) {
      console.error('创建生成草稿失败:', err);
      setGeneratingPack(false);
    }
  }, [vault, generateIntentSource, aiStatus, appendSourceReferences, buildSelectionReasoningContext, chat, formatSourceRefs]);

  // M4: 统一 join helper - 文档级（完整内容）
  const doJoinDoc = useCallback(async (packId: string, docPath: string) => {
    if (!vault) return;
    const { contextPackService } = await import('@/services/index/context-pack');
    const { metadataService } = await import('@/services/index/metadata');
    const meta = await metadataService.getDocumentDbMetadata(vault.path, docPath).catch(() => null);
    const fullContent = await documentService.readDocument(vault.path, docPath);
    await contextPackService.addItem(vault.path, packId, {
      document_path: docPath, title: meta?.title ?? null, summary: meta?.summary ?? null, tags: meta?.tags ?? null,
      content: fullContent.slice(0, 50000), heading: null, start_line: null, end_line: null,
      selected_reason: 'user_added', chunk_id: null, source_type: 'document', score: null, reasoning_note: null, is_suggestion: false,
    });
  }, [vault]);

  // M4: 统一 join helper - 选区级
  const doJoinSelection = useCallback(async (packId: string, docPath: string, selection: { from: number; to: number; text: string }) => {
    if (!vault) return;
    const { contextPackService } = await import('@/services/index/context-pack');
    const content = activeTab?.content ?? '';
    const lines = content.split('\n');
    let cur = 0, sl = 1, el = 1;
    for (let i = 0; i < lines.length; i++) {
      if (cur + lines[i].length >= selection.from && sl === 1) sl = i + 1;
      if (cur + lines[i].length >= selection.to) { el = i + 1; break; }
      cur += lines[i].length + 1;
    }
    const matchedChunk = await findChunkForLineRange(docPath, sl, el);
    await contextPackService.addItem(vault.path, packId, {
      document_path: docPath, title: null, summary: null, tags: null,
      content: selection.text, heading: matchedChunk?.heading_path ?? null,
      start_line: sl, end_line: el, selected_reason: 'user_added',
      chunk_id: matchedChunk?.id ?? null, source_type: 'selection', score: null, reasoning_note: null, is_suggestion: false,
    });
  }, [vault, activeTab, findChunkForLineRange]);

  // M4: 统一 join helper - 搜索结果
  const doJoinSearch = useCallback(async (packId: string, result: SearchDocumentResult) => {
    if (!vault) return;
    const { contextPackService } = await import('@/services/index/context-pack');
    await contextPackService.addItem(vault.path, packId, {
      document_path: result.document_path, title: null, summary: null, tags: null,
      content: result.content ?? result.snippet ?? null, heading: result.heading_path ?? null,
      start_line: result.start_line ?? null, end_line: result.end_line ?? null,
      selected_reason: 'search_result', chunk_id: result.chunk_id ?? null,
      source_type: 'search', score: typeof result.rank === 'number' ? result.rank : null, reasoning_note: null, is_suggestion: false,
    });
  }, [vault]);

  const insertMentorOutputAfterSelection = useCallback(async (params: {
    documentPath: string;
    selectionTo?: number;
    title: string;
    content: string;
  }) => {
    if (!vault) return;
    const targetTab = openTabsRef.current.find(tab => tab.id === params.documentPath);
    if (!targetTab) return;
    const insertionPoint = Math.max(0, Math.min(params.selectionTo ?? targetTab.content.length, targetTab.content.length));
    const insertText = `\n\n> AI Mentor · ${params.title}\n\n${params.content.trim()}\n`;
    const nextContent = `${targetTab.content.slice(0, insertionPoint)}${insertText}${targetTab.content.slice(insertionPoint)}`;
    setOpenTabs(prev => prev.map(tab =>
      tab.id === params.documentPath
        ? { ...tab, content: nextContent, isDirty: false, hasEdited: true }
        : tab
    ));
    await documentService.writeDocument(vault.path, params.documentPath, nextContent);
    refreshDocTree();
  }, [refreshDocTree, vault]);

  const insertQuickAskCalloutAfterSelection = useCallback(async () => {
    if (!vault || !quickAsk || !quickAsk.answer.trim() || !quickAsk.question.trim()) return;
    const targetTab = openTabsRef.current.find(tab => tab.id === quickAsk.documentPath);
    if (!targetTab) return;

    const insertionPoint = Math.max(0, Math.min(quickAsk.selectionTo, targetTab.content.length));
    const title = quickAsk.question.trim().replace(/\s+/g, ' ');
    const bodyLines = quickAsk.answer.trim().split('\n').map(line => line.trim() ? `> ${line}` : '>');
    const callout = [`> [!note] ${title}`, ...bodyLines].join('\n');
    const insertText = `\n\n${callout}\n\n`;
    const nextContent = `${targetTab.content.slice(0, insertionPoint)}${insertText}${targetTab.content.slice(insertionPoint)}`;

    setOpenTabs(prev => prev.map(tab =>
      tab.id === quickAsk.documentPath
        ? { ...tab, content: nextContent, isDirty: false, hasEdited: true }
        : tab
    ));
    await documentService.writeDocument(vault.path, quickAsk.documentPath, nextContent);
    refreshDocTree();
    setQuickAsk(prev => prev ? { ...prev, inserted: true } : null);
    window.setTimeout(() => setQuickAsk(prev => prev ? { ...prev, inserted: false } : null), 2000);
  }, [quickAsk, refreshDocTree, vault]);

  // Pack selector state (M4: 统一选择器，支持 doc/selection/search)
  const [packSelectorTarget, setPackSelectorTarget] = useState<{
    label: string;
    type: 'doc' | 'selection' | 'search';
    docPath: string;
    data?: any;
  } | null>(null);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [joinToast, setJoinToast] = useState<string | null>(null);
  const joinToastTimer = useRef<number>(0);

  const addMentorOutputToPack = useCallback(async (params: {
    documentPath: string;
    title: string;
    content: string;
    selectedText?: string;
    sources: MentorSourceRef[];
  }) => {
    if (!vault) return;
    const { contextPackService } = await import('@/services/index/context-pack');
    const packId = activePackId
      ?? (await contextPackService.createContextPack(vault.path, 'AI Mentor 输出')).id;
    const primarySource = params.sources[0];
    await contextPackService.addItem(vault.path, packId, {
      document_path: params.documentPath,
      title: params.title,
      summary: params.selectedText ? `基于选区生成：${params.selectedText.slice(0, 120)}` : null,
      tags: null,
      content: params.content,
      heading: primarySource?.heading ?? null,
      start_line: primarySource?.startLine ?? null,
      end_line: primarySource?.endLine ?? null,
      selected_reason: 'reasoning_output',
      chunk_id: null,
      source_type: 'selection',
      score: null,
      reasoning_note: `AI Mentor 生成输出，引用来源：${formatSourceRefs(params.sources)}`,
      is_suggestion: false,
    });
    setActivePackId(packId);
    setContextPackRefreshKey(prev => prev + 1);
    setMentorDockTab('context-pack');
    setMentorDockOpen(true);
    setJoinToast(`已加入当前 Pack「${params.title}」`);
    clearTimeout(joinToastTimer.current);
    joinToastTimer.current = window.setTimeout(() => setJoinToast(null), 2500);
  }, [activePackId, formatSourceRefs, vault]);

  const buildTriggerJudgmentContext = useCallback(async (trigger: TriggerResult): Promise<string> => {
    if (!vault) return '';
    const documentPath = trigger.document_path ?? activeTabId;
    const triggerLabel: Record<string, string> = {
      semantic_repeat: '可能重复',
      new_topic: '可能新方向',
      context_drift: '可能偏离',
      review: '建议复查',
    };
    const meta = await metadataService.getDocumentDbMetadata(vault.path, documentPath).catch(() => null);
    const related = trigger.chunk_id
      ? await vectorIndexService.suggestContextPackCandidates(vault.path, [trigger.chunk_id], 5).catch(() => [])
      : [];

    const evidence = related
      .filter(item => item.document_path !== documentPath || item.chunk_id !== trigger.chunk_id)
      .slice(0, 4)
      .map((item, index) => [
        `[R${index + 1}] ${item.document_path}`,
        item.heading_path ? `Heading: ${item.heading_path}` : null,
        `Lines: ${item.start_line}-${item.end_line}`,
        `Similarity: ${item.similarity_score.toFixed(3)}`,
        item.content.slice(0, 900),
      ].filter(Boolean).join('\n'))
      .join('\n\n');

    return [
      `触发器类型: ${triggerLabel[trigger.trigger_type] ?? trigger.trigger_type}`,
      `触发器原因: ${trigger.reason}`,
      `状态: ${trigger.status === 'threshold_exceeded' ? '已超过阈值' : '建议级别'}`,
      trigger.affected_count ? `同类触发数量: ${trigger.affected_count}` : null,
      trigger.theme ? `主题: ${trigger.theme}` : null,
      trigger.repeat_count ? `重复候选数量: ${trigger.repeat_count}` : null,
      `当前文档: ${documentPath}`,
      meta?.summary ? `当前文档摘要: ${meta.summary}` : null,
      trigger.chunk_heading ? `当前片段 heading: ${trigger.chunk_heading}` : null,
      trigger.start_line != null && trigger.end_line != null ? `当前片段行号: ${trigger.start_line}-${trigger.end_line}` : null,
      trigger.chunk_content ? `[S1] 当前触发片段:\n${trigger.chunk_content.slice(0, 1600)}` : null,
      evidence ? `Embedding 召回依据:\n${evidence}` : 'Embedding 召回依据: 暂无可用相似片段',
    ].filter(Boolean).join('\n\n');
  }, [activeTabId, vault]);

  const addTriggerToPack = useCallback(async (trigger: TriggerResult): Promise<boolean> => {
    if (!vault) return false;
    const { contextPackService } = await import('@/services/index/context-pack');
    const packId = activePackId
      ?? (await contextPackService.createContextPack(vault.path, 'Mentor 待判断素材')).id;
    await contextPackService.addItem(vault.path, packId, {
      document_path: trigger.document_path ?? activeTabId,
      title: trigger.trigger_type === 'semantic_repeat' ? '可能重复片段' : trigger.trigger_type === 'context_drift' ? '可能偏离片段' : 'Mentor 触发片段',
      summary: trigger.reason,
      tags: null,
      content: trigger.chunk_content ?? null,
      heading: trigger.chunk_heading ?? null,
      start_line: trigger.start_line ?? null,
      end_line: trigger.end_line ?? null,
      selected_reason: 'mentor_trigger',
      chunk_id: trigger.chunk_id ?? null,
      source_type: 'trigger',
      score: trigger.threshold ?? null,
      reasoning_note: `Mentor trigger: ${trigger.trigger_type}`,
      is_suggestion: false,
    });
    setActivePackId(packId);
    setContextPackRefreshKey(prev => prev + 1);
    setMentorDockTab('context-pack');
    setMentorDockOpen(true);
    setJoinToast('已将触发片段加入当前 Pack');
    clearTimeout(joinToastTimer.current);
    joinToastTimer.current = window.setTimeout(() => setJoinToast(null), 2500);
    return true;
  }, [activePackId, activeTabId, vault]);

  // Related results state
  const [relatedResults, setRelatedResults] = useState<any[]>([]);

  // Find Related callback
  const handleFindRelated = useCallback(async (docPath: string) => {
    if (!vault) return;
    try {
      const { vectorIndexService } = await import('@/services/index/vector');
      const { metadataService } = await import('@/services/index/metadata');

      // 获取文档 embedding
      const docEmbedding = await vectorIndexService.getDocumentEmbedding(vault.path, docPath);

      if (docEmbedding && docEmbedding.embedding) {
        // 使用文档 embedding 搜索相似 chunks
        const results = await vectorIndexService.semanticSearch(vault.path, docEmbedding.embedding, 10);
        // 过滤掉当前文档的结果
        const filtered = results.filter((r: any) => r.document_path !== docPath);
        setRelatedResults(filtered);
      } else {
        // fallback: 使用文档标题做 FTS 搜索
        const meta = await metadataService.getDocumentDbMetadata(vault.path, docPath);
        const title = meta?.title || docPath.split('/').pop()?.replace('.md', '') || '';
        if (title) {
          const { searchService } = await import('@/services/index/search');
          const results = await searchService.searchDocuments(vault.path, title);
          const filtered = results.filter((r: any) => r.document_path !== docPath);
          setRelatedResults(filtered);
        }
      }

      setMentorDockTab('mentor');
      setMentorDockOpen(true);
    } catch (err) {
      console.error('查找相关内容失败:', err);
      setRelatedResults([]);
    }
  }, [vault]);

  // Summarize Doc callback
  const handleSummarizeDoc = useCallback(async (_docPath: string) => {
    setMentorDockTab('document-context');
    setMentorDockOpen(true);
  }, []);

  const runSelectionReasoning = useCallback(async (
    type: 'explain' | 'summarize',
    selection: { from: number; to: number; text: string },
  ) => {
    if (!activeTabId || !vault || !selection.text.trim()) return;
    const titlePrefix = type === 'explain' ? '解释' : '总结';
    const title = `${titlePrefix}: ${selection.text.slice(0, 30)}${selection.text.length > 30 ? '...' : ''}`;
    const context = await buildSelectionReasoningContext(activeTabId, selection);

    setReasoningResult({
      type,
      title,
      content: '',
      documentPath: activeTabId,
      selectedText: selection.text,
      selectionFrom: selection.from,
      selectionTo: selection.to,
      sources: context.sources,
      loading: true,
      editing: false,
      copied: false,
      addedToPack: false,
    });

    if (aiStatus !== 'connected') {
      setReasoningResult(prev => prev ? {
        ...prev,
        content: 'AI Reasoning 未连接。请在 Settings → AI Reasoning 中配置并连接模型。加入 Pack、查找相关内容仍可继续使用。',
        loading: false,
      } : null);
      return;
    }

    try {
      const result = await chat(
        buildSelectionReasoningMessages(type, context.promptContext),
        `${type}_selection`,
      );
      const contentWithSources = appendSourceReferences(result.content || '无法获取 reasoning 结果', context.sources);
      setReasoningResult(prev => prev ? { ...prev, content: contentWithSources, loading: false } : null);
    } catch (err) {
      setReasoningResult(prev => prev ? { ...prev, content: `Reasoning 调用失败: ${err}`, loading: false } : null);
    }
  }, [activeTabId, aiStatus, appendSourceReferences, buildSelectionReasoningContext, chat, vault]);

  const submitQuickAsk = useCallback(async () => {
    if (!quickAsk || !vault || !quickAsk.question.trim()) return;

    if (aiStatus !== 'connected') {
      setQuickAsk(prev => prev ? {
        ...prev,
        answer: 'AI Reasoning 未连接。请在 Settings → AI Reasoning 中配置并连接模型后再提问。',
        loading: false,
      } : null);
      return;
    }

    setQuickAsk(prev => prev ? { ...prev, loading: true, answer: '' } : null);
    try {
      const context = await buildSelectionReasoningContext(quickAsk.documentPath, {
        from: quickAsk.selectionFrom,
        to: quickAsk.selectionTo,
        text: quickAsk.selectedText,
      });
      const result = await chat(
        buildSelectionQAMessages(quickAsk.question.trim(), context.promptContext),
        'selection_quick_qa',
      );
      setQuickAsk(prev => prev ? {
        ...prev,
        answer: appendSourceReferences(result.content || '没有得到回答', context.sources),
        sources: context.sources,
        loading: false,
      } : null);
    } catch (err) {
      setQuickAsk(prev => prev ? {
        ...prev,
        answer: `问答失败: ${err}`,
        loading: false,
      } : null);
    }
  }, [aiStatus, appendSourceReferences, buildSelectionReasoningContext, chat, quickAsk, vault]);

  // Editor selection action callback (from right-click context menu)
  const handleEditorSelectionAction = useCallback(async (action: string, selection: EditorSelectionPayload) => {
    if (!activeTabId || !vault) return;

    // 发出 selection_created 事件（轻量 payload）
    const content = activeTab?.content ?? '';
    const { startLine } = getSelectionLineContext(content, selection);
    mentorEventBus.emit('selection_created', {
      targetId: activeTabId,
      targetType: 'selection',
      documentPath: activeTabId,
      selectionLength: selection.text.length,
      lineStart: startLine,
    }, { vaultPath: vault.path, vaultId: vault.path });

    switch (action) {
      case 'addToPack':
        // 选区加入 Pack：需要先选择 Pack
        handleAddSelectionToPack(activeTabId, selection);
        break;
      case 'generateFrom':
        // 选区"从此生成"：打开 GenerateIntentModal
        {
          const content = activeTab?.content ?? '';
          const lines = content.split('\n');
          let currentPos = 0;
          let startLine = 1;
          let endLine = 1;
          for (let i = 0; i < lines.length; i++) {
            if (currentPos + lines[i].length >= selection.from && startLine === 1) {
              startLine = i + 1;
            }
            if (currentPos + lines[i].length >= selection.to) {
              endLine = i + 1;
              break;
            }
            currentPos += lines[i].length + 1;
          }
          // 查找选区所在 heading
          let heading: string | undefined;
          for (let i = startLine - 1; i >= 0; i--) {
            const line = lines[i];
            if (line.trim().startsWith('#')) {
              heading = line.replace(/^#+\s*/, '').trim();
              break;
            }
          }
          setGenerateIntentSource({
            type: 'selection',
            documentPath: activeTabId,
            selectedText: selection.text,
            selectionFrom: selection.from,
            selectionTo: selection.to,
            heading,
            startLine,
            endLine,
          });
        }
        break;
      case 'explain':
        runSelectionReasoning('explain', selection);
        break;
      case 'quickAsk':
        setQuickAsk({
          documentPath: activeTabId,
          selectedText: selection.text,
          selectionFrom: selection.from,
          selectionTo: selection.to,
          anchorRect: selection.anchorRect,
          question: '',
          answer: '',
          loading: false,
          copied: false,
          inserted: false,
          sources: [],
        });
        break;
      case 'findRelated':
        handleFindRelated(activeTabId);
        break;
      case 'summarize':
        runSelectionReasoning('summarize', selection);
        break;
    }
  }, [activeTabId, vault, handleAddSelectionToPack, handleFindRelated, activeTab, getSelectionLineContext, runSelectionReasoning]);

  const handleOpenVersionDiff = useCallback(async (commit: GitCommit) => {
    if (!vault || !activeTabId) return;

    setDiffSelection({ commit, diff: null, loading: true, error: null });
    setCurrentView('diff');

    try {
      const diff = await gitService.getDiff(vault.path, activeTabId, commit.hash);
      setDiffSelection({ commit, diff, loading: false, error: null });
    } catch (err) {
      setDiffSelection({ commit, diff: null, loading: false, error: String(err) });
    }
  }, [vault, activeTabId]);

  const renderWorkspaceContent = () => {
    switch (currentView) {
      case 'editor':
        if (openTabs.length === 0) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 gap-4 text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                <FileText size={28} className="text-stone-300 dark:text-stone-600" />
              </div>
              <div className="space-y-1">
                <p className="text-[13px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">
                  欢迎使用 MindDock
                </p>
                <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] leading-relaxed max-w-[260px]">
                  从左侧导航栏选择文档开始编辑，或使用{' '}
                  <kbd className="px-1 py-0.5 text-[10px] bg-stone-100 dark:bg-stone-800 rounded border border-[#e6e6dc] dark:border-[#2f2f2f] font-mono">⌘K</kbd>
                  {' '}打开全局命令
                </p>
              </div>
            </div>
          );
        }
        return (
          <div className="flex-1 flex flex-col min-h-0">
            <TabBar
              tabs={openTabs.map(t => ({ id: t.id, title: t.title, isDirty: t.isDirty }))}
              activeTabId={activeTabId}
              onTabSelect={handleTabSelect}
              onTabClose={handleTabClose}
            />
            <EditorToolbar
              previewMode={previewMode}
              onPreviewModeChange={setPreviewMode}
            />
            <div className="flex-1 flex min-h-0 relative" ref={editorContentRef}>
              {(previewMode === 'edit' || previewMode === 'split') && (
                <EditorView
                  ref={editorRef}
                  content={editorText}
                  onContentChange={handleContentChange}
                  onSelectionAction={handleEditorSelectionAction}
                  reasoningAvailable={aiStatus === 'connected'}
                  vaultPath={vault?.path}
                  vaultId={activeTabId}
                />
              )}
              {(previewMode === 'preview' || previewMode === 'split') && (
                <DocumentPreview
                  content={editorText}
                  filePath={activeTabId}
                />
              )}
              <EditorTocScale
                content={editorText}
                onEntryClick={(entry) => {
                  if (editorRef.current) {
                    editorRef.current.scrollToLine(entry.line);
                    return;
                  }

                  const headings = Array.from(editorContentRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? []);
                  const target = headings.find(heading => heading.textContent?.trim() === entry.text);
                  target?.scrollIntoView({ block: 'center' });
                }}
              />
            </div>
            <StatusBar
              charCount={editorText.length}
              filePath={activeTabId}
              isDirty={isDirty}
              isSaving={isSaving}
              saveError={saveError}
              onClearError={() => setSaveError(null)}
            />
          </div>
        );

      case 'mindview':
        // PHASE_PLACEHOLDER - Phase 5 会实现 MindView
        return <PlaceholderView title="MindView" phase="Phase 5" description="知识图谱可视化与操作层，支持节点选择、关系检查、上下文提取" />;

      case 'health':
        // PHASE_PLACEHOLDER - Phase 6 会实现知识体检
        return <PlaceholderView title="知识体检" phase="Phase 6" description="知识库健康评估与维护，包括孤岛检测、时效分析和建议动作" />;

      case 'diff':
        return (
          <div className="flex-1 flex flex-col min-h-0 bg-[#fcfcf9] dark:bg-[#171717]">
            <div className="h-12 border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-4 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#2c2c2a] dark:text-[#e3e3e3] truncate">
                  {diffSelection?.commit.subject || '版本对比'}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {diffSelection?.commit && (
                    <>
                      <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">{diffSelection.commit.short_hash}</span>
                      <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">{diffSelection.commit.author}</span>
                      <span className="text-[9px] text-stone-400 dark:text-stone-500">
                        {new Date(diffSelection.commit.timestamp * 1000).toLocaleString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setCurrentView('editor')}
                className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3]"
                title="返回编辑器"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 min-h-0 p-3">
              {diffSelection?.loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-stone-400" />
                </div>
              ) : diffSelection?.error ? (
                <div className="h-full flex items-center justify-center text-[11px] text-red-500">
                  {diffSelection.error}
                </div>
              ) : diffSelection?.diff ? (
                <DiffViewer patch={diffSelection.diff.patch_preview} className="h-full rounded-md" />
              ) : (
                <div className="h-full flex items-center justify-center text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  未选择版本
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  const quickAskPlacement = quickAsk ? getQuickAskPlacement(quickAsk.anchorRect) : null;

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans select-none transition-colors duration-150 bg-[#fcfcf9] dark:bg-[#171717] text-[#2c2c2a] dark:text-[#e3e3e3]`}>
      {/* Left Sidebar */}
      <Sidebar
        open={sidebarOpen}
        activeDocId={activeTabId}
        docTree={docTree}
        onDocSelect={handleDocSelect}
        onToggle={() => setSidebarOpen(false)}
        onCmdPaletteOpen={() => setCmdPaletteOpen(true)}
        onQuickCapture={() => setQuickCaptureOpen(true)}
        onOpenInbox={() => { setMentorDockTab('inbox'); setMentorDockOpen(true); }}
        onHealthView={() => setCurrentView('health')}
        onDocRenamed={handleDocRenamed}
        onSummarize={handleSummarizeDoc}
        onGeneratePackFromFolder={handleGeneratePackFromFolder}
        onGenerate={(docPath) => setGenerateIntentSource({ type: 'document', documentPath: docPath })}
        onGenerateFromFolder={(folderPath) => setGenerateIntentSource({ type: 'folder', folderPath })}
        onGenerateFromVault={() => setGenerateIntentSource({ type: 'vault', vaultPath: vault?.path })}
        onFindRelated={handleFindRelated}
        onAddToPack={handleAddToPack}
      />

      {/* Sidebar reopen button */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className={`absolute left-3 bottom-3 z-30 p-1.5 bg-white dark:bg-[#212121] border-[#e6e6dc] dark:border-[#2f2f2f] border rounded shadow-sm`}
        >
          <ChevronRight size={14} />
        </button>
      )}

      {/* Center Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative">
        <WorkspaceHeader
          currentView={currentView}
          onViewChange={setCurrentView}
          onMentorDockToggle={() => setMentorDockOpen(prev => !prev)}
          onNotificationsOpen={() => { setMentorDockTab('notifications'); setMentorDockOpen(true); }}
          onCreateStickyNote={() => addNote(activeTabId || undefined)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {renderWorkspaceContent()}
        <StickyNotesLayer
          notes={notes}
          activeDocumentPath={currentView === 'editor' ? activeTabId : ''}
          error={stickyNotesError}
          onUpdate={updateNote}
          onDelete={deleteNote}
          onConvertToCapture={convertToCapture}
        />
      </main>

      {/* Right Mentor Dock */}
      <MentorDock
        open={mentorDockOpen}
        activeTab={mentorDockTab}
        onTabChange={setMentorDockTab}
        onClose={() => setMentorDockOpen(false)}
        activeDocumentPath={activeTabId || undefined}
        activeDocumentName={activeTab?.title || undefined}
        activeDocumentContent={editorText || undefined}
        onScrollToHeading={(heading) => editorRef.current?.scrollToHeading(heading)}
        onScrollToLine={(line) => editorRef.current?.scrollToLine(line)}
        onOpenVersionDiff={handleOpenVersionDiff}
        onGeneratePrompt={(pack) => {
          setOutputGeneratorInitialType(undefined);
          setOutputGeneratorInitialIntent(undefined);
          setOutputGeneratorPack(pack);
        }}
        onOpenInEditor={(documentPath, sourceType) => {
          if (sourceType === 'document' || sourceType === 'folder' || sourceType === 'vault') {
            handleDocSelect(documentPath);
          } else {
            handleDocSelect(documentPath);
          }
        }}
        onActivePackChange={(packId) => setActivePackId(packId)}
        triggerResults={triggerResults}
        onDismissTrigger={async (triggerType) => {
          setTriggerResults(prev => prev.filter(r => r.trigger_type !== triggerType));
          // 持久化 dismissed 状态
          if (vault && activeTabId) {
            try {
              await mentorTriggersService.updateTriggerState(vault.path, activeTabId, triggerType, true);
            } catch (err) {
              console.error('持久化 dismissed 状态失败:', err);
            }
          }
        }}
        onJudgeTrigger={async (trigger) => {
          if (aiStatus !== 'connected') return null;
          try {
            const triggerTypeLabel: Record<string, string> = {
              semantic_repeat: '可能重复',
              new_topic: '新方向',
              context_drift: '可能偏离',
              review: '复查建议',
            };
            const label = triggerTypeLabel[trigger.trigger_type] || trigger.trigger_type;
            const context = await buildTriggerJudgmentContext(trigger);
            const result = await chat(
              [
                {
                  role: 'system',
                  content: `你是 MindDock 的 AI Mentor。用户请求你判断保存后的触发器是否需要关注。

规则：
1. 你只能基于当前触发片段、文档摘要和 embedding 召回依据判断。
2. 不自动合并、不自动删除、不要求用户立刻改文档。
3. 必须输出一个建议动作，限定为：合并 / 保留差异 / 加入 Pack / 稍后复查 / 忽略。
4. 如果证据不足，选择“稍后复查”或“保留差异”，并说明缺口。
5. 中文输出，控制在 5 段以内。`,
                },
                {
                  role: 'user',
                  content: `请判断这个 ${label} 触发器是否需要关注，并给出建议。\n\n输出格式：\n判断：...\n建议动作：合并 / 保留差异 / 加入 Pack / 稍后复查 / 忽略\n理由：...\n下一步：...\n\n${context}`,
                },
              ],
              'trigger_judgment',
            );
            return result.content || '无法获取判断结果';
          } catch (err) {
            console.error('触发器判断失败:', err);
            return null;
          }
        }}
        onAddTriggerToPack={addTriggerToPack}
        onDocumentUpdated={async () => {
          // 摘要/标签写入后，重新读取文件内容并更新编辑器
          if (!vault || !activeTabId) return;
          try {
            const newContent = await documentService.readDocument(vault.path, activeTabId);
            setOpenTabs(prev => prev.map(tab =>
              tab.id === activeTabId
                ? { ...tab, content: newContent, isDirty: false }
                : tab
            ));
          } catch (err) {
            console.error('刷新文档内容失败:', err);
          }
        }}
        pendingContextPackItem={pendingContextPackItem}
        onOpenSettings={() => setSettingsOpen(true)}
        onFindRelated={handleFindRelated}
        onExplain={handleSummarizeDoc}
        onSummarize={handleSummarizeDoc}
        relatedResults={relatedResults}
        onClearRelatedResults={() => setRelatedResults([])}
        onDocSelect={handleDocSelect}
        contextPackRefreshKey={contextPackRefreshKey}
      />

      {/* Command Palette Overlay */}
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onOpenDoc={handleCmdOpenDoc}
        onCreateDoc={handleCmdCreateDoc}
        onSwitchTab={handleCmdSwitchTab}
        onQuickCapture={() => { setCmdPaletteOpen(false); setQuickCaptureOpen(true); }}
        onTogglePlatter={() => setMentorDockOpen(prev => !prev)}
        onSwitchPlatterView={(view) => { setMentorDockTab(view as PlatterTab); setMentorDockOpen(true); }}
        onCreateStickyNote={() => addNote(activeTabId || undefined)}
        onAIOnboarding={() => setOnboardingOpen(true)}
        onOpenDocAtLine={async (docPath: string, line: number) => {
          await handleDocSelect(docPath);
          setTimeout(() => editorRef.current?.scrollToLine(line), 100);
        }}
        onGenerateSummaryTags={(_docPath: string) => {
          setMentorDockTab('document-context');
          setMentorDockOpen(true);
        }}
        onAddToContextPack={(result: SearchDocumentResult) => {
          // 从搜索结果添加到 Pack（可能是 chunk 级别）
          handleAddSearchResultToPack(result);
          setCmdPaletteOpen(false);
        }}
        onFindSimilar={(result: SearchDocumentResult) => {
          // 打开文档并搜索相关内容
          handleFindRelated(result.document_path);
        }}
        onAddCurrentDocToPack={() => activeTabId && handleAddToPack(activeTabId)}
        onFindRelatedContent={handleFindRelated}
        onOpenSettings={() => setSettingsOpen(true)}
        activeDocPath={activeTabId}
        openTabs={openTabs.map(t => ({ id: t.id, title: t.title }))}
        docEntries={flatDocEntries}
      />

      {/* Quick Capture Panel */}
      <QuickCapturePanel
        open={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
      />

      <OnboardingPanel
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />

      <ClarityInterviewPanel
        open={clarityInterviewOpen}
        onClose={() => setClarityInterviewOpen(false)}
        onAccept={(result) => { createDocumentFromClarityResult(result); setClarityInterviewOpen(false); }}
        onReject={() => { createDocumentFromClarityResult(null); setClarityInterviewOpen(false); }}
      />

      {/* Output Generator Modal */}
      {outputGeneratorPack && (
        <OutputGenerator
          pack={outputGeneratorPack}
          initialOutputType={outputGeneratorInitialType}
          initialIntent={outputGeneratorInitialIntent}
          autoGenerate={outputGeneratorInitialType !== undefined}
          onClose={() => { setOutputGeneratorPack(null); setOutputGeneratorInitialType(undefined); setOutputGeneratorInitialIntent(undefined); }}
        />
      )}

      {/* Pack Selector Modal (M4: 统一选择器) */}
      {packSelectorTarget && vault && (
        <PackSelectorModal
          vaultPath={vault.path}
          label={packSelectorTarget.label}
          activePackId={activePackId ?? undefined}
          onSelect={async (packId) => {
            const { type, docPath, data } = packSelectorTarget;
            try {
              if (type === 'doc') {
                await doJoinDoc(packId, docPath);
              } else if (type === 'selection') {
                await doJoinSelection(packId, docPath, data);
              } else if (type === 'search') {
                await doJoinSearch(packId, data);
              }
              setActivePackId(packId);
              setContextPackRefreshKey(prev => prev + 1);
              setMentorDockTab('context-pack');
              setMentorDockOpen(true);
              // toast
              const name = packSelectorTarget.label;
              setJoinToast(`已加入「${name}」`);
              clearTimeout(joinToastTimer.current);
              joinToastTimer.current = window.setTimeout(() => setJoinToast(null), 2500);
            } catch (err) {
              console.error('加入上下文包失败:', err);
            }
            setPackSelectorTarget(null);
          }}
          onCreateNew={async () => {
            const { type, docPath, data } = packSelectorTarget;
            try {
              const { contextPackService } = await import('@/services/index/context-pack');
              const pack = await contextPackService.createContextPack(vault.path, '新的上下文包');
              if (type === 'doc') {
                await doJoinDoc(pack.id, docPath);
              } else if (type === 'selection') {
                await doJoinSelection(pack.id, docPath, data);
              } else if (type === 'search') {
                await doJoinSearch(pack.id, data);
              }
              setActivePackId(pack.id);
              setContextPackRefreshKey(prev => prev + 1);
              setMentorDockTab('context-pack');
              setMentorDockOpen(true);
              const name = packSelectorTarget.label;
              setJoinToast(`已加入新包「${name}」`);
              clearTimeout(joinToastTimer.current);
              joinToastTimer.current = window.setTimeout(() => setJoinToast(null), 2500);
            } catch (err) {
              console.error('加入上下文包失败:', err);
            }
            setPackSelectorTarget(null);
          }}
          onCancel={() => setPackSelectorTarget(null)}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Generate Intent Modal */}
      {generateIntentSource && (
        <GenerateIntentModal
          source={generateIntentSource}
          onConfirm={handleGenerateIntentConfirm}
          onCancel={() => setGenerateIntentSource(null)}
        />
      )}

      {/* Join Toast (M4) */}
      {joinToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2 bg-emerald-600 text-white text-[11px] rounded-lg shadow-lg animate-pulse pointer-events-none">
          {joinToast}
        </div>
      )}

      {/* Generating Overlay */}
      <GeneratingOverlay open={generatingPack} />

      {/* Quick Ask Bubble (selection Q&A) */}
      {quickAsk && (
        <div
          className="fixed z-[99999] max-w-[calc(100vw-32px)] select-text"
          style={quickAskPlacement?.style}
        >
          <div className="relative">
            {quickAskPlacement?.tailSide !== 'none' && (
              <div
                className={`absolute top-7 h-3.5 w-3.5 rotate-45 border border-white/50 bg-white/60 shadow-sm backdrop-blur-2xl dark:border-white/10 dark:bg-[#1c1c1c]/65 ${
                  quickAskPlacement?.tailSide === 'left'
                    ? '-left-1.5 border-r-0 border-t-0'
                    : '-right-1.5 border-b-0 border-l-0'
                }`}
              />
            )}
            <div className="relative overflow-hidden rounded-[22px] border border-white/55 bg-white/65 shadow-[0_20px_54px_rgba(31,41,55,0.22)] ring-1 ring-black/5 backdrop-blur-2xl dark:border-white/10 dark:bg-[#1c1c1c]/65 dark:shadow-[0_20px_54px_rgba(0,0,0,0.42)] dark:ring-white/10">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/40 bg-white/25 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#2c2c2a] dark:text-[#e3e3e3]">
                  有问题，尽管问
                </p>
                <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] truncate">
                  基于当前选区回答
                </p>
              </div>
              <button
                onClick={() => setQuickAsk(null)}
                className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>

            <div className="max-h-[min(360px,calc(100vh-180px))] overflow-y-auto px-3 py-3 space-y-3">
              <div className="max-w-[86%] rounded-2xl rounded-bl-md bg-white/55 px-3 py-2 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:bg-white/[0.08] dark:ring-white/10">
                <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
                  有问题，尽管问
                </p>
                <p className="mt-1 text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] line-clamp-2">
                  选区：{quickAsk.selectedText}
                </p>
              </div>

              {quickAsk.question.trim() && (
                <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-emerald-600/90 px-3 py-2 shadow-sm backdrop-blur-xl dark:bg-emerald-500/70">
                  <p className="text-[11px] text-white whitespace-pre-wrap">
                    {quickAsk.question}
                  </p>
                </div>
              )}

              {quickAsk.loading && (
                <div className="max-w-[86%] rounded-2xl rounded-bl-md bg-white/55 px-3 py-2 flex items-center gap-2 text-[11px] text-[#7e7e78] shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:bg-white/[0.08] dark:text-[#8e8e8e] dark:ring-white/10">
                  <Loader2 size={12} className="animate-spin" />
                  正在基于选区回答...
                </div>
              )}

              {quickAsk.answer && !quickAsk.loading && (
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white/55 px-3 py-2 space-y-2 shadow-sm ring-1 ring-black/5 backdrop-blur-xl dark:bg-white/[0.08] dark:ring-white/10">
                  <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-pre-wrap leading-relaxed">
                    {quickAsk.answer}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    {quickAsk.sources.length > 0 ? (
                      <p className="text-[8px] text-[#7e7e78] dark:text-[#8e8e8e] truncate">
                        来源：{quickAsk.sources.map(s => s.id).join(', ')}
                      </p>
                    ) : <span />}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={insertQuickAskCalloutAfterSelection}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                      >
                        {quickAsk.inserted ? <Check size={9} /> : <CornerDownLeft size={9} />}
                        {quickAsk.inserted ? '已插入' : '插入 Callout'}
                      </button>
                      <button
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(quickAsk.answer); } catch { /* ignore */ }
                          setQuickAsk(prev => prev ? { ...prev, copied: true } : null);
                          setTimeout(() => setQuickAsk(prev => prev ? { ...prev, copied: false } : null), 2000);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                      >
                        {quickAsk.copied ? <Check size={9} /> : <Copy size={9} />}
                        {quickAsk.copied ? '已复制' : '复制'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form
              className="flex items-center gap-2 px-3 py-2 border-t border-white/40 bg-white/25 dark:border-white/10 dark:bg-white/[0.03]"
              onSubmit={(event) => {
                event.preventDefault();
                submitQuickAsk();
              }}
            >
              <input
                value={quickAsk.question}
                onChange={(event) => setQuickAsk(prev => prev ? { ...prev, question: event.target.value } : null)}
                placeholder="有问题，尽管问"
                disabled={quickAsk.loading}
                className="flex-1 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-white/55 dark:bg-white/[0.07] border border-white/55 dark:border-white/10 rounded-full px-3 py-2 outline-none focus:border-emerald-500 placeholder:text-[#7e7e78] backdrop-blur-xl"
                autoFocus
              />
              <button
                type="submit"
                disabled={!quickAsk.question.trim() || quickAsk.loading}
                className="px-3 py-2 rounded-full text-[10px] font-medium bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                发送
              </button>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* Generation Result Panel (文档/选区 AI 生成结果) */}
      {generationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" style={{ cursor: 'default' }} onClick={() => { setGenerationResult(null); document.documentElement.style.cursor = ''; }}>
          <div
            className="w-[700px] max-h-[85vh] bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-nowrap">
                  生成结果
                </span>
                <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] truncate">
                  {generationResult.title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!generationResult.loading && generationResult.content && (
                  <>
                    <button
                      onClick={() => setGenerationResult(prev => prev ? { ...prev, editing: !prev.editing } : null)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        generationResult.editing
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                          : 'text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <Pencil size={10} />
                      {generationResult.editing ? '编辑中' : '编辑'}
                    </button>
                    <button
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(generationResult.content); } catch {}
                        setGenerationResult(prev => prev ? { ...prev, saved: true } : null);
                        setTimeout(() => setGenerationResult(prev => prev ? { ...prev, saved: false } : null), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      {generationResult.saved ? <Check size={10} /> : <Copy size={10} />}
                      {generationResult.saved ? '已复制' : '复制'}
                    </button>
                    {generationResult.selectionTo != null && (
                      <button
                        onClick={async () => {
                          await insertMentorOutputAfterSelection({
                            documentPath: generationResult.sourcePath,
                            selectionTo: generationResult.selectionTo,
                            title: generationResult.title,
                            content: generationResult.content,
                          });
                          setGenerationResult(null);
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                        title="插入到选区后方"
                      >
                        <CornerDownLeft size={10} />
                        插入
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        await addMentorOutputToPack({
                          documentPath: generationResult.sourcePath,
                          title: generationResult.title,
                          content: generationResult.content,
                          selectedText: generationResult.selectedText,
                          sources: generationResult.sources,
                        });
                        setGenerationResult(prev => prev ? { ...prev, addedToPack: true } : null);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                    >
                      {generationResult.addedToPack ? <Check size={10} /> : <Plus size={10} />}
                      {generationResult.addedToPack ? '已加入' : '加入 Pack'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!vault) return;
                        const outputLabels: Record<string, string> = {
                          dev_agent_prompt: 'DevAgent', prd: 'PRD', spec: 'SPEC',
                          checklist: 'Checklist', summary: 'Summary', custom: 'Gen',
                        };
                        const prefix = outputLabels[generationResult.outputType] || 'Gen';
                        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        const fileName = `${prefix}_${generationResult.sourceName}_${ts}.md`;
                        const filePath = `${vault.path}/documents/${fileName}`;
                        try {
                          await documentService.createDocumentWithMetadata({
                            vaultPath: vault.path, filePath,
                            content: `# ${generationResult.title}\n\n${generationResult.content}`,
                            frontmatter: { title: generationResult.title, source: generationResult.sourcePath, created_at: new Date().toISOString() },
                          });
                          refreshDocTree();
                          setGenerationResult(null);
                          handleDocSelect(filePath);
                        } catch { /* ignore */ }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                      title="保存为新文档"
                    >
                      <Save size={10} />
                      保存
                    </button>
                  </>
                )}
                <button
                  onClick={() => setGenerationResult(null)}
                  className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {generationResult.loading ? (
                <div className="flex items-center gap-2 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  <Loader2 size={14} className="animate-spin" />
                  正在 AI 生成「{generationResult.title}」...
                </div>
              ) : generationResult.editing ? (
                <textarea
                  value={generationResult.content}
                  onChange={(e) => setGenerationResult(prev => prev ? { ...prev, content: e.target.value } : null)}
                  className="w-full h-full min-h-[400px] text-[12px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-3 resize-none outline-none focus:border-emerald-500 font-mono leading-relaxed"
                  autoFocus
                />
              ) : (
                <pre className="text-[12px] text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-pre-wrap font-mono leading-relaxed">
                  {generationResult.content}
                </pre>
              )}
            </div>

            {/* Footer */}
            {!generationResult.loading && (
              <div className="px-4 py-2 border-t border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
                <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  来源: {generationResult.sourceName}
                  {generationResult.sourcePath && ` · ${generationResult.sourcePath}`}
                  {generationResult.sources.length > 0 && ` · ${generationResult.sources.length} 条引用`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reasoning Result Panel (explain/summarize selection) */}
      {reasoningResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50" onClick={() => setReasoningResult(null)}>
          <div
            className="w-[520px] max-h-[70vh] bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
                  {reasoningResult.type === 'explain' ? '解释选区' : '总结选区'}
                </span>
                <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] truncate max-w-[280px]">
                  {reasoningResult.title}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {reasoningResult.content && !reasoningResult.loading && (
                  <>
                    <button
                      onClick={() => setReasoningResult(prev => prev ? { ...prev, editing: !prev.editing } : null)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        reasoningResult.editing
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                          : 'text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50'
                      }`}
                    >
                      <Pencil size={10} />
                      {reasoningResult.editing ? '编辑中' : '编辑'}
                    </button>
                    <button
                      onClick={async () => {
                        await insertMentorOutputAfterSelection({
                          documentPath: reasoningResult.documentPath,
                          selectionTo: reasoningResult.selectionTo,
                          title: reasoningResult.title,
                          content: reasoningResult.content,
                        });
                        setReasoningResult(null);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                      title="插入到选区后方"
                    >
                      <CornerDownLeft size={10} />
                      插入
                    </button>
                    <button
                      onClick={async () => {
                        await addMentorOutputToPack({
                          documentPath: reasoningResult.documentPath,
                          title: reasoningResult.title,
                          content: reasoningResult.content,
                          selectedText: reasoningResult.selectedText,
                          sources: reasoningResult.sources,
                        });
                        setReasoningResult(prev => prev ? { ...prev, addedToPack: true } : null);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                    >
                      {reasoningResult.addedToPack ? <Check size={10} /> : <Plus size={10} />}
                      {reasoningResult.addedToPack ? '已加入' : '加入 Pack'}
                    </button>
                    <button
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(reasoningResult.content); } catch { /* ignore */ }
                        setReasoningResult(prev => prev ? { ...prev, copied: true } : null);
                        setTimeout(() => setReasoningResult(prev => prev ? { ...prev, copied: false } : null), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      {reasoningResult.copied ? <Check size={10} /> : <Copy size={10} />}
                      {reasoningResult.copied ? '已复制' : '复制'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setReasoningResult(null)}
                  className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {reasoningResult.loading ? (
                <div className="flex items-center gap-2 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  <Loader2 size={14} className="animate-spin" />
                  {reasoningResult.type === 'explain' ? '正在解释...' : '正在总结...'}
                </div>
              ) : reasoningResult.editing ? (
                <textarea
                  value={reasoningResult.content}
                  onChange={(e) => setReasoningResult(prev => prev ? { ...prev, content: e.target.value } : null)}
                  className="w-full h-full min-h-[320px] text-[12px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-3 resize-none outline-none focus:border-emerald-500 font-mono leading-relaxed"
                  autoFocus
                />
              ) : (
                <div className="text-[12px] text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-pre-wrap leading-relaxed">
                  {reasoningResult.content}
                </div>
              )}
            </div>

            {/* Sources */}
            {reasoningResult.sources.length > 0 && (
              <div className="px-4 py-2 border-t border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
                <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  来源: {reasoningResult.sources.map(s => {
                    const name = s.path.split('/').pop()?.replace('.md', '') ?? '文档';
                    const line = s.startLine != null && s.endLine != null ? ` L${s.startLine}-${s.endLine}` : '';
                    return s.heading ? `${s.id} ${name} › ${s.heading}${line}` : `${s.id} ${name}${line}`;
                  }).join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
