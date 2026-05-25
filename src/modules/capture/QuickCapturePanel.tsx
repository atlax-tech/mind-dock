import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Zap, Sparkles, Loader2, AlertCircle, Send, Check, Pencil, RotateCcw } from 'lucide-react';
import { useCapture } from '@/modules/capture/CaptureProvider';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { useAISuggestions } from '@/modules/ai/AISuggestionsProvider';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import {
  buildClarifierMessages,
  buildSynthesizerMessages,
  parseStructuredCapture,
  type StructuredCapture,
} from '@/modules/ai/MentorSkills';

type CaptureMode = 'fast' | 'guided';
type GuidedStep = 'input' | 'interview' | 'synthesizing' | 'preview' | 'error';

// 状态机说明：
// input → interview (AI 追问第 1 轮)
// interview → interview (继续追问，直到达到 MAX_ROUNDS 或用户点"完成整理")
// interview → synthesizing (用户点"完成整理"或达到 MAX_ROUNDS)
// synthesizing → preview (AI 生成结构化 capture 成功)
// synthesizing → error (AI 生成失败)
// preview → 保存到 Inbox
// 任何步骤 AI 失败 → error (保留原始输入，可保存为极速捕获)

const MAX_ROUNDS = 3; // 默认 3 轮追问

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface QuickCapturePanelProps {
  open: boolean;
  onClose: () => void;
}

