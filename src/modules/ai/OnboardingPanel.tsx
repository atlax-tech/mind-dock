import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronLeft, FolderOpen, Target, Sparkles, Check } from 'lucide-react';
import { useVault } from '@/modules/vault/VaultProvider';
import { useAIRuntime } from '@/modules/ai/AIRuntimeProvider';
import { aiRuntimeService } from '@/services/ai/runtime';
import { onboardingService } from '@/services/ai/onboarding';
import { documentService } from '@/services/filesystem/documents';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';

type OnboardingStep = 'welcome' | 'purpose' | 'goal' | 'structure' | 'configure' | 'done';

// 知识库用途选项
const PURPOSE_OPTIONS = [
  { id: 'personal', label: '个人知识库', desc: '整理学习笔记、读书摘录、个人思考' },
  { id: 'project', label: '项目文档库', desc: '管理项目文档、会议纪要、技术方案' },
  { id: 'research', label: '研究资料库', desc: '收集研究资料、论文笔记、实验记录' },
  { id: 'creative', label: '创意灵感库', desc: '捕获灵感、创作素材、设计参考' },
];

// 规则生成的推荐结构（不依赖 AI）
const STRUCTURE_TEMPLATES: Record<string, { folders: string[]; docs: { name: string; content: string }[] }> = {
  personal: {
    folders: ['读书笔记', '学习记录', '日常思考'],
    docs: [
      { name: 'README', content: '# 个人知识库\n\n这是我的个人知识库，用于整理学习笔记、读书摘录和个人思考。\n\n## 结构说明\n\n- **读书笔记**：书籍阅读的摘录和心得\n- **学习记录**：课程、教程的学习笔记\n- **日常思考**：灵感、想法和反思' },
    ],
  },
  project: {
    folders: ['会议纪要', '技术方案', '项目文档'],
    docs: [
      { name: 'README', content: '# 项目文档库\n\n项目相关的文档、会议纪要和技术方案。\n\n## 结构说明\n\n- **会议纪要**：项目会议记录和决策\n- **技术方案**：技术设计和架构文档\n- **项目文档**：需求文档、进度跟踪' },
    ],
  },
  research: {
    folders: ['论文笔记', '实验记录', '资料收集'],
    docs: [
      { name: 'README', content: '# 研究资料库\n\n研究相关的资料收集、论文笔记和实验记录。\n\n## 结构说明\n\n- **论文笔记**：论文阅读笔记和摘要\n- **实验记录**：实验过程和结果记录\n- **资料收集**：参考文献和资源链接' },
    ],
  },
  creative: {
    folders: ['灵感捕获', '创作素材', '设计参考'],
    docs: [
      { name: 'README', content: '# 创意灵感库\n\n捕获灵感、收集创作素材和设计参考。\n\n## 结构说明\n\n- **灵感捕获**：随时记录的灵感和想法\n- **创作素材**：写作、设计等创作素材\n- **设计参考**：优秀案例和参考资源' },
    ],
  },
};

interface OnboardingPanelProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingPanel({ open, onClose }: OnboardingPanelProps) {
  const { vault } = useVault();
  const { config, availableModels, status, updateConfig, chat, aiPhase } = useAIRuntime();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [purpose, setPurpose] = useState<string>('');
  const [goal, setGoal] = useState('');
  const [recommendedStructure, setRecommendedStructure] = useState<typeof STRUCTURE_TEMPLATES.personal | null>(null);
  const [structureAccepted, setStructureAccepted] = useState<boolean | null>(null);

