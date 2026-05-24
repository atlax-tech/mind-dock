import { useEffect } from 'react';
import { Command } from 'cmdk';
import { Search, Zap, FileText, Network, HeartPulse, Plus, PanelRight, Bot, Bell, Inbox, LayoutGrid, FileSearch, StickyNote } from 'lucide-react';

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
  openTabs: Array<{ id: string; title: string }>;
  docEntries: Array<{ name: string; path: string; absolute_path: string; is_dir: boolean }>;
}

export function CommandPalette({ open, onClose, onOpenDoc, onCreateDoc, onSwitchTab, onQuickCapture, onTogglePlatter, onSwitchPlatterView, onCreateStickyNote, openTabs, docEntries }: CommandPaletteProps) {

  // 扁平化文档列表（只取 .md 文件，不取目录）
  const flatDocs = docEntries.filter(e => !e.is_dir);

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

  if (!open) return null;

  const groupHeadingClass = '[cmdk-group-heading]:text-[9px] [cmdk-group-heading]:uppercase [cmdk-group-heading]:font-mono [cmdk-group-heading]:font-bold [cmdk-group-heading]:tracking-wider [cmdk-group-heading]:opacity-50 [cmdk-group-heading]:px-2 [cmdk-group-heading]:py-1';

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[99999] flex items-start justify-center pt-[15vh] p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl max-w-md w-full shadow-lg overflow-hidden`}>
        <Command>
          <div className={`p-3.5 border-b border-[#e6e6dc] dark:border-[#2f2f2f] bg-transparent flex items-center gap-2`}>
            <Search size={15} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
            <Command.Input
              className="w-full bg-transparent border-none text-xs focus:outline-none focus:ring-0 text-[#2c2c2a] dark:text-[#e3e3e3]"
              placeholder="键入执行命令关键字..."
            />
          </div>
          <Command.List className="p-1 max-h-64 overflow-y-auto text-xs">
            <Command.Empty className="p-3 text-center text-[#7e7e78] dark:text-[#8e8e8e] text-[11px]">无匹配命令</Command.Empty>

            {/* 文档搜索 */}
            {flatDocs.length > 0 && (
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
            {openTabs.length > 0 && (
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
