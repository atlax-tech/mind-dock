import { X, FileText } from 'lucide-react';

export interface TabInfo {
  id: string;           // 文档绝对路径
  title: string;        // 文档标题（从 frontmatter 或文件名提取）
  isDirty: boolean;     // 是否有未保存修改
}

interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
}

export function TabBar({ tabs, activeTabId, onTabSelect, onTabClose }: TabBarProps) {

  if (tabs.length === 0) return null;

  return (
    <div className={`flex items-center border-b border-[#e6e6dc] dark:border-[#2f2f2f] bg-transparent overflow-x-auto shrink-0`}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          onClick={() => onTabSelect(tab.id)}
          className={`group flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer border-r border-[#e6e6dc] dark:border-[#2f2f2f] transition-colors min-w-0 max-w-[160px] ${
            activeTabId === tab.id
              ? `bg-white dark:bg-[#212121] text-[#2c2c2a] dark:text-[#e3e3e3] font-medium border-b-2 border-b-emerald-600`
              : `text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-100 dark:hover:bg-stone-800`
          }`}
        >
          <FileText size={10} className="shrink-0 opacity-60" />
          <span className="truncate flex-1">{tab.title}</span>
          {tab.isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
            className={`p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 shrink-0 opacity-0 group-hover:opacity-100 ${
              activeTabId === tab.id ? 'opacity-100' : ''
            }`}
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
