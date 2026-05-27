import { useState, useEffect, useCallback, useRef } from 'react';
import { Command } from 'cmdk';
import { Search, Zap, FileText, Network, HeartPulse, Plus, PanelRight, Bot, Bell, Inbox, LayoutGrid, FileSearch, StickyNote, Settings, RotateCcw, Tags, Package, Loader2 } from 'lucide-react';

import { useVault } from '@/modules/vault/VaultProvider';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { searchService, type SearchDocumentResult } from '@/services/index/search';
import { vectorIndexService } from '@/services/index/vector';
import { metadataService } from '@/services/index/metadata';
import { personalizationService } from '@/services/index/personalization';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenDoc: (docPath: string) => void;
  onCreateDoc: () => void;
  onSwitchTab: (tabId: string) => void;
  onQuickCapture: () => void;
  onTogglePlatter: () => void;
  onSwitchPlatterView: (view: string) => void;
  onCreateStickyNote: () => void;
  onAIConfig?: () => void;
  onAICheckConnection?: () => void;
  onAIRuntimeLogs?: () => void;
  onAIOnboarding: () => void;
  onOpenDocAtLine?: (docPath: string, line: number) => void;
  onGenerateSummaryTags?: (docPath: string) => void;
  onAddToContextPack?: (result: SearchDocumentResult) => void;
  onFindSimilar?: (result: SearchDocumentResult) => void;
  onGeneratePackFromDoc?: (docPath: string) => void;
  onAddCurrentDocToPack?: () => void;
  onFindRelatedContent?: (docPath: string) => void;
  onOpenSettings?: () => void;
  activeDocPath?: string;
  openTabs: Array<{ id: string; title: string }>;
  docEntries: Array<{ name: string; path: string; absolute_path: string; is_dir: boolean }>;
}

