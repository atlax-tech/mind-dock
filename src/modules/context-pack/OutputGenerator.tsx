import { useState, useCallback } from 'react';
import { Copy, Pencil, X, Check, Sparkles, Loader2, FileText, ListChecks, FileCode, ClipboardList } from 'lucide-react';

import type { ContextPack } from '@/services/index/context-pack';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';

type OutputType = 'prompt' | 'prd' | 'spec' | 'checklist';

const OUTPUT_TYPES: { id: OutputType; label: string; icon: typeof FileText; description: string }[] = [
  { id: 'prompt', label: 'Prompt', icon: Sparkles, description: 'AI 提示词' },
  { id: 'prd', label: 'PRD', icon: FileText, description: '产品需求文档' },
  { id: 'spec', label: 'SPEC', icon: FileCode, description: '技术规格说明' },
  { id: 'checklist', label: 'Checklist', icon: ClipboardList, description: '检查清单' },
];

/** Deterministic prompt assembly - 不调用任何 AI 模型 */
function assemblePrompt(pack: ContextPack, outputType: OutputType): string {
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

  const taskTemplates: Record<OutputType, string> = {
    prompt: '# Task\n基于以上上下文，生成一个详细的 AI 提示词，指导 AI 完成相关任务。',
    prd: '# Task\n基于以上上下文，生成一份产品需求文档（PRD），包含背景、目标、功能需求、非功能需求和验收标准。',
    spec: '# Task\n基于以上上下文，生成一份技术规格说明（SPEC），包含架构设计、接口定义、数据模型和实现细节。',
    checklist: '# Task\n基于以上上下文，生成一份检查清单（Checklist），包含需要验证的关键条目和验收点。',
  };

  lines.push(taskTemplates[outputType]);
  lines.push('');

  return lines.join('\n');
}

/** 构建 reasoning system prompt */
function buildSystemPrompt(outputType: OutputType): string {
  const basePrompt = '你是 MindDock 的 AI Mentor。用户提供了上下文材料，请你基于这些材料生成输出。';
  const typePrompts: Record<OutputType, string> = {
    prompt: '请生成一个详细的 AI 提示词。提示词应包含角色设定、任务描述、约束条件和输出格式要求。使用中文输出。',
    prd: '请生成一份产品需求文档（PRD），包含：1. 背景与目标 2. 用户故事 3. 功能需求 4. 非功能需求 5. 验收标准。使用中文输出，格式清晰。',
    spec: '请生成一份技术规格说明（SPEC），包含：1. 架构概述 2. 接口定义 3. 数据模型 4. 实现步骤 5. 测试要点。使用中文输出，格式清晰。',
    checklist: '请生成一份检查清单，按类别分组，每条包含：检查项、说明、验收标准。使用中文输出，格式清晰。',
  };
  return `${basePrompt}\n\n${typePrompts[outputType]}`;
}

interface OutputGeneratorProps {
  pack: ContextPack;
  onClose: () => void;
}

