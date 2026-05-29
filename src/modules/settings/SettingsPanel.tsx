import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  X,
  ChevronRight,
  Settings,
  Wifi,
  WifiOff,
  AlertTriangle,
  Loader2,
  Zap,
  Database,
  RefreshCw,
  Search,
  ScrollText,
  Info,
  Shield,
  Cpu,
  RotateCcw,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

import { useVault } from '@/modules/vault/VaultProvider';
import { useAIRuntime, type AIRuntimeStatus } from '@/modules/ai/AIRuntimeProvider';
import { metadataService } from '@/services/index/metadata';
import { chunkingService } from '@/services/index/chunking';
import { vectorIndexService, type DocumentEmbeddingResult } from '@/services/index/vector';
import { personalizationService } from '@/services/index/personalization';
import { aiLogsService, type AIRuntimeLog } from '@/services/ai/logs';
import { onboardingService } from '@/services/ai/onboarding';
import { documentService } from '@/services/filesystem/documents';
import { extractTitle, parseFrontMatter } from '@/services/markdown/frontmatter';
import type { DocEntry } from '@/types/vault';

// ── Props ──

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

async function computeContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function flattenDocTree(entries: DocEntry[]): DocEntry[] {
  const result: DocEntry[] = [];
  for (const entry of entries) {
    result.push(entry);
    if (entry.children.length > 0) {
      result.push(...flattenDocTree(entry.children));
    }
  }
  return result;
}

// ── ExplorerSection (复用 MentorDock 样式) ──

function ExplorerSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  children,
  contentClassName,
}: {
  title: string;
  icon: typeof Settings;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="border-b border-[#e6e6dc] dark:border-[#2f2f2f] last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left hover:bg-stone-100/70 dark:hover:bg-stone-800/40 transition-colors"
      >
        <ChevronRight
          size={11}
          className={`shrink-0 text-[#7e7e78] dark:text-[#8e8e8e] transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <Icon size={12} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
        <span className="text-[10px] font-mono uppercase font-bold tracking-wide text-[#2c2c2a] dark:text-[#e3e3e3]">
          {title}
        </span>
      </button>
      {expanded && children && <div className={contentClassName ?? 'pb-1'}>{children}</div>}
    </div>
  );
}

// ── AI 连接状态配置 ──

const STATUS_CONFIG: Record<AIRuntimeStatus, { label: string; dotClass: string; textClass: string; icon: typeof Wifi }> = {
  connected: { label: '已连接', dotClass: 'bg-emerald-500', textClass: 'text-emerald-600 dark:text-emerald-400', icon: Wifi },
  disconnected: { label: '未连接', dotClass: 'bg-stone-400 dark:bg-stone-500', textClass: 'text-stone-500 dark:text-stone-400', icon: WifiOff },
  error: { label: '连接错误', dotClass: 'bg-red-400 dark:bg-red-500', textClass: 'text-red-500 dark:text-red-400', icon: AlertTriangle },
  running: { label: '检测中', dotClass: 'bg-amber-400 dark:bg-amber-500', textClass: 'text-amber-600 dark:text-amber-400', icon: Loader2 },
  disabled: { label: '已禁用', dotClass: 'bg-stone-300 dark:bg-stone-600', textClass: 'text-stone-400 dark:text-stone-500', icon: WifiOff },
};

// ── 主组件 ──

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { vault, docTree } = useVault();
  const { status, config, availableModels, error, checkConnection, updateConfig, embed, embedAndStore } = useAIRuntime();
  const normalizedProvider = config.provider === 'spark_codingplan' ? 'custom_api' : (config.provider || 'ollama');
  const isXfyunCodingPlanBaseUrl = (baseUrl: string) => baseUrl.trim().toLowerCase().includes('maas-coding-api.cn-huabei-1.xf-yun.com');

  // ── 折叠状态 ──
  const [aiSectionOpen, setAiSectionOpen] = useState(true);
  const [knowledgeEngineOpen, setKnowledgeEngineOpen] = useState(true);
  const [logsSectionOpen, setLogsSectionOpen] = useState(false);
  const [productFlowOpen, setProductFlowOpen] = useState(false);
  const [aboutSectionOpen, setAboutSectionOpen] = useState(false);

  // ── AI 配置编辑 ──
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [editingModel, setEditingModel] = useState(false);
  const [editingEmbeddingModel, setEditingEmbeddingModel] = useState(false);
  const [editingProvider, setEditingProvider] = useState(false);
  const [editingSparkBaseUrl, setEditingSparkBaseUrl] = useState(false);
  const [editingSparkApiKey, setEditingSparkApiKey] = useState(false);
  const [editingSparkModel, setEditingSparkModel] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState(config.endpoint);
  const [modelDraft, setModelDraft] = useState(config.default_model || '');
  const [embeddingModelDraft, setEmbeddingModelDraft] = useState(config.embedding_model || '');
  const [providerDraft, setProviderDraft] = useState<'ollama' | 'custom_api'>(normalizedProvider === 'custom_api' ? 'custom_api' : 'ollama');
  const [sparkBaseUrlDraft, setSparkBaseUrlDraft] = useState(config.spark_base_url || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2');
  const [sparkApiKeyDraft, setSparkApiKeyDraft] = useState(config.spark_api_key || '');
  const [sparkModelDraft, setSparkModelDraft] = useState(config.spark_model || 'astron-code-latest');

  // ── Embedding 测试 ──
  const [embedTesting, setEmbedTesting] = useState(false);
  const [embedTestResult, setEmbedTestResult] = useState<{ model: string; dimension: number; provider: string } | null>(null);
  const [embedTestError, setEmbedTestError] = useState<string | null>(null);

  // ── 索引状态 ──
  const [indexStats, setIndexStats] = useState<{ totalDocs: number; indexedDocs: number; embeddingReadyDocs: number; staleDocs: number } | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState<string | null>(null);
  const [sampleEmbedding, setSampleEmbedding] = useState<DocumentEmbeddingResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyRunning, setVerifyRunning] = useState(false);
  const [personalizationCount, setPersonalizationCount] = useState<number | null>(null);
  const [personalizationResetting, setPersonalizationResetting] = useState(false);

  // ── 运行日志 ──
  const [logs, setLogs] = useState<AIRuntimeLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    if (!vault || !open) return;
    personalizationService.countSignals(vault.path)
      .then(setPersonalizationCount)
      .catch(() => setPersonalizationCount(null));
  }, [open, vault]);

  // ── 同步 config 到 draft ──
  useEffect(() => { setEndpointDraft(config.endpoint); }, [config.endpoint]);
  useEffect(() => { setModelDraft(config.default_model || ''); }, [config.default_model]);
  useEffect(() => { setEmbeddingModelDraft(config.embedding_model || ''); }, [config.embedding_model]);
  useEffect(() => {
    setProviderDraft(normalizedProvider === 'custom_api' ? 'custom_api' : 'ollama');
  }, [normalizedProvider]);
  useEffect(() => { setSparkBaseUrlDraft(config.spark_base_url || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2'); }, [config.spark_base_url]);
  useEffect(() => { setSparkApiKeyDraft(config.spark_api_key || ''); }, [config.spark_api_key]);
  useEffect(() => { setSparkModelDraft(config.spark_model || 'astron-code-latest'); }, [config.spark_model]);

  // ── 保存配置 ──
  const saveEndpoint = useCallback(async () => {
    setEditingEndpoint(false);
    if (endpointDraft.trim() && endpointDraft !== config.endpoint) {
      await updateConfig({ ...config, endpoint: endpointDraft.trim() });
    }
  }, [endpointDraft, config, updateConfig]);

  const saveModel = useCallback(async () => {
    setEditingModel(false);
    const newModel = modelDraft.trim() || null;
    if (newModel !== config.default_model) {
      await updateConfig({ ...config, default_model: newModel });
    }
  }, [modelDraft, config, updateConfig]);

  const saveEmbeddingModel = useCallback(async () => {
    setEditingEmbeddingModel(false);
    const newModel = embeddingModelDraft.trim() || null;
    if (newModel !== config.embedding_model) {
      await updateConfig({ ...config, embedding_model: newModel });
    }
  }, [embeddingModelDraft, config, updateConfig]);

  const saveProvider = useCallback(async () => {
    setEditingProvider(false);
    const nextProvider = providerDraft === 'custom_api' ? 'custom_api' : 'ollama';
    if (nextProvider !== normalizedProvider) {
      await updateConfig({ ...config, provider: nextProvider });
    }
  }, [providerDraft, config, updateConfig, normalizedProvider]);

  const saveSparkBaseUrl = useCallback(async () => {
    setEditingSparkBaseUrl(false);
    const value = sparkBaseUrlDraft.trim() || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2';
    if (value !== (config.spark_base_url || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2')) {
      await updateConfig({ ...config, spark_base_url: value });
    }
  }, [sparkBaseUrlDraft, config, updateConfig]);

  const saveSparkApiKey = useCallback(async () => {
    setEditingSparkApiKey(false);
    const value = sparkApiKeyDraft.trim();
    if (value !== (config.spark_api_key || '')) {
      await updateConfig({ ...config, spark_api_key: value || null });
    }
  }, [sparkApiKeyDraft, config, updateConfig]);

  const saveSparkModel = useCallback(async () => {
    setEditingSparkModel(false);
    const value = isXfyunCodingPlanBaseUrl(config.spark_base_url || '')
      ? 'astron-code-latest'
      : (sparkModelDraft.trim() || 'astron-code-latest');
    if (value !== (config.spark_model || 'astron-code-latest')) {
      await updateConfig({ ...config, spark_model: value });
    }
  }, [sparkModelDraft, config, updateConfig]);

  const handleCheckConnection = useCallback(async () => {
    if (providerDraft === 'custom_api') {
      const normalizedBaseUrl = sparkBaseUrlDraft.trim() || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2';
      const forceAstronModel = isXfyunCodingPlanBaseUrl(normalizedBaseUrl);
      const nextConfig = {
        ...config,
        provider: 'custom_api' as const,
        spark_base_url: normalizedBaseUrl,
        spark_api_key: sparkApiKeyDraft.trim() || null,
        spark_model: forceAstronModel ? 'astron-code-latest' : (config.spark_model || 'astron-code-latest'),
      };
      await updateConfig(nextConfig);
      await checkConnection(nextConfig);
      return;
    }

    const nextConfig = {
      ...config,
      provider: 'ollama' as const,
      endpoint: endpointDraft.trim() || config.endpoint,
    };
    await updateConfig(nextConfig);
    await checkConnection(nextConfig);
  }, [
    providerDraft,
    config,
    sparkBaseUrlDraft,
    sparkApiKeyDraft,
    endpointDraft,
    updateConfig,
    checkConnection,
  ]);

  // ── Embedding 测试 ──
  const handleEmbedTest = useCallback(async () => {
    setEmbedTesting(true);
    setEmbedTestResult(null);
    setEmbedTestError(null);
    try {
      const result = await embed('测试文本');
      if (result.embeddings && result.embeddings.length > 0) {
        setEmbedTestResult({
          model: result.model,
          dimension: result.embeddings[0].length,
          provider: 'ollama',
        });
      } else {
        setEmbedTestError('返回结果为空');
      }
    } catch (err) {
      setEmbedTestError(String(err));
    } finally {
      setEmbedTesting(false);
    }
  }, [embed]);

  // ── 加载索引状态 ──
  const loadIndexStats = useCallback(async () => {
    if (!vault) return;
    setIndexLoading(true);
    try {
      const docs = await metadataService.listDocumentsMetadata(vault.path);
      const totalDocs = docs.length;
      const indexedDocs = docs.filter(d => d.index_status === 'indexed').length;
      const embeddingReadyDocs = docs.filter(d => d.embedding_status === 'ready').length;
      const staleDocs = docs.filter(d => d.embedding_status === 'stale').length;
      setIndexStats({ totalDocs, indexedDocs, embeddingReadyDocs, staleDocs });

      const readyDoc = docs.find(d => d.embedding_status === 'ready');
      if (readyDoc) {
        const embResult = await vectorIndexService.getDocumentEmbedding(vault.path, readyDoc.path);
        setSampleEmbedding(embResult);
      } else {
        setSampleEmbedding(null);
      }
    } catch {
      // ignore
    } finally {
      setIndexLoading(false);
    }
  }, [vault]);

  useEffect(() => {
    if (open) loadIndexStats();
  }, [open, loadIndexStats]);

  // ── 重建索引 ──
  const handleRebuildIndex = useCallback(async () => {
    if (!vault || rebuilding) return;
    setRebuilding(true);
    setRebuildProgress('初始化数据库...');
    try {
      await metadataService.initMetadataDb(vault.path);
      setRebuildProgress('同步文档元数据...');
      const markdownDocs = flattenDocTree(docTree).filter(entry => !entry.is_dir && entry.absolute_path.endsWith('.md'));
      for (const doc of markdownDocs) {
        try {
          const content = await documentService.readDocument(vault.path, doc.absolute_path);
          const { data: fmData } = parseFrontMatter(content);
          await metadataService.upsertDocumentMetadata({
            vaultPath: vault.path,
            documentPath: doc.absolute_path,
            title: extractTitle(content) || doc.name.replace(/\.md$/, ''),
            frontmatter: Object.keys(fmData).length > 0 ? JSON.stringify(fmData) : null,
            contentHash: await computeContentHash(content),
            wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
          });
        } catch {
          // 单个文档 metadata 同步失败不中断整体重建
        }
      }
      setRebuildProgress('读取文档列表...');
      const docs = await metadataService.listDocumentsMetadata(vault.path);
      const total = docs.length;
      let processed = 0;

      for (const doc of docs) {
        processed++;
        setRebuildProgress(`重建全文索引 (${processed}/${total})...`);
        try {
          await chunkingService.reindexDocument(vault.path, doc.path);
          if (status === 'connected') {
            const chunks = await chunkingService.getDocumentChunks(vault.path, doc.path);
            let embedded = 0;
            for (const chunk of chunks) {
              embedded++;
              setRebuildProgress(`生成语义向量 (${processed}/${total}, ${embedded}/${chunks.length})...`);
              try {
                await embedAndStore(chunk.id, chunk.content, chunk.content_hash || '');
              } catch {
                await vectorIndexService.markEmbeddingError(vault.path, chunk.id).catch(() => {});
              }
            }
          }
        } catch {
          // 单个文档索引失败不中断整体流程
        }
      }

      setRebuildProgress(null);
      await loadIndexStats();
    } catch {
      // ignore
    } finally {
      setRebuilding(false);
      setRebuildProgress(null);
    }
  }, [vault, docTree, rebuilding, loadIndexStats, status, embedAndStore]);

  // ── 验证索引 ──
  const handleVerifyIndex = useCallback(async () => {
    if (!vault) return;
    setVerifyRunning(true);
    setVerifyResult(null);
    try {
      const result = await invoke<string>('run_verify_index', { vaultPath: vault.path });
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult(`验证失败: ${err}`);
    } finally {
      setVerifyRunning(false);
    }
  }, [vault]);

  // ── 加载日志 ──
  const loadLogs = useCallback(async () => {
    if (!vault) return;
    setLogsLoading(true);
    try {
      const entries = await aiLogsService.readLogs(vault.path, 10);
      setLogs(entries.reverse());
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }, [vault]);

  useEffect(() => {
    if (open && logsSectionOpen) loadLogs();
  }, [open, logsSectionOpen, loadLogs]);

  // ── Escape 关闭 ──
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const statusCfg = STATUS_CONFIG[status];
  const StatusIcon = statusCfg.icon;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[99999] flex justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-w-lg w-full mx-auto mt-[10vh] max-h-[80vh] flex flex-col bg-[#fcfcf9] dark:bg-[#171717] rounded-xl border border-[#e6e6dc] dark:border-[#2f2f2f] shadow-xl overflow-hidden">
        {/* ── 头部 ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6dc] dark:border-[#2f2f2f] shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={14} className="text-[#7e7e78] dark:text-[#8e8e8e]" />
            <span className="text-[10px] font-mono uppercase font-bold tracking-wide text-[#2c2c2a] dark:text-[#e3e3e3]">
              设置
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#7e7e78] dark:text-[#8e8e8e] hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── 内容区 ── */}
        <div className="flex-1 overflow-y-auto">
          {/* ── 1. AI Reasoning ── */}
          <ExplorerSection
            title="AI Reasoning"
            icon={Zap}
            expanded={aiSectionOpen}
            onToggle={() => setAiSectionOpen(prev => !prev)}
            contentClassName="px-4 pb-3 space-y-3"
          >
            {/* 连接状态 */}
            <div className="bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon size={14} className={`${statusCfg.textClass} ${status === 'running' ? 'animate-spin' : ''}`} />
                  <span className={`text-[11px] font-medium ${statusCfg.textClass}`}>
                    {statusCfg.label}
                  </span>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusCfg.dotClass}`} />
                </div>
                <button
                  onClick={() => void handleCheckConnection()}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <Zap size={10} />
                  检测连接
                </button>
              </div>
              {error && (
                <p className="text-[10px] text-red-400 dark:text-red-500 leading-normal">{error}</p>
              )}
            </div>

            {/* Provider */}
            <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">Provider</p>
              {editingProvider ? (
                <select
                  value={providerDraft}
                  onChange={(e) => setProviderDraft(e.target.value as 'ollama' | 'custom_api')}
                  onBlur={saveProvider}
                  className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                  autoFocus
                >
                  <option value="ollama">Ollama (本地)</option>
                  <option value="custom_api">Custom API</option>
                </select>
              ) : (
                <p
                  onClick={() => setEditingProvider(true)}
                  className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                  title="点击编辑"
                >
                  {normalizedProvider === 'custom_api' ? 'Custom API' : 'Ollama (本地)'}
                </p>
              )}
            </div>

            {/* Ollama 服务地址 */}
            <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">服务地址</p>
              {editingEndpoint ? (
                <input
                  type="text"
                  value={endpointDraft}
                  onChange={(e) => setEndpointDraft(e.target.value)}
                  onBlur={saveEndpoint}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEndpoint();
                    if (e.key === 'Escape') { setEditingEndpoint(false); setEndpointDraft(config.endpoint); }
                  }}
                  className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                  autoFocus
                />
              ) : (
                <p
                  onClick={() => setEditingEndpoint(true)}
                  className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                  title="点击编辑"
                >
                  {config.endpoint}
                </p>
              )}
            </div>

            {/* 对话模型 */}
            {normalizedProvider === 'ollama' && (
              <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">对话模型</p>
              {editingModel ? (
                availableModels.length > 0 ? (
                  <select
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    onBlur={saveModel}
                    className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                    autoFocus
                  >
                    <option value="">（自动选择）</option>
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    onBlur={saveModel}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveModel();
                      if (e.key === 'Escape') { setEditingModel(false); setModelDraft(config.default_model || ''); }
                    }}
                    placeholder="输入模型名称"
                    className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5 placeholder:text-[#7e7e78]"
                    autoFocus
                  />
                )
              ) : (
                <p
                  onClick={() => setEditingModel(true)}
                  className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                  title="点击编辑"
                >
                  {config.default_model || '（自动选择）'}
                </p>
              )}
              </div>
            )}

            {/* Custom API 配置 */}
            {normalizedProvider === 'custom_api' && (
              <>
                <div>
                  <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">Custom API Base URL</p>
                  {editingSparkBaseUrl ? (
                    <input
                      type="text"
                      value={sparkBaseUrlDraft}
                      onChange={(e) => setSparkBaseUrlDraft(e.target.value)}
                      onBlur={saveSparkBaseUrl}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveSparkBaseUrl();
                        if (e.key === 'Escape') { setEditingSparkBaseUrl(false); setSparkBaseUrlDraft(config.spark_base_url || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2'); }
                      }}
                      className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                      autoFocus
                    />
                  ) : (
                    <p
                      onClick={() => setEditingSparkBaseUrl(true)}
                      className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                      title="点击编辑"
                    >
                      {config.spark_base_url || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2'}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">Custom API Key</p>
                  {editingSparkApiKey ? (
                    <input
                      type="password"
                      value={sparkApiKeyDraft}
                      onChange={(e) => setSparkApiKeyDraft(e.target.value)}
                      onBlur={saveSparkApiKey}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveSparkApiKey();
                        if (e.key === 'Escape') { setEditingSparkApiKey(false); setSparkApiKeyDraft(config.spark_api_key || ''); }
                      }}
                      className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                      autoFocus
                    />
                  ) : (
                    <p
                      onClick={() => setEditingSparkApiKey(true)}
                      className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                      title="点击编辑"
                    >
                      {config.spark_api_key ? '••••••••••' : '（未设置）'}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">Custom API 模型</p>
                  {isXfyunCodingPlanBaseUrl(config.spark_base_url || '') ? (
                    <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">astron-code-latest</p>
                  ) : editingSparkModel ? (
                    availableModels.length > 0 ? (
                      <select
                        value={sparkModelDraft}
                        onChange={(e) => setSparkModelDraft(e.target.value)}
                        onBlur={saveSparkModel}
                        className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                        autoFocus
                      >
                        {availableModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={sparkModelDraft}
                        onChange={(e) => setSparkModelDraft(e.target.value)}
                        onBlur={saveSparkModel}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSparkModel();
                          if (e.key === 'Escape') { setEditingSparkModel(false); setSparkModelDraft(config.spark_model || 'astron-code-latest'); }
                        }}
                        className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                        autoFocus
                      />
                    )
                  ) : (
                    <p
                      onClick={() => setEditingSparkModel(true)}
                      className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                      title="点击编辑"
                    >
                      {config.spark_model || 'astron-code-latest'}
                    </p>
                  )}
                  {isXfyunCodingPlanBaseUrl(config.spark_base_url || '') ? (
                    <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">
                      讯飞 CodingPlan 请求 model 固定为 astron-code-latest；底层模型请到讯飞套餐页面切换（1-3 分钟生效）。
                    </p>
                  ) : availableModels.length > 0 && (
                    <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] mt-1">
                      已检测到 {availableModels.length} 个可用模型
                    </p>
                  )}
                </div>
              </>
            )}
          </ExplorerSection>

          {/* ── 2. Knowledge Engine（知识引擎） ── */}
          <ExplorerSection
            title="Knowledge Engine"
            icon={Database}
            expanded={knowledgeEngineOpen}
            onToggle={() => setKnowledgeEngineOpen(prev => !prev)}
            contentClassName="px-4 pb-3 space-y-3"
          >
            <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] leading-normal">
              以下为开发与诊断用途。产品主流程会在后台自动使用 Knowledge Engine，无需手动操作。
            </p>
            {/* 语义模型配置 */}
            <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">语义模型</p>
              {editingEmbeddingModel ? (
                availableModels.length > 0 ? (
                  <select
                    value={embeddingModelDraft}
                    onChange={(e) => setEmbeddingModelDraft(e.target.value)}
                    onBlur={saveEmbeddingModel}
                    className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5"
                    autoFocus
                  >
                    <option value="">（跟随对话模型）</option>
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={embeddingModelDraft}
                    onChange={(e) => setEmbeddingModelDraft(e.target.value)}
                    onBlur={saveEmbeddingModel}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEmbeddingModel();
                      if (e.key === 'Escape') { setEditingEmbeddingModel(false); setEmbeddingModelDraft(config.embedding_model || ''); }
                    }}
                    placeholder="输入语义模型名称"
                    className="w-full text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] bg-transparent border-b border-emerald-600 dark:border-emerald-400 outline-none py-0.5 placeholder:text-[#7e7e78]"
                    autoFocus
                  />
                )
              ) : (
                <p
                  onClick={() => { setEditingEmbeddingModel(true); setEmbeddingModelDraft(config.embedding_model || ''); }}
                  className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                  title="点击编辑"
                >
                  {config.embedding_model || '（跟随对话模型）'}
                </p>
              )}
            </div>

            {/* Embedding 测试 */}
            <div className="border-t border-[#e6e6dc] dark:border-[#2f2f2f] pt-2">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">Embedding 测试</p>
                <button
                  onClick={handleEmbedTest}
                  disabled={embedTesting}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {embedTesting ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                  测试
                </button>
              </div>
              {embedTestResult && (
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-1">
                  模型: {embedTestResult.model} · 维度: {embedTestResult.dimension} · Provider: {embedTestResult.provider}
                </p>
              )}
              {embedTestError && (
                <p className="text-[9px] text-red-400 dark:text-red-500 mt-1">{embedTestError}</p>
              )}
              {!embedTestResult && !embedTestError && sampleEmbedding && (
                <p className="text-[9px] text-[#7e7e78] dark:text-[#8e8e8e] mt-1">
                  模型: {sampleEmbedding.embedding_model || '未知'} · 维度: {sampleEmbedding.embedding_dimension ?? '未知'} · Provider: ollama
                </p>
              )}
            </div>

            {/* 索引状态 */}
            <div className="border-t border-[#e6e6dc] dark:border-[#2f2f2f] pt-2 space-y-2">
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">索引状态</p>
              {indexLoading && !indexStats ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 size={12} className="animate-spin text-stone-400" />
                </div>
              ) : indexStats ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">全文索引</p>
                    <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
                      {indexStats.indexedDocs} / {indexStats.totalDocs} 文档已索引
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">语义索引</p>
                    {indexStats.embeddingReadyDocs > 0 ? (
                      <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">
                        {indexStats.embeddingReadyDocs} / {indexStats.totalDocs} 文档已生成语义向量
                      </p>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Search size={10} className="text-amber-500" />
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          语义搜索未开启
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Stale Embedding 检测 */}
                  {indexStats.staleDocs > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={10} className="text-amber-500" />
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {indexStats.staleDocs} 个文档的向量已过期（内容已变更，需重建索引）
                      </p>
                    </div>
                  ) : indexStats.embeddingReadyDocs > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Shield size={10} className="text-emerald-500" />
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        所有向量均为最新
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">无法加载索引状态</p>
              )}

              {rebuildProgress && (
                <div className="flex items-center gap-1.5">
                  <Loader2 size={10} className="animate-spin text-stone-400" />
                  <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">{rebuildProgress}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRebuildIndex}
                  disabled={rebuilding}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={10} className={rebuilding ? 'animate-spin' : ''} />
                  {rebuilding ? '重建中...' : '重建索引'}
                </button>
                <button
                  onClick={handleVerifyIndex}
                  disabled={verifyRunning}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Shield size={10} />
                  {verifyRunning ? '验证中...' : '验证索引'}
                </button>
              </div>
              {verifyResult && (
                <pre className="text-[9px] text-[#5a5a56] dark:text-[#a0a0a0] bg-stone-50 dark:bg-stone-800/50 rounded-lg p-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {verifyResult}
                </pre>
              )}
            </div>

            {/* 个性化学习记录 */}
            <div className="border-t border-[#e6e6dc] dark:border-[#2f2f2f] pt-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e]">学习记录</p>
                  <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e]">
                    本地记录 {personalizationCount ?? 0} 条，用于推荐排序和默认输出类型；不会上传云端。
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!vault) return;
                    setPersonalizationResetting(true);
                    try {
                      await personalizationService.resetSignals(vault.path);
                      setPersonalizationCount(0);
                    } finally {
                      setPersonalizationResetting(false);
                    }
                  }}
                  disabled={personalizationResetting || !vault}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {personalizationResetting ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                  重置
                </button>
              </div>
            </div>
          </ExplorerSection>

          {/* ── 3. 运行日志 ── */}
          <ExplorerSection
            title="运行日志"
            icon={ScrollText}
            expanded={logsSectionOpen}
            onToggle={() => setLogsSectionOpen(prev => !prev)}
            contentClassName="px-4 pb-3"
          >
            {logsLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 size={12} className="animate-spin text-stone-400" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e] py-2">暂无日志记录</p>
            ) : (
              <div className="space-y-1.5">
                {logs.map(log => (
                  <div key={log.id} className="border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg p-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-mono text-[#7e7e78] dark:text-[#8e8e8e]">
                        {log.request_type || log.prompt_type}
                      </span>
                      <span className={`text-[9px] ${log.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                        {log.success ? '成功' : '失败'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] text-[#5a5a56] dark:text-[#a0a0a0]">{log.model}</span>
                      <span className="text-[9px] text-stone-400 dark:text-stone-500">{log.latency_ms}ms</span>
                    </div>
                    {log.error_message && (
                      <p className="text-[9px] text-red-400 dark:text-red-500 line-clamp-1">{log.error_message}</p>
                    )}
                    <p className="text-[8px] text-stone-400 dark:text-stone-500">
                      {new Date(log.timestamp).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ExplorerSection>

          {/* ── 4. Product Flow ── */}
          <ExplorerSection
            title="Product Flow"
            icon={Cpu}
            expanded={productFlowOpen}
            onToggle={() => setProductFlowOpen(prev => !prev)}
            contentClassName="px-4 pb-3 space-y-2"
          >
            <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">Onboarding</p>
              <button
                onClick={async () => {
                  if (!vault) return;
                  try {
                    await onboardingService.resetStatus(vault.path);
                    window.location.reload();
                  } catch (err) {
                    alert(`重置失败: ${err}`);
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#e6e6dc] dark:border-[#2f2f2f] text-[10px] font-medium text-[#2c2c2a] dark:text-[#e3e3e3] hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
              >
                <RotateCcw size={10} />
                重新运行 Onboarding
              </button>
            </div>
            <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-1">说明</p>
              <p className="text-[10px] text-[#7e7e78] dark:text-[#8e8e8e] leading-normal">
                Knowledge Engine 负责在后台维护知识感知能力（索引、召回、聚类、相似推荐、重复检测）。即使 AI Reasoning 不可用，搜索、推荐、发现相似内容等基础功能仍可正常使用。
              </p>
            </div>
          </ExplorerSection>

          {/* ── 5. 关于 ── */}
          <ExplorerSection
            title="关于"
            icon={Info}
            expanded={aboutSectionOpen}
            onToggle={() => setAboutSectionOpen(prev => !prev)}
            contentClassName="px-4 pb-3 space-y-2"
          >
            <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">版本</p>
              <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3]">MindDock v0.1.0</p>
            </div>
            {vault && (
              <div>
                <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">Vault 路径</p>
                <p className="text-[11px] text-[#2c2c2a] dark:text-[#e3e3e3] break-all">{vault.path}</p>
              </div>
            )}
            <div>
              <p className="text-[9px] font-mono uppercase text-[#7e7e78] dark:text-[#8e8e8e] mb-0.5">数据存储</p>
              <p className="text-[11px] text-[#7e7e78] dark:text-[#8e8e8e]">
                索引数据、AI 配置和日志存储在 Vault 目录下的 .minddock 文件夹中
              </p>
            </div>
          </ExplorerSection>
        </div>
      </div>
    </div>
  );
}
