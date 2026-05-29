import { ChevronLeft, Search, Zap, Inbox, Sun, Moon, FolderSync, Sparkles, Plus, FileText, FolderPlus, Folder } from 'lucide-react';
import { useTheme } from '@/app/theme';
import { useVault } from '@/modules/vault/VaultProvider';
import { DocTree } from '@/modules/dock/DocTree';
import { useState, useEffect, useRef, useCallback } from 'react';
import { documentService } from '@/services/filesystem/documents';
import type { DocEntry } from '@/types/vault';

interface SidebarProps {
  open: boolean;
  activeDocId: string;
  docTree: DocEntry[];
  onDocSelect: (docId: string) => void;
  onToggle: () => void;
  onCmdPaletteOpen: () => void;
  onQuickCapture: () => void;
  onOpenInbox: () => void;
  onHealthView: () => void;
  onDocRenamed?: (oldPath: string, newPath: string) => void;
  onSummarize?: (docPath: string) => void;
  onGeneratePackFromFolder?: (folderPath: string) => void;
  onGenerate?: (docPath: string) => void;
  onGenerateFromFolder?: (folderPath: string) => void;
  onGenerateFromVault?: () => void;
  onFindRelated?: (docPath: string) => void;
  onAddToPack?: (docPath: string) => void;
}

