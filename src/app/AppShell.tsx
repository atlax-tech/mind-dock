import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronRight, Loader2, X } from 'lucide-react';

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
import { EditorView, type EditorViewHandle } from '@/modules/editor/EditorView';
import { MarkdownPreview } from '@/modules/editor/MarkdownPreview';
import { CommandPalette } from '@/modules/command-palette/CommandPalette';
import { QuickCapturePanel } from '@/modules/capture/QuickCapturePanel';
import { StickyNotesLayer } from '@/modules/sticky-notes/StickyNotesLayer';
import { ClarityInterviewPanel } from '@/modules/ai/ClarityInterviewPanel';
import { OnboardingPanel } from '@/modules/ai/OnboardingPanel';
import { OutputGenerator } from '@/modules/context-pack/OutputGenerator';
import { SettingsPanel } from '@/modules/settings/SettingsPanel';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import { onboardingService } from '@/services/ai/onboarding';
import { documentService } from '@/services/filesystem/documents';
import { gitService, type GitCommit, type GitDiffEntry } from '@/services/filesystem/git';
import { extractTitle } from '@/services/markdown/frontmatter';
import type { ClarityInterviewResult } from '@/modules/ai/MentorSkills';
import type { DocEntry } from '@/types/vault';
import type { ContextPack } from '@/services/index/context-pack';
import { mentorTriggersService, type TriggerResult } from '@/services/index/mentor-triggers';
import type { SearchDocumentResult } from '@/services/index/search';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { setPostReindexHook } from '@/services/filesystem/documents';
import { chunkingService } from '@/services/index/chunking';

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

