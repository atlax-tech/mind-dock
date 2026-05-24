import { ChevronLeft, Search, Zap, Sun, Moon, FolderSync } from 'lucide-react';
import { useTheme } from '@/app/theme';
import { useVault } from '@/modules/vault/VaultProvider';
import { DocTree } from '@/modules/dock/DocTree';
import type { DocEntry } from '@/types/vault';

interface SidebarProps {
  open: boolean;
  activeDocId: string;
  docTree: DocEntry[];
  onDocSelect: (docId: string) => void;
  onToggle: () => void;
  onCmdPaletteOpen: () => void;
  onQuickCapture: () => void;
  onHealthView: () => void;
  onDocDeleted?: (docPath: string) => void;
  onDocRenamed?: (oldPath: string, newPath: string) => void;
}

export function Sidebar({ open, activeDocId, docTree, onDocSelect, onToggle, onCmdPaletteOpen, onQuickCapture, onHealthView, onDocDeleted, onDocRenamed }: SidebarProps) {
  const { isDark, toggle } = useTheme();
  const { vault, switchVault } = useVault();

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
          className={`w-full flex items-center justify-between text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] px-2.5 py-1.5 rounded-lg transition-colors`}
        >
          <span className="flex items-center gap-1">
            <Search size={11} />
            全局命令...
          </span>
          <span className="text-[9px] opacity-60">⌘K</span>
        </button>
      </div>

      {/* PHASE_PLACEHOLDER - Phase 2 会实现 Quick Capture */}
      <div className="p-2 pt-0">
        <button
          onClick={onQuickCapture}
          className="w-full py-1.5 bg-emerald-600 text-stone-50 text-[11px] font-semibold rounded-md hover:bg-emerald-500 transition-colors flex items-center justify-center gap-1"
        >
          <Zap size={11} />
          极速捕获灵感
        </button>
      </div>

      {/* Document Tree */}
      <DocTree activeDocId={activeDocId} docTree={docTree} onDocSelect={onDocSelect} onDocDeleted={onDocDeleted} onDocRenamed={onDocRenamed} />

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
