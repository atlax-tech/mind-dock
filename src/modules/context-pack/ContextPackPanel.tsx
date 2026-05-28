import { useState, useEffect, useCallback } from 'react';
import {
  Package, Plus, Trash2, Pencil, ChevronUp, ChevronDown,
  Loader2, FileText, ArrowRight, Download, Sparkles, Check,
} from 'lucide-react';

import { useVault } from '@/modules/vault/VaultProvider';
import {
  contextPackService,
  type ContextPack,
  type ContextPackItem,
} from '@/services/index/context-pack';
import {
  vectorIndexService,
} from '@/services/index/vector';
import {
  chunkingService,
} from '@/services/index/chunking';
import { personalizationService } from '@/services/index/personalization';

/** selected_reason 的中文标签映射 */
const REASON_LABELS: Record<string, { label: string; colorClass: string }> = {
  semantic_similarity: { label: '内容相关', colorClass: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  same_tag: { label: '同标签', colorClass: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  same_heading_cluster: { label: '同主题', colorClass: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
  recent_interaction: { label: '最近查看', colorClass: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  previously_accepted_similar_item: { label: '历史采纳', colorClass: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' },
  user_added: { label: '你选择的', colorClass: 'bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]' },
  folder_collection: { label: '文件夹收集', colorClass: 'bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]' },
};

function getReasonBadge(reason: string) {
  const cfg = REASON_LABELS[reason] ?? { label: reason, colorClass: 'bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]' };
  return <span className={`text-[9px] px-1 py-0.5 rounded ${cfg.colorClass}`}>{cfg.label}</span>;
}

interface ContextPackPanelProps {
  onGeneratePrompt?: (pack: ContextPack) => void;
  pendingItem?: {
    documentPath: string;
    title: string | null;
    summary: string | null;
    tags: string | null;
    content: string | null;
    heading: string | null;
    start_line: number | null;
    end_line: number | null;
  } | null;
  refreshKey?: number;
}

/** 文档级推荐候选 */
interface DocCandidate {
  document_path: string;
  title?: string;
  summary?: string;
  tags?: string;
  content?: string;
  selected_reason: string;
  similarity_score: number;
  chunk_id?: number;
  start_line?: number;
  end_line?: number;
}

export function ContextPackPanel({ onGeneratePrompt, pendingItem, refreshKey }: ContextPackPanelProps) {
  const { vault } = useVault();
  const [packs, setPacks] = useState<ContextPack[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DocCandidate[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [newPackName, setNewPackName] = useState('');
  const [showNewPack, setShowNewPack] = useState(false);
  const [renamingPackId, setRenamingPackId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const activePack = packs.find(p => p.id === activePackId) ?? null;

  // 加载 packs
  const refreshPacks = useCallback(async () => {
    if (!vault) { setPacks([]); return; }
    try {
      const list = await contextPackService.listContextPacks(vault.path);
      setPacks(list);
    } catch {
      setPacks([]);
    }
  }, [vault]);

  useEffect(() => {
    refreshPacks();
  }, [refreshPacks]);

  useEffect(() => {
    if (refreshKey === undefined) return;
    refreshPacks();
  }, [refreshKey, refreshPacks]);

  // 处理 pendingItem：当从搜索结果添加时，自动加入当前活跃的 Pack
  useEffect(() => {
    if (!vault || !pendingItem) return;
    const addPendingItem = async () => {
      try {
        // 如果没有活跃 Pack，创建一个
        let packId = activePackId;
        if (!packId) {
          const newPack = await contextPackService.createContextPack(vault.path, '从搜索添加');
          packId = newPack.id;
          await refreshPacks();
          setActivePackId(packId);
        }
        await contextPackService.addItem(vault.path, packId, {
          document_path: pendingItem.documentPath,
          title: pendingItem.title ?? null,
          summary: pendingItem.summary ?? null,
          tags: pendingItem.tags ?? null,
          content: pendingItem.content ?? null,
          heading: pendingItem.heading ?? null,
          start_line: pendingItem.start_line ?? null,
          end_line: pendingItem.end_line ?? null,
          chunk_id: null,
          source_type: 'search',
          score: null,
          reasoning_note: null,
          selected_reason: 'user_added',
          is_suggestion: false,
        });
        await refreshPacks();
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 2000);
      } catch (err) {
        console.error('添加到 Context Pack 失败:', err);
      }
    };
    addPendingItem();
  }, [vault, pendingItem]);

  // 当 activePack 变化时，加载建议（基于已有 item 的 chunk_id 推荐相似内容）
  useEffect(() => {
    if (!vault || !activePack) {
      setSuggestions([]);
      return;
    }
    const confirmedItems = activePack.items.filter(i => !i.is_suggestion);
    if (confirmedItems.length === 0) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);

    // 收集已有 item 的 chunk_id 用于推荐
    const collectChunkIdsAndSuggest = async () => {
      try {
        // 1. 从已有 item 中直接收集 chunk_id
        const existingChunkIds = confirmedItems
          .map(i => i.chunk_id)
          .filter((id): id is number => id != null);

        // 2. 对于没有 chunk_id 的文档级 item，查询该文档的 chunks 取第一个
        const docItemsWithoutChunk = confirmedItems.filter(i => i.chunk_id == null);
        for (const item of docItemsWithoutChunk) {
          try {
            const chunks = await chunkingService.getDocumentChunks(vault.path, item.document_path);
            if (chunks.length > 0) {
              existingChunkIds.push(chunks[0].id);
            }
          } catch {
            // 文档可能未索引，跳过
          }
        }

        if (existingChunkIds.length === 0) {
          setSuggestions([]);
          return;
        }

        // 3. 用收集到的 chunkIds 调用推荐
        const candidates = await vectorIndexService.suggestContextPackCandidates(
          vault.path,
          existingChunkIds,
          20,
        );

        // 4. 按 document_path 去重，排除已有文档
        const existingDocPaths = new Set(confirmedItems.map(i => i.document_path));
        const seen = new Set<string>();
        const docCandidates: DocCandidate[] = [];
        for (const c of candidates) {
          if (seen.has(c.document_path) || existingDocPaths.has(c.document_path)) continue;
          seen.add(c.document_path);
          docCandidates.push({
            document_path: c.document_path,
            title: c.heading_path ?? undefined,
            content: c.content,
            selected_reason: c.selected_reason,
            similarity_score: c.similarity_score,
            chunk_id: c.chunk_id,
            start_line: c.start_line,
            end_line: c.end_line,
          });
        }
        setSuggestions(docCandidates.slice(0, 5));
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    };

    collectChunkIdsAndSuggest();
  }, [vault, activePackId, activePack?.items.filter(i => !i.is_suggestion).length]);

  // 创建新 pack
  const handleCreatePack = useCallback(async () => {
    if (!vault || !newPackName.trim()) return;
    try {
      const pack = await contextPackService.createContextPack(vault.path, newPackName.trim());
      setNewPackName('');
      setShowNewPack(false);
      await refreshPacks();
      setActivePackId(pack.id);
    } catch (err) {
      console.error('创建 Context Pack 失败:', err);
    }
  }, [vault, newPackName, refreshPacks]);

  // 删除 pack
  const handleDeletePack = useCallback(async (packId: string) => {
    if (!vault) return;
    try {
      await contextPackService.deleteContextPack(vault.path, packId);
      if (activePackId === packId) setActivePackId(null);
      await refreshPacks();
    } catch (err) {
      console.error('删除 Context Pack 失败:', err);
    }
  }, [vault, activePackId, refreshPacks]);

  // 重命名 pack
  const handleRenamePack = useCallback(async (packId: string) => {
    if (!vault || !renameDraft.trim()) return;
    try {
      await contextPackService.renameContextPack(vault.path, packId, renameDraft.trim());
      setRenamingPackId(null);
      await refreshPacks();
    } catch (err) {
      console.error('重命名 Context Pack 失败:', err);
    }
  }, [vault, renameDraft, refreshPacks]);

  // 删除条目
  const handleRemoveItem = useCallback(async (itemId: string) => {
    if (!vault || !activePackId) return;
    const item = activePack?.items.find(i => i.id === itemId);
    try {
      await contextPackService.removeItem(vault.path, activePackId, itemId);
      await refreshPacks();
    } catch (err) {
      console.error('删除条目失败:', err);
    }

    // 记录 context_pack_item_rejected 信号
    if (vault && item) {
      personalizationService.recordSignal(vault.path, {
        action_type: 'context_pack_item_rejected',
        document_path: item.document_path,
        chunk_id: item.chunk_id ?? null,
        search_query: null,
      }).catch(() => { /* 信号记录失败不影响操作 */ });
    }
  }, [vault, activePackId, activePack, refreshPacks]);

  // 移动条目
  const handleMoveItem = useCallback(async (itemId: string, direction: 'up' | 'down') => {
    if (!vault || !activePackId) return;
    try {
      await contextPackService.moveItem(vault.path, activePackId, itemId, direction);
      await refreshPacks();
    } catch (err) {
      console.error('移动条目失败:', err);
    }
  }, [vault, activePackId, refreshPacks]);

  // 编辑条目：如果有 content（段落/选区），编辑 content；否则编辑 summary
  const startEditItem = useCallback((item: ContextPackItem) => {
    setEditingItemId(item.id);
    setEditSummary(item.content ?? item.summary ?? '');
  }, []);

  const saveEditItem = useCallback(async () => {
    if (!vault || !activePackId || !editingItemId) return;
    try {
      const item = activePack?.items.find(i => i.id === editingItemId);
      if (item?.content) {
        await contextPackService.updateItem(vault.path, activePackId, editingItemId, { content: editSummary.trim() || null });
      } else {
        await contextPackService.updateItem(vault.path, activePackId, editingItemId, { summary: editSummary.trim() || null });
      }
      setEditingItemId(null);
      setEditSummary('');
      await refreshPacks();
    } catch (err) {
      console.error('编辑条目失败:', err);
    }
  }, [vault, activePackId, editingItemId, editSummary, refreshPacks, activePack]);

  // 接受建议
  const handleAcceptSuggestion = useCallback(async (candidate: DocCandidate) => {
    if (!vault || !activePackId) return;
    try {
      await contextPackService.addItem(vault.path, activePackId, {
        document_path: candidate.document_path,
        title: candidate.title ?? null,
        summary: candidate.summary ?? null,
        tags: candidate.tags ?? null,
        content: candidate.content ?? null,
        heading: candidate.title ?? null,
        start_line: candidate.start_line ?? null,
        end_line: candidate.end_line ?? null,
        chunk_id: candidate.chunk_id ?? null,
        source_type: 'suggestion',
        score: candidate.similarity_score,
        reasoning_note: null,
        selected_reason: candidate.selected_reason,
        is_suggestion: false,
      });
      // 从建议列表中移除
      setSuggestions(prev => prev.filter(s => s.document_path !== candidate.document_path));
      await refreshPacks();
    } catch (err) {
      console.error('添加推荐失败:', err);
    }

    // 记录 context_pack_item_accepted 信号
    if (vault) {
      personalizationService.recordSignal(vault.path, {
        action_type: 'context_pack_item_accepted',
        document_path: candidate.document_path,
        chunk_id: candidate.chunk_id ?? null,
        search_query: null,
      }).catch(() => { /* 信号记录失败不影响操作 */ });
    }
  }, [vault, activePackId, refreshPacks]);

  // 导出 Markdown
  const handleExportMarkdown = useCallback(async () => {
    if (!activePack || !vault) return;
    setExportError(null);
    try {
      const md = contextPackService.exportAsMarkdown(activePack);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `context-pack-${activePack.name.replace(/\s+/g, '-')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 记录 prompt_copied 信号
      personalizationService.recordSignal(vault.path, {
        action_type: 'prompt_copied',
        document_path: null,
        chunk_id: null,
        search_query: null,
      }).catch(() => { /* 信号记录失败不影响操作 */ });
    } catch (err) {
      setExportError(`导出失败: ${err}`);
    }
  }, [activePack, vault]);

  // 生成 Prompt
  const handleGeneratePrompt = useCallback(() => {
    if (!activePack || !onGeneratePrompt) return;
    onGeneratePrompt(activePack);

    // 记录 prompt_copied 信号
    if (vault) {
      personalizationService.recordSignal(vault.path, {
        action_type: 'prompt_copied',
        document_path: null,
        chunk_id: null,
        search_query: null,
      }).catch(() => { /* 信号记录失败不影响操作 */ });
    }
  }, [activePack, onGeneratePrompt, vault]);

  const confirmedItems = activePack?.items.filter(i => !i.is_suggestion) ?? [];

  return (
    <div className="divide-y divide-[#e6e6dc] dark:divide-[#2f2f2f]">
      {/* Pack 列表 */}
      <section className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Package size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
            <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
              上下文包
            </p>
          </div>
          <button
            onClick={() => setShowNewPack(true)}
            className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            title="新建 Context Pack"
          >
            <Plus size={12} />
          </button>
        </div>

        {showNewPack && (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newPackName}
              onChange={(e) => setNewPackName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePack(); if (e.key === 'Escape') { setShowNewPack(false); setNewPackName(''); } }}
              placeholder="上下文包名称"
              className="flex-1 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5 placeholder:text-[#7e7e78]"
              autoFocus
            />
            <button onClick={() => handleCreatePack()} className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline">
              创建
            </button>
            <button onClick={() => { setShowNewPack(false); setNewPackName(''); }} className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] hover:underline">
              取消
            </button>
          </div>
        )}

        {packs.length === 0 ? (
          <div className="py-4 space-y-1.5">
            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
              收集相关文档，生成结构化提示词。
            </p>
            <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
              在文档上右键选择"加入上下文包"或在文件夹上右键选择"生成上下文包"即可开始。
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {packs.map(pack => (
              <div
                key={pack.id}
                className={`flex items-center gap-1.5 px-1.5 py-1.5 cursor-pointer transition-colors border-l-2 ${
                  activePackId === pack.id
                    ? 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10'
                    : 'border-l-transparent hover:bg-stone-50 dark:hover:bg-stone-800/40'
                }`}
              >
                {renamingPackId === pack.id ? (
                  <input
                    type="text"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => handleRenamePack(pack.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenamePack(pack.id); if (e.key === 'Escape') setRenamingPackId(null); }}
                    className="flex-1 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                    autoFocus
                  />
                ) : (
                  <>
                    <button
                      onClick={() => setActivePackId(pack.id)}
                      className="flex-1 text-left text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] truncate"
                    >
                      {pack.name}
                      <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] ml-1">
                        ({pack.items.filter(i => !i.is_suggestion).length})
                      </span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingPackId(pack.id); setRenameDraft(pack.name); }}
                      className="p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200"
                      title="重命名"
                    >
                      <Pencil size={9} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePack(pack.id); }}
                      className="p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-red-500 dark:hover:text-red-400"
                      title="删除"
                    >
                      <Trash2 size={9} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 当前 Pack 内容 */}
      {activePack && (
        <section className="px-3 py-2.5 space-y-2">
          {justAdded && (
            <div className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check size={10} />
              已添加到上下文包
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
              <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
                {activePack.name}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleExportMarkdown}
                disabled={confirmedItems.length === 0}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="导出 Markdown"
              >
                <Download size={9} />
                导出
              </button>
              <button
                onClick={handleGeneratePrompt}
                disabled={confirmedItems.length === 0}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="生成 Prompt"
              >
                <Sparkles size={9} />
                生成提示词
              </button>
            </div>
          </div>

          {exportError && (
            <p className="text-[10px] text-red-500">{exportError}</p>
          )}

          {confirmedItems.length === 0 ? (
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">从文档右键菜单或搜索结果添加文档</p>
          ) : (
            <div className="divide-y divide-[#e6e6dc] dark:divide-[#2f2f2f]">
              {confirmedItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="py-2 space-y-1"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* 标题：段落级显示 heading，文档级显示 title */}
                        <span className="text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] truncate">
                          {item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名'}
                        </span>
                        {getReasonBadge(item.selected_reason)}
                        {/* 粒度标签 */}
                        {item.content && (
                          <span className="text-[8px] px-1 py-0 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                            {item.start_line != null ? '段落' : '选区'}
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] truncate">
                        {item.document_path}
                        {item.start_line != null && item.end_line != null && ` · L${item.start_line}–L${item.end_line}`}
                      </p>
                      {/* 文档级：显示摘要和标签 */}
                      {item.summary && !item.content && (
                        <p className="text-[9px] text-[#5a5a56] dark:text-[#a0a0a0] line-clamp-1 mt-0.5">
                          {item.summary}
                        </p>
                      )}
                      {/* 段落/选区级：显示内容预览 */}
                      {item.content && (
                        <p className="text-[9px] text-[#5a5a56] dark:text-[#a0a0a0] line-clamp-2 mt-0.5 leading-normal">
                          {item.content}
                        </p>
                      )}
                      {/* 文档级标签 */}
                      {item.tags && !item.content && (
                        <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                          {item.tags.split(',').map(tag => (
                            <span key={tag} className="text-[8px] px-1 py-0 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => handleMoveItem(item.id, 'up')}
                        disabled={idx === 0}
                        className="p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-30"
                        title="上移"
                      >
                        <ChevronUp size={10} />
                      </button>
                      <button
                        onClick={() => handleMoveItem(item.id, 'down')}
                        disabled={idx === confirmedItems.length - 1}
                        className="p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-30"
                        title="下移"
                      >
                        <ChevronDown size={10} />
                      </button>
                      <button
                        onClick={() => startEditItem(item)}
                        className="p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200"
                        title="编辑"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-red-500 dark:hover:text-red-400"
                        title="删除"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>

                  {editingItemId === item.id && (
                    <textarea
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      onBlur={saveEditItem}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditItem(); } if (e.key === 'Escape') { setEditingItemId(null); setEditSummary(''); } }}
                      className="w-full text-[10px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded p-1 resize-none outline-none focus:border-emerald-500"
                      rows={2}
                      placeholder={item.content ? '编辑内容...' : '编辑摘要...'}
                      autoFocus
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Embedding-driven 候选建议 */}
      {activePack && (
        <section className="px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-amber-500 dark:text-amber-400" />
            <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
              推荐内容
            </p>
            {suggestionsLoading && <Loader2 size={10} className="animate-spin text-stone-400" />}
          </div>
          <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
            {confirmedItems.length === 0
              ? '添加文档后，将自动推荐相关知识'
              : '基于你选择的文档，推荐可能相关的知识'}
          </p>

          {suggestions.length === 0 && !suggestionsLoading ? (
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              {confirmedItems.length === 0
                ? '添加文档后，将基于语义相似度推荐相关内容'
                : '暂无更多建议'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {suggestions.map(candidate => (
                <div
                  key={candidate.document_path}
                  className="border-l-2 border-l-amber-500 bg-amber-50/30 dark:bg-amber-900/10 px-2 py-1.5 space-y-1"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">
                          推荐
                        </span>
                        {getReasonBadge(candidate.selected_reason)}
                        <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
                          相关度 {(candidate.similarity_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] truncate mt-0.5">
                        {candidate.title ?? candidate.document_path.split('/').pop()?.replace('.md', '') ?? '未命名'}
                      </p>
                      <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] truncate">
                        {candidate.document_path}
                        {candidate.start_line != null && candidate.end_line != null && (
                          <span> · L{candidate.start_line}-{candidate.end_line}</span>
                        )}
                      </p>
                      {candidate.content && (
                        <p className="text-[9px] text-[#5a5a56] dark:text-[#a0a0a0] line-clamp-2 mt-0.5 leading-normal">
                          {candidate.content}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAcceptSuggestion(candidate)}
                      className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition-colors shrink-0"
                      title="加入"
                    >
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
