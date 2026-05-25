interface SplitDiffRow {
  left?: string;
  right?: string;
  type: 'context' | 'add' | 'delete' | 'meta';
}

function parsePatchToSplitRows(patch: string): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];

  for (const rawLine of patch.split('\n')) {
    if (!rawLine) continue;
    if (rawLine.startsWith('diff --git') || rawLine.startsWith('index ') || rawLine.startsWith('---') || rawLine.startsWith('+++')) {
      continue;
    }
    if (rawLine.startsWith('@@')) {
      rows.push({ left: rawLine, right: rawLine, type: 'meta' });
      continue;
    }
    if (rawLine.startsWith('-')) {
      rows.push({ left: rawLine.slice(1), type: 'delete' });
      continue;
    }
    if (rawLine.startsWith('+')) {
      rows.push({ right: rawLine.slice(1), type: 'add' });
      continue;
    }

    const line = rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine;
    rows.push({ left: line, right: line, type: 'context' });
  }

  return rows;
}

export function DiffViewer({ patch, className = '' }: { patch: string; className?: string }) {
  const rows = parsePatchToSplitRows(patch);

  if (rows.length === 0) {
    return (
      <div className={`flex items-center justify-center text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] ${className}`}>
        无可展示变更
      </div>
    );
  }

  return (
    <div className={`border border-[#e6e6dc] dark:border-[#2f2f2f] overflow-hidden bg-white dark:bg-[#171717] ${className}`}>
      <div className="grid grid-cols-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f] bg-stone-50 dark:bg-[#202020]">
        <div className="px-3 py-2 text-[10px] font-mono uppercase font-bold text-red-500 border-r border-[#e6e6dc] dark:border-[#2f2f2f]">
          旧版本
        </div>
        <div className="px-3 py-2 text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400">
          新版本
        </div>
      </div>
      <div className="h-full overflow-auto font-mono text-[11px] leading-relaxed">
        {rows.map((row, index) => {
          if (row.type === 'meta') {
            return (
              <div key={index} className="px-3 py-1 bg-stone-100 dark:bg-[#262626] text-stone-400 dark:text-stone-500 whitespace-pre">
                {row.left}
              </div>
            );
          }

          return (
            <div key={index} className="grid grid-cols-2 min-w-[720px]">
              <pre className={`px-3 py-1 whitespace-pre-wrap break-all border-r border-[#e6e6dc] dark:border-[#2f2f2f] ${
                row.type === 'delete'
                  ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                  : 'text-[#5a5a56] dark:text-[#a0a0a0]'
              }`}>
                {row.left ?? ''}
              </pre>
              <pre className={`px-3 py-1 whitespace-pre-wrap break-all ${
                row.type === 'add'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'text-[#5a5a56] dark:text-[#a0a0a0]'
              }`}>
                {row.right ?? ''}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
