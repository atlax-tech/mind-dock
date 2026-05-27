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
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

import { useVault } from '@/modules/vault/VaultProvider';
import { useAIRuntime, type AIRuntimeStatus } from '@/modules/ai/AIRuntimeProvider';
import { metadataService } from '@/services/index/metadata';
import { chunkingService } from '@/services/index/chunking';
import { vectorIndexService, type DocumentEmbeddingResult } from '@/services/index/vector';
import { aiLogsService, type AIRuntimeLog } from '@/services/ai/logs';

// ── Props ──

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
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
  const { vault } = useVault();
  const { status, config, availableModels, error, checkConnection, updateConfig, embed } = useAIRuntime();

  // ── 折叠状态 ──
  const [aiSectionOpen, setAiSectionOpen] = useState(true);
  const [indexSectionOpen, setIndexSectionOpen] = useState(true);
  const [logsSectionOpen, setLogsSectionOpen] = useState(false);
  const [aboutSectionOpen, setAboutSectionOpen] = useState(false);

  // ── AI 配置编辑 ──
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [editingModel, setEditingModel] = useState(false);
  const [editingEmbeddingModel, setEditingEmbeddingModel] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState(config.endpoint);
  const [modelDraft, setModelDraft] = useState(config.default_model || '');
  const [embeddingModelDraft, setEmbeddingModelDraft] = useState(config.embedding_model || '');

  // ── Embedding 测试 ──
  const [embedTesting, setEmbedTesting] = useState(false);
  const [embedTestResult, setEmbedTestResult] = useState<{ model: string; dimension: number; provider: string } | null>(null);
  const [embedTestError, setEmbedTestError] = useState<string | null>(null);

  // ── 索引状态 ──
  const [indexStats, setIndexStats] = useState<{ totalDocs: number; indexedDocs: number; embeddingReadyDocs: number } | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState<string | null>(null);
  const [sampleEmbedding, setSampleEmbedding] = useState<DocumentEmbeddingResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [verifyRunning, setVerifyRunning] = useState(false);

  // ── 运行日志 ──
  const [logs, setLogs] = useState<AIRuntimeLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // ── 同步 config 到 draft ──
  useEffect(() => { setEndpointDraft(config.endpoint); }, [config.endpoint]);
  useEffect(() => { setModelDraft(config.default_model || ''); }, [config.default_model]);
  useEffect(() => { setEmbeddingModelDraft(config.embedding_model || ''); }, [config.embedding_model]);

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
      setIndexStats({ totalDocs, indexedDocs, embeddingReadyDocs });

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
      setRebuildProgress('读取文档列表...');
      const docs = await metadataService.listDocumentsMetadata(vault.path);
      const total = docs.length;
      let processed = 0;

      for (const doc of docs) {
        processed++;
        setRebuildProgress(`索引中 (${processed}/${total})...`);
        try {
          await chunkingService.reindexDocument(vault.path, doc.path);
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
  }, [vault, rebuilding, loadIndexStats]);

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
          {/* ── 1. AI 助手配置 ── */}
          <ExplorerSection
            title="AI 助手"
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
                  onClick={() => checkConnection()}
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

            {/* 服务地址 */}
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

            {/* 语义模型 */}
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
                  disabled={embedTesting || status !== 'connected'}
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
          </ExplorerSection>

          {/* ── 2. 知识索引状态 ── */}
          <ExplorerSection
            title="知识索引状态"
            icon={Database}
            expanded={indexSectionOpen}
            onToggle={() => setIndexSectionOpen(prev => !prev)}
            contentClassName="px-4 pb-3 space-y-2"
          >
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

          {/* ── 4. 关于 ── */}
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
