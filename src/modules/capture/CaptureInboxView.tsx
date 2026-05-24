import { Inbox } from 'lucide-react';
import { useCapture } from '@/modules/capture/CaptureProvider';

function formatTimestamp(ts: string): string {
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
}

function sourceBadgeLabel(source: string): string {
  switch (source) {
    case 'quick-capture': return '极速捕获';
    case 'clipboard': return '剪贴板';
    case 'ai-mentor': return 'AI Mentor';
    default: return source;
  }
}

export function CaptureInboxView() {
  const { captures, loading, error } = useCapture();

  // 按时间倒序排列（最新在前）
  const sorted = [...captures].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return tb - ta;
  });

  if (loading && captures.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-red-500 dark:text-red-400">
        加载失败: {error}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[#7e7e78] dark:text-[#8e8e8e]">
        <Inbox size={24} strokeWidth={1.5} />
        <p className="text-[11px]">暂无捕获内容</p>
        <p className="text-[10px] opacity-60">使用极速捕获记录灵感</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f]">
        <span className="text-[11px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">
          收件箱
        </span>
        <span className="ml-1.5 text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
          {sorted.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.map(entry => (
          <div
            key={entry.id}
            className="px-3 py-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
          >
            <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-relaxed line-clamp-3">
              {entry.content}
            </p>
            <div className="flex items-center gap-2 mt-1">
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
    </div>
  );
}
