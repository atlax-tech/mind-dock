import { Pin, MessageSquare, Layers } from 'lucide-react';

export type WorkspaceView = 'editor' | 'mindview' | 'health' | 'diff';

interface WorkspaceHeaderProps {
  currentView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  onMentorDockToggle: () => void;
  onNotificationsOpen: () => void;
  onCreateStickyNote?: () => void;
}

export function WorkspaceHeader({ currentView, onViewChange, onMentorDockToggle, onNotificationsOpen, onCreateStickyNote }: WorkspaceHeaderProps) {

  const viewLabel = currentView === 'editor'
    ? '编辑器'
    : currentView === 'mindview'
      ? '知识图谱'
      : currentView === 'health'
        ? '库体检'
        : '版本对比';

  const tabs: { id: WorkspaceView; label: string }[] = [
    { id: 'editor', label: '编辑器' },
    // PHASE_PLACEHOLDER - Phase 5 会实现 MindView
    { id: 'mindview', label: 'MindView' },
    // PHASE_PLACEHOLDER - Phase 6 会实现知识体检
    { id: 'health', label: '体检' },
  ];

  return (
    <header className={`h-12 border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-4 flex items-center justify-between bg-transparent shrink-0`}>
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold uppercase opacity-60">
          {viewLabel}
        </span>

        <div className={`flex items-center bg-[#f4f4ee] dark:bg-[#1f1f1f] border border-[#e6e6dc] dark:border-[#2f2f2f] p-0.5 rounded-lg`}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onViewChange(tab.id)}
              className={`px-3 py-1 text-[11px] rounded font-medium transition-colors ${
                currentView === tab.id
                  ? `bg-white dark:bg-[#212121] text-[#2c2c2a] dark:text-[#e3e3e3] shadow-xs border border-[#e6e6dc] dark:border-[#2f2f2f]`
                  : `text-[#7e7e78] dark:text-[#8e8e8e] hover:text-slate-800 dark:hover:text-slate-200`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onCreateStickyNote}
          className={`px-2 py-1 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-[#f0ece2] dark:hover:bg-[#2a2a2a] flex items-center gap-1`}
        >
          <Pin size={11} className="text-amber-500" />
          便笺
        </button>

        <button
          onClick={onNotificationsOpen}
          className={`p-1 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md text-stone-400 hover:bg-[#f0ece2] dark:hover:bg-[#2a2a2a]`}
        >
          <MessageSquare size={12} />
        </button>

        <button
          onClick={onMentorDockToggle}
          className={`p-1 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md text-stone-400 hover:bg-[#f0ece2] dark:hover:bg-[#2a2a2a]`}
        >
          <Layers size={12} />
        </button>
      </div>
    </header>
  );
}
