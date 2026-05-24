import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

import { useVault } from '@/modules/vault/VaultProvider';
import { Sidebar } from '@/components/Sidebar';
import { WorkspaceHeader, type WorkspaceView } from '@/components/WorkspaceHeader';
import { MentorDock } from '@/components/MentorDock';
import { StatusBar } from '@/components/StatusBar';
import { PlaceholderView } from '@/components/PlaceholderView';
import { TabBar } from '@/components/TabBar';
import { EditorToolbar, type PreviewMode } from '@/modules/editor/EditorToolbar';
import { EditorView } from '@/modules/editor/EditorView';
import { MarkdownPreview } from '@/modules/editor/MarkdownPreview';
import { CommandPalette } from '@/modules/command-palette/CommandPalette';
import { documentService } from '@/services/filesystem/documents';
import { extractTitle } from '@/services/markdown/frontmatter';
import type { DocEntry } from '@/types/vault';

interface OpenTab {
  id: string;           // 文档绝对路径
  title: string;        // 文档标题
  content: string;      // 文档内容
  isDirty: boolean;     // 是否有未保存修改
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
  const [mentorDockTab, setMentorDockTab] = useState('mentor');

  // Editor state
  const [previewMode, setPreviewMode] = useState<PreviewMode>('split');

  // Command palette state
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

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
  const handleTabClose = useCallback((tabId: string) => {
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
  }, [activeTabId]);

  // 编辑内容变化
  const handleContentChange = useCallback((newContent: string) => {
    // 使用 ref 获取最新 activeTabId，避免闭包过期导致内容串写
    const currentTabId = activeTabIdRef.current;
    if (!currentTabId) return;

    setOpenTabs(prev => prev.map(tab =>
      tab.id === currentTabId
        ? { ...tab, content: newContent, isDirty: true }
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

  const handleCmdCreateDoc = useCallback(async () => {
    if (!vault) return;
    try {
      // 唯一命名策略：未命名文档 / 未命名文档-1 / 未命名文档-2 ...
      const baseName = '未命名文档';
      const existingNames = new Set(flatDocEntries.filter(e => !e.is_dir).map(e => e.name));
      let name = `${baseName}.md`;
      let counter = 1;
      while (existingNames.has(name)) {
        name = `${baseName}-${counter}.md`;
        counter++;
      }
      const filePath = `${vault.path}/documents/${name}`;
      await documentService.createDocument(vault.path, filePath);
      await refreshDocTree();
      // 打开新创建的文档
      handleDocSelect(filePath);
    } catch (err) {
      console.error('创建文档失败:', err);
      alert(`创建文档失败: ${err}`);
    }
  }, [vault, refreshDocTree, handleDocSelect, flatDocEntries]);

  const handleCmdSwitchTab = useCallback((tabId: string) => {
    handleTabSelect(tabId);
  }, []);

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
        onQuickCapture={() => {}}
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
      <main className="flex-1 flex flex-col min-w-0 bg-transparent">
        <WorkspaceHeader
          currentView={currentView}
          onViewChange={setCurrentView}
          onMentorDockToggle={() => setMentorDockOpen(prev => !prev)}
          onNotificationsOpen={() => { setMentorDockTab('notifications'); setMentorDockOpen(true); }}
        />
        {renderWorkspaceContent()}
      </main>

      {/* Right Mentor Dock */}
      <MentorDock
        open={mentorDockOpen}
        activeTab={mentorDockTab}
        onTabChange={setMentorDockTab}
        onClose={() => setMentorDockOpen(false)}
      />

      {/* Command Palette Overlay */}
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onOpenDoc={handleCmdOpenDoc}
        onCreateDoc={handleCmdCreateDoc}
        onSwitchTab={handleCmdSwitchTab}
        openTabs={openTabs.map(t => ({ id: t.id, title: t.title }))}
        docEntries={flatDocEntries}
      />
    </div>
  );
}
