import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Bot, Bell, LayoutGrid, FileText, Inbox, CheckCheck, Trash2, Circle, ChevronDown, GripVertical, Pencil, Trash } from 'lucide-react';

import { useNotifications } from '@/modules/notifications/NotificationProvider';
import { useCapture } from '@/modules/capture/CaptureProvider';
import { useVault } from '@/modules/vault/VaultProvider';
import { documentService, type DocumentMetadata } from '@/services/filesystem/documents';

// PHASE_PLACEHOLDER - Phase 3 会实现 AI Mentor

export type PlatterTab = 'mentor' | 'notifications' | 'inbox' | 'widgets' | 'document-context';

interface PlatterProps {
  open: boolean;
  activeTab: PlatterTab;
  onTabChange: (tab: PlatterTab) => void;
  onClose: () => void;
  activeDocumentPath?: string;
  activeDocumentName?: string;
}

const PLATTER_TABS: { id: PlatterTab; label: string; icon: typeof Bot }[] = [
  { id: 'mentor', label: 'Mentor', icon: Bot },
  { id: 'notifications', label: '通知', icon: Bell },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'widgets', label: 'Widgets', icon: LayoutGrid },
  { id: 'document-context', label: 'Context', icon: FileText },
];

/* ---------- Mentor View ---------- */
function MentorView() {
  return (
    <div className="space-y-4">
      <div className={`bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl p-3.5 space-y-3`}>
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-stone-400" />
          <p className="text-[10px] font-mono uppercase text-emerald-600 font-bold">
            AI Mentor 未接入
          </p>
        </div>
        <p className={`text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] leading-normal`}>
          AI Mentor 功能将在 Phase 3 实现
        </p>
      </div>
    </div>
  );
}

