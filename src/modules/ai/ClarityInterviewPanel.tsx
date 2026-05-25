import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, Pencil, Check, XCircle } from 'lucide-react';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { useAISuggestions } from '@/modules/ai/AISuggestionsProvider';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import {
  buildClarityInterviewMessages,
  parseClarityInterviewResult,
  type ClarityInterviewResult,
} from '@/modules/ai/MentorSkills';

type InterviewStep = 'intent' | 'suggestion' | 'editing' | 'error';

interface ClarityInterviewPanelProps {
  open: boolean;
  onClose: () => void;
  onAccept: (result: ClarityInterviewResult) => void;
  onReject: () => void;
}

export function ClarityInterviewPanel({ open, onClose, onAccept, onReject }: ClarityInterviewPanelProps) {
  const { status, chat, aiPhase, cancelCurrentOperation } = useAIRuntime();
  const { createSuggestion, updateSuggestionStatus } = useAISuggestions();

  const [step, setStep] = useState<InterviewStep>('intent');
  const [intent, setIntent] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [editedSuggestion, setEditedSuggestion] = useState('');
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ClarityInterviewResult | null>(null);

  // Escape 关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // 重置状态
  useEffect(() => {
    if (open) {
      setStep('intent');
      setIntent('');
      setLoading(false);
      setAiError(null);
      setSuggestion('');
      setEditedSuggestion('');
      setSuggestionId(null);
      setParsedResult(null);
    }
  }, [open]);

  if (!open) return null;

  const handleGetSuggestion = async () => {
    if (!intent.trim()) return;

    // 检查 AI 是否可用
    if (status !== 'connected') {
      setStep('error');
      setAiError('AI Runtime 未连接，无法获取建议。请先在设置中配置 AI Runtime。');
      return;
    }

    setLoading(true);
    setAiError(null);
    try {
      const messages = buildClarityInterviewMessages(intent.trim());
      const result = await chat(messages, 'clarity_interview');
      setSuggestion(result.content);
      setEditedSuggestion(result.content);

      // 解析结构化结果（自动 strip fence）
      const parsed = parseClarityInterviewResult(result.content);
      setParsedResult(parsed);

      setStep('suggestion');

      // 创建 AI Suggestion 记录
      const created = await createSuggestion('clarity_interview', result.content);
      if (created) {
        setSuggestionId(created.id);
      }

      mentorEventBus.emit('new_document_intent', { intent: intent.trim() });
    } catch (err) {
      setStep('error');
      setAiError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (suggestionId) {
      await updateSuggestionStatus(suggestionId, 'accepted');
    }
    // 使用解析后的结构化结果
    if (parsedResult) {
      onAccept(parsedResult);
    } else {
      // fallback：如果解析失败，使用原始建议
      onAccept({ title: '', filename: '', markdown_body: suggestion });
    }
    onClose();
  };

  const handleEdit = () => {
    setStep('editing');
  };

  const handleConfirmEdit = async () => {
    // 重新解析编辑后的内容
    const reparsed = parseClarityInterviewResult(editedSuggestion);
    setParsedResult(reparsed);

    if (suggestionId) {
      await updateSuggestionStatus(suggestionId, 'edited', editedSuggestion);
    }
    onAccept(reparsed);
    onClose();
  };

  const handleReject = async () => {
    if (suggestionId) {
      await updateSuggestionStatus(suggestionId, 'rejected');
    }
    onReject();
    onClose();
  };

  const handleContinueEmpty = () => {
    onReject();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-[9999] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg w-full max-w-lg shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f]">
          <span className="text-[12px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">
            文档清晰度访谈
          </span>
          <button
            onClick={onClose}
            className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Step: Intent input */}
        {step === 'intent' && (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              描述你想创建的文档意图或主题，AI 将为你生成结构建议。
            </p>
            <textarea
              value={intent}
              onChange={e => setIntent(e.target.value)}
              placeholder="例如：记录本周项目复盘的会议纪要..."
              rows={4}
              className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-2 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] resize-none focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors"
            />
            <div className="flex items-center justify-between">
              <button
                onClick={handleContinueEmpty}
                className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                跳过，创建空文档
              </button>
              <button
                onClick={handleGetSuggestion}
                disabled={!intent.trim() || loading}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 size={11} className="animate-spin" /> : null}
                {loading
                  ? (aiPhase === 'connecting' ? '连接中...' :
                     aiPhase === 'loading_model' ? '加载模型...' :
                     aiPhase === 'thinking' ? '思考中...' :
                     aiPhase === 'generating' ? '生成中...' : '获取中...')
                  : '获取 AI 建议'}
              </button>
              {loading && (
                <button
                  onClick={() => { cancelCurrentOperation(); setLoading(false); setStep('intent'); }}
                  className="text-[10px] text-red-400 hover:text-red-500 transition-colors"
                >
                  取消
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step: AI Suggestion */}
        {step === 'suggestion' && (
          <div className="p-4 flex flex-col gap-3">
            {/* 解析后的标题预览 */}
            {parsedResult?.title && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md p-2">
                <p className="text-[9px] font-mono uppercase text-emerald-600 dark:text-emerald-400 mb-0.5">推荐标题</p>
                <p className="text-[12px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">{parsedResult.title}</p>
                {parsedResult.filename && (
                  <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] mt-0.5">
                    文件名: {parsedResult.filename}.md
                  </p>
                )}
              </div>
            )}
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              AI 生成的文档结构建议：
            </p>
            <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md p-3 max-h-[240px] overflow-y-auto">
              <pre className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] whitespace-pre-wrap font-mono leading-relaxed">
                {parsedResult?.markdown_body || suggestion}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleReject}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              >
                <XCircle size={11} />
                拒绝
              </button>
              <button
                onClick={handleEdit}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                <Pencil size={11} />
                修改
              </button>
              <button
                onClick={handleAccept}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors"
              >
                <Check size={11} />
                接受
              </button>
            </div>
          </div>
        )}

        {/* Step: Editing */}
        {step === 'editing' && (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              编辑 AI 建议内容：
            </p>
            <textarea
              value={editedSuggestion}
              onChange={e => setEditedSuggestion(e.target.value)}
              rows={8}
              className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-2 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] resize-none focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors font-mono"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setStep('suggestion')}
                className="px-2.5 py-1.5 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmEdit}
                disabled={!editedSuggestion.trim()}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={11} />
                确认修改
              </button>
            </div>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2 text-[11px] text-red-500 dark:text-red-400">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{aiError || 'AI 调用失败，请稍后重试。'}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleContinueEmpty}
                className="px-3 py-1.5 text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
              >
                继续创建空文档
              </button>
              <button
                onClick={() => { setStep('intent'); setAiError(null); }}
                className="px-3 py-1.5 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                返回重试
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
