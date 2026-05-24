import { X, Sparkles } from 'lucide-react';

// PHASE_PLACEHOLDER - Phase 3 会实现 AI Mentor
// 此组件为纯静态占位，不包含任何真实 AI 功能或数据

interface MentorDockProps {
  open: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;
}

const DOCK_TABS = [
  { id: 'mentor', label: 'Mentor' },
  { id: 'outline', label: '大纲' },
  { id: 'context', label: 'Context' },
];

export function MentorDock({ open, activeTab, onTabChange, onClose }: MentorDockProps) {

  if (!open) return null;

  return (
    <aside className={`w-64 border-l border-[#e6e6dc] dark:border-[#2f2f2f] bg-[#f4f4ee] dark:bg-[#1f1f1f] flex flex-col min-h-0`}>
      {/* Header */}
      <div className={`h-12 border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-4 flex items-center justify-between shrink-0`}>
        <span className="text-[10px] font-mono uppercase font-bold tracking-wider">
          Mentor Dock
        </span>
        <button onClick={onClose} className="text-stone-400">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className={`border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-2 py-1 bg-transparent flex gap-0.5`}>
        {DOCK_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-1 text-[10px] font-semibold rounded ${
              activeTab === tab.id
                ? `bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] text-[#2c2c2a] dark:text-[#e3e3e3]`
                : `text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200`
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB: Mentor */}
        {activeTab === 'mentor' && (
          <div className="space-y-4">
            {/* PHASE_PLACEHOLDER - Phase 3 会实现 AI Mentor */}
            <div className={`bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl p-3.5 space-y-2`}>
              <p className="text-[10px] font-mono uppercase text-emerald-600 font-bold flex items-center gap-1">
                <Sparkles size={11} />
                AI Mentor
              </p>
              <p className={`text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] leading-normal`}>
                AI 智能助手将在 Phase 3 实现，提供知识关联建议、内容优化推荐等能力。
              </p>
            </div>
          </div>
        )}

        {/* TAB: Outline */}
        {activeTab === 'outline' && (
          <div className="space-y-2 text-xs">
            <p className={`text-[10px] font-mono text-[#7e7e78] dark:text-[#8e8e8e] mb-2`}>
              文档提纲结构树将在后续 Phase 实现。
            </p>
          </div>
        )}

        {/* TAB: Context */}
        {activeTab === 'context' && (
          <div className="text-center p-4 text-[10px] text-stone-400">
            上下文提取打包功能将在后续 Phase 实现。
          </div>
        )}
      </div>
    </aside>
  );
}