export function Sidebar({ open, activeDocId, docTree, onDocSelect, onToggle, onCmdPaletteOpen, onQuickCapture, onOpenInbox, onHealthView, onDocRenamed, onSummarize, onGeneratePackFromFolder, onGenerate, onGenerateFromFolder, onGenerateFromVault, onFindRelated, onAddToPack }: SidebarProps) {
  const { isDark, toggle } = useTheme();
  const { vault, switchVault, refreshDocTree } = useVault();
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);
  const [creatingType, setCreatingType] = useState<'doc' | 'folder' | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!createMenu) return;
    const close = () => setCreateMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [createMenu]);

  useEffect(() => {
    if (creatingType) createInputRef.current?.focus();
  }, [creatingType]);

  const handleTopCreate = useCallback(async (type: 'doc' | 'folder') => {
    setCreateMenu(null);
    setCreatingType(type);
  }, []);

  const handleCreateConfirm = useCallback(async (name: string) => {
    if (!creatingType || !vault || !name.trim()) {
      setCreatingType(null);
      return;
    }

    // 同级重名校验（根级 = docTree 顶层）
    const targetName = creatingType === 'folder'
      ? name.trim()
      : (/\.[^/.]+$/.test(name.trim()) ? name.trim() : `${name.trim()}.md`);
    if (docTree.some(e => e.name === targetName)) {
      alert(`根目录已存在同名${creatingType === 'folder' ? '文件夹' : '文档'}: ${targetName}`);
      setCreatingType(null);
      return;
    }

    setCreatingType(null);

    try {
      if (creatingType === 'folder') {
        await documentService.createDirectory(vault.path, `${vault.path}/documents/${name.trim()}`);
      } else {
        const fileName = /\.[^/.]+$/.test(name.trim()) ? name.trim() : `${name.trim()}.md`;
        await documentService.createDocumentWithMetadata({
          vaultPath: vault.path,
          filePath: `${vault.path}/documents/${fileName}`,
          frontmatter: fileName.match(/\.(md|markdown)$/i)
            ? { title: name.trim().replace(/\.(md|markdown)$/i, ''), created_at: new Date().toISOString() }
            : undefined,
        });
        onDocSelect(`${vault.path}/documents/${fileName}`);
      }
      await refreshDocTree();
    } catch (err) {
      alert(`创建失败: ${err}`);
    }
  }, [creatingType, vault, docTree, refreshDocTree, onDocSelect]);

  if (!open) return null;

  return (
    <aside className={`w-56 border-r border-[#e6e6dc] dark:border-[#2f2f2f] bg-[#f4f4ee] dark:bg-[#1f1f1f] flex flex-col min-h-0`}>
      {/* Header */}
      <div className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider font-mono">MindDock</span>
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="p-1 hover:bg-stone-200 dark:hover:bg-stone-700 rounded transition-colors text-stone-500 dark:text-stone-400"
              title={isDark ? '亮色模式' : '暗色模式'}
            >
              {isDark ? <Sun size={12} /> : <Moon size={12} />}
            </button>
            <button onClick={onToggle} className="text-stone-400 dark:text-stone-500 p-1">
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>

        {/* Cmd+K Button */}
        <button
          onClick={onCmdPaletteOpen}
          className="w-full flex items-center justify-between text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-1">
            <Search size={11} />
            全局命令...
          </span>
          <span className="text-[9px] opacity-60">⌘K</span>
        </button>
      </div>

      {/* Quick Capture + Inbox + New Doc/Folder */}
      <div className="p-2 pt-0 space-y-1">
        <button
          onClick={onQuickCapture}
          className="w-full py-1.5 bg-emerald-600 text-stone-50 text-[11px] font-semibold rounded-md hover:bg-emerald-500 transition-colors flex items-center justify-center gap-1"
        >
          <Zap size={11} />
          极速捕获灵感
        </button>
        <button
          onClick={onOpenInbox}
          className="w-full py-1 text-[10px] text-[#5a5a56] dark:text-[#a0a0a0] hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-1"
        >
          <Inbox size={10} />
          查看捕获 Inbox
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setCreateMenu({ x: e.clientX, y: e.clientY }); }}
          className="w-full py-1 border border-dashed border-[#e6e6dc] dark:border-[#2f2f2f] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200 text-[10px] rounded transition-colors flex items-center justify-center gap-1"
        >
          <Plus size={10} />
          新建...
        </button>
        {createMenu && (
          <div
            className="fixed z-50 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg shadow-lg py-1 text-[11px] min-w-[140px]"
            style={{ left: createMenu.x, top: createMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => handleTopCreate('doc')}
            >
              <FileText size={11} /> 新建文档
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => handleTopCreate('folder')}
            >
              <FolderPlus size={11} /> 新建文件夹
            </button>
          </div>
        )}
        {creatingType && (
          <div className="flex items-center gap-1 px-0.5">
            {creatingType === 'folder' ? (
              <Folder size={11} className="text-amber-500 shrink-0" />
            ) : (
              <FileText size={11} className="text-stone-400 shrink-0" />
            )}
            <input
              ref={createInputRef}
              onKeyDown={(e) => {
                if (e.keyCode === 229) return;
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  handleCreateConfirm(e.currentTarget.value.trim());
                }
                if (e.key === 'Escape') setCreatingType(null);
              }}
              onBlur={() => setCreatingType(null)}
              placeholder={creatingType === 'folder' ? '文件夹名称...' : '文档名称...'}
              className="flex-1 text-xs px-1 py-0.5 border border-emerald-500 rounded bg-[#fcfcf9] dark:bg-[#171717] text-[#2c2c2a] dark:text-[#e3e3e3] outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
            />
          </div>
        )}
      </div>

      {/* Document Tree */}
      <DocTree activeDocId={activeDocId} docTree={docTree} onDocSelect={onDocSelect} onDocRenamed={onDocRenamed} onSummarize={onSummarize} onGeneratePackFromFolder={onGeneratePackFromFolder} onGenerate={onGenerate} onGenerateFromFolder={onGenerateFromFolder} onFindRelated={onFindRelated} onAddToPack={onAddToPack} />

      {/* Vault 统计信息 - 来自 VaultProvider */}
      <div className={`p-4 border-t border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] space-y-2`}>
        {/* 当前 Vault 路径 + 切换按钮 */}
        {vault && (
          <div className="flex items-center gap-1">
            <span className="truncate flex-1 font-mono" title={vault.path}>
              {vault.path}
            </span>
            <button
              onClick={switchVault}
              className="p-0.5 hover:bg-stone-200 dark:hover:bg-stone-700 rounded transition-colors shrink-0"
              title="切换 Vault"
            >
              <FolderSync size={11} />
            </button>
          </div>
        )}
        {vault && onGenerateFromVault && (
          <button
            onClick={onGenerateFromVault}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-[#e6e6dc] dark:border-[#2f2f2f] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-[10px] font-medium"
          >
            <Sparkles size={10} />
            根据整个主库生成...
          </button>
        )}
        <div className="flex justify-between font-mono">
          <span>文件: {vault?.document_count ?? 0} md</span>
          {/* PHASE_PLACEHOLDER - 节点数待 Phase 5 实现 */}
          <span>节点: --</span>
        </div>
        {/* PHASE_PLACEHOLDER - 健康分数待 Phase 6 实现 */}
        <p className="hover:underline cursor-pointer" onClick={onHealthView}>
          诊断指数：-- (--分)
        </p>
      </div>
    </aside>
  );
}
