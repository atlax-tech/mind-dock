import { useEffect, useMemo, useState, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import type { AIPhase } from '@/modules/ai/AIRuntimeProvider';

const DEFAULT_STEP_MESSAGES = [
  '正在创建上下文包...',
  '正在收集文档内容...',
  '正在分析文档结构...',
  '正在整理关键片段...',
  '正在构建输出材料...',
  '即将完成...',
];

interface GeneratingOverlayProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  steps?: string[];
  phase?: AIPhase;
}

function phaseToStepIndex(phase: AIPhase | undefined, stepsLength: number) {
  if (!phase) return null;
  const max = Math.max(0, stepsLength - 1);
  switch (phase) {
    case 'connecting':
      return Math.min(0, max);
    case 'loading_model':
      return Math.min(1, max);
    case 'thinking':
      return Math.min(2, max);
    case 'generating':
      return Math.min(3, max);
    case 'saving':
      return Math.min(4, max);
    case 'done':
      return max;
    default:
      return null;
  }
}

export function GeneratingOverlay({
  open,
  title = '正在生成...',
  subtitle = '请稍候，AI Mentor 正在为你准备材料',
  steps,
  phase,
}: GeneratingOverlayProps) {
  const stepMessages = useMemo(() => steps && steps.length > 0 ? steps : DEFAULT_STEP_MESSAGES, [steps]);
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setStepIndex(0);
      intervalRef.current = setInterval(() => {
        setStepIndex(prev => Math.min(prev + 1, stepMessages.length - 1));
      }, 1200);
    } else {
      intervalRef.current = null;
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, stepMessages.length]);

  useEffect(() => {
    const nextStep = phaseToStepIndex(phase, stepMessages.length);
    if (nextStep == null) return;
    setStepIndex(prev => Math.max(prev, nextStep));
  }, [phase, stepMessages.length]);

  if (!visible) return null;

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${
      open ? 'opacity-100' : 'opacity-0'
    }`}>
      <div className="absolute inset-0 bg-stone-900/60 dark:bg-black/70 backdrop-blur-sm" />

      <div className="relative bg-white dark:bg-[#1a1a1a] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-2xl shadow-2xl px-8 py-8 w-[360px] max-w-[90vw]">
        <div className="flex flex-col items-center gap-5">
          {/* Animated ring */}
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-stone-100 dark:border-stone-800" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 dark:border-t-emerald-400 animate-spin" />
            <div className="absolute inset-[6px] rounded-full border-4 border-transparent border-t-emerald-400/60 dark:border-t-emerald-500/60 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles size={20} className="text-emerald-600 dark:text-emerald-400 animate-pulse" />
            </div>
          </div>

          {/* Title */}
          <p className="text-[14px] font-semibold text-[#2c2c2a] dark:text-[#e3e3e3]">
            {title}
          </p>

          {/* Step messages */}
          <div className="flex flex-col items-center gap-1.5 min-h-[48px]">
            {stepMessages.map((msg, idx) => (
              <p
                key={idx}
                className={`text-[11px] transition-all duration-500 ${
                  idx === stepIndex
                    ? 'text-emerald-600 dark:text-emerald-400 opacity-100 translate-y-0'
                    : idx < stepIndex
                      ? 'text-[#7e7e78] dark:text-[#8e8e8e] opacity-40 -translate-y-1'
                      : 'text-[#7e7e78] dark:text-[#8e8e8e] opacity-0 translate-y-1 hidden'
                }`}
              >
                {idx < stepIndex && (
                  <span className="mr-1.5 text-emerald-500">✓</span>
                )}
                {msg}
              </p>
            ))}
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {stepMessages.map((_, idx) => (
              <div
                key={idx}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                  idx === stepIndex
                    ? 'bg-emerald-500 scale-125'
                    : idx < stepIndex
                      ? 'bg-emerald-300 dark:bg-emerald-600'
                      : 'bg-stone-200 dark:bg-stone-700'
                }`}
              />
            ))}
          </div>

          {/* Subtitle hint */}
          <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
