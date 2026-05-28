import { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';

export interface GenerateIntentSource {
  type: 'document' | 'folder' | 'selection';
  documentPath?: string;
  folderPath?: string;
  selectedText?: string;
  heading?: string;
  startLine?: number;
  endLine?: number;
}

interface GenerateIntentModalProps {
  source: GenerateIntentSource;
  onConfirm: (intent: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function GenerateIntentModal({ source, onConfirm, onCancel, loading }: GenerateIntentModalProps) {
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
      case 'selection':
        return source.selectedText
          ? (source.selectedText.length > 30 ? source.selectedText.slice(0, 30) + '...' : source.selectedText)
          : '选区';
    }
  })();

  const placeholder = (() => {
    switch (source.type) {
      case 'document': return '例如：生成开发提示词、总结文档要点...';
      case 'folder': return '例如：根据文件夹内容生成 PRD、生成项目概述...';
      case 'selection': return '例如：解释这段代码、生成实现方案...';
    }
  })();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && intent.trim() && !loading) {
      onConfirm(intent.trim());
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        className="bg-white dark:bg-[#1a1a1a] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl w-[420px] max-w-[90vw]"
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

        {/* Intent input */}
        <div className="px-4 py-2">
          <input
            ref={inputRef}
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
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
            onClick={() => onConfirm(intent.trim())}
            disabled={!intent.trim() || loading}
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
