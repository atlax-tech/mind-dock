interface PlaceholderViewProps {
  title: string;
  phase: string;
  description?: string;
}

// PHASE_PLACEHOLDER - 通用占位页面组件，后续各 Phase 会实现真实功能
export function PlaceholderView({ title, phase, description }: PlaceholderViewProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3 px-8">
        <div className="text-[10px] font-mono uppercase tracking-wider text-[#7e7e78] dark:text-[#8e8e8e]">
          {phase}
        </div>
        <h2 className="text-base font-semibold text-[#2c2c2a] dark:text-[#e3e3e3]">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-[#7e7e78] dark:text-[#8e8e8e] max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        )}
        <div className="pt-2">
          <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-[#f4f4ee] dark:bg-[#1f1f1f] text-[#7e7e78] dark:text-[#8e8e8e] border border-[#e6e6dc] dark:border-[#2f2f2f]">
            后续 {phase} 可用
          </span>
        </div>
      </div>
    </div>
  );
}
