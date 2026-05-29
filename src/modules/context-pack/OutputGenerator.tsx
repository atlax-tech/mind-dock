import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Copy, Pencil, X, Check, Sparkles, Loader2, FileText, ListChecks, FileCode, ClipboardList, PenTool, Download, Save } from 'lucide-react';

import type { ContextPack } from '@/services/index/context-pack';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { useVault } from '@/modules/vault/VaultProvider';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import { GeneratingOverlay } from '@/components/GeneratingOverlay';
import { documentService } from '@/services/filesystem/documents';
import { personalizationService } from '@/services/index/personalization';
import { buildSourceDrivenOutputMessages } from '@/modules/ai/MentorSkills';

export type OutputGeneratorType = 'dev_agent_prompt' | 'prompt' | 'prd' | 'spec' | 'checklist' | 'custom';

const OUTPUT_TYPES: { id: OutputGeneratorType; label: string; icon: typeof FileText; description: string }[] = [
  { id: 'dev_agent_prompt', label: 'Dev Agent', icon: FileCode, description: '开发任务提示词' },
  { id: 'prompt', label: 'Prompt', icon: Sparkles, description: 'AI 提示词' },
  { id: 'prd', label: 'PRD', icon: FileText, description: '产品需求文档' },
  { id: 'spec', label: 'SPEC', icon: FileCode, description: '技术规格说明' },
  { id: 'checklist', label: 'Checklist', icon: ClipboardList, description: '检查清单' },
  { id: 'custom', label: '自定义', icon: PenTool, description: '自定义输出类型' },
];

function defaultIntentForType(outputType: OutputGeneratorType): string {
  const intents: Record<OutputGeneratorType, string> = {
    dev_agent_prompt: '生成 dev agent prompt',
    prompt: '生成可复用 AI 提示词',
    prd: '生成 PRD',
    spec: '生成 SPEC',
    checklist: '生成检查清单',
    custom: '',
  };
  return intents[outputType];
}