export function QuickCapturePanel({ open, onClose }: QuickCapturePanelProps) {
  const { addCapture, error } = useCapture();
  const { status, chat, aiPhase, cancelCurrentOperation } = useAIRuntime();
  const { createSuggestion } = useAISuggestions();

  const [mode, setMode] = useState<CaptureMode>('fast');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Guided capture state
  const [guidedStep, setGuidedStep] = useState<GuidedStep>('input');
  const [guidedInput, setGuidedInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [structuredCapture, setStructuredCapture] = useState<StructuredCapture | null>(null);
  const [interviewRound, setInterviewRound] = useState(0);
  const [preservedInput, setPreservedInput] = useState('');
  const guidedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 打开时自动聚焦
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (mode === 'fast') {
          textareaRef.current?.focus();
        } else {
          guidedTextareaRef.current?.focus();
        }
      }, 50);
    } else {
      setContent('');
      setLocalError(null);
      resetGuidedState();
    }
  }, [open, mode]);

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

  const resetGuidedState = useCallback(() => {
    setGuidedStep('input');
    setGuidedInput('');
    setChatHistory([]);
    setChatInput('');
    setAiLoading(false);
    setAiError(null);
    setStructuredCapture(null);
    setInterviewRound(0);
    setPreservedInput('');
  }, []);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    try {
      setSubmitting(true);
      setLocalError(null);
      await addCapture(trimmed, 'quick-capture');
      setContent('');
    } catch (err) {
      setLocalError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // === Guided Capture handlers ===

  const handleStartGuided = async () => {
    if (!guidedInput.trim()) return;

    // 保留原始输入
    setPreservedInput(guidedInput.trim());

    // 检查 AI 是否可用
    if (status !== 'connected') {
      setAiError('AI Runtime 未连接，无法使用引导模式。请先配置 AI Runtime。');
      setGuidedStep('error');
      return;
    }

    mentorEventBus.emit('guided_capture_requested', { input: guidedInput.trim() });

    setAiLoading(true);
    setAiError(null);
    try {
      const messages = buildClarifierMessages(guidedInput.trim(), [], 0, MAX_ROUNDS);
      const result = await chat(messages, 'guided_capture_question');
      setChatHistory([{ role: 'assistant', content: result.content }]);
      setInterviewRound(1);
      setGuidedStep('interview');
    } catch (err) {
      setAiError(String(err));
      setGuidedStep('error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleChatReply = async () => {
    if (!chatInput.trim() || aiLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    const newHistory: ChatTurn[] = [...chatHistory, { role: 'user', content: userMessage }];
    setChatHistory(newHistory);

    // 检查是否已达到最大轮次
    const nextRound = interviewRound + 1;
    if (nextRound >= MAX_ROUNDS) {
      // 达到最大轮次，自动进入综合阶段
      setInterviewRound(nextRound);
      await synthesizeCapture(guidedInput.trim(), newHistory);
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const messages = buildClarifierMessages(guidedInput.trim(), newHistory, nextRound, MAX_ROUNDS);
      const result = await chat(messages, 'guided_capture_question');
      setChatHistory(prev => [...prev, { role: 'assistant', content: result.content }]);
      setInterviewRound(nextRound);
    } catch (err) {
      setAiError(String(err));
      // 保留用户输入和对话历史
    } finally {
      setAiLoading(false);
    }
  };

  // 综合对话内容，生成结构化 capture
  const synthesizeCapture = async (originalInput: string, qaTrace: ChatTurn[]) => {
    setGuidedStep('synthesizing');
    setAiLoading(true);
    setAiError(null);
    try {
      const messages = buildSynthesizerMessages(originalInput, qaTrace);
      const result = await chat(messages, 'guided_capture_synthesis');

      // 解析结构化结果
      const parsed = parseStructuredCapture(result.content);

      // 验证：如果 AI 生成失败（title 为空），保留原始输入
      if (!parsed.title && !parsed.structured_body) {
        setAiError('AI 未能生成有效的结构化捕获。你可以保存原始输入为极速捕获。');
        setGuidedStep('error');
        return;
      }

      setStructuredCapture(parsed);
      setGuidedStep('preview');

      // 创建 AI Suggestion 记录
      await createSuggestion('guided_capture', result.content);
      mentorEventBus.emit('ai_suggestion_created', { type: 'guided_capture' });
    } catch (err) {
      setAiError(String(err));
      setGuidedStep('error');
    } finally {
      setAiLoading(false);
    }
  };

  // 用户提前结束追问，进入综合阶段
  const handleFinishInterview = () => {
    synthesizeCapture(preservedInput || guidedInput.trim(), chatHistory);
  };

  const handleSaveToInbox = async () => {
    if (!structuredCapture) return;
    try {
      setSubmitting(true);
      setLocalError(null);

      // 构建包含 original_input 和 qa_trace 的完整内容
      const qaTraceStr = chatHistory
        .map(t => `${t.role === 'user' ? '用户' : 'AI'}：${t.content}`)
        .join('\n');

      const captureContent = [
        `# ${structuredCapture.title}`,
        '',
        structuredCapture.summary ? `> ${structuredCapture.summary}` : '',
        '',
        structuredCapture.tags.length > 0 ? `**标签**: ${structuredCapture.tags.join(', ')}` : '',
        structuredCapture.next_action ? `**下一步**: ${structuredCapture.next_action}` : '',
        '',
        '---',
        '',
        structuredCapture.structured_body,
        '',
        '---',
        '',
        '<!-- metadata -->',
        `<!-- original_input: ${preservedInput.replace(/-->/g, '—>')} -->`,
        `<!-- qa_trace: ${qaTraceStr.replace(/-->/g, '—>')} -->`,
        `<!-- capture_mode: guided -->`,
      ].join('\n');

      await addCapture(captureContent, 'guided-capture');
      resetGuidedState();
      setMode('fast');
    } catch (err) {
      setLocalError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveAsFastCapture = async () => {
    // AI 不可用时，由用户确认后保存原始输入到 capture inbox
    const input = preservedInput || guidedInput.trim();
    if (!input) return;
    try {
      setSubmitting(true);
      setLocalError(null);
      await addCapture(input, 'quick-capture');
      resetGuidedState();
      setMode('fast');
    } catch (err) {
      setLocalError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryGuided = () => {
    setAiError(null);
    if (guidedStep === 'error' && chatHistory.length > 0) {
      // 对话中出错，回到 interview 步骤
      setGuidedStep('interview');
    } else if (guidedStep === 'error') {
      // 初始阶段出错，回到 input
      setGuidedStep('input');
    } else {
      // 其他情况，回到 input
      setGuidedStep('input');
    }
  };

  const displayError = localError || error;

  // 追问进度指示
  const roundIndicator = `${interviewRound}/${MAX_ROUNDS}`;

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
          /* === Guided Capture === */
          <div className="p-3">
            {/* Step: Input */}
            {guidedStep === 'input' && (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={guidedTextareaRef}
                  value={guidedInput}
                  onChange={e => setGuidedInput(e.target.value)}
                  placeholder="输入你的想法或灵感..."
                  rows={4}
                  className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-2 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] resize-none focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                    AI 将追问 {MAX_ROUNDS} 轮帮助理清思路
                  </span>
                  <button
                    onClick={handleStartGuided}
                    disabled={!guidedInput.trim() || aiLoading}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    开始引导
                  </button>
                </div>
              </div>
            )}

            {/* Step: Interview */}
            {guidedStep === 'interview' && (
              <div className="flex flex-col gap-2">
                {/* Round indicator */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[#7e7e78] dark:text-[#8e8e8e]">
                    追问 {roundIndicator}
                  </span>
                  <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                    {interviewRound >= MAX_ROUNDS ? '已达到最大轮次' : `还剩 ${MAX_ROUNDS - interviewRound} 轮`}
                  </span>
                </div>

                {/* Chat history */}
                <div className="max-h-[200px] overflow-y-auto flex flex-col gap-1.5 pr-1">
                  {chatHistory.map((turn, idx) => (
                    <div
                      key={idx}
                      className={`text-[11px] leading-relaxed px-2.5 py-1.5 rounded-md ${
                        turn.role === 'assistant'
                          ? 'bg-stone-50 dark:bg-stone-800 text-[#2c2c2a] dark:text-[#e3e3e3]'
                          : 'bg-emerald-50 dark:bg-emerald-900/20 text-[#2c2c2a] dark:text-[#e3e3e3]'
                      }`}
                    >
                      <span className="text-[9px] font-medium text-[#7e7e78] dark:text-[#8e8e8e] block mb-0.5">
                        {turn.role === 'assistant' ? 'AI 追问' : '你的回答'}
                      </span>
                      {turn.content}
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex items-center justify-between text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] px-2.5 py-1.5">
                      <span>
                        <Loader2 size={10} className="animate-spin inline mr-1" />
                        {aiPhase === 'connecting' ? '连接中...' :
                         aiPhase === 'loading_model' ? '加载模型...' :
                         aiPhase === 'thinking' ? '思考中...' :
                         aiPhase === 'generating' ? '生成中...' : '思考中...'}
                      </span>
                      <button
                        onClick={cancelCurrentOperation}
                        className="text-[10px] text-red-400 hover:text-red-500 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  )}
                </div>

                {/* AI error in interview */}
                {aiError && (
                  <div className="flex items-start gap-1.5 text-[11px] text-red-500 dark:text-red-400">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" />
                    <span>{aiError}</span>
                  </div>
                )}

                {/* Input + actions */}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={chatTextareaRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleChatReply();
                      }
                    }}
                    placeholder="输入你的回答..."
                    rows={2}
                    disabled={aiLoading}
                    className="flex-1 bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-1.5 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] resize-none focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors disabled:opacity-50"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={handleChatReply}
                      disabled={!chatInput.trim() || aiLoading}
                      className="flex items-center justify-center p-1.5 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="发送回答"
                    >
                      <Send size={11} />
                    </button>
                    <button
                      onClick={handleFinishInterview}
                      disabled={aiLoading}
                      className="flex items-center justify-center p-1.5 bg-emerald-600 dark:bg-emerald-500 text-white rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="完成整理，生成结构化捕获"
                    >
                      <Check size={11} />
                    </button>
                  </div>
                </div>

                {/* Finish hint */}
                {interviewRound >= 1 && !aiLoading && (
                  <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] text-center">
                    点击 <Check size={9} className="inline" /> 完成整理并保存到 Inbox
                  </p>
                )}
              </div>
            )}

            {/* Step: Synthesizing */}
            {guidedStep === 'synthesizing' && (
              <div className="flex flex-col items-center justify-center min-h-[120px] gap-2">
                <Loader2 size={16} className="animate-spin text-emerald-600 dark:text-emerald-400" />
                <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
                  {aiPhase === 'connecting' ? '连接 AI...' :
                   aiPhase === 'loading_model' ? '加载模型...' :
                   aiPhase === 'thinking' ? '分析对话内容...' :
                   aiPhase === 'generating' ? '生成结构化捕获...' : '正在整理你的想法...'}
                </p>
                <button
                  onClick={cancelCurrentOperation}
                  className="text-[10px] text-red-400 hover:text-red-500 transition-colors"
                >
                  取消
                </button>
              </div>
            )}

            {/* Step: Preview */}
            {guidedStep === 'preview' && structuredCapture && (
              <div className="flex flex-col gap-2">
                <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md p-3 max-h-[240px] overflow-y-auto">
                  <h4 className="text-[12px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] mb-1">
                    {structuredCapture.title || '（无标题）'}
                  </h4>
                  {structuredCapture.summary && (
                    <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] mb-1.5">
                      {structuredCapture.summary}
                    </p>
                  )}
                  {structuredCapture.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {structuredCapture.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-block px-1.5 py-0.5 text-[9px] bg-stone-100 dark:bg-stone-700 text-[#7e7e78] dark:text-[#8e8e8e] rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {structuredCapture.next_action && (
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-2">
                      下一步: {structuredCapture.next_action}
                    </p>
                  )}
                  <div className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] leading-relaxed whitespace-pre-wrap">
                    {structuredCapture.structured_body}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => { setGuidedStep('interview'); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    <Pencil size={11} />
                    继续追问
                  </button>
                  <button
                    onClick={handleSaveToInbox}
                    disabled={submitting}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    保存到 Inbox
                  </button>
                </div>
              </div>
            )}

            {/* Step: Error */}
            {guidedStep === 'error' && (
              <div className="flex flex-col gap-3 min-h-[120px] justify-center">
                <div className="flex items-start gap-1.5 text-[11px] text-red-500 dark:text-red-400">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{aiError || 'AI 调用失败，请稍后重试。'}</span>
                </div>
                {preservedInput && (
                  <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md p-2">
                    <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] mb-1">你的原始输入：</p>
                    <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">{preservedInput}</p>
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleSaveAsFastCapture}
                    disabled={!preservedInput || submitting}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Zap size={11} />
                    保存为极速捕获
                  </button>
                  <button
                    onClick={handleRetryGuided}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
                  >
                    <RotateCcw size={11} />
                    重试
                  </button>
                </div>
              </div>
            )}

            {displayError && (
              <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">
                保存失败: {displayError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
