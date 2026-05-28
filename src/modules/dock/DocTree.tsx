import { useState, useRef, useEffect } from 'react';
import { Folder, FileText, RefreshCw, Plus, Pencil, Trash2, Tags, Search, Sparkles } from 'lucide-react';
import { useVault } from '@/modules/vault/VaultProvider';
import { documentService } from '@/services/filesystem/documents';
import type { DocEntry } from '@/types/vault';

interface DocTreeProps {
  activeDocId: string;
  docTree: DocEntry[];
  onDocSelect: (docId: string) => void;
  onDocDeleted?: (docPath: string) => void;
  onDocRenamed?: (oldPath: string, newPath: string) => void;
  onCreateDoc?: () => void;
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
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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

  if (entry.is_dir) {
    return (
      <div className="space-y-0.5">
        <div
          onContextMenu={handleContextMenu}
          className={`flex items-center gap-1 px-2 py-0.5 text-[#7e7e78] dark:text-[#8e8e8e] text-[11px] font-semibold`}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <Folder size={12} />
          <span>{entry.name}</span>
        </div>
        {contextMenu && (
          <div
            className={`fixed z-50 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg shadow-lg py-1 text-[11px] min-w-[140px]`}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
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
        {entry.children.map(child => {
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
            />
          );
        })}
      </div>
    );
  }

  // 文件节点：如果正在重命名，显示 RenameInput
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
        <span className="truncate flex-1">{entry.title || entry.name.replace(/\.md$/, '')}</span>
      </div>
      {contextMenu && (
        <div
          className={`fixed z-50 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg shadow-lg py-1 text-[11px] min-w-[140px]`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!entry.is_dir && (
            <>
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
            </>
          )}
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
  const [value, setValue] = useState(initialName.replace(/\.md$/, ''));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // keyCode 229 = IME composing，直接忽略
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
        className={`w-full text-xs px-1 py-0.5 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded bg-[#fcfcf9] dark:bg-[#171717] text-[#2c2c2a] dark:text-[#e3e3e3] outline-none focus:ring-1 focus:ring-emerald-500`}
      />
    </div>
  );
}

function NewDocInput({
  depth,
  onConfirm,
  onCancel,
}: {
  depth: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // keyCode 229 = IME composing，直接忽略
    if (e.keyCode === 229) return;
    if (e.key === 'Enter' && value.trim()) {
      onConfirm(value.trim());
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
        onBlur={() => value.trim() ? onConfirm(value.trim()) : onCancel()}
        placeholder="输入文档名称..."
        className={`w-full text-xs px-1 py-0.5 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded bg-[#fcfcf9] dark:bg-[#171717] text-[#2c2c2a] dark:text-[#e3e3e3] outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-stone-400 dark:placeholder:text-stone-500`}
      />
    </div>
  );
}

export function DocTree({ activeDocId, docTree, onDocSelect, onDocDeleted, onDocRenamed, onCreateDoc, onSummarize, onGeneratePackFromFolder, onGenerate, onGenerateFromFolder, onFindRelated, onAddToPack }: DocTreeProps) {
  const { vault, refreshDocTree } = useVault();

  const [renamingEntry, setRenamingEntry] = useState<DocEntry | null>(null);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshDocTree();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateDocument = async (name: string) => {
    if (!vault) return;
    try {
      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const filePath = `${vault.path}/documents/${fileName}`;
      await documentService.createDocumentWithMetadata({
        vaultPath: vault.path,
        filePath,
        frontmatter: {
          title: name.replace(/\.md$/, ''),
          created_at: new Date().toISOString(),
        },
      });
      setShowNewDoc(false);
      await refreshDocTree();
      // 自动打开新建的文档
      onDocSelect(filePath);
    } catch (err) {
      alert(`创建文档失败: ${err}`);
      setShowNewDoc(false);
    }
  };

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
      // 通知 AppShell 更新 tab 的 id 和 title
      onDocRenamed?.(entry.absolute_path, newPath);
    } catch (err) {
      alert(`重命名失败: ${err}`);
      setRenamingEntry(null);
    }
  };

  const handleDelete = async (entry: DocEntry) => {
    if (!vault) return;
    const confirmed = window.confirm(`确定要删除文档「${entry.name}」吗？此操作不可撤销。`);
    if (!confirmed) return;
    try {
      await documentService.deleteDocument(vault.path, entry.absolute_path);
      onDocDeleted?.(entry.absolute_path);
      await refreshDocTree();
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between px-2">
        <span className="text-[9px] uppercase font-mono font-bold tracking-wider opacity-50">
          物理主库
        </span>
        <button
          onClick={handleRefresh}
          className={`p-0.5 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors`}
          title="刷新文档树"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {docTree.length === 0 && !showNewDoc ? (
        <div className={`text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] px-2 py-4 text-center`}>
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
          />
        ))
      )}

      {/* New document input */}
      {showNewDoc && (
        <NewDocInput
          depth={0}
          onConfirm={handleCreateDocument}
          onCancel={() => setShowNewDoc(false)}
        />
      )}

      {/* New document button */}
      <div className="px-2">
        <button
          onClick={() => {
            if (onCreateDoc) {
              onCreateDoc();
            } else {
              setShowNewDoc(true);
            }
          }}
          className={`w-full py-1 border border-dashed border-[#e6e6dc] dark:border-[#2f2f2f] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200 text-[11px] rounded transition-colors flex items-center justify-center gap-1`}
        >
          <Plus size={11} />
          新建文档
        </button>
      </div>
    </div>
  );
}