  // AI 配置
  const [endpoint, setEndpoint] = useState(config.endpoint || 'http://localhost:11434');
  const [selectedModel, setSelectedModel] = useState(config.default_model || '');
  const [customModel, setCustomModel] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<'success' | 'error' | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [aiEnhancing, setAiEnhancing] = useState(false);

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
      setStep('welcome');
      setPurpose('');
      setGoal('');
      setRecommendedStructure(null);
      setStructureAccepted(null);
      setEndpoint(config.endpoint || 'http://localhost:11434');
      setSelectedModel(config.default_model || '');
      setCustomModel('');
      setUseCustomModel(false);
      setConnectionResult(null);
      setConnectionError(null);
      setCreatingStructure(false);
      setStructureError(null);
      setAiEnhancing(false);
    }
  }, [open, config.endpoint, config.default_model]);

  if (!open) return null;

  const handleSkip = async () => {
    if (!vault) return;
    try {
      await onboardingService.writeStatus(vault.path, 'skipped');
      mentorEventBus.emit('onboarding_skipped');
    } catch (err) {
      console.error('写入 onboarding 状态失败:', err);
    }
    onClose();
  };

  // 选择用途后，生成推荐结构
  const handlePurposeSelect = (purposeId: string) => {
    setPurpose(purposeId);
    setRecommendedStructure(STRUCTURE_TEMPLATES[purposeId] || STRUCTURE_TEMPLATES.personal);
    setStep('goal');
  };

  // 输入目标后，进入结构确认
  const handleGoalNext = () => {
    setStep('structure');
  };

  // AI 增强推荐结构
  const handleAIEnhance = async () => {
    if (status !== 'connected' || !goal.trim()) return;

    setAiEnhancing(true);
    try {
      const purposeLabel = PURPOSE_OPTIONS.find(p => p.id === purpose)?.label || purpose;
      const messages = [
        {
          role: 'system',
          content: '你是一个知识库结构顾问。根据用户的用途和目标，推荐 3-5 个文件夹名称和 1 个 README 文件的内容。只输出 JSON 格式：{"folders":["文件夹1","文件夹2"],"docs":[{"name":"README","content":"# 标题\n内容"}]}',
        },
        {
          role: 'user',
          content: `我的知识库用途是「${purposeLabel}」，当前目标是：${goal.trim()}`,
        },
      ];
      const result = await chat(messages, 'clarity_interview');

      // 尝试解析 JSON
      try {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.folders && Array.isArray(parsed.folders)) {
            setRecommendedStructure({
              folders: parsed.folders,
              docs: parsed.docs || STRUCTURE_TEMPLATES[purpose]?.docs || [],
            });
          }
        }
      } catch {
        // JSON 解析失败，保持规则生成的结构
      }
    } catch {
      // AI 增强失败，保持规则生成的结构
    } finally {
      setAiEnhancing(false);
    }
  };

  // 接受/修改/跳过结构
  const handleAcceptStructure = () => {
    setStructureAccepted(true);
    setStep('configure');
  };

  const handleSkipStructure = () => {
    setStructureAccepted(false);
    setStep('configure');
  };

  // 检测连接
  const handleDetectConnection = async () => {
    setDetecting(true);
    setConnectionResult(null);
    setConnectionError(null);
    try {
      const nextConfig = { endpoint, default_model: config.default_model, embedding_model: config.embedding_model };
      await updateConfig(nextConfig);
      const result = await aiRuntimeService.checkConnection(endpoint);
      if (!result.connected) {
        setConnectionResult('error');
        setConnectionError(result.error || '无法连接 Ollama 服务');
        return;
      }
      setConnectionResult('success');
    } catch (err) {
      setConnectionResult('error');
      setConnectionError(String(err));
    } finally {
      setDetecting(false);
    }
  };

  // 完成配置并创建知识库结构
  const handleComplete = async () => {
    if (!vault) return;
    const model = useCustomModel ? customModel.trim() : selectedModel;

    setSaving(true);
    try {
      // 保存 AI 配置（如果有模型选择）
      if (model) {
        await updateConfig({ endpoint, default_model: model, embedding_model: null });
      }

      // 创建知识库结构（如果用户接受了推荐）
      if (structureAccepted && recommendedStructure) {
        setCreatingStructure(true);
        setStructureError(null);
        try {
          // 创建文件夹
          for (const folder of recommendedStructure.folders) {
            const folderPath = `${vault.path}/documents/${folder}`;
            await documentService.createDirectory(vault.path, folderPath);
            // 创建 .keep.md 占位文件
            await documentService.createDocument(vault.path, `${folderPath}/.keep.md`);
            await documentService.writeDocument(vault.path, `${folderPath}/.keep.md`, '# 目录占位');
          }

          // 创建 README 文档
          for (const doc of recommendedStructure.docs) {
            const docPath = `${vault.path}/documents/${doc.name}.md`;
            await documentService.createDocument(vault.path, docPath);
            await documentService.writeDocument(vault.path, docPath, doc.content);
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          setStructureError(`创建知识库结构失败: ${errMsg}`);
          setCreatingStructure(false);
          return;
        }
        setCreatingStructure(false);
      }

      await onboardingService.writeStatus(vault.path, 'completed');
      mentorEventBus.emit('onboarding_completed');
      setStep('done');
    } catch (err) {
      console.error('保存配置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  const canComplete = !structureAccepted || connectionResult === 'success' || status === 'connected' || !recommendedStructure;
  void canComplete;

  const stepTitle: Record<OnboardingStep, string> = {
    welcome: '欢迎使用 Mind Dock',
    purpose: '选择知识库用途',
    goal: '设定当前目标',
    structure: '推荐知识库结构',
    configure: '配置 AI Runtime',
    done: '设置完成',
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-[9999] flex items-center justify-center" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg w-full max-w-md shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#e6e6dc] dark:border-[#2f2f2f]">
          <span className="text-[12px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">
            {stepTitle[step]}
          </span>
          <button
            onClick={onClose}
            className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#2c2c2a] dark:hover:text-[#e3e3e3] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="text-center">
              <p className="text-xs text-[#2c2c2a] dark:text-[#e3e3e3] leading-relaxed">
                Mind Dock 可以连接本地 AI 模型，为你提供智能写作辅助、文档结构建议和引导式捕获。
              </p>
              <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] mt-2">
                让我们先搭建你的知识库基础结构。
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setStep('purpose')}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors"
              >
                开始搭建知识库
                <ChevronRight size={11} />
              </button>
              <button
                onClick={handleSkip}
                className="px-3 py-1.5 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                跳过，稍后设置
              </button>
            </div>
          </div>
        )}

        {/* Step: Purpose */}
        {step === 'purpose' && (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              你打算用这个知识库做什么？
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PURPOSE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => handlePurposeSelect(opt.id)}
                  className={`flex flex-col items-start p-2.5 border rounded-md text-left transition-colors ${
                    purpose === opt.id
                      ? 'border-emerald-600 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-[#e6e6dc] dark:border-[#2f2f2f] hover:border-stone-300 dark:hover:border-stone-600'
                  }`}
                >
                  <span className="text-[11px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">{opt.label}</span>
                  <span className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] mt-0.5">{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('welcome')}
                className="flex items-center gap-1 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                <ChevronLeft size={11} />
                返回
              </button>
              <button
                onClick={handleSkip}
                className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                跳过
              </button>
            </div>
          </div>
        )}

        {/* Step: Goal */}
        {step === 'goal' && (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              你当前最重要的目标是什么？（可选）
            </p>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="例如：整理最近三个月的学习笔记..."
              rows={3}
              className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-2 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] resize-none focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors"
            />
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('purpose')}
                className="flex items-center gap-1 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                <ChevronLeft size={11} />
                返回
              </button>
              <button
                onClick={handleGoalNext}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors"
              >
                下一步
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        )}

        {/* Step: Structure */}
        {step === 'structure' && recommendedStructure && (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              基于你的用途，推荐以下知识库结构：
            </p>
            <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <FolderOpen size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                <span className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">文件夹</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recommendedStructure.folders.map(folder => (
                  <span
                    key={folder}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-stone-50 dark:bg-stone-800 border border-[#e6e6dc] dark:border-[#2f2f2f] rounded text-[#2c2c2a] dark:text-[#e3e3e3]"
                  >
                    <FolderOpen size={9} className="text-[#7e7e78]" />
                    {folder}
                  </span>
                ))}
              </div>
              {recommendedStructure.docs.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 mt-2">
                    <Target size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
                    <span className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">初始文档</span>
                  </div>
                  {recommendedStructure.docs.map(doc => (
                    <div key={doc.name} className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
                      {doc.name}.md
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* AI 增强按钮 */}
            {status === 'connected' && goal.trim() && (
              <button
                onClick={handleAIEnhance}
                disabled={aiEnhancing}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-[#e6e6dc] dark:border-[#2f2f2f] text-[11px] font-medium rounded-md text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {aiEnhancing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {aiEnhancing
                  ? (aiPhase === 'thinking' ? 'AI 分析中...' : aiPhase === 'generating' ? '生成推荐...' : 'AI 增强中...')
                  : 'AI 增强推荐'}
              </button>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('goal')}
                className="flex items-center gap-1 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                <ChevronLeft size={11} />
                返回
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSkipStructure}
                  className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
                >
                  跳过
                </button>
                <button
                  onClick={handleAcceptStructure}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors"
                >
                  <Check size={11} />
                  接受并继续
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Configure AI */}
        {step === 'configure' && (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
              配置 AI Runtime 以启用智能辅助功能（可选）。
            </p>
            {/* Endpoint */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">Endpoint URL</label>
              <input
                type="text"
                value={endpoint}
                onChange={e => { setEndpoint(e.target.value); setConnectionResult(null); }}
                placeholder="http://localhost:11434"
                className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-1.5 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors"
              />
            </div>

            {/* Model selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">模型</label>
              {availableModels.length > 0 && !useCustomModel ? (
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-1.5 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors"
                >
                  <option value="">选择模型...</option>
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  placeholder="输入模型名称，如 llama3.2"
                  className="w-full bg-transparent border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md px-2.5 py-1.5 text-xs text-[#2c2c2a] dark:text-[#e3e3e3] placeholder:text-[#7e7e78] dark:placeholder:text-[#8e8e8e] focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-400 transition-colors"
                />
              )}
              {availableModels.length > 0 && (
                <button
                  onClick={() => setUseCustomModel(prev => !prev)}
                  className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors self-start"
                >
                  {useCustomModel ? '从列表选择' : '手动输入模型名'}
                </button>
              )}
            </div>

            {/* Detect connection */}
            <button
              onClick={handleDetectConnection}
              disabled={detecting || !endpoint.trim()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-[#e6e6dc] dark:border-[#2f2f2f] text-[11px] font-medium rounded-md text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {detecting ? <Loader2 size={11} className="animate-spin" /> : null}
              检测连接
            </button>

            {/* Connection result */}
            {connectionResult === 'success' && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={12} />
                <span>连接成功，发现 {availableModels.length} 个模型</span>
              </div>
            )}
            {connectionResult === 'error' && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-500 dark:text-red-400">
                <XCircle size={12} />
                <span>{connectionError || '连接失败，请检查 Endpoint 和 Ollama 状态'}</span>
              </div>
            )}

            {/* 结构创建错误 */}
            {structureError && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-500 dark:text-red-400">
                <XCircle size={12} />
                <span>{structureError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-1">
              <button
                onClick={() => setStep(structureAccepted ? 'structure' : 'goal')}
                className="flex items-center gap-1 text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
              >
                <ChevronLeft size={11} />
                返回
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSkip}
                  className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] hover:text-[#5a5a56] dark:hover:text-[#a0a0a0] transition-colors"
                >
                  跳过
                </button>
                <button
                  onClick={handleComplete}
                  disabled={saving || creatingStructure}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving || creatingStructure ? <Loader2 size={11} className="animate-spin" /> : null}
                  {creatingStructure ? '创建结构中...' : '完成设置'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="text-center">
              <CheckCircle2 size={24} className="mx-auto text-emerald-600 dark:text-emerald-400 mb-2" />
              <p className="text-xs font-medium text-[#2c2c2a] dark:text-[#e3e3e3]">知识库设置完成</p>
            </div>

            <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md p-3 space-y-2">
              <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
                你刚刚完成了
              </p>
              <ul className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] space-y-1">
                {structureAccepted && recommendedStructure && (
                  <li>创建了 {recommendedStructure.folders.length} 个文件夹和 {recommendedStructure.docs.length} 个初始文档</li>
                )}
                {config.default_model && (
                  <li>配置了 AI Runtime（{config.default_model}）</li>
                )}
                {!config.default_model && (
                  <li>跳过了 AI Runtime 配置（可稍后在设置中配置）</li>
                )}
              </ul>
            </div>

            <div className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-md p-3 space-y-2">
              <p className="text-[10px] font-mono uppercase font-bold text-[#2c2c2a] dark:text-[#e3e3e3]">
                下一步可以做什么
              </p>
              <ul className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] space-y-1">
                <li>使用极速捕获（Ctrl+Shift+C）快速记录想法</li>
                <li>使用引导捕获让 AI 帮助理清思路</li>
                <li>创建新文档时使用 AI 结构建议</li>
                <li>在 Mentor Dock 查看 AI 状态和建议</li>
              </ul>
            </div>

            <button
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-medium rounded-md hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors"
            >
              开始使用
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
