import { useState, useRef, useEffect } from 'react';
import { X, Zap, Sparkles, Loader2 } from 'lucide-react';
import { useCapture } from '@/modules/capture/CaptureProvider';

type CaptureMode = 'fast' | 'guided';

interface QuickCapturePanelProps {
  open: boolean;
  onClose: () => void;
}

export function QuickCapturePanel({ open, onClose }: QuickCapturePanelProps) {
  const { addCapture, error } = useCapture();
  const [mode, setMode] = useState<CaptureMode>('fast');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 打开时自动聚焦
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    } else {
      setContent('');
      setLocalError(null);
    }
  }, [open]);

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

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    try {
      setSubmitting(true);
      setLocalError(null);
      await addCapture(trimmed, 'quick-capture');
      setContent('');
      // 保持面板打开，方便连续捕获
    } catch (err) {
      setLocalError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter 提交
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const displayError = localError || error;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-[9999] flex items-start justify-center pt-[18vh]" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg w-full max-w-md shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden"
      >
        {/* Header: mode toggle + close */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode('fast')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors ${
                mode === 'fast'
                  ? 'bg-stone-100 dark:bg-stone-700 text-[#2c2c2a] dark:text-[#e3e3e3] font-medium'
                  : 'text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0]'
              }`}
            >
              <Zap size={11} />
              极速
            </button>
            <button
              onClick={() => setMode('guided')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors ${
                mode === 'guided'
                  ? 'bg-stone-100 dark:bg-stone-700 text-[#2c2c2a] dark:text-[#e3e3e3] font-medium'
                  : 'text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0]'
              }`}
            >
              <Sparkles size={11} />
              引导
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        {mode === 'fast' ? (
          <div className="p-3">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="记录灵感、想法、待整理的碎片..."
              rows={4}
              className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-2 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] resize-none focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                {content.trim() ? `${content.trim().length} 字` : ''}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                  {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!content.trim() || submitting}
                  className="flex items-center gap-1 px-3 py-1 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                  捕获
                </button>
              </div>
            </div>
            {displayError && (
              <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">
                保存失败: {displayError}
              </p>
            )}
          </div>
        ) : (
          <div className="p-4 flex flex-col items-center gap-3 min-h-[120px] justify-center">
            <div className="flex items-center gap-1.5 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-stone-600" />
              AI Runtime 未连接
            </div>
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] text-center leading-relaxed">
              引导模式需要 AI Mentor 支持
              <br />
              <span className="text-[10px] opacity-60">-- Phase 3 --</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
