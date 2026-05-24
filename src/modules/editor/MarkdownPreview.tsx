import Markdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '@/app/theme';

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const { isDark } = useTheme();

  // 解析 frontmatter，只显示正文部分
  const bodyContent = extractBody(content);

  const components: Components = {
    h1: ({ children }) => <h1 className={`text-lg font-bold font-sans text-[#2c2c2a] dark:text-[#e3e3e3] border-b border-[#e6e6dc] dark:border-[#2f2f2f] pb-1 mt-6 mb-3`}>{children}</h1>,
    h2: ({ children }) => <h2 className={`text-base font-bold font-sans ${isDark ? 'text-emerald-400' : 'text-emerald-800'} mt-5 mb-2`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`text-sm font-bold font-sans text-[#2c2c2a] dark:text-[#e3e3e3] mt-4 mb-2`}>{children}</h3>,
    p: ({ children }) => <p className="my-2 text-[13px] leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-xs font-sans my-2">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-xs font-sans my-2">{children}</ol>,
    li: ({ children }) => <li className="text-[13px]">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className={`border-l-2 ${isDark ? 'border-emerald-700 bg-emerald-950/20' : 'border-emerald-500 bg-emerald-50/50'} pl-4 py-1.5 my-3 text-xs italic text-slate-500 rounded-r`}>
        {children}
      </blockquote>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className;
      if (isInline) {
        return <code className={`font-mono text-xs px-1 rounded ${isDark ? 'bg-stone-800 text-emerald-400' : 'bg-stone-100 text-emerald-800'}`}>{children}</code>;
      }
      return <code className={`${className ?? ''} font-mono text-xs block p-4 rounded ${isDark ? 'bg-stone-900' : 'bg-stone-50'} overflow-x-auto`} {...props}>{children}</code>;
    },
    a: ({ href, children }) => (
      <a href={href} className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className={`text-xs border-collapse border border-[#e6e6dc] dark:border-[#2f2f2f]`}>{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className={`border border-[#e6e6dc] dark:border-[#2f2f2f] px-3 py-1.5 ${isDark ? 'bg-stone-800' : 'bg-stone-50'} font-semibold text-left`}>{children}</th>
    ),
    td: ({ children }) => (
      <td className={`border border-[#e6e6dc] dark:border-[#2f2f2f] px-3 py-1.5`}>{children}</td>
    ),
  };

  return (
    <div className={`flex-1 overflow-y-auto p-8 max-w-none ${isDark ? 'text-stone-300' : 'text-stone-800'}`}>
      <article className={`prose prose-sm prose-stone max-w-none ${isDark ? 'prose-invert' : ''}`}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={components}
        >
          {bodyContent}
        </Markdown>
      </article>
    </div>
  );
}

/** 从 Markdown 内容中提取正文（跳过 frontmatter） */
function extractBody(content: string): string {
  const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
  return content.replace(frontmatterRegex, '');
}
