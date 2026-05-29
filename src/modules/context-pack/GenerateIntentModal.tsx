import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, FileCode, FileText, ClipboardList, ListChecks, FileStack, Lightbulb } from 'lucide-react';

export type OutputType = 'dev_agent_prompt' | 'prd' | 'spec' | 'checklist' | 'summary' | 'custom';

export interface GenerateIntentSource {
  type: 'document' | 'folder' | 'vault' | 'selection';
  documentPath?: string;
  folderPath?: string;
  vaultPath?: string;
  selectedText?: string;
  selectionFrom?: number;
  selectionTo?: number;
  heading?: string;
  startLine?: number;
  endLine?: number;
}

interface GenerateIntentModalProps {
  source: GenerateIntentSource;
  onConfirm: (intent: string, outputType: OutputType) => void;
  onCancel: () => void;
  loading?: boolean;
}

const OUTPUT_TYPE_OPTIONS: { value: OutputType; label: string; shortLabel: string; icon: typeof FileCode; placeholder: string }[] = [
  { value: 'dev_agent_prompt', label: 'Dev Agent Prompt', shortLabel: 'Dev Agent', icon: FileCode, placeholder: '描述你需要的开发任务提示词...' },
  { value: 'prd', label: 'PRD', shortLabel: 'PRD', icon: FileText, placeholder: '描述产品需求文档的目标和范围...' },
  { value: 'spec', label: 'SPEC', shortLabel: 'SPEC', icon: ClipboardList, placeholder: '描述技术规格文档的详细要求...' },
  { value: 'checklist', label: 'Checklist', shortLabel: '检查清单', icon: ListChecks, placeholder: '描述检查清单的检查范围...' },
  { value: 'summary', label: 'Summary', shortLabel: '摘要', icon: FileStack, placeholder: '描述需要总结的内容要点...' },
  { value: 'custom', label: '自定义', shortLabel: '自定义', icon: Lightbulb, placeholder: '例如：生成开发提示词、总结文档要点...' },
];

export function GenerateIntentModal({ source, onConfirm, onCancel, loading }: GenerateIntentModalProps) {
  const [outputType, setOutputType] = useState<OutputType | null>(null);
  const [intent, setIntent] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sourceLabel = (() => {
    switch (source.type) {
      case 'document':
        return source.documentPath?.split('/').pop()?.replace('.md', '') ?? '文档';
      case 'folder':
        return source.folderPath?.split('/').pop() ?? '文件夹';
      case 'vault':
        return source.vaultPath?.split('/').pop() ?? '整个主库';
      case 'selection':
        return source.selectedText
          ? (source.selectedText.length > 30 ? source.selectedText.slice(0, 30) + '...' : source.selectedText)
          : '选区';
    }
  })();

  const handleTypeSelect = (type: OutputType) => {
    setOutputType(type);
    const option = OUTPUT_TYPE_OPTIONS.find(o => o.value === type);
    if (type !== 'custom' && option) {
      setIntent(option.label);
    } else {
      setIntent('');
    }
    inputRef.current?.focus();
  };

  const selectedOption = outputType ? OUTPUT_TYPE_OPTIONS.find(o => o.value === outputType) : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && intent.trim() && outputType && !loading) {
      onConfirm(intent.trim(), outputType);
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        className="bg-white dark:bg-[#1a1a1a] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl w-[480px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6dc] dark:border-[#2f2f2f]">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-[12px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">生成...</span>
          </div>
          <button onClick={onCancel} className="p-0.5 text-[#7e7e78] hover:text-stone-800 dark:hover:text-stone-200">
            <X size={14} />
          </button>
        </div>

        {/* Source info */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
            来源: <span className="text-[#2c2c2a] dark:text-[#e3e3e3]">{sourceLabel}</span>
            {source.type === 'selection' && source.heading && (
              <span> · {source.heading}</span>
            )}
            {source.type === 'selection' && source.startLine != null && source.endLine != null && (
              <span> · L{source.startLine}-{source.endLine}</span>
            )}
          </p>
        </div>

        {/* Output type selection */}
        <div className="px-4 py-2">
          <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-2">
            输出类型
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {OUTPUT_TYPE_OPTIONS.map(option => {
              const Icon = option.icon;
              const isSelected = outputType === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleTypeSelect(option.value)}
                  disabled={loading}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[10px] font-medium transition-colors ${
                    isSelected
                      ? 'border-emerald-500 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'border-[#e6e6dc] dark:border-[#2f2f2f] text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Icon size={11} className="shrink-0" />
                  <span className="truncate">{option.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Intent input */}
        <div className="px-4 py-2">
          <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-1">
            生成意图{outputType ? ` · ${selectedOption?.label ?? outputType}` : ''}
          </p>
          <input
            ref={inputRef}
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={outputType ? (selectedOption?.placeholder ?? '描述你的生成意图...') : '请先选择输出类型'}
            className="w-full text-[12px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-1.5 placeholder:text-[#7e7e78]"
            disabled={loading}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#e6e6dc] dark:border-[#2f2f2f]">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[11px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => outputType && onConfirm(intent.trim(), outputType)}
            disabled={!outputType || !intent.trim() || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-700 text-[11px] font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {loading ? '创建中...' : '创建并生成'}
          </button>
        </div>
      </div>
    </div>
  );
}