function slugifyFileName(input: string) {
  const slug = input
    .trim()
    .replace(/[\\/:*?"<>|#\[\]{}]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
  return slug || 'mentor-output';
}

/** Source map assembly - 不调用任何 AI 模型 */
function assemblePrompt(pack: ContextPack, outputType: OutputGeneratorType, outputIntent: string): string {
  const lines: string[] = [];
  const confirmedItems = pack.items.filter(i => !i.is_suggestion);

  lines.push('# 输出意图');
  lines.push('');
  lines.push(outputIntent || defaultIntentForType(outputType));
  lines.push('');
  lines.push('# Source Map');
  lines.push('');

  for (const [idx, item] of confirmedItems.entries()) {
    const sourceId = `S${idx + 1}`;
    const label = item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名';
    lines.push(`## [${sourceId}] ${label}`);
    lines.push(`来源: [${sourceId}] ${item.document_path}`);
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

  const taskTemplates: Record<OutputGeneratorType, string> = {
    dev_agent_prompt: '# 草稿要求\n基于以上来源生成一份可直接交给 dev agent 的开发任务 prompt。必须包含任务目标、范围、不做、涉及文件、实现约束、验收标准、验证命令和来源引用。',
    prompt: '# Task\n基于以上上下文，生成一个详细的 AI 提示词，指导 AI 完成相关任务。',
    prd: '# Task\n基于以上上下文，生成一份产品需求文档（PRD），包含背景、目标、功能需求、非功能需求和验收标准。',
    spec: '# Task\n基于以上上下文，生成一份技术规格说明（SPEC），包含架构设计、接口定义、数据模型和实现细节。',
    checklist: '# Task\n基于以上上下文，生成一份检查清单（Checklist），包含需要验证的关键条目和验收点。',
    custom: '# Task\n基于以上上下文，按用户指定的要求生成输出内容。',
  };

  lines.push(taskTemplates[outputType]);
  lines.push('');

  return lines.join('\n');
}

interface OutputGeneratorProps {
  pack: ContextPack;
  onClose: () => void;
  initialOutputType?: OutputGeneratorType;
  initialIntent?: string;
  autoGenerate?: boolean;
}

export function OutputGenerator({ pack, onClose, initialOutputType, initialIntent, autoGenerate }: OutputGeneratorProps) {
  const { vault } = useVault();
  const { status: aiStatus, chat, aiPhase } = useAIRuntime();
  const [outputType, setOutputType] = useState<OutputGeneratorType>(initialOutputType || 'prompt');
  const [outputIntent, setOutputIntent] = useState(initialIntent || defaultIntentForType(initialOutputType || 'prompt'));
  const [prompt, setPrompt] = useState(() => assemblePrompt(pack, initialOutputType || 'prompt', initialIntent || defaultIntentForType(initialOutputType || 'prompt')));
  const [reasoningDraft, setReasoningDraft] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [customType, setCustomType] = useState('');

  const confirmedItems = pack.items.filter(i => !i.is_suggestion);
  const textToExport = reasoningDraft || prompt;

  useEffect(() => {
    if (!vault || initialOutputType) return;
    personalizationService.getPreferredOutputType(vault.path)
      .then(preferred => {
        if (!preferred) return;
        const valid = OUTPUT_TYPES.some(type => type.id === preferred);
        if (!valid) return;
        const preferredType = preferred as OutputGeneratorType;
        setOutputType(preferredType);
        setOutputIntent(defaultIntentForType(preferredType));
        setPrompt(assemblePrompt(pack, preferredType, defaultIntentForType(preferredType)));
      })
      .catch(() => { /* 个性化默认项不可用不影响生成器 */ });
  }, [vault, pack, initialOutputType]);

  const sourceCoverage = confirmedItems.map((item, idx) => {
    const id = `S${idx + 1}`;
    return {
      id,
      name: item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名',
      hasContent: !!(item.content || item.summary),
      referenced: textToExport.includes(`[${id}]`),
      item,
    };
  });

  const buildSourceContext = useCallback(() => {
    const contextLines: string[] = [];
    contextLines.push('# Source Map');
    contextLines.push('');
    for (const [idx, item] of confirmedItems.entries()) {
      const sourceId = `S${idx + 1}`;
      const label = item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名';
      contextLines.push(`## [${sourceId}] ${label}`);
      contextLines.push(`来源: ${item.document_path}${item.start_line != null && item.end_line != null ? ` L${item.start_line}-${item.end_line}` : ''}`);
      if (item.selected_reason) contextLines.push(`加入原因: ${item.selected_reason}`);
      if (item.reasoning_note) contextLines.push(`备注: ${item.reasoning_note}`);
      if (item.content) {
        contextLines.push(item.content.slice(0, 4000));
      } else if (item.summary) {
        contextLines.push(item.summary);
      } else {
        contextLines.push('该来源缺少可用原文或摘要，生成时只能作为来源占位。');
      }
      contextLines.push('');
    }
    return contextLines.join('\n');
  }, [confirmedItems]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textToExport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToExport;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [textToExport]);

  const handleExportMarkdown = useCallback(async () => {
    setExportError(null);
    const filePath = await save({
      defaultPath: `${slugifyFileName(outputIntent || outputType)}.md`,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
    });
    if (!filePath) return;
    try {
      await invoke('export_text_file', { filePath, content: textToExport });
      setExportedPath(filePath);
      if (vault) {
        mentorEventBus.emit('context_pack_exported', {
          targetId: pack.id,
          targetType: 'context_pack',
          packId: pack.id,
          packName: pack.name,
          format: 'markdown',
          itemCount: confirmedItems.length,
        }, { vaultPath: vault.path, vaultId: vault.path });
      }
    } catch (err) {
      setExportError(`导出失败: ${err}`);
    }
  }, [outputIntent, outputType, textToExport, pack, confirmedItems.length, vault]);

  const handleSaveAsDocument = useCallback(async () => {
    if (!vault) return;
    const fileName = `${slugifyFileName(outputIntent || outputType)}-${Date.now().toString(36)}.md`;
    const filePath = `${vault.path}/outputs/${fileName}`;
    const title = outputIntent || OUTPUT_TYPES.find(t => t.id === outputType)?.label || 'Mentor Output';
    const content = [
      '---',
      `title: ${title.replace(/\n/g, ' ')}`,
      'source: minddock-output-generator',
      `output_type: ${outputType}`,
      `context_pack: ${pack.name}`,
      '---',
      '',
      textToExport,
    ].join('\n');
    await documentService.createDocumentWithMetadata({
      vaultPath: vault.path,
      filePath,
      content,
    });
    setSavedPath(filePath);
    mentorEventBus.emit('context_pack_exported', {
      targetId: pack.id,
      targetType: 'context_pack',
      packId: pack.id,
      packName: pack.name,
      format: 'document',
      itemCount: confirmedItems.length,
    }, { vaultPath: vault.path, vaultId: vault.path });
  }, [outputIntent, outputType, pack.name, pack.id, confirmedItems.length, textToExport, vault]);

  const handleReset = useCallback(() => {
    setReasoningDraft(null);
    setPrompt(assemblePrompt(pack, outputType, outputIntent));
    setEditing(false);
  }, [pack, outputIntent, outputType]);

  const handleOutputTypeChange = useCallback((type: OutputGeneratorType) => {
    setOutputType(type);
    const nextIntent = type === 'custom' ? '' : defaultIntentForType(type);
    setOutputIntent(nextIntent);
    setReasoningDraft(null);
    setPrompt(assemblePrompt(pack, type, nextIntent));
    setEditing(false);
    if (type !== 'custom') setCustomType('');
  }, [pack]);

  const handleGenerate = useCallback(async () => {
    if (aiStatus !== 'connected') return;
    const intent = outputIntent.trim() || customType.trim() || defaultIntentForType(outputType);
    if (outputType === 'custom' && !intent) return;
    setGenerating(true);
    setReasoningDraft(null);
    try {
      const result = await chat([
        ...buildSourceDrivenOutputMessages(
          outputType === 'custom' ? customType.trim() || 'custom' : outputType,
          intent,
          buildSourceContext(),
        ),
      ], `generate_${outputType}`);

      setReasoningDraft(result.content || '生成失败：无返回内容');
      if (vault) {
        personalizationService.recordSignal(vault.path, {
          action_type: 'output_type_used',
          document_path: null,
          chunk_id: null,
          search_query: null,
          output_type: outputType,
          knowledge_type: null,
        }).catch(() => { /* 信号记录失败不影响生成 */ });
      }
    } catch (err) {
      setReasoningDraft(`生成失败: ${err}`);
    } finally {
      setGenerating(false);
    }
  }, [aiStatus, buildSourceContext, chat, customType, outputIntent, outputType, vault]);

  // autoGenerate: 打开时自动触发 AI 生成（无需手动点击"AI 生成"按钮）
  const autoGeneratedRef = useRef(false);
  useEffect(() => {
    if (!autoGenerate || aiStatus !== 'connected' || confirmedItems.length === 0 || autoGeneratedRef.current) return;
    autoGeneratedRef.current = true;
    setGenerating(true);

    const type = initialOutputType || 'prompt';
    const doGenerate = async () => {
      try {
        const intent = initialIntent || outputIntent || defaultIntentForType(type);
        const result = await chat([
          ...buildSourceDrivenOutputMessages(type, intent, buildSourceContext()),
        ], `generate_${type}`);
        setReasoningDraft(result.content || '生成失败：无返回内容');
      } catch (err) {
        setReasoningDraft(`生成失败: ${err}`);
      } finally {
        setGenerating(false);
      }
    };
    doGenerate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50">
      <GeneratingOverlay
        open={generating}
        phase={aiPhase}
        title="AI Mentor 正在生成草稿"
        subtitle="长上下文生成可能需要数分钟，请保持窗口打开"
        steps={[
          '正在连接模型服务...',
          '正在加载模型与会话...',
          '正在阅读 Context Pack 来源...',
          '正在生成可编辑草稿...',
          '正在整理来源引用...',
          '即将完成...',
        ]}
      />
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
              onClick={handleExportMarkdown}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
            >
              <Download size={10} />
              导出
            </button>
            <button
              onClick={handleSaveAsDocument}
              disabled={!vault}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savedPath ? <Check size={10} /> : <Save size={10} />}
              {savedPath ? '已保存' : '保存为文档'}
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
          {outputType === 'custom' && (
            <input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="输入生成类型，如：发布说明、API文档..."
              className="flex-1 text-[10px] px-2 py-1 border border-emerald-500 rounded bg-[#fcfcf9] dark:bg-[#171717] text-[#2c2c2a] dark:text-[#e3e3e3] outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 mr-2"
            />
          )}
          <button
            onClick={handleGenerate}
            disabled={generating || aiStatus !== 'connected' || !outputIntent.trim()}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-emerald-600 dark:bg-emerald-700 text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={aiStatus !== 'connected' ? 'AI Reasoning 未连接，请先在 Settings 中配置连接' : 'AI 生成'}
          >
            {generating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
            {generating ? '生成中...' : 'AI 生成'}
          </button>
        </div>
        <div className="px-4 py-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
          <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-1">
            Output Intent
          </p>
          <input
            value={outputIntent}
            onChange={(event) => {
              const next = event.target.value;
              setOutputIntent(next);
              setReasoningDraft(null);
              setPrompt(assemblePrompt(pack, outputType, next));
            }}
            placeholder="例如：生成 dev agent prompt，覆盖任务目标、范围、约束和验收"
            className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-1 placeholder:text-[#7e7e78]"
          />
        </div>
        {savedPath && (
          <div className="px-4 py-1.5 border-b border-[#e6e6dc] dark:border-[#2f2f2f] text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/10">
            已保存到 {savedPath}
          </div>
        )}
        {exportedPath && (
          <div className="px-4 py-1.5 border-b border-[#e6e6dc] dark:border-[#2f2f2f] text-[9px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/10">
            已导出到 {exportedPath}
          </div>
        )}
        {exportError && (
          <div className="px-4 py-1.5 border-b border-[#e6e6dc] dark:border-[#2f2f2f] text-[9px] text-red-500 dark:text-red-400 bg-red-50/60 dark:bg-red-900/10">
            {exportError}
          </div>
        )}
        {aiStatus !== 'connected' && (
          <div className="px-4 py-1.5 border-b border-[#e6e6dc] dark:border-[#2f2f2f] text-[9px] text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-900/10">
            AI Reasoning 未连接。当前模板仍可编辑和复制，连接后可生成 reasoning 草稿。
          </div>
        )}

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
            {reasoningDraft && ` · 已引用 ${sourceCoverage.filter(s => s.referenced).length}/${sourceCoverage.length}`}
          </p>
          <div className="flex flex-wrap gap-1">
            {sourceCoverage.slice(0, 5).map(({ item, id, name, hasContent, referenced }) => {
              return (
                <span
                  key={id}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] ${
                    hasContent && (!reasoningDraft || referenced)
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                  }`}
                  title={`${item.document_path}${item.start_line != null ? ` L${item.start_line}-${item.end_line}` : ''}`}
                >
                  {hasContent && (!reasoningDraft || referenced) ? <Check size={7} /> : <ListChecks size={7} />}
                  [{id}] {name.length > 15 ? name.slice(0, 15) + '...' : name}
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
