import { useState, useRef, useEffect, useCallback } from 'react';
import { Folder, FileText, RefreshCw, Plus, Pencil, Trash2, Tags, Search, Sparkles, ChevronRight, FolderPlus } from 'lucide-react';
import { useVault } from '@/modules/vault/VaultProvider';
import { documentService } from '@/services/filesystem/documents';
import type { DocEntry } from '@/types/vault';

function displayFileName(entry: DocEntry) {
  return entry.title || entry.name.replace(/\.(md|markdown|txt|html?|json)$/i, '');
}

interface DocTreeProps {
  activeDocId: string;
  docTree: DocEntry[];
  onDocSelect: (docId: string) => void;
  onDocRenamed?: (oldPath: string, newPath: string) => void;
  onSummarize?: (docPath: string) => void;
  onGeneratePackFromFolder?: (folderPath: string) => void;
  onGenerate?: (docPath: string) => void;
  onGenerateFromFolder?: (folderPath: string) => void;
  onFindRelated?: (docPath: string) => void;
  onAddToPack?: (docPath: string) => void;
}

function DocEntryItem({
  entry,
  activeDocId,
  onDocSelect,
  depth = 0,
  onRename,
  onDelete,
  renamingEntry,
  onRenameConfirm,
  onRenameCancel,
  onSummarize,
  onGeneratePackFromFolder,
  onGenerate,
  onGenerateFromFolder,
  onFindRelated,
  onAddToPack,
  expandedFolders,
  onToggleFolder,
  creatingInFolder,
  onStartCreate,
  onConfirmCreate,
  onCancelCreate,
}: {
  entry: DocEntry;
  activeDocId: string;
  onDocSelect: (docId: string) => void;
  depth?: number;
  onRename: (entry: DocEntry) => void;
  onDelete: (entry: DocEntry) => void;
  renamingEntry: DocEntry | null;
  onRenameConfirm: (entry: DocEntry, newName: string) => void;
  onRenameCancel: () => void;
  onSummarize?: (docPath: string) => void;
  onGeneratePackFromFolder?: (folderPath: string) => void;
  onGenerate?: (docPath: string) => void;
  onGenerateFromFolder?: (folderPath: string) => void;
  onFindRelated?: (docPath: string) => void;
  onAddToPack?: (docPath: string) => void;
  expandedFolders: Set<string>;
  onToggleFolder: (folderPath: string) => void;
  creatingInFolder: { path: string; type: 'doc' | 'folder' } | null;
  onStartCreate: (folderPath: string, type: 'doc' | 'folder') => void;
  onConfirmCreate: (name: string, type: 'doc' | 'folder') => void;
  onCancelCreate: () => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [hoverPlus, setHoverPlus] = useState(false);
  const [plusMenu, setPlusMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  useEffect(() => {
    if (!plusMenu) return;
    const close = () => setPlusMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [plusMenu]);

  if (entry.is_dir) {
    const isExpanded = expandedFolders.has(entry.absolute_path);
    const isCreatingHere = creatingInFolder?.path === entry.absolute_path;

    return (
      <div className="space-y-0.5">
        <div
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setHoverPlus(true)}
          onMouseLeave={() => setHoverPlus(false)}
          className="flex items-center gap-1 px-2 py-0.5 text-[#7e7e78] dark:text-[#8e8e8e] text-[11px] font-semibold cursor-pointer hover:bg-stone-100/50 dark:hover:bg-stone-800/30 rounded group"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          onClick={() => onToggleFolder(entry.absolute_path)}
        >
          <ChevronRight size={10} className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          <Folder size={12} className="shrink-0" />
          <span className="flex-1 truncate">{entry.name}</span>
          {hoverPlus && (
            <button
              onClick={(e) => { e.stopPropagation(); setPlusMenu({ x: e.clientX, y: e.clientY }); }}
              className="shrink-0 p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              title="新建..."
            >
              <Plus size={10} />
            </button>
          )}
        </div>
        {contextMenu && (
          <div
            className="fixed z-50 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg shadow-lg py-1 text-[11px] min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => { onStartCreate(entry.absolute_path, 'doc'); setContextMenu(null); }}
            >
              <FileText size={11} /> 新建文档
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => { onStartCreate(entry.absolute_path, 'folder'); setContextMenu(null); }}
            >
              <FolderPlus size={11} /> 新建文件夹
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => { onGenerateFromFolder?.(entry.absolute_path); setContextMenu(null); }}
            >
              <Sparkles size={11} /> 根据文件夹生成...
            </button>
            <div className="border-t border-[#e6e6dc] dark:border-[#2f2f2f] my-1" />
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => { onRename(entry); setContextMenu(null); }}
            >
              <Pencil size={11} /> 重命名
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 flex items-center gap-2"
              onClick={() => { onDelete(entry); setContextMenu(null); }}
            >
              <Trash2 size={11} /> 删除
            </button>
          </div>
        )}
        {plusMenu && (
          <div
            className="fixed z-50 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg shadow-lg py-1 text-[11px] min-w-[120px]"
            style={{ left: plusMenu.x, top: plusMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => { onStartCreate(entry.absolute_path, 'doc'); setPlusMenu(null); }}
            >
              <FileText size={11} /> 新建文档
            </button>
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
              onClick={() => { onStartCreate(entry.absolute_path, 'folder'); setPlusMenu(null); }}
            >
              <FolderPlus size={11} /> 新建文件夹
            </button>
          </div>
        )}
        {isCreatingHere && (
          <CreateInFolderInput
            depth={depth + 1}
            type={creatingInFolder!.type}
            onConfirm={onConfirmCreate}
            onCancel={onCancelCreate}
          />
        )}
        {isExpanded && entry.children.map(child => {
          if (!child.is_dir && renamingEntry && renamingEntry.absolute_path === child.absolute_path) {
            return (
              <RenameInput
                key={child.path}
                initialName={child.name}
                depth={depth + 1}
                onConfirm={(newName) => onRenameConfirm(child, newName)}
                onCancel={onRenameCancel}
              />
            );
          }
          return (
            <DocEntryItem
              key={child.path}
              entry={child}
              activeDocId={activeDocId}
              onDocSelect={onDocSelect}
              depth={depth + 1}
              onRename={onRename}
              onDelete={onDelete}
              renamingEntry={renamingEntry}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
              onSummarize={onSummarize}
              onGeneratePackFromFolder={onGeneratePackFromFolder}
              onGenerate={onGenerate}
              onGenerateFromFolder={onGenerateFromFolder}
              onFindRelated={onFindRelated}
              onAddToPack={onAddToPack}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              creatingInFolder={creatingInFolder}
              onStartCreate={onStartCreate}
              onConfirmCreate={onConfirmCreate}
              onCancelCreate={onCancelCreate}
            />
          );
        })}
      </div>
    );
  }

  if (renamingEntry && renamingEntry.absolute_path === entry.absolute_path) {
    return (
      <RenameInput
        initialName={entry.name}
        depth={depth}
        onConfirm={(newName) => onRenameConfirm(entry, newName)}
        onCancel={onRenameCancel}
      />
    );
  }

  return (
    <>
      <div
        onClick={() => onDocSelect(entry.absolute_path)}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
          activeDocId === entry.absolute_path
            ? `bg-white dark:bg-[#212121] text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] font-medium`
            : `text-stone-500 dark:text-stone-400 hover:bg-[#f0ece2] dark:hover:bg-[#2a2a2a]`
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <FileText size={11} className="opacity-60" />
        <span className="truncate flex-1">{displayFileName(entry)}</span>
      </div>
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg shadow-lg py-1 text-[11px] min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
            onClick={() => { onSummarize?.(entry.absolute_path); setContextMenu(null); }}
          >
            <Tags size={11} /> 总结文档
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
            onClick={() => { onFindRelated?.(entry.absolute_path); setContextMenu(null); }}
          >
            <Search size={11} /> 查找相关内容
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
            onClick={() => { onAddToPack?.(entry.absolute_path); setContextMenu(null); }}
          >
            <Plus size={11} /> 加入上下文包
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
            onClick={() => { onGenerate?.(entry.absolute_path); setContextMenu(null); }}
          >
            <Sparkles size={11} /> 生成...
          </button>
          <div className="border-t border-[#e6e6dc] dark:border-[#2f2f2f] my-1" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800/50 flex items-center gap-2"
            onClick={() => { onRename(entry); setContextMenu(null); }}
          >
            <Pencil size={11} /> 重命名
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 flex items-center gap-2"
            onClick={() => { onDelete(entry); setContextMenu(null); }}
          >
            <Trash2 size={11} /> 删除
          </button>
        </div>
      )}
    </>
  );
}

