import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useVault } from '@/modules/vault/VaultProvider';
import { aiRuntimeService, type AIConfig, type AIProvider, type OllamaConnectionResult, type ChatMessage, type OllamaChatResult, type OllamaEmbedResult } from '@/services/ai/runtime';
import { aiLogsService } from '@/services/ai/logs';
import { vectorIndexService } from '@/services/index/vector';
import { mentorEventBus } from '@/modules/ai/MentorEventBus';

export type AIRuntimeStatus = 'disconnected' | 'connected' | 'error' | 'disabled' | 'running';

// AI 调用阶段状态
export type AIPhase = 'idle' | 'connecting' | 'loading_model' | 'thinking' | 'generating' | 'saving' | 'done' | 'error';

interface AIRuntimeState {
  status: AIRuntimeStatus;
  config: AIConfig;
  availableModels: string[];
  isRemote: boolean;
  error: string | null;
  aiPhase: AIPhase;
  checkConnection: (overrideConfig?: AIConfig) => Promise<void>;
  chat: (messages: ChatMessage[], promptType: string) => Promise<OllamaChatResult>;
  embed: (input: string) => Promise<OllamaEmbedResult>;
  embedAndStore: (chunkId: number, content: string, contentHash: string) => Promise<void>;
  updateConfig: (config: AIConfig) => Promise<void>;
  cancelCurrentOperation: () => void;
}

const AIRuntimeContext = createContext<AIRuntimeState | null>(null);

export function useAIRuntime(): AIRuntimeState {
  const ctx = useContext(AIRuntimeContext);
  if (!ctx) throw new Error('useAIRuntime must be used within AIRuntimeProvider');
  return ctx;
}

const DEFAULT_CONFIG: AIConfig = {
  endpoint: 'http://localhost:11434',
  default_model: null,
  embedding_model: null,
  provider: 'ollama',
  spark_base_url: 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2',
  spark_api_key: null,
  spark_model: 'astron-code-latest',
};

// AI 阶段自动推进计时器
const PHASE_TIMINGS: Record<string, number> = {
  connecting: 500,      // 0.5s 后进入 loading_model
  loading_model: 2000,  // 2s 后进入 thinking
  thinking: 5000,       // 5s 后进入 generating
};