/* ---------- Notifications View ---------- */
function NotificationsView() {
  const { notifications, loading, error, markAsRead, markAllAsRead, clearNotification, clearAll } = useNotifications();

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Action bar */}
      {notifications.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
            {unreadCount > 0 ? `${unreadCount} 条未读` : '全部已读'}
          </span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200"
                title="全部标记已读"
              >
                <CheckCheck size={12} />
              </button>
            )}
            <button
              onClick={clearAll}
              className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200"
              title="清空全部"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="text-center py-8">
          <Bell size={20} className="mx-auto text-stone-300 dark:text-stone-600 mb-2" />
          <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">暂无通知</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => { if (!n.read) markAsRead(n.id); }}
              className={`group relative bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2.5 cursor-pointer hover:border-stone-300 dark:hover:border-stone-600 transition-colors ${
                !n.read ? 'border-l-2 border-l-emerald-500' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {!n.read && (
                      <Circle size={6} className="text-emerald-500 fill-emerald-500 shrink-0" />
                    )}
                    <p className={`text-[11px] truncate ${!n.read ? 'font-semibold text-[#2c2c2a] dark:text-[#e3e3e3]' : 'text-[#7e7e78] dark:text-[#8e8e8e]'}`}>
                      {n.title}
                    </p>
                  </div>
                  <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] mt-0.5 line-clamp-2 leading-normal">
                    {n.content}
                  </p>
                  <p className="text-[9px] text-stone-400 dark:text-stone-500 mt-1">
                    {new Date(n.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); clearNotification(n.id); }}
                  className="p-0.5 text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  title="删除"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Inbox View (Capture Inbox) ---------- */
function InboxView() {
  const { captures, loading, error, deleteCapture, updateCapture } = useCapture();

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entryId: string } | null>(null);
  // 内联编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const sorted = [...captures].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return tb - ta;
  });

  const sourceBadgeLabel = (source: string): string => {
    switch (source) {
      case 'quick-capture': return '极速捕获';
      case 'sticky-note': return '便笺';
      case 'clipboard': return '剪贴板';
      case 'ai-mentor': return 'AI Mentor';
      default: return source;
    }
  };

  const formatTimestamp = (ts: string): string => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      if (isToday) {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  // 右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, entryId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, entryId });
  }, []);

  // 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  // 开始编辑
  const startEdit = useCallback((entryId: string) => {
    const entry = captures.find(c => c.id === entryId);
    if (entry) {
      setEditingId(entryId);
      setEditContent(entry.content);
    }
    setContextMenu(null);
  }, [captures]);

  // 保存编辑
  const saveEdit = useCallback(async () => {
    if (editingId && editContent.trim()) {
      await updateCapture(editingId, editContent.trim());
    }
    setEditingId(null);
    setEditContent('');
  }, [editingId, editContent, updateCapture]);

  // 删除
  const handleDelete = useCallback(async (entryId: string) => {
    await deleteCapture(entryId);
    setContextMenu(null);
  }, [deleteCapture]);

  if (loading && captures.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.length > 0 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
            {sorted.length} 条捕获
          </span>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-8">
          <Inbox size={20} className="mx-auto text-stone-300 dark:text-stone-600 mb-2" />
          <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">暂无捕获内容</p>
          <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] opacity-60 mt-1">使用极速捕获记录灵感</p>
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map(entry => (
            <div
              key={entry.id}
              onContextMenu={(e) => handleContextMenu(e, entry.id)}
              className="bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2.5 hover:border-stone-300 dark:hover:border-stone-600 transition-colors"
            >
              {editingId === entry.id ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } }}
                  className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-relaxed bg-transparent resize-none outline-none border-b border-stone-200 dark:border-stone-700 pb-1"
                  autoFocus
                  rows={3}
                />
              ) : (
                <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-relaxed line-clamp-3">
                  {entry.content}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="text-[9px] px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-[#5a5a56] dark:text-[#a0a0a0]">
                  {sourceBadgeLabel(entry.source)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-[#2a2a2a] border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 z-50 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => startEdit(contextMenu.entryId)}
            className="w-full px-3 py-1.5 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center gap-2 text-left"
          >
            <Pencil size={10} />
            编辑
          </button>
          <button
            onClick={() => handleDelete(contextMenu.entryId)}
            className="w-full px-3 py-1.5 text-[11px] text-red-500 hover:bg-stone-100 dark:hover:bg-stone-700 flex items-center gap-2 text-left"
          >
            <Trash size={10} />
            删除
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Widgets View ---------- */
function WidgetsView() {
  return (
    <div className="space-y-4">
      <div className={`bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl p-3.5 space-y-2`}>
        <div className="flex items-center gap-2">
          <LayoutGrid size={16} className="text-stone-400" />
          <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
            Widgets
          </p>
        </div>
        <p className={`text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] leading-normal`}>
          小组件功能将在后续 Phase 扩展
        </p>
      </div>
    </div>
  );
}

/* ---------- Document Context View ---------- */
function DocumentContextView({ documentPath, documentName }: { documentPath?: string; documentName?: string }) {
  const { vault } = useVault();
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (!vault || !documentPath) {
      setMetadata(null);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    documentService.getDocumentMetadata(vault.path, documentPath).then(meta => {
      if (!cancelled) {
        setMetadata(meta);
        setMetaLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [vault, documentPath]);

  if (!documentPath) {
    return (
      <div className="text-center py-8">
        <FileText size={20} className="mx-auto text-stone-300 dark:text-stone-600 mb-2" />
        <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">No document selected</p>
      </div>
    );
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTime = (isoStr: string): string => {
    try {
      return new Date(isoStr).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return 'unavailable';
    }
  };

  return (
    <div className="space-y-3">
      <div className={`bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl p-3.5 space-y-2.5`}>
        <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
          文档信息
        </p>

        <div className="space-y-2">
          <div>
            <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">文件名</p>
            <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">{documentName || 'unavailable'}</p>
          </div>

          <div>
            <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">路径</p>
            <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] break-all">{documentPath}</p>
          </div>

          <div>
            <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">大小</p>
            <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
              {metaLoading ? '...' : (metadata ? formatSize(metadata.size) : 'unavailable')}
            </p>
          </div>

          <div>
            <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">修改时间</p>
            <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
              {metaLoading ? '...' : (metadata ? formatTime(metadata.modified_at) : 'unavailable')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Platter Main Component ---------- */
export function MentorDock({ open, activeTab, onTabChange, onClose, activeDocumentPath, activeDocumentName }: PlatterProps) {
  const [tabOrder, setTabOrder] = useState<PlatterTab[]>(PLATTER_TABS.map(t => t.id));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null); // 插入位置：在 dropIdx 之前插入
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const VISIBLE_COUNT = 3;
  const visibleTabs = tabOrder.slice(0, VISIBLE_COUNT);
  const overflowTabs = tabOrder.slice(VISIBLE_COUNT);

  const getTabDef = (id: PlatterTab) => PLATTER_TABS.find(t => t.id === id)!;

  // 拖动排序：用 mousedown/mousemove/mouseup 实现
  const handleDragStart = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    setDragIdx(idx);
    setDropIdx(idx);
    const parent = (e.target as HTMLElement).closest('[data-tab-idx]');
    dragNodeRef.current = parent as HTMLDivElement;
  }, []);

  useEffect(() => {
    if (dragIdx === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragNodeRef.current) return;
      const elements = document.querySelectorAll('[data-tab-idx]');
      // 计算插入位置：根据鼠标 Y 坐标判断在哪个元素的上半部还是下半部
      let newDropIdx: number = tabOrder.length; // 默认插入末尾
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const idx = parseInt(el.getAttribute('data-tab-idx')!, 10);
        if (e.clientY < midY && idx < newDropIdx) {
          newDropIdx = idx;
        }
      });
      // 如果拖动位置在所有元素下方，插入末尾
      if (newDropIdx === tabOrder.length) {
        let allBelow = true;
        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (e.clientY < rect.bottom) allBelow = false;
        });
        if (!allBelow) newDropIdx = tabOrder.length - 1;
      }
      setDropIdx(newDropIdx);
    };

    const handleMouseUp = () => {
      if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
        setTabOrder(prev => {
          const items = [...prev];
          const [moved] = items.splice(dragIdx, 1);
          // 调整插入位置：如果拖动元素在目标之前，目标索引需要减1
          const adjustedIdx = dragIdx < dropIdx ? dropIdx - 1 : dropIdx;
          items.splice(adjustedIdx, 0, moved);
          return items;
        });
      }
      setDragIdx(null);
      setDropIdx(null);
      dragNodeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragIdx, dropIdx, tabOrder.length]);

  if (!open) return null;

  return (
    <aside className={`w-64 border-l border-[#e6e6dc] dark:border-[#2f2f2f] bg-[#f4f4ee] dark:bg-[#1f1f1f] flex flex-col min-h-0`}>
      {/* Header */}
      <div className={`h-12 border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-4 flex items-center justify-between shrink-0`}>
        <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
          Platter
        </span>
        <button onClick={onClose} className="text-stone-400">
          <X size={14} />
        </button>
      </div>

      {/* Tabs - 前3个 + 下拉抽屉按钮 */}
      <div className={`border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-2 py-1 bg-transparent flex gap-0.5 items-center`}>
        {visibleTabs.map(tabId => {
          const tab = getTabDef(tabId);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 py-1 text-[10px] font-semibold rounded flex items-center justify-center gap-0.5 ${
                activeTab === tab.id
                  ? `bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] text-[#2c2c2a] dark:text-[#e3e3e3]`
                  : `text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200`
              }`}
            >
              <Icon size={10} />
              {tab.label}
            </button>
          );
        })}
        {overflowTabs.length > 0 && (
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`px-1.5 py-1 text-[10px] rounded flex items-center justify-center ${
              drawerOpen || overflowTabs.includes(activeTab)
                ? `bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] text-[#2c2c2a] dark:text-[#e3e3e3]`
                : `text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200`
            }`}
          >
            <ChevronDown size={12} className={`transition-transform ${drawerOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* 下拉抽屉 - 显示所有标签，支持拖动排序 */}
      {drawerOpen && (
        <div className={`border-b border-[#e6e6dc] dark:border-[#2f2f2f] bg-white dark:bg-[#1a1a1a] px-2 py-1.5`}>
          {tabOrder.map((tabId, idx) => {
            const tab = getTabDef(tabId);
            const Icon = tab.icon;
            const isOverflow = overflowTabs.includes(tabId);
            const showInsertLine = dragIdx !== null && dropIdx === idx && dragIdx !== idx;
            return (
              <div key={tab.id}>
                {/* 插入预览线 */}
                {showInsertLine && (
                  <div className="h-[2px] bg-emerald-500 rounded-full mx-1 mb-0.5 transition-all" />
                )}
                <div
                  data-tab-idx={idx}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] transition-opacity ${
                    dragIdx === idx ? 'opacity-40' : ''
                  }`}
                >
                  <div
                    onMouseDown={(e) => handleDragStart(idx, e)}
                    className="cursor-grab active:cursor-grabbing text-stone-300 dark:text-stone-600 hover:text-stone-500 shrink-0"
                  >
                    <GripVertical size={10} />
                  </div>
                  <button
                    onClick={() => { onTabChange(tab.id); setDrawerOpen(false); }}
                    className={`flex-1 flex items-center gap-1.5 text-left ${
                      activeTab === tab.id
                        ? 'font-semibold text-[#2c2c2a] dark:text-[#e3e3e3]'
                        : 'text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200'
                    }`}
                  >
                    <Icon size={10} />
                    <span className="flex-1">{tab.label}</span>
                    {!isOverflow && <span className="text-[8px] text-stone-400 dark:text-stone-600">固定</span>}
                  </button>
                </div>
              </div>
            );
          })}
          {/* 末尾插入预览线 */}
          {dragIdx !== null && dropIdx === tabOrder.length && (
            <div className="h-[2px] bg-emerald-500 rounded-full mx-1 mt-0.5 transition-all" />
          )}
        </div>
      )}

      {/* Content - use hidden class to preserve state across tab switches */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className={activeTab === 'mentor' ? '' : 'hidden'}>
          <MentorView />
        </div>
        <div className={activeTab === 'notifications' ? '' : 'hidden'}>
          <NotificationsView />
        </div>
        <div className={activeTab === 'inbox' ? '' : 'hidden'}>
          <InboxView />
        </div>
        <div className={activeTab === 'widgets' ? '' : 'hidden'}>
          <WidgetsView />
        </div>
        <div className={activeTab === 'document-context' ? '' : 'hidden'}>
          <DocumentContextView documentPath={activeDocumentPath} documentName={activeDocumentName} />
        </div>
      </div>
    </aside>
  );
}