function RenameInput({
  initialName,
  onConfirm,
  onCancel,
  depth,
}: {
  initialName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
  depth: number;
}) {
  const [value, setValue] = useState(initialName.replace(/\.(md|markdown|txt|html?|json)$/i, ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.keyCode === 229) return;
    if (e.key === 'Enter') {
      onConfirm(value);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={{ paddingLeft: `${8 + depth * 12}px` }} className="px-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onConfirm(value)}
        className="w-full text-xs px-1 py-0.5 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded bg-[#fcfcf9] dark:bg-[#171717] text-[#2c2c2a] dark:text-[#e3e3e3] outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}

function CreateInFolderInput({
  depth,
  type,
  onConfirm,
  onCancel,
}: {
  depth: number;
  type: 'doc' | 'folder';
  onConfirm: (name: string, type: 'doc' | 'folder') => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.keyCode === 229) return;
    if (e.key === 'Enter' && value.trim()) {
      onConfirm(value.trim(), type);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div style={{ paddingLeft: `${8 + depth * 12}px` }} className="px-2">
      <div className="flex items-center gap-1">
        {type === 'folder' ? <Folder size={11} className="text-amber-500 shrink-0" /> : <FileText size={11} className="text-stone-400 shrink-0" />}
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => value.trim() ? onConfirm(value.trim(), type) : onCancel()}
          placeholder={type === 'folder' ? '文件夹名称...' : '文档名称...'}
          className="flex-1 text-xs px-1 py-0.5 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded bg-[#fcfcf9] dark:bg-[#171717] text-[#2c2c2a] dark:text-[#e3e3e3] outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-stone-400 dark:placeholder:text-stone-500"
        />
      </div>
    </div>
  );
}

function findEntryByPath(entries: DocEntry[], targetPath: string): DocEntry | null {
  for (const entry of entries) {
    if (entry.absolute_path === targetPath) return entry;
    if (entry.is_dir && entry.children.length > 0) {
      const found = findEntryByPath(entry.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function hasDocumentFiles(entry: DocEntry): boolean {
  for (const child of entry.children) {
    if (!child.is_dir) return true;
    if (hasDocumentFiles(child)) return true;
  }
  return false;
}

export function DocTree({ activeDocId, docTree, onDocSelect, onDocRenamed, onSummarize, onGeneratePackFromFolder, onGenerate, onGenerateFromFolder, onFindRelated, onAddToPack }: DocTreeProps) {
  const { vault, refreshDocTree } = useVault();

  const [renamingEntry, setRenamingEntry] = useState<DocEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingInFolder, setCreatingInFolder] = useState<{ path: string; type: 'doc' | 'folder' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ entry: DocEntry; message: string } | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshDocTree();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleStartCreate = useCallback((folderPath: string, type: 'doc' | 'folder') => {
    setCreatingInFolder({ path: folderPath, type });
  }, []);

  const handleCancelCreate = useCallback(() => {
    setCreatingInFolder(null);
  }, []);

  const handleConfirmCreate = useCallback(async (name: string, type: 'doc' | 'folder') => {
    if (!vault || !creatingInFolder) return;
    const parentPath = creatingInFolder.path;

    // 同级重名校验
    const targetName = type === 'folder' ? name : (/\.[^/.]+$/.test(name) ? name : `${name}.md`);
    const parentEntry = findEntryByPath(docTree, parentPath);
    const siblings = parentEntry ? parentEntry.children : docTree;
    if (siblings.some(e => e.name === targetName)) {
      alert(`同级已存在同名${type === 'folder' ? '文件夹' : '文档'}: ${targetName}`);
      setCreatingInFolder(null);
      return;
    }

    // 子文件夹不能与父文件夹同名
    if (type === 'folder' && parentEntry && parentEntry.name === name) {
      alert('子文件夹不能与父文件夹同名');
      setCreatingInFolder(null);
      return;
    }

    setCreatingInFolder(null);

    try {
      if (type === 'folder') {
        const folderPath = `${parentPath}/${name}`;
        await documentService.createDirectory(vault.path, folderPath);
      } else {
        const fileName = /\.[^/.]+$/.test(name) ? name : `${name}.md`;
        const filePath = `${parentPath}/${fileName}`;
        await documentService.createDocumentWithMetadata({
          vaultPath: vault.path,
          filePath,
          frontmatter: {
            title: name.replace(/\.(md|markdown)$/i, ''),
            created_at: new Date().toISOString(),
          },
        });
        // 自动打开新建的文档
        onDocSelect(filePath);
      }
      await refreshDocTree();
    } catch (err) {
      alert(`创建失败: ${err}`);
    }
  }, [vault, creatingInFolder, docTree, refreshDocTree, onDocSelect]);

  const handleRename = async (entry: DocEntry, newName: string) => {
    if (!vault) return;
    if (!newName.trim()) {
      setRenamingEntry(null);
      return;
    }
    try {
      const newPath = await documentService.renameDocument(vault.path, entry.absolute_path, newName.trim());
      setRenamingEntry(null);
      await refreshDocTree();
      onDocRenamed?.(entry.absolute_path, newPath);
    } catch (err) {
      alert(`重命名失败: ${err}`);
      setRenamingEntry(null);
    }
  };

  const handleDelete = (entry: DocEntry) => {
    if (!vault) return;

    let message: string;
    if (entry.is_dir && hasDocumentFiles(entry)) {
      message = `文件夹「${entry.name}」下有文档文件，删除后不可恢复。\n确定删除？`;
    } else if (entry.is_dir) {
      message = `确定要删除空文件夹「${entry.name}」吗？`;
    } else {
      message = `确定要删除文档「${entry.name}」吗？此操作不可撤销。`;
    }

    setDeleteConfirm({ entry, message });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || !vault) return;
    const entry = deleteConfirm.entry;
    setDeleteConfirm(null);
    try {
      await documentService.deleteDocument(vault.path, entry.absolute_path);
      window.dispatchEvent(new CustomEvent('minddock:doc-deleted', { detail: { path: entry.absolute_path } }));
      await refreshDocTree();
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-[9px] uppercase font-mono font-bold tracking-wider opacity-50">
          物理主库
        </span>
        <button
          onClick={handleRefresh}
          className="p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
          title="刷新文档树"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {docTree.length === 0 ? (
        <div className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] px-2 py-4 text-center">
          暂无文档
        </div>
      ) : (
        docTree.map(entry => (
          <DocEntryItem
            key={entry.path}
            entry={entry}
            activeDocId={activeDocId}
            onDocSelect={onDocSelect}
            onRename={setRenamingEntry}
            onDelete={handleDelete}
            renamingEntry={renamingEntry}
            onRenameConfirm={handleRename}
            onRenameCancel={() => setRenamingEntry(null)}
            onSummarize={onSummarize}
            onGeneratePackFromFolder={onGeneratePackFromFolder}
            onGenerate={onGenerate}
            onGenerateFromFolder={onGenerateFromFolder}
            onFindRelated={onFindRelated}
            onAddToPack={onAddToPack}
            expandedFolders={expandedFolders}
            onToggleFolder={toggleFolder}
            creatingInFolder={creatingInFolder}
            onStartCreate={handleStartCreate}
            onConfirmCreate={handleConfirmCreate}
            onCancelCreate={handleCancelCreate}
          />
        ))
      )}

      {/* 文件夹内创建输入已由 DocEntryItem 内联渲染，不再在底部重复 */}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl p-6 max-w-sm w-[320px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[12px] text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-pre-line leading-relaxed">
              {deleteConfirm.message}
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[11px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium transition-colors"
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