export function AIRuntimeProvider({ children }: { children: ReactNode }) {
  const { vault } = useVault();
  const [status, setStatus] = useState<AIRuntimeStatus>('disconnected');
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isRemote, setIsRemote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPhase, setAiPhase] = useState<AIPhase>('idle');

  const isCustomApiProvider = useCallback((provider: AIProvider | undefined) => {
    return provider === 'custom_api' || provider === 'spark_codingplan';
  }, []);

  const isXfyunCodingPlanBaseUrl = useCallback((baseUrl: string | null | undefined) => {
    const raw = (baseUrl || '').trim().toLowerCase();
    return raw.includes('maas-coding-api.cn-huabei-1.xf-yun.com');
  }, []);

  // 取消标志
  const cancelledRef = useRef(false);
  // 阶段推进计时器
  const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 清理阶段计时器
  const clearPhaseTimers = useCallback(() => {
    phaseTimersRef.current.forEach(t => clearTimeout(t));
    phaseTimersRef.current = [];
  }, []);

  // 启动阶段自动推进
  const startPhaseProgression = useCallback((startPhase: AIPhase) => {
    clearPhaseTimers();
    setAiPhase(startPhase);

    // connecting → loading_model → thinking → generating
    const phases: AIPhase[] = ['connecting', 'loading_model', 'thinking', 'generating'];
    const startIdx = phases.indexOf(startPhase);
    if (startIdx === -1) return;

    let cumulativeDelay = 0;
    for (let i = startIdx + 1; i < phases.length; i++) {
      const prevPhase = phases[i - 1];
      const delay = PHASE_TIMINGS[prevPhase] || 2000;
      cumulativeDelay += delay;

      const targetPhase = phases[i];
      const timer = setTimeout(() => {
        if (!cancelledRef.current) {
          setAiPhase(targetPhase);
        }
      }, cumulativeDelay);
      phaseTimersRef.current.push(timer);
    }
  }, [clearPhaseTimers]);

  // 加载 AI 配置
  useEffect(() => {
    if (!vault) return;
    (async () => {
      try {
        const savedConfig = await aiRuntimeService.readAIConfig(vault.path);
        setConfig(savedConfig);
      } catch {
        // 配置文件不存在，使用默认值
      }
    })();
  }, [vault]);

  // 检测连接
  const checkConnection = useCallback(async (overrideConfig?: AIConfig) => {
    try {
      setStatus('running');
      setError(null);
      const targetConfig = overrideConfig ?? config;
      const provider: AIProvider = targetConfig.provider ?? 'ollama';
      const result: OllamaConnectionResult = isCustomApiProvider(provider)
        ? await aiRuntimeService.customApiCheckConnection(
          targetConfig.spark_base_url || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2',
          targetConfig.spark_api_key || '',
        )
        : await aiRuntimeService.checkConnection(targetConfig.endpoint);
      if (result.connected) {
        setStatus('connected');
        const detectedModels = result.models.map(m => m.name);
        const models = isCustomApiProvider(provider) && isXfyunCodingPlanBaseUrl(targetConfig.spark_base_url)
          ? ['astron-code-latest']
          : detectedModels;
        setAvailableModels(models);
        setIsRemote(result.is_remote);
      } else {
        setStatus('error');
        setError(result.error || (isCustomApiProvider(provider) ? '无法连接自定义 API 服务' : '无法连接 Ollama 服务'));
        setAvailableModels([]);
      }
      mentorEventBus.emit('ai_runtime_status_changed', { status: result.connected ? 'connected' : 'error' });
    } catch (err) {
      setStatus('error');
      setError(String(err));
      setAvailableModels([]);
      mentorEventBus.emit('ai_runtime_status_changed', { status: 'error' });
    }
  }, [config, isCustomApiProvider, isXfyunCodingPlanBaseUrl]);

  // 配置加载后自动检测连接
  useEffect(() => {
    const provider: AIProvider = config.provider ?? 'ollama';
    if (vault && (isCustomApiProvider(provider) ? config.spark_base_url : config.endpoint)) {
      checkConnection();
    }
  }, [vault, config.endpoint, config.provider, config.spark_base_url, checkConnection, isCustomApiProvider]);

  // chat 调用
  const chat = useCallback(async (messages: ChatMessage[], promptType: string): Promise<OllamaChatResult> => {
    if (!vault) throw new Error('Vault 未就绪');
    const provider: AIProvider = config.provider ?? 'ollama';
    const model = isCustomApiProvider(provider)
      ? (isXfyunCodingPlanBaseUrl(config.spark_base_url)
        ? 'astron-code-latest'
        : (config.spark_model || config.default_model || 'astron-code-latest'))
      : (config.default_model || availableModels[0]);
    if (!model) throw new Error('未选择模型，请先配置 AI Runtime');

    cancelledRef.current = false;
    startPhaseProgression('connecting');

    const startTime = Date.now();
    try {
      const result = isCustomApiProvider(provider)
        ? await aiRuntimeService.customApiChat(
          config.spark_base_url || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2',
          config.spark_api_key || '',
          model,
          messages,
          promptType,
        )
        : await aiRuntimeService.chat(config.endpoint, model, messages, promptType);

      // 检查是否被取消
      if (cancelledRef.current) {
        throw new Error('操作已取消');
      }

      clearPhaseTimers();
      setAiPhase('done');
      // 短暂显示 done 后回到 idle
      setTimeout(() => setAiPhase('idle'), 1000);

      // 记录 AI Runtime Log（只记录 metadata，不记录完整 prompt/response）
      await aiLogsService.appendLog(
        vault.path, provider, model, result.latency_ms, promptType,
        promptType, 'none', true, null
      );
      return result;
    } catch (err) {
      clearPhaseTimers();
      if (cancelledRef.current) {
        setAiPhase('idle');
        throw new Error('操作已取消');
      }
      setAiPhase('error');
      setTimeout(() => setAiPhase('idle'), 2000);

      const latencyMs = Date.now() - startTime;
      await aiLogsService.appendLog(
        vault.path, provider, model, latencyMs, promptType,
        promptType, 'none', false, String(err)
      );
      throw err;
    }
  }, [vault, config, availableModels, startPhaseProgression, clearPhaseTimers, isCustomApiProvider, isXfyunCodingPlanBaseUrl]);

  // embed 调用
  const embed = useCallback(async (input: string): Promise<OllamaEmbedResult> => {
    if (!vault) throw new Error('Vault 未就绪');
    const provider: AIProvider = config.provider ?? 'ollama';
    const model = isCustomApiProvider(provider)
      ? config.embedding_model
      : (config.embedding_model || config.default_model || availableModels[0]);
    if (!model) throw new Error('未选择模型，请先配置 AI Runtime');

    cancelledRef.current = false;
    startPhaseProgression('connecting');

    const startTime = Date.now();
    try {
      const result = await aiRuntimeService.embed(config.endpoint, model, input);

      if (cancelledRef.current) {
        throw new Error('操作已取消');
      }

      clearPhaseTimers();
      setAiPhase('done');
      setTimeout(() => setAiPhase('idle'), 1000);

      const fallbackStatus = result.used_deprecated_endpoint ? 'deprecated_endpoint' : 'none';
      await aiLogsService.appendLog(
        vault.path, 'ollama', model, result.latency_ms, 'embedding',
        'embedding_test', fallbackStatus, true, null
      );
      return result;
    } catch (err) {
      clearPhaseTimers();
      if (cancelledRef.current) {
        setAiPhase('idle');
        throw new Error('操作已取消');
      }
      setAiPhase('error');
      setTimeout(() => setAiPhase('idle'), 2000);

      const latencyMs = Date.now() - startTime;
      await aiLogsService.appendLog(
        vault.path, 'ollama', model, latencyMs, 'embedding',
        'embedding_test', 'none', false, String(err)
      );
      throw err;
    }
  }, [vault, config, availableModels, startPhaseProgression, clearPhaseTimers, isCustomApiProvider]);

  // embedAndStore: 生成 embedding 并存储到 vector index
  const embedAndStore = useCallback(async (chunkId: number, content: string, contentHash: string): Promise<void> => {
    if (!vault) throw new Error('Vault 未就绪');
    const provider: AIProvider = config.provider ?? 'ollama';
    const model = isCustomApiProvider(provider)
      ? config.embedding_model
      : (config.embedding_model || config.default_model || availableModels[0]);
    if (!model) throw new Error('未选择模型，请先配置 AI Runtime');

    // 1. 调用 embed 获取 embedding 向量
    const embedResult = await aiRuntimeService.embed(config.endpoint, model, content);
    if (!embedResult.embeddings || embedResult.embeddings.length === 0) {
      throw new Error('Embedding 返回为空');
    }
    const embedding = embedResult.embeddings[0];
    const dimension = embedding.length;

    // 2. 存储到 vector index
    await vectorIndexService.storeChunkEmbedding({
      vaultPath: vault.path,
      chunkId,
      embedding,
      embeddingModel: model,
      embeddingDimension: dimension,
      embeddingProvider: 'ollama',
      embeddingContentHash: contentHash,
    });
  }, [vault, config, availableModels, isCustomApiProvider]);

  // 取消当前操作
  const cancelCurrentOperation = useCallback(() => {
    cancelledRef.current = true;
    clearPhaseTimers();
    setAiPhase('idle');
  }, [clearPhaseTimers]);

  // 更新配置
  const updateConfig = useCallback(async (newConfig: AIConfig) => {
    if (!vault) return;
    await aiRuntimeService.writeAIConfig(vault.path, newConfig);
    setConfig(newConfig);
    // 配置变更后自动重新检测连接
  }, [vault]);

  // 清理
  useEffect(() => {
    return () => {
      clearPhaseTimers();
    };
  }, [clearPhaseTimers]);

  return (
    <AIRuntimeContext.Provider
      value={{
        status,
        config,
        availableModels,
        isRemote,
        error,
        aiPhase,
        checkConnection,
        chat,
        embed,
        embedAndStore,
        updateConfig,
        cancelCurrentOperation,
      }}
    >
      {children}
    </AIRuntimeContext.Provider>
  );
}
