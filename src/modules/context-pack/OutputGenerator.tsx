import { useState, useCallback } from 'react';
import { Copy, Pencil, X, Check, Sparkles } from 'lucide-react';

import type { ContextPack } from '@/services/index/context-pack';

interface OutputGeneratorProps {
  pack: ContextPack;
  onClose: () => void;
}

/** Deterministic prompt assembly - 不调用任何 AI 模型 */
function assemblePrompt(pack: ContextPack): string {
  const lines: string[] = [];
  const confirmedItems = pack.items.filter(i => !i.is_suggestion);

  lines.push('# Context');
  lines.push('');

  for (const item of confirmedItems) {
    const label = item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名';
    lines.push(`## ${label}`);
    lines.push(`来源: ${item.document_path}`);
    if (item.start_line != null && item.end_line != null) {
      lines.push(`位置: L${item.start_line}–L${item.end_line}`);
    }
    lines.push('');
    if (item.content) {
      lines.push(item.content);
    } else if (item.summary) {
      lines.push(item.summary);
    }
    lines.push('');
  }

  lines.push('# Task');
  lines.push('[在此输入任务指令]');
  lines.push('');

  return lines.join('\n');
}

export function OutputGenerator({ pack, onClose }: OutputGeneratorProps) {
  const [prompt, setPrompt] = useState(() => assemblePrompt(pack));
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [prompt]);

  const handleReset = useCallback(() => {
    setPrompt(assemblePrompt(pack));
    setEditing(false);
  }, [pack]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50">
      <div className="w-[640px] max-h-[80vh] bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
              提示词生成器
            </span>
            <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
              {pack.name} · {pack.items.filter(i => !i.is_suggestion).length} 条目
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button
              onClick={() => setEditing(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                editing
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                  : 'text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50'
              }`}
            >
              <Pencil size={10} />
              {editing ? '编辑中' : '编辑'}
            </button>
            {editing && (
              <button
                onClick={handleReset}
                className="px-2 py-1 rounded text-[10px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                重置
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] mb-2">
            以下提示词基于你确认的 {pack.items.filter(i => !i.is_suggestion).length} 条内容生成
          </p>
          {editing ? (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-full min-h-[400px] text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-3 resize-none outline-none focus:border-emerald-500 font-mono leading-relaxed"
              autoFocus
            />
          ) : (
            <pre className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-pre-wrap font-mono leading-relaxed">
              {prompt}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
          <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
            基于你确认的内容生成 · 不含隐藏信息
          </p>
        </div>
      </div>
    </div>
  );
}
