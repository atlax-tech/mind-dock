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
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import { onboardingService } from '@/services/ai/onboarding';
import { documentService } from '@/services/filesystem/documents';
import { gitService, type GitCommit, type GitDiffEntry } from '@/services/filesystem/git';
import { extractTitle } from '@/services/markdown/frontmatter';
import type { ClarityInterviewResult } from '@/modules/ai/MentorSkills';
import type { DocEntry } from '@/types/vault';

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

export function AppShell() {
  const { vault, docTree, refreshDocTree } = useVault();
  const { notes, error: stickyNotesError, addNote, updateNote, deleteNote, convertToCapture } = useStickyNotes();

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

  // 打开文档
  const handleDocSelect = useCallback(async (docPath: string) => {
    if (!vault) return;

    // 如果文档已在标签中，直接切换
    const existingTab = openTabs.find(t => t.id === docPath);
    if (existingTab) {
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

      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabId(docPath);
      setCurrentView('editor');
    } catch (err) {
      console.error('读取文档失败:', err);
      alert(`读取文档失败: ${err}`);
    }
  }, [vault, openTabs]);

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
      await documentService.createDocument(vault.path, filePath);
      if (result?.markdown_body?.trim()) {
        const titleLine = result.title?.trim() ? `# ${result.title.trim()}\n\n` : '';
        await documentService.writeDocument(vault.path, filePath, `${titleLine}${result.markdown_body.trim()}\n`);
      }
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
        onAIConfig={() => setOnboardingOpen(true)}
        onAICheckConnection={() => setOnboardingOpen(true)}
        onAIRuntimeLogs={() => { setMentorDockTab('mentor'); setMentorDockOpen(true); }}
        onAIOnboarding={() => setOnboardingOpen(true)}
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
    </div>
  );
}
