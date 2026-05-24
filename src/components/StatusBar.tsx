interface StatusBarProps {
  charCount: number;
  filePath?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  onClearError?: () => void;
}

export function StatusBar({ charCount, filePath, isDirty, isSaving, saveError, onClearError }: StatusBarProps) {

  const saveStatus = isSaving
    ? '保存中...'
    : saveError
      ? null
      : isDirty
        ? '未保存'
        : filePath
          ? '已保存'
          : '';

  return (
    <div className={`h-11 border-t border-[#e6e6dc] dark:border-[#2f2f2f] px-4 flex items-center justify-between bg-transparent text-xs`}>
      <div className="flex items-center gap-1.5">
        {filePath && (
          <span className={`text-[10px] font-mono text-[#7e7e78] dark:text-[#8e8e8e]`}>
            {filePath}
          </span>
        )}
      </div>
      <div className={`text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] font-mono flex items-center gap-2`}>
        {saveError && (
          <span className="text-red-500 cursor-pointer" onClick={onClearError} title={saveError}>
            保存失败 - 点击关闭
          </span>
        )}
        {saveStatus && (
          <span className={isDirty ? 'text-amber-500' : isSaving ? 'text-blue-400' : 'text-emerald-600'}>
            {saveStatus}
          </span>
        )}
        <span>{charCount} 字符</span>
      </div>
    </div>
  );
}