export function CommandPalette({ open, onClose, onOpenDoc, onCreateDoc, onSwitchTab, onQuickCapture, onTogglePlatter, onSwitchPlatterView, onCreateStickyNote, onAIOnboarding, onOpenDocAtLine, onGenerateSummaryTags, onAddToContextPack, onFindSimilar, onGeneratePackFromDoc, onAddCurrentDocToPack, onFindRelatedContent, onOpenSettings, activeDocPath, openTabs, docEntries }: CommandPaletteProps) {
  const { vault } = useVault();
  const { status: aiStatus, embed } = useAIRuntime();

  // 扁平化文档列表（只取 .md 文件，不取目录）
  const flatDocs = docEntries.filter(e => !e.is_dir);

  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchDocumentResult[]>([]);
  const [semanticAvailable, setSemanticAvailable] = useState<boolean | null>(null);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 检测语义搜索是否可用
  useEffect(() => {
    if (!vault) return;
    (async () => {
      try {
        const docs = await metadataService.listDocumentsMetadata(vault.path);
        const hasEmbedding = docs.some(d => d.embedding_status === 'ready');
        setSemanticAvailable(hasEmbedding);
      } catch {
        setSemanticAvailable(false);
      }
    })();
  }, [vault]);

  // 执行搜索
  const performSearch = useCallback(async (query: string) => {
    if (!vault || !query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      // FTS 搜索
      const ftsResults = await searchService.searchDocuments(vault.path, query, 10);

      // 语义搜索（如果 embedding 可用且 AI 已连接）
      let semanticResults: SearchDocumentResult[] = [];
      if (semanticAvailable && aiStatus === 'connected') {
        try {
          const embedResult = await embed(query);
          if (embedResult.embeddings && embedResult.embeddings.length > 0) {
            const queryEmbedding = embedResult.embeddings[0];
            const semResults = await vectorIndexService.semanticSearch(vault.path, queryEmbedding, 5);
            semanticResults = semResults.map(r => ({
              document_title: null,
              document_path: r.document_path,
              heading_path: r.heading_path,
              start_line: r.start_line,
              end_line: r.end_line,
              snippet: '',
              source: 'semantic',
              rank: r.similarity_score,
            }));
          }
        } catch {
          // 语义搜索失败，仅使用 FTS 结果
        }
      }

      // 合并去重（FTS 优先）
      const seenPaths = new Set<string>();
      const merged: SearchDocumentResult[] = [];
      for (const r of ftsResults) {
        const key = `${r.document_path}:${r.start_line}`;
        if (!seenPaths.has(key)) {
          seenPaths.add(key);
          merged.push(r);
        }
      }
      for (const r of semanticResults) {
        const key = `${r.document_path}:${r.start_line}`;
        if (!seenPaths.has(key)) {
          seenPaths.add(key);
          merged.push(r);
        }
      }

      setSearchResults(merged);

      // 记录 search_query 信号
      personalizationService.recordSignal(vault.path, {
        action_type: 'search_query',
        document_path: null,
        chunk_id: null,
        search_query: query,
      }).catch(() => { /* 信号记录失败不影响搜索 */ });
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [vault, semanticAvailable, aiStatus, embed]);

  // 输入防抖搜索
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    if (value.trim().length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        performSearch(value);
      }, 300);
    } else {
      setSearchResults([]);
    }
  }, [performSearch]);

  // Escape 关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // 打开时重置搜索
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [open]);

  // 清理 debounce
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  if (!open) return null;

  const groupHeadingClass = '[cmdk-group-heading]:text-[9px] [cmdk-group-heading]:uppercase [cmdk-group-heading]:font-mono [cmdk-group-heading]:font-bold [cmdk-group-heading]:tracking-wider [cmdk-group-heading]:opacity-50 [cmdk-group-heading]:px-2 [cmdk-group-heading]:py-1';

  const sourceBadge = (source: string) => {
    switch (source) {
      case 'fts':
        return <span className="text-[8px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">全文</span>;
      case 'semantic':
        return <span className="text-[8px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">智能</span>;
      default:
        return <span className="text-[8px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">{source}</span>;
    }
  };

  const handleSearchResultSelect = (result: SearchDocumentResult) => {
    // 记录 opened_result 信号
    if (vault) {
      personalizationService.recordSignal(vault.path, {
        action_type: 'opened_result',
        document_path: result.document_path,
        chunk_id: null,
        search_query: searchQuery || null,
      }).catch(() => { /* 信号记录失败不影响操作 */ });
    }
    if (onOpenDocAtLine) {
      onOpenDocAtLine(result.document_path, result.start_line);
    } else {
      onOpenDoc(result.document_path);
    }
    onClose();
  };

  const hasSearchQuery = searchQuery.trim().length >= 2;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[99999] flex items-start justify-center pt-[15vh] p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl max-w-md w-full shadow-lg overflow-hidden`}>
        <Command shouldFilter={!hasSearchQuery}>
          <div className={`p-3.5 border-b border-[#e6e6dc] dark:border-[#2f2f2f] bg-transparent flex items-center gap-2`}>
            <Search size={15} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
            <Command.Input
              value={searchQuery}
              onValueChange={handleSearchChange}
              className="w-full bg-transparent border-none text-xs focus:outline-none focus:ring-0 text-[#2c2c2a] dark:text-[#e3e3e3]"
              placeholder="搜索文档内容或键入命令..."
            />
            {searching && <Loader2 size={12} className="animate-spin text-stone-400" />}
          </div>
          <Command.List className="p-1 max-h-64 overflow-y-auto text-xs">
            <Command.Empty className="p-3 text-center text-[#7e7e78] dark:text-[#8e8e8e] text-[11px]">无匹配命令</Command.Empty>

            {/* 搜索结果 - 仅在有搜索词时显示 */}
            {hasSearchQuery && (
              <>
                {searchResults.length > 0 && (
                  <Command.Group heading="搜索结果" className={groupHeadingClass}>
                    {searchResults.map((result, idx) => (
                      <Command.Item
                        key={`${result.document_path}:${result.start_line}:${idx}`}
                        value={`search-${result.document_path}-${idx}`}
                        onSelect={() => handleSearchResultSelect(result)}
                        className="group p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
                      >
                        <FileText size={12} className="text-[#7e7e78] dark:text-[#8e8e8e] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#2c2c2a] dark:text-[#e3e3e3] truncate">
                              {result.document_title || result.document_path.split('/').pop()?.replace('.md', '') || result.document_path}
                            </span>
                            {sourceBadge(result.source)}
                          </div>
                          {result.snippet && (
                            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] line-clamp-1 mt-0.5">
                              {result.snippet}
                            </p>
                          )}
                          {result.heading_path && (
                            <p className="text-[9px] text-stone-400 dark:text-stone-500 mt-0.5">
                              {result.heading_path} · L{result.start_line}-{result.end_line}
                            </p>
                          )}
                          {!result.heading_path && (
                            <p className="text-[9px] text-stone-400 dark:text-stone-500 mt-0.5">
                              L{result.start_line}-{result.end_line}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); onAddToContextPack?.(result); }}
                            className="p-0.5 text-[#7e7e78] hover:text-emerald-600"
                            title="加入上下文包"
                          >
                            <Package size={10} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onFindSimilar?.(result); }}
                            className="p-0.5 text-[#7e7e78] hover:text-blue-600"
                            title="查找相似内容"
                          >
                            <Search size={10} />
                          </button>
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {/* 语义搜索状态提示 - 仅在无语义结果时显示 */}
                {semanticAvailable === false && !searchResults.some(r => r.source === 'semantic') && (
                  <div className="px-2 py-1">
                    <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
                      💡 智能搜索未开启（需先生成语义索引）
                    </p>
                  </div>
                )}

                {searching && searchResults.length === 0 && (
                  <div className="p-3 flex items-center justify-center gap-1.5">
                    <Loader2 size={12} className="animate-spin text-stone-400" />
                    <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">搜索中...</p>
                  </div>
                )}

                {!searching && searchResults.length === 0 && hasSearchQuery && (
                  <div className="p-3 text-center">
                    <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">未找到匹配内容</p>
                  </div>
                )}
              </>
            )}

            {/* 文档列表 - 仅在无搜索词时显示 */}
            {!hasSearchQuery && flatDocs.length > 0 && (
              <Command.Group heading="文档" className={groupHeadingClass}>
                {flatDocs.map(doc => (
                  <Command.Item
                    key={doc.absolute_path}
                    value={doc.name}
                    onSelect={() => { onOpenDoc(doc.absolute_path); onClose(); }}
                    className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
                  >
                    <FileText size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                    <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">{doc.name.replace('.md', '')}</span>
                    <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] ml-auto">{doc.path}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* 已打开标签 */}
            {!hasSearchQuery && openTabs.length > 0 && (
              <Command.Group heading="已打开标签" className={groupHeadingClass}>
                {openTabs.map(tab => (
                  <Command.Item
                    key={tab.id}
                    value={tab.title}
                    onSelect={() => { onSwitchTab(tab.id); onClose(); }}
                    className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
                  >
                    <FileText size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                    <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">{tab.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* 命令 */}
            <Command.Group heading="命令" className={groupHeadingClass}>
              <Command.Item
                value="新建文档"
                onSelect={() => { onCreateDoc(); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Plus size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">新建文档</span>
              </Command.Item>
              {/* Quick Capture */}
              <Command.Item
                value="极速捕获 Quick Capture"
                onSelect={() => { onQuickCapture(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Zap size={12} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">极速捕获 Quick Capture</span>
                <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] ml-auto">{navigator.platform.includes('Mac') ? '\u2318\u21E7C' : 'Ctrl+Shift+C'}</span>
              </Command.Item>
              {/* Toggle Platter */}
              <Command.Item
                value="打开/关闭 Platter"
                onSelect={() => { onTogglePlatter(); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <PanelRight size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">打开/关闭 Platter</span>
              </Command.Item>
              {/* New Sticky Note */}
              <Command.Item
                value="新建便笺"
                onSelect={() => { onCreateStickyNote(); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <StickyNote size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">新建便笺</span>
              </Command.Item>
            </Command.Group>

            {/* 知识助手命令 */}
            <Command.Group heading="知识助手" className={groupHeadingClass}>
              <Command.Item
                value="总结当前文档"
                onSelect={() => {
                  if (onGenerateSummaryTags && openTabs.length > 0) {
                    onGenerateSummaryTags(openTabs[0].id);
                  }
                  onClose();
                }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Tags size={12} className="text-blue-600 dark:text-blue-400" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">总结当前文档</span>
                <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] ml-auto">当前文档</span>
              </Command.Item>
              <Command.Item
                value="从当前文档生成上下文包"
                onSelect={() => { onGeneratePackFromDoc?.(activeDocPath || ''); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Package size={12} className="text-emerald-600" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">从当前文档生成上下文包</span>
              </Command.Item>
              <Command.Item
                value="将当前文档加入上下文包"
                onSelect={() => { onAddCurrentDocToPack?.(); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Plus size={12} className="text-blue-600" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">将当前文档加入上下文包</span>
              </Command.Item>
              <Command.Item
                value="查找相关内容"
                onSelect={() => { onFindRelatedContent?.(activeDocPath || ''); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Search size={12} className="text-blue-600" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">查找相关内容</span>
              </Command.Item>
            </Command.Group>

            {/* AI 命令 */}
            <Command.Group heading="AI" className={groupHeadingClass}>
              <Command.Item
                value="打开设置"
                onSelect={() => { onOpenSettings?.(); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Settings size={12} className="text-[#7e7e78]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">打开设置</span>
              </Command.Item>
              <Command.Item
                value="重新运行引导"
                onSelect={() => { onAIOnboarding(); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <RotateCcw size={12} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">重新运行引导</span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="后续功能" className={groupHeadingClass}>
              {/* PHASE_PLACEHOLDER - Phase 5 MindView */}
              <Command.Item
                value="打开 MindView"
                onSelect={() => { onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Network size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">打开 MindView</span>
                <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] ml-auto">Phase 5</span>
              </Command.Item>
              {/* PHASE_PLACEHOLDER - Phase 6 知识体检 */}
              <Command.Item
                value="知识体检"
                onSelect={() => { onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <HeartPulse size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">知识体检</span>
                <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] ml-auto">Phase 6</span>
              </Command.Item>
            </Command.Group>

            {/* Platter 视图切换 */}
            <Command.Group heading="Platter 视图" className={groupHeadingClass}>
              <Command.Item
                value="Platter: Mentor"
                onSelect={() => { onSwitchPlatterView('mentor'); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Bot size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">Platter: Mentor</span>
              </Command.Item>
              <Command.Item
                value="Platter: Notifications"
                onSelect={() => { onSwitchPlatterView('notifications'); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Bell size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">Platter: Notifications</span>
              </Command.Item>
              <Command.Item
                value="Platter: Inbox"
                onSelect={() => { onSwitchPlatterView('inbox'); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <Inbox size={12} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">Platter: Inbox</span>
              </Command.Item>
              <Command.Item
                value="Platter: Widgets"
                onSelect={() => { onSwitchPlatterView('widgets'); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <LayoutGrid size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">Platter: Widgets</span>
              </Command.Item>
              <Command.Item
                value="Platter: Document Context"
                onSelect={() => { onSwitchPlatterView('document-context'); onClose(); }}
                className="p-2 rounded cursor-pointer flex items-center gap-2 data-[selected=true]:bg-stone-100 dark:data-[selected=true]:bg-stone-800"
              >
                <FileSearch size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">Platter: Document Context</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
