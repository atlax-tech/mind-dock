import { Edit3, Layers, BookOpen } from 'lucide-react';

export type PreviewMode = 'edit' | 'split' | 'preview';

interface EditorToolbarProps {
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
}

export function EditorToolbar({ previewMode, onPreviewModeChange }: EditorToolbarProps) {

  const modes: { id: PreviewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'edit', label: '编辑', icon: <Edit3 size={11} /> },
    { id: 'split', label: '分栏', icon: <Layers size={11} /> },
    { id: 'preview', label: '预览', icon: <BookOpen size={11} /> },
  ];

  return (
    <div className={`h-11 border-b border-[#e6e6dc] dark:border-[#2f2f2f] px-4 flex items-center justify-between bg-transparent shrink-0`}>
      <div className="flex items-center gap-3">
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded bg-[#f4f4ee] dark:bg-[#1f1f1f] text-[#7e7e78] dark:text-[#8e8e8e] font-semibold uppercase`}>
          Markdown
        </span>
      </div>

      <div className={`flex items-center gap-0.5 bg-[#f4f4ee] dark:bg-[#1f1f1f] p-0.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f]`}>
        {modes.map(mode => (
          <button
            key={mode.id}
            onClick={() => onPreviewModeChange(mode.id)}
            className={`px-2.5 py-1 text-[11px] rounded font-medium flex items-center gap-1 transition-all ${
              previewMode === mode.id
                ? `bg-white dark:bg-[#212121] text-[#2c2c2a] dark:text-[#e3e3e3] shadow-sm border border-[#e6e6dc] dark:border-[#2f2f2f]`
                : `text-[#7e7e78] dark:text-[#8e8e8e] hover:text-slate-800 dark:hover:text-slate-200`
            }`}
          >
            {mode.icon}
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