function PackSelectorModal({ vaultPath, docPath, onSelect, onCreateNew, onCancel }: {
  vaultPath: string;
  docPath: string;
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
          将「{docPath.split('/').pop()?.replace('.md', '')}」添加到：
        </p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {packs.map(pack => (
            <button
              key={pack.id}
              onClick={() => onSelect(pack.id)}
              className="w-full text-left px-3 py-2 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
            >
              <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">{pack.name}</p>
              <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">{pack.items.filter(i => !i.is_suggestion).length} 条内容</p>
            </button>
          ))}
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
  const { status: aiStatus, embedAndStore } = useAIRuntime();

  // Editor ref for TOC navigation
  const editorRef = useRef<EditorViewHandle>(null);

  // Multi-tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 始终保持 ref 指向最新 activeTabId，避免 handleContentChange 闭包过期
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

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

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    setPostReindexHook(async (vaultPath: string, documentPath: string) => {
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

      // 步骤 7: 检查触发器
      try {
        const results = await mentorTriggersService.checkTriggers(vaultPath, documentPath);
        if (results.length > 0) {
          setTriggerResults(prev => {
            // 去重：替换同一文档的旧触发结果
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

  useEffect(() => {
    if (!vault) return;
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

  // 文档删除时关闭对应标签
  const handleDocDeleted = useCallback((docPath: string) => {
    handleTabClose(docPath);
  }, [handleTabClose]);

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
        await contextPackService.addItem(vault.path, pack.id, {
          document_path: doc.path,
          title: doc.title ?? null,
          summary: doc.summary ?? null,
          tags: doc.tags ?? null,
          content: null,
          heading: null,
          start_line: null,
          end_line: null,
          selected_reason: 'folder_collection',
          is_suggestion: false,
        });
      }

      setMentorDockTab('context-pack');
      setMentorDockOpen(true);
    } catch (err) {
      console.error('生成上下文包失败:', err);
    }
  }, [vault]);

  // Add to Pack callback
  const handleAddToPack = useCallback(async (docPath: string) => {
    if (!vault) return;
    try {
      const { contextPackService } = await import('@/services/index/context-pack');

      const packs = await contextPackService.listContextPacks(vault.path);

      if (packs.length === 0) {
        // 没有 Pack，自动创建
        const pack = await contextPackService.createContextPack(vault.path, '我的上下文包');
        await addDocToPack(pack.id, docPath);
        setMentorDockTab('context-pack');
        setMentorDockOpen(true);
      } else if (packs.length === 1) {
        // 只有一个 Pack，直接添加
        await addDocToPack(packs[0].id, docPath);
        setMentorDockTab('context-pack');
        setMentorDockOpen(true);
      } else {
        // 多个 Pack，显示选择器
        setPackSelectorTarget(docPath);
      }
    } catch (err) {
      console.error('加入上下文包失败:', err);
    }
  }, [vault]);

  // 辅助函数：将文档添加到 Pack（文档级）
  const addDocToPack = useCallback(async (packId: string, docPath: string) => {
    if (!vault) return;
    const { contextPackService } = await import('@/services/index/context-pack');
    const { metadataService } = await import('@/services/index/metadata');

    // 获取文档 metadata
    const meta = await metadataService.getDocumentDbMetadata(vault.path, docPath);

    await contextPackService.addItem(vault.path, packId, {
      document_path: docPath,
      title: meta?.title ?? null,
      summary: meta?.summary ?? null,
      tags: meta?.tags ?? null,
      content: null,
      heading: null,
      start_line: null,
      end_line: null,
      selected_reason: 'user_added',
      is_suggestion: false,
    });
  }, [vault]);

  // 辅助函数：将选区添加到 Pack（段落/选区级）
  const addSelectionToPack = useCallback(async (packId: string, docPath: string, selection: { text: string; from: number; to: number }) => {
    if (!vault) return;
    const { contextPackService } = await import('@/services/index/context-pack');

    // 计算行号
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
      currentPos += lines[i].length + 1; // +1 for \n
    }

    await contextPackService.addItem(vault.path, packId, {
      document_path: docPath,
      title: null,
      summary: null,
      tags: null,
      content: selection.text,
      heading: null,
      start_line: startLine,
      end_line: endLine,
      selected_reason: 'user_added',
      is_suggestion: false,
    });
  }, [vault, activeTab]);

  // 辅助函数：将选区加入已有 Pack
  const handleAddSelectionToPack = useCallback(async (docPath: string, selection: { from: number; to: number; text: string }) => {
    if (!vault) return;
    try {
      const { contextPackService } = await import('@/services/index/context-pack');
      const packs = await contextPackService.listContextPacks(vault.path);

      if (packs.length === 0) {
        const pack = await contextPackService.createContextPack(vault.path, '我的上下文包');
        await addSelectionToPack(pack.id, docPath, selection);
        setMentorDockTab('context-pack');
        setMentorDockOpen(true);
      } else if (packs.length === 1) {
        await addSelectionToPack(packs[0].id, docPath, selection);
        setMentorDockTab('context-pack');
        setMentorDockOpen(true);
      } else {
        // 多个 Pack，暂时用第一个，后续加 PackSelectorModal
        await addSelectionToPack(packs[0].id, docPath, selection);
        setMentorDockTab('context-pack');
        setMentorDockOpen(true);
      }
    } catch (err) {
      console.error('加入上下文包失败:', err);
    }
  }, [vault, addSelectionToPack]);

  // 辅助函数：从选区生成新 Pack
  const handleGenerateFromSelection = useCallback(async (docPath: string, selection: { from: number; to: number; text: string }) => {
    if (!vault) return;
    try {
      const { contextPackService } = await import('@/services/index/context-pack');
      const docName = docPath.split('/').pop()?.replace('.md', '') || '未命名';
      const pack = await contextPackService.createContextPack(vault.path, `来自: ${docName} 选区`);
      await addSelectionToPack(pack.id, docPath, selection);
      setMentorDockTab('context-pack');
      setMentorDockOpen(true);
    } catch (err) {
      console.error('生成上下文包失败:', err);
    }
  }, [vault, addSelectionToPack]);

  // 辅助函数：将搜索结果添加到 Pack
  const handleAddSearchResultToPack = useCallback(async (result: any) => {
    if (!vault) return;
    try {
      const { contextPackService } = await import('@/services/index/context-pack');
      const packs = await contextPackService.listContextPacks(vault.path);

      let packId: string;
      if (packs.length === 0) {
        const pack = await contextPackService.createContextPack(vault.path, '我的上下文包');
        packId = pack.id;
      } else {
        packId = packs[0].id;
      }

      await contextPackService.addItem(vault.path, packId, {
        document_path: result.document_path,
        title: null,
        summary: null,
        tags: null,
        content: result.snippet ?? result.content ?? null,
        heading: result.heading_path ?? null,
        start_line: result.start_line ?? null,
        end_line: result.end_line ?? null,
        selected_reason: 'search_result',
        is_suggestion: false,
      });

      setMentorDockTab('context-pack');
      setMentorDockOpen(true);
    } catch (err) {
      console.error('加入上下文包失败:', err);
    }
  }, [vault]);

  // Related results state
  const [relatedResults, setRelatedResults] = useState<any[]>([]);

  // Pack selector state
  const [packSelectorTarget, setPackSelectorTarget] = useState<string | null>(null);

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

  // Editor selection action callback (from right-click context menu)
  const handleEditorSelectionAction = useCallback((action: string, selection: { from: number; to: number; text: string }) => {
    if (!activeTabId || !vault) return;

    switch (action) {
      case 'addToPack':
        // 选区加入 Pack：需要先选择 Pack
        handleAddSelectionToPack(activeTabId, selection);
        break;
      case 'generateFrom':
        // 选区"从此生成"：创建新 Pack 并添加选区
        handleGenerateFromSelection(activeTabId, selection);
        break;
      case 'explain':
        handleSummarizeDoc(activeTabId);
        break;
      case 'findRelated':
        handleFindRelated(activeTabId);
        break;
      case 'summarize':
        handleSummarizeDoc(activeTabId);
        break;
    }
  }, [activeTabId, vault, handleAddSelectionToPack, handleGenerateFromSelection, handleSummarizeDoc, handleFindRelated]);

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
            <div className="flex-1 flex min-h-0">
              {(previewMode === 'edit' || previewMode === 'split') && (
                <EditorView
                  ref={editorRef}
                  content={editorText}
                  onContentChange={handleContentChange}
                  onSelectionAction={handleEditorSelectionAction}
                />
              )}
              {(previewMode === 'preview' || previewMode === 'split') && (
                <MarkdownPreview
                  content={editorText}
                />
              )}
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
        onDocDeleted={handleDocDeleted}
        onDocRenamed={handleDocRenamed}
        onSummarize={handleSummarizeDoc}
        onGeneratePackFromFolder={handleGeneratePackFromFolder}
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
        onGeneratePrompt={(pack) => setOutputGeneratorPack(pack)}
        triggerResults={triggerResults}
        onDismissTrigger={(triggerType) => {
          setTriggerResults(prev => prev.filter(r => r.trigger_type !== triggerType));
        }}
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
          onClose={() => setOutputGeneratorPack(null)}
        />
      )}

      {/* Pack Selector Modal */}
      {packSelectorTarget && (
        <PackSelectorModal
          vaultPath={vault!.path}
          docPath={packSelectorTarget}
          onSelect={async (packId) => {
            await addDocToPack(packId, packSelectorTarget);
            setPackSelectorTarget(null);
            setMentorDockTab('context-pack');
            setMentorDockOpen(true);
          }}
          onCreateNew={async () => {
            const { contextPackService } = await import('@/services/index/context-pack');
            const pack = await contextPackService.createContextPack(vault!.path, '新的上下文包');
            await addDocToPack(pack.id, packSelectorTarget);
            setPackSelectorTarget(null);
            setMentorDockTab('context-pack');
            setMentorDockOpen(true);
          }}
          onCancel={() => setPackSelectorTarget(null)}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