export function OutputGenerator({ pack, onClose }: OutputGeneratorProps) {
  const { status: aiStatus, chat } = useAIRuntime();
  const [outputType, setOutputType] = useState<OutputType>('prompt');
  const [prompt, setPrompt] = useState(() => assemblePrompt(pack, 'prompt'));
  const [reasoningDraft, setReasoningDraft] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const confirmedItems = pack.items.filter(i => !i.is_suggestion);

  const handleCopy = useCallback(async () => {
    const textToCopy = reasoningDraft || prompt;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [reasoningDraft, prompt]);

  const handleReset = useCallback(() => {
    setReasoningDraft(null);
    setPrompt(assemblePrompt(pack, outputType));
    setEditing(false);
  }, [pack, outputType]);

  const handleOutputTypeChange = useCallback((type: OutputType) => {
    setOutputType(type);
    setReasoningDraft(null);
    setPrompt(assemblePrompt(pack, type));
    setEditing(false);
  }, [pack]);

  const handleGenerate = useCallback(async () => {
    if (aiStatus !== 'connected') return;
    setGenerating(true);
    setReasoningDraft(null);
    try {
      // 构建上下文
      const contextLines: string[] = [];
      for (const item of confirmedItems) {
        const label = item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名';
        contextLines.push(`【${label}】`);
        if (item.content) {
          contextLines.push(item.content);
        } else if (item.summary) {
          contextLines.push(item.summary);
        }
        contextLines.push('');
      }
      const contextStr = contextLines.join('\n');

      const result = await chat([
        { role: 'system', content: buildSystemPrompt(outputType) },
        { role: 'user', content: `以下是上下文材料：\n\n${contextStr}\n\n请基于以上材料生成输出。` },
      ], `generate_${outputType}`);

      setReasoningDraft(result.content || '生成失败：无返回内容');
    } catch (err) {
      setReasoningDraft(`生成失败: ${err}`);
    } finally {
      setGenerating(false);
    }
  }, [aiStatus, chat, outputType, confirmedItems]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50">
      <div className="w-[640px] max-h-[80vh] bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-[11px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
              输出生成器
            </span>
            <span className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
              {pack.name} · {confirmedItems.length} 条来源
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

        {/* Output Type Selector */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
          {OUTPUT_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => handleOutputTypeChange(t.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                outputType === t.id
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                  : 'text-[#7e7e78] dark:text-[#8e8e8e] hover:bg-stone-50 dark:hover:bg-stone-800/50'
              }`}
              title={t.description}
            >
              <t.icon size={10} />
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleGenerate}
            disabled={generating || aiStatus !== 'connected'}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            {generating ? '生成中...' : 'AI 生成'}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {reasoningDraft ? (
            <>
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 mb-2">
                AI 生成内容 · 可编辑修改
              </p>
              {editing ? (
                <textarea
                  value={reasoningDraft}
                  onChange={(e) => setReasoningDraft(e.target.value)}
                  className="w-full h-full min-h-[400px] text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-3 resize-none outline-none focus:border-emerald-500 font-mono leading-relaxed"
                  autoFocus
                />
              ) : (
                <pre className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-pre-wrap font-mono leading-relaxed">
                  {reasoningDraft}
                </pre>
              )}
            </>
          ) : (
            <>
              <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] mb-2">
                以下为基于 {confirmedItems.length} 条来源的模板 · 点击"AI 生成"获取 reasoning 草稿
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
            </>
          )}
        </div>

        {/* Source Coverage Footer */}
        <div className="px-4 py-2 border-t border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0 space-y-1">
          <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e]">
            来源覆盖: {confirmedItems.length} 条确认内容
            {confirmedItems.filter(i => i.content).length > 0 && ` · ${confirmedItems.filter(i => i.content).length} 条含原文`}
            {confirmedItems.filter(i => i.summary && !i.content).length > 0 && ` · ${confirmedItems.filter(i => i.summary && !i.content).length} 条含摘要`}
          </p>
          <div className="flex flex-wrap gap-1">
            {confirmedItems.slice(0, 5).map((item, idx) => {
              const name = item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名';
              const hasContent = !!(item.content || item.summary);
              return (
                <span
                  key={idx}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] ${
                    hasContent
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-stone-100 dark:bg-stone-800/50 text-[#7e7e78] dark:text-[#8e8e8e]'
                  }`}
                  title={`${item.document_path}${item.start_line != null ? ` L${item.start_line}-${item.end_line}` : ''}`}
                >
                  {hasContent ? <Check size={7} /> : <ListChecks size={7} />}
                  {name.length > 15 ? name.slice(0, 15) + '...' : name}
                </span>
              );
            })}
            {confirmedItems.length > 5 && (
              <span className="text-[8px] text-[#7e7e78] dark:text-[#8e8e8e] px-1">
                +{confirmedItems.length - 5} 更多
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
