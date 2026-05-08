'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentUser } from '@/lib/auth';
import DraftEditorView from './features/editor/DraftEditorView';
import {
  Home,
  Brain,
  Archive,
  PenTool,
  BookOpen,
  Settings,
  Search,
  Database,
  Cloud,
  Download,
  Command,
  FileText,
  Code,
  Link,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Plus,
  FolderTree,
  Activity,
  HardDrive,
  Share2,
  Calendar,
  TerminalSquare,
  Sparkles,
  PanelLeft,
  PanelRight,
  MoreHorizontal,
  X,
  Bot,
  Puzzle,
  LayoutDashboard,
  Network,
  LayoutTemplate,
  FileSignature,
  Newspaper,
  CloudCog,
  ArrowRightLeft,
  Crown,
  Layers,
  ChevronRight,
  ChevronDown,
  Kanban,
  CheckSquare,
  Target,
  Trash2,
  PieChart,
  Inbox,
  Clock,
  Filter,
  MousePointer2,
  GitCommit,
  Wand2,
} from 'lucide-react';

// ==========================================
// 设计系统组件 (Design System Components)
// ==========================================

// 毛玻璃面板基础组件
const GlassPanel = ({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div
    onClick={onClick}
    className={`bg-[#1c2023]/40 backdrop-blur-[20px] border-[0.5px] border-white/5 rounded-[22px] transition-all duration-200 hover:border-[#86d7ff]/30 hover:bg-[#1c2023]/60 ${className} ${onClick ? 'cursor-pointer' : ''}`}
  >
    {children}
  </div>
);

// 毛玻璃卡片组件 (内部层级)
const GlassCard = ({ children, className = "", hoverEffect = true }: { children: React.ReactNode; className?: string; hoverEffect?: boolean }) => (
  <div className={`bg-[#1c2023]/40 backdrop-blur-[16px] border-[0.5px] border-white/5 rounded-[16px] ${hoverEffect ? 'transition-all duration-200 hover:border-[#86d7ff]/30' : ''} ${className}`}>
    {children}
  </div>
);

// 标签胶囊组件
const Pill = ({ text, type = "default" }: { text: string; type?: 'design' | 'planning' | 'active' | 'research' | 'pro' | 'default' }) => {
  const styles = {
    design: "bg-[#86d7ff]/10 text-[#86d7ff] border border-[#86d7ff]/20",
    planning: "bg-[#a8c8ff]/10 text-[#a8c8ff] border border-[#a8c8ff]/20",
    active: "bg-[#9cf4d4]/10 text-[#9cf4d4] border border-[#9cf4d4]/20",
    research: "bg-[#c8a0f0]/10 text-[#c8a0f0] border border-[#c8a0f0]/20",
    pro: "bg-gradient-to-r from-[#c8a0f0]/20 to-[#86d7ff]/20 text-white border border-[#c8a0f0]/30 shadow-[0_0_10px_rgba(200,160,240,0.2)]",
    default: "bg-white/5 text-[#899298] border border-white/10"
  } as const;
  return (
    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase ${styles[type]}`}>
      {text}
    </span>
  );
};

// ==========================================
// 页面视图组件 (Page Views)
// ==========================================

// 1. 主页视图 (Home View)
// 此处为Mock功能，等待后端接入 — 活跃思维、最近草稿、今日知识简报均为Mock数据
// To-do: 后端已支持 listDockItems(), 可对接真实数据
const HomeView = () => {
  return (
    <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* 头部标题区 */}
      <div className="mb-6 mt-2">
        <h1 className="text-3xl font-semibold mb-2 text-white tracking-tight">早上好。</h1>
        <p className="text-[#899298] text-sm">您的本地工作区已同步。4 个活跃的思维会话。</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 左侧主列 */}
        <div className="col-span-1 lg:col-span-8 flex flex-col gap-4">

          {/* 活跃思维 面板 */}
          <GlassPanel className="p-5">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#86d7ff]" />
                <h2 className="text-base font-medium text-white">活跃思维</h2>
              </div>
              <button className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold tracking-wider text-white hover:bg-white/10 transition-colors uppercase">
                新会话
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <GlassCard className="p-4 relative overflow-hidden group">
                <div className="absolute top-3 right-3 w-1 h-1 rounded-full bg-[#86d7ff] shadow-[0_0_6px_#86d7ff]"></div>
                <h3 className="text-sm text-white font-medium mb-1.5 group-hover:text-[#86d7ff] transition-colors">空间 UI 架构</h3>
                <p className="text-xs text-[#899298] mb-3 leading-relaxed">探索桌面环境的分层毛玻璃和深度层级。</p>
                <Pill text="设计" type="design" />
              </GlassCard>

              <GlassCard className="p-4 group">
                <h3 className="text-sm text-white font-medium mb-1.5 group-hover:text-[#a8c8ff] transition-colors">Q3 战略综合</h3>
                <p className="text-xs text-[#899298] mb-3 leading-relaxed">将本地数据存储与远程同步协议合并以实现离线优先功能。</p>
                <Pill text="规划" type="planning" />
              </GlassCard>

              <GlassCard className="p-4 group">
                <h3 className="text-sm text-white font-medium mb-1.5 group-hover:text-[#9cf4d4] transition-colors">本地优先同步设计</h3>
                <p className="text-xs text-[#899298] mb-3 leading-relaxed">构建基于 CRDT 的同步架构以实现即时数据更新。</p>
                <Pill text="活跃" type="active" />
              </GlassCard>

              <GlassCard className="p-4 group">
                <h3 className="text-sm text-white font-medium mb-1.5 group-hover:text-[#c8a0f0] transition-colors">知识图谱</h3>
                <p className="text-xs text-[#899298] mb-3 leading-relaxed">映射不同思维向量之间的语义关系。</p>
                <Pill text="研究" type="research" />
              </GlassCard>
            </div>
          </GlassPanel>

          {/* 最近草稿 面板 */}
          <GlassPanel className="p-5 relative">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-[#86d7ff]" />
              <h2 className="text-base font-medium text-white">最近草稿</h2>
            </div>

            <div className="flex flex-col gap-1.5">
              {[
                { icon: FileText, title: "Atlax 项目宣言", time: "2 小时前编辑" },
                { icon: FileText, title: "设计系统令牌", time: "昨天编辑" },
                { icon: Code, title: "API 同步端点", time: "3 天前编辑" }
              ].map((draft, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#899298] group-hover:text-[#86d7ff] group-hover:border-[#86d7ff]/30 transition-all">
                    <draft.icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs text-white font-medium">{draft.title}</h4>
                    <p className="text-[10px] text-[#899298] mt-0.5">{draft.time}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="absolute bottom-5 right-5">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white hover:bg-white/10 transition-colors">
                <Command className="w-3.5 h-3.5" /> 快速笔记
              </button>
            </div>
          </GlassPanel>

        </div>

        {/* 右侧边栏列 */}
        <div className="col-span-1 lg:col-span-4 flex flex-col gap-4">

          {/* 今日知识简报 */}
          <GlassPanel className="p-5">
            <h2 className="text-lg font-medium text-white mb-1">今日知识简报</h2>
            <p className="text-xs text-[#899298] mb-5">来自分析的 6 条建议</p>

            <div className="flex flex-col gap-4 mb-6 relative">
              <div className="absolute left-[3px] top-2 bottom-2 w-px bg-white/5 z-0"></div>

              <div className="relative z-10 pl-3 border-l-2 border-[#86d7ff]">
                <h4 className="text-xs text-white font-medium">跟进事项</h4>
                <p className="text-[10px] text-[#899298] mt-0.5">2 个标记为日常跟进的项目</p>
              </div>
              <div className="relative z-10 pl-3 border-l-2 border-[#899298] opacity-70">
                <h4 className="text-xs text-white font-medium">复习</h4>
                <p className="text-[10px] text-[#899298] mt-0.5">8 条笔记最近未打开</p>
              </div>
              <div className="relative z-10 pl-3 border-l-2 border-[#899298] opacity-70">
                <h4 className="text-xs text-white font-medium">草稿</h4>
                <p className="text-[10px] text-[#899298] mt-0.5">3 份未完成草稿需要决策</p>
              </div>
              <div className="relative z-10 pl-3 border-l-2 border-[#899298] opacity-70">
                <h4 className="text-xs text-white font-medium">提示</h4>
                <p className="text-[10px] text-[#899298] mt-0.5">5 条快速笔记已准备好整理</p>
              </div>
            </div>

            <button className="w-full py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold tracking-wider text-white hover:bg-white/10 transition-colors uppercase">
              打开每日简报
            </button>
          </GlassPanel>

          {/* 每周回顾提醒 */}
          <GlassPanel className="p-5 cursor-pointer group">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[9px] font-semibold tracking-wider text-[#899298] uppercase mb-1">回顾提醒</p>
                <h3 className="text-base font-medium text-white mb-0.5 group-hover:text-[#86d7ff] transition-colors">每周回顾</h3>
                <p className="text-[11px] text-[#899298]">当您想要闭环时，您的每周回顾已就绪。</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#86d7ff]/20 transition-colors">
                <span className="text-white text-sm leading-none group-hover:text-[#86d7ff] transition-colors">→</span>
              </div>
            </div>
          </GlassPanel>

          {/* 待处理数据包 */}
          <GlassPanel className="p-5">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-white" />
                <h2 className="text-base font-medium text-white">待处理数据包</h2>
              </div>
              <span className="w-4 h-4 rounded-full bg-white/10 text-[9px] flex items-center justify-center text-white">3</span>
            </div>
            <p className="text-[11px] text-[#899298] mb-4">传入的数据等待分拣到您的停靠区。</p>

            <div className="grid grid-cols-3 gap-2">
              <button className="flex flex-col items-center justify-center py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all gap-1.5">
                <Link className="w-3.5 h-3.5 text-[#899298]" />
                <span className="text-[10px] font-medium text-white">网页剪报</span>
              </button>
              <button className="flex flex-col items-center justify-center py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#899298]" />
                <span className="text-[10px] font-medium text-white">媒体</span>
              </button>
              <button className="flex flex-col items-center justify-center py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#899298]" />
                <span className="text-[10px] font-medium text-white">笔记</span>
              </button>
            </div>
          </GlassPanel>

        </div>
      </div>
    </div>
  );
};

// 1.5 工具箱/扩展视图 (Toolbox View) - 应用市场/展位页
// 此处为Mock功能，等待后端接入 — 工具列表、订阅状态均为Mock数据
const ToolboxView = () => {
  const tools = [
    { id: 'llm', title: 'LLM 核心接入', desc: '配置 OpenAI, Anthropic 或本地开源大模型的 API 密钥，解锁全局 AI 辅助生成与总结。', icon: Bot, isPro: true },
    { id: 'plugins', title: '插件中心', desc: '浏览并安装由社区和官方提供的扩展应用，打造符合个人工作流的专属生态。', icon: Puzzle, isPro: false },
    { id: 'home_custom', title: '首页模块定制', desc: '自由拖拽排列今日视图卡片，添加数据仪表盘、习惯追踪等个性化组件。', icon: Layers, isPro: true },
    { id: 'mind_custom', title: 'Mind 视图引擎', desc: '升级神经图谱渲染算法，自定义节点引力场、连线逻辑及 3D 拓扑结构。', icon: Network, isPro: true },
    { id: 'dock_template', title: 'Dock 结构模板', desc: '一键导入行业标准的知识库结构模板，如 PARA, Zettelkasten 或 P.A.C.T。', icon: LayoutTemplate, isPro: true },
    { id: 'editor_paper', title: 'Editor 纸张材质', desc: '解锁羊皮纸、深色方格本、工程图纸等沉浸式书写背景主题和高阶排版。', icon: FileSignature, isPro: true },
    { id: 'brief_custom', title: '简报生成定制', desc: '自定义每日知识简报的 AI 总结 Prompt 和数据抓取源，精准聚焦核心信息。', icon: Newspaper, isPro: true },
    { id: 'widgets', title: '系统小组件', desc: '将 Atlax 核心数据与捕获入口直接嵌入到您的 OS 桌面或菜单栏中。', icon: LayoutDashboard, isPro: true },
    { id: 'cloud_storage', title: '企业级云端接入', desc: '解锁 S3, WebDAV, Google Drive 等第三方高级同步协议，数据完全自主掌控。', icon: CloudCog, isPro: true },
    { id: 'io_control', title: '导入导出总控', desc: '完整的数据流控中心，支持批量 Markdown、PDF 甚至外部数据库级无损迁移。', icon: ArrowRightLeft, isPro: false },
  ];

  return (
    <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500">
      {/* 头部 Banner */}
      <GlassPanel className="p-8 mb-8 relative overflow-hidden bg-gradient-to-br from-[#1c2023] to-[#0b0f11]">
        <div className="absolute top-[-50%] right-[-10%] w-[50%] h-[200%] bg-gradient-to-b from-[#86d7ff]/10 via-[#c8a0f0]/10 to-transparent rotate-12 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-[#c8a0f0]" />
            <span className="text-[#c8a0f0] text-xs font-semibold tracking-widest uppercase">App Market & Plugins</span>
          </div>
          <h1 className="text-4xl font-semibold mb-4 text-white tracking-tight">Atlax 扩展引擎</h1>
          <p className="text-[#899298] text-sm leading-relaxed mb-6">
            这是您的数字基建指挥中心。浏览、安装并订阅高级模块，将默认工作区改造为您专属的终极生产力系统。强大的定制能力，只为更深度的思考。
          </p>
          <div className="flex gap-4">
            <button className="px-5 py-2 rounded-full bg-white text-[#0b0f11] text-xs font-semibold hover:bg-white/90 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              浏览所有插件
            </button>
            <button className="px-5 py-2 rounded-full bg-transparent border border-white/20 text-white text-xs font-semibold hover:bg-white/5 transition-colors">
              管理已订阅服务
            </button>
          </div>
        </div>
      </GlassPanel>

      {/* 工具分类网格 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">精选模块与服务</h2>
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded-full bg-white/10 text-white text-[10px] font-medium cursor-pointer">全部</span>
          <span className="px-3 py-1 rounded-full text-[#899298] hover:text-white text-[10px] font-medium cursor-pointer transition-colors">UI 定制</span>
          <span className="px-3 py-1 rounded-full text-[#899298] hover:text-white text-[10px] font-medium cursor-pointer transition-colors">AI 服务</span>
          <span className="px-3 py-1 rounded-full text-[#899298] hover:text-white text-[10px] font-medium cursor-pointer transition-colors">数据与云</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tools.map((tool) => (
          <GlassPanel key={tool.id} className="p-5 flex flex-col h-full group hover:-translate-y-1 transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[#86d7ff]/10 group-hover:border-[#86d7ff]/30 group-hover:text-[#86d7ff] text-[#899298] transition-all">
                <tool.icon className="w-5 h-5" />
              </div>
              {tool.isPro && (
                <div className="flex items-center gap-1 bg-gradient-to-r from-[#c8a0f0]/20 to-[#86d7ff]/20 text-white border border-[#c8a0f0]/30 shadow-[0_0_10px_rgba(200,160,240,0.1)] px-2 py-1 rounded-full">
                  <Crown className="w-3 h-3 text-[#c8a0f0]" />
                  <span className="text-[9px] font-bold tracking-wider uppercase">Pro</span>
                </div>
              )}
            </div>

            <h3 className="text-base text-white font-medium mb-2 group-hover:text-[#86d7ff] transition-colors">{tool.title}</h3>
            <p className="text-xs text-[#899298] leading-relaxed mb-6 flex-1">
              {tool.desc}
            </p>

            <div className="mt-auto">
              <button className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${tool.isPro
                  ? 'bg-[#c8a0f0]/10 text-[#c8a0f0] border border-[#c8a0f0]/20 hover:bg-[#c8a0f0]/20'
                  : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                }`}>
                {tool.isPro ? '订阅解锁' : '立即配置'}
              </button>
            </div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
};


// ==========================================
// 2. 思维视图 (Mind View) - 混沌到有序的整理工作台 (全屏平铺版)
// 此处为Mock功能，等待后端接入 — 所有思绪/节点/连线/推荐均为Mock数据
// To-do: 后端已支持 listMindNodes/listMindEdges/mindSnapshotBuilder 可对接真实图谱
// To-do: 后端已支持 MindGraphSigma (Sigma 2D) 和 react-force-graph-3d (3D) 渲染
// To-do: 后端已支持 listDockItems() 可填充"散落思绪池"未链接内容
// To-do: 后端已支持 createCaptureToDocumentFlow() 可实现"注入图谱"的完整流程
// ==========================================

// Mind 类型定义
interface MindThought { id: string; title: string; type: string; tag: string; color: string; }
interface MindNode { id: string; label: string; x: number; y: number; type: 'core' | 'sub'; }
interface MindEdge { source: string; target: string; }

const MindView = () => {
  const [activeSpace, setActiveSpace] = useState('Atlax 架构设计');
  const [activeThought, setActiveThought] = useState<MindThought | null>(null);

  // 此处为Mock功能，等待后端接入 — 未链接思绪应从 listDockItems(status=pending) 获取
  const [unlinkedThoughts, setUnlinkedThoughts] = useState<MindThought[]>([
    { id: 't1', title: '关于神经深度的灵感', type: 'Audio', tag: '#Design', color: '#c8a0f0' },
    { id: 't2', title: 'Figma Token API 更新', type: 'Web', tag: '#Tech', color: '#86d7ff' },
    { id: 't3', title: 'CRDT 算法优化方向', type: 'Note', tag: '#Sync', color: '#9cf4d4' },
    { id: 't4', title: '周会 Q3 规划备忘', type: 'Meeting', tag: '#Product', color: '#ffb4ab' }
  ]);

  // 此处为Mock功能，等待后端接入 — 节点应从 listMindNodes() 获取
  const [nodes, setNodes] = useState<MindNode[]>([
    { id: 'n1', label: '空间计算 UI 范式', x: 350, y: 150, type: 'core' },
    { id: 'n2', label: '毛玻璃渲染材质', x: 220, y: 300, type: 'sub' },
    { id: 'n3', label: '光学深度与 Z 轴', x: 500, y: 280, type: 'sub' },
    { id: 'n4', label: '本地优先架构', x: 380, y: 450, type: 'core' },
  ]);

  // 此处为Mock功能，等待后端接入 — 连线应从 listMindEdges() 获取
  const [edges, setEdges] = useState<MindEdge[]>([
    { source: 'n1', target: 'n2' },
    { source: 'n1', target: 'n3' },
    { source: 'n3', target: 'n4' },
  ]);

  // --- 拖拽交互状态 ---
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragNode, setDragNode] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [drawLink, setDrawLink] = useState<{ sourceId: string; x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
    if (dragNode) {
      setNodes(prev => prev.map(n => n.id === dragNode.id ? { ...n, x: x - dragNode.offsetX, y: y - dragNode.offsetY } : n));
    }
  };

  const handlePointerUp = () => { setDragNode(null); setDrawLink(null); };

  const startNodeDrag = (e: React.PointerEvent, node: MindNode) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDragNode({ id: node.id, offsetX: e.clientX - rect.left - node.x, offsetY: e.clientY - rect.top - node.y });
    if (activeThought) setActiveThought(null);
  };

  const startDrawingLink = (e: React.PointerEvent, sourceId: string) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDrawLink({ sourceId, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const dropLinkOnNode = (e: React.PointerEvent, targetId: string) => {
    e.stopPropagation();
    if (drawLink && drawLink.sourceId !== targetId) {
      const exists = edges.find(ed => (ed.source === drawLink.sourceId && ed.target === targetId) || (ed.target === drawLink.sourceId && ed.source === targetId));
      if (!exists) setEdges([...edges, { source: drawLink.sourceId, target: targetId }]);
    }
    setDrawLink(null);
  };

  // 此处为Mock功能，等待后端接入 — 注入操作应调用 createCaptureToDocumentFlow() + upsertMindNode()
  const injectThought = () => {
    if (!activeThought) return;
    const newNodeId = `n_${Date.now()}`;
    setNodes([...nodes, { id: newNodeId, label: activeThought.title, x: 350, y: 250, type: 'sub' }]);
    setEdges([...edges, { source: 'n1', target: newNodeId }]);
    setUnlinkedThoughts(prev => prev.filter(t => t.id !== activeThought.id));
    setActiveThought(null);
  };

  return (
    <div className="w-full h-full flex animate-in fade-in duration-500 bg-[#0b0f11] text-[#e6eaed] overflow-hidden divide-x divide-white/[0.07] border-t border-white/[0.07]">

      {/* Left Pane: 混沌区 (Unlinked / Inbox) */}
      <div className="w-[240px] bg-[#0d1215] flex flex-col shrink-0 overflow-hidden">
        <div className="px-4 py-5 border-b border-white/[0.07] shrink-0">
          <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><Inbox className="w-3.5 h-3.5" /> Inbox / Unlinked</div>
          <h2 className="text-[18px] font-semibold text-white leading-tight">散落思绪池</h2>
          <p className="text-[11px] text-[#8d989f] mt-1">{unlinkedThoughts.length} 个对象等待归入图谱</p>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {unlinkedThoughts.map(thought => {
            const isSelected = activeThought?.id === thought.id;
            return (
              <div key={thought.id} onClick={() => setActiveThought(thought)}
                className={`p-3 rounded-[8px] border cursor-pointer transition-all ${isSelected ? 'bg-[#86d7ff]/[0.08] border-[#86d7ff]/30 shadow-[inset_0_1px_1px_rgba(134,215,255,0.1)]' : 'bg-transparent border-transparent hover:bg-white/[0.04]'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: thought.color }}></div>
                  <span className="text-[9px] font-semibold text-[#8d989f] uppercase tracking-wider">{thought.type}</span>
                </div>
                <h4 className={`text-[12px] font-medium leading-tight mb-2 truncate ${isSelected ? 'text-[#86d7ff]' : 'text-[#e6eaed]'}`}>{thought.title}</h4>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/[0.07] text-[#8d989f]">{thought.tag}</span>
                  <span className="text-[9px] text-[#8d989f]">Just now</span>
                </div>
              </div>
            );
          })}
          {unlinkedThoughts.length === 0 && (
            <div className="text-[11px] text-[#8d989f] text-center mt-10">收件箱已清空，所有思绪已归档。</div>
          )}
        </div>
      </div>

      {/* Center Pane: 交互式图谱 (Mind Canvas) */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0b0f11] relative">
        {/* Top View Switcher */}
        <div className="h-[48px] border-b border-white/[0.07] px-4 flex items-center justify-between bg-[#0d1215] z-10 shrink-0">
          <div className="flex items-center gap-3">
            <Network className="w-4 h-4 text-[#86d7ff]" />
            {/* 此处为Mock功能，等待后端接入 — Space列表应从 listCollections() 获取 */}
            <div className="flex bg-black/20 p-0.5 rounded-lg border border-white/[0.07]">
              {(['Atlax 架构设计', 'Q3 用户研究', '全局图谱'] as const).map(space => (
                <button key={space} onClick={() => setActiveSpace(space)}
                  className={`px-3 py-1.5 rounded-[6px] text-[11px] font-medium transition-all ${activeSpace === space ? 'bg-white/10 text-white shadow-sm' : 'text-[#8d989f] hover:text-white hover:bg-white/5'}`}>
                  {space}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-[#8d989f] flex items-center gap-1.5"><MousePointer2 className="w-3 h-3" /> 拖动节点可调整</span>
            <span className="text-[10px] text-[#8d989f] flex items-center gap-1.5"><GitCommit className="w-3 h-3" /> 拖动右侧锚点连线</span>
          </div>
        </div>

        {/* Canvas Area */}
        <div ref={canvasRef} className="flex-1 relative overflow-hidden"
          onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
          style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
          {/* SVG 连线层 */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            {edges.map((edge, idx) => {
              const src = nodes.find(n => n.id === edge.source);
              const tgt = nodes.find(n => n.id === edge.target);
              if (!src || !tgt) return null;
              return <line key={idx} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />;
            })}
            {drawLink && (
              <line x1={nodes.find(n => n.id === drawLink.sourceId)?.x || drawLink.x} y1={nodes.find(n => n.id === drawLink.sourceId)?.y || drawLink.y}
                x2={mousePos.x} y2={mousePos.y} stroke="#86d7ff" strokeWidth="2" strokeDasharray="4 4" />
            )}
          </svg>

          {/* DOM 节点层 */}
          {nodes.map(node => (
            <div key={node.id} onPointerDown={(e) => startNodeDrag(e, node)} onPointerUp={(e) => dropLinkOnNode(e, node.id)}
              className={`absolute flex items-center gap-2 px-3 py-1.5 rounded-full cursor-grab active:cursor-grabbing backdrop-blur-md border border-white/10 shadow-lg z-10 transition-shadow select-none ${node.type === 'core' ? 'bg-[#86d7ff]/10 border-[#86d7ff]/30 text-white shadow-[0_0_15px_rgba(134,215,255,0.1)]' : 'bg-[#1c2023]/80 text-[#e6eaed] hover:border-white/20'}`}
              style={{ left: node.x, top: node.y, transform: 'translate(-50%, -50%)' }}>
              {node.type === 'core' ? <Brain className="w-3.5 h-3.5 text-[#86d7ff]" /> : <FileText className="w-3 h-3 text-[#899298]" />}
              <span className="text-[12px] font-medium whitespace-nowrap">{node.label}</span>
              {/* 连线锚点 */}
              <div onPointerDown={(e) => startDrawingLink(e, node.id)}
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#1c2023] border border-white/20 flex items-center justify-center cursor-crosshair hover:bg-[#86d7ff] hover:border-[#86d7ff] transition-colors group/handle z-20">
                <div className="w-1.5 h-1.5 rounded-full bg-[#86d7ff] group-hover/handle:bg-[#0b0f11]"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Pane: 蒸馏与 AI 推荐 (Distillation) */}
      <div className="w-[300px] bg-[#0d1215] flex flex-col shrink-0 p-5 relative overflow-y-auto custom-scrollbar">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#86d7ff] to-[#c8a0f0]"></div>
        <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider flex items-center gap-1.5 mb-5 mt-1"><Wand2 className="w-3.5 h-3.5" /> Neural Distillation</div>

        {activeThought ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-[16px] font-semibold text-white leading-tight mb-2.5">{activeThought.title}</h3>
            <div className="flex gap-2 mb-6">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/[0.07] text-[10px] text-[#8d989f]">{activeThought.type}</span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/[0.07] text-[10px] text-[#8d989f]">{activeThought.tag}</span>
            </div>
            {/* 此处为Mock功能，等待后端接入 — AI推荐应从 generateBasicCandidates()/IntelligenceSpine 获取 */}
            <div className="bg-[#c8a0f0]/[0.05] border border-[#c8a0f0]/20 rounded-[12px] p-4 mb-4">
              <h4 className="text-[10px] font-bold text-[#c8a0f0] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> 知识库映射分析</h4>
              <p className="text-[11px] text-[#e0e3e6] leading-relaxed mb-4">
                基于内容语义，此对象高度契合当前图谱。AI 推荐将其作为子节点挂载。
              </p>
              <div className="bg-black/30 border border-white/5 rounded-[8px] p-3 mb-4">
                <div className="text-[10px] text-[#8d989f] mb-1.5">推荐连线至 (Target Node):</div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-white font-medium flex items-center gap-1.5"><Brain className="w-3 h-3 text-[#86d7ff]" /> 空间计算 UI 范式</span>
                  <span className="text-[10px] text-[#9cf4d4] font-mono bg-[#9cf4d4]/10 px-1.5 py-0.5 rounded border border-[#9cf4d4]/20">94% Match</span>
                </div>
              </div>
              <button onClick={injectThought}
                className="w-full h-[32px] rounded-[8px] bg-gradient-to-r from-[#86d7ff]/20 to-[#c8a0f0]/20 border border-[#c8a0f0]/30 text-white text-[12px] font-medium hover:from-[#86d7ff]/30 hover:to-[#c8a0f0]/30 transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(200,160,240,0.15)]">
                <Plus className="w-3.5 h-3.5" /> 接受并注入图谱 (Inject)
              </button>
            </div>
            <div className="text-[11px] text-[#8d989f] leading-relaxed bg-[#151a1e] p-3 rounded-lg border border-white/5">
              提示：您也可以点击此面板外的空白处取消选中，或在左侧列表选取其他思绪。注入后将自动生成对应的结构化文档草稿。
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 px-2">
            <div className="w-12 h-12 rounded-[12px] bg-white/[0.05] border border-white/[0.1] flex items-center justify-center mb-4">
              <Network className="w-5 h-5 text-[#8d989f]" />
            </div>
            <p className="text-[13px] font-medium text-white mb-1.5">等待分析流</p>
            <p className="text-[11px] text-[#8d989f] leading-relaxed">
              请在左侧&ldquo;散落思绪池&rdquo;选择一个对象，引擎将自动为您寻找最佳连线位置。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 停靠区子视图 (Dock Sub-views)
// ==========================================

// 3. 停靠区视图 (Dock View) — 知识结构控制台
// 此处为Mock功能，等待后端接入 — 所有Space/Doc/Rec数据均为Mock
// To-do: 后端已支持 listDockItems(), archiveItem(), ignoreItem(), restoreItem(), suggestItem()
// To-do: 后端已支持 getCurrentUser() 获取当前用户身份
const DockView = ({ setActiveTab }: { setActiveTab: (tab: string) => void }) => {
  const [selectedSpace, setSelectedSpace] = React.useState('Atlax 架构设计');
  const [selectedDoc, setSelectedDoc] = React.useState('空间计算 UI 范式');
  const [selectedAction, setSelectedAction] = React.useState('修复 5 个孤立节点');

  
  // 此处为Mock功能，等待后端接入
// Space Data
  const spaces = [
    { name: 'Atlax 架构设计', type: 'Project Control', health: '92%', recs: 5, active: true },
    { name: 'Q3 用户研究', type: 'Research OS', health: '85%', recs: 0, active: false },
    { name: 'Java 体系复习', type: 'Learning', health: '78%', recs: 2, active: false },
    { name: '技术博客', type: 'Content Pipeline', health: '95%', recs: 1, active: false }
  ];

  
  // 此处为Mock功能，等待后端接入
// Document Data
  const docs = [
    { type: 'Research Note', name: '空间计算 UI 范式', space: 'Atlax 架构设计', state: '待确认', tags: '#Spatial #Architecture', rec: '推荐连接到 UI Structure', score: '92%' },
    { type: 'Tech Draft', name: 'Local-first 数据同步设计', space: 'Atlax 架构设计', state: '活跃', tags: '#CRDT #Sync', rec: '建议加入数据结构链路', score: '88%' },
    { type: 'Decision', name: 'Mind 与 Dock 边界说明', space: 'Atlax 架构设计', state: '可合并', tags: '#Architecture', rec: '可关联到产品原则', score: '84%' },
    { type: 'Interview', name: '用户访谈 #12 摘要', space: 'Q3 用户研究', state: '待整理', tags: '#UserPain', rec: '建议生成洞察节点', score: '79%' },
    { type: 'Learning', name: 'JVM 内存模型复习', space: 'Java 体系复习', state: '孤立', tags: '#Java #JVM', rec: '建议连接到并发主题', score: '75%' }
  ];

  
  // 此处为Mock功能，等待后端接入
// Rec Data
  const recs = [
    { id: '修复 5 个孤立节点', type: 'Link', action: '修复 5 个孤立节点', target: 'Atlax 架构设计', impact: '+5 MindEdge', confidence: '94%' },
    { id: '合并重复 Design 标签', type: 'Merge', action: '合并重复 Design 标签', target: '14 篇文档', impact: 'tag cleanup', confidence: '88%' },
    { id: '确认 12 条落库建议', type: 'Landing', action: '确认 12 条落库建议', target: 'Capture queue', impact: '+12 events', confidence: '83%' },
    { id: '处理 8 条停滞内容', type: 'Review', action: '处理 8 条停滞内容', target: '7d untouched', impact: 'archive / revive', confidence: '71%' }
  ];

  return (
    <div className="flex w-full h-full bg-[#0b0f11] text-[#e6eaed] overflow-hidden">
      {/* B. Dock sidebar */}
      <div className="w-[224px] bg-[#0d1215] border-r border-white/[0.07] flex flex-col shrink-0">
        <div className="px-4 py-5">
          <h2 className="text-[26px] font-semibold leading-none mb-1">Dock</h2>
          <div className="text-[12px] text-[#8d989f]">知识结构控制台</div>
        </div>
        
        <div className="px-3 flex-1 space-y-1">
          <div className="h-[36px] px-2 rounded-[8px] flex items-center gap-2 cursor-pointer bg-[#86d7ff]/12 border border-[#86d7ff]/30 text-[#86d7ff]">
            <LayoutDashboard className="w-[14px] h-[14px]" />
            <span className="text-[12px] font-medium flex-1">任务控制</span>
          </div>
          <div className="h-[36px] px-2 rounded-[8px] flex items-center gap-2 cursor-pointer text-[#8d989f] hover:bg-white/5 hover:text-white transition-colors">
            <Inbox className="w-[14px] h-[14px]" />
            <span className="text-[12px] font-medium flex-1">待整理</span>
            <span className="text-[10px] bg-white/10 px-1.5 rounded-full">24</span>
          </div>
          <div className="h-[36px] px-2 rounded-[8px] flex items-center gap-2 cursor-pointer text-[#8d989f] hover:bg-white/5 hover:text-white transition-colors">
            <FolderTree className="w-[14px] h-[14px]" />
            <span className="text-[12px] font-medium flex-1">空间</span>
          </div>
          <div className="h-[36px] px-2 rounded-[8px] flex items-center gap-2 cursor-pointer text-[#8d989f] hover:bg-white/5 hover:text-white transition-colors">
            <Sparkles className="w-[14px] h-[14px]" />
            <span className="text-[12px] font-medium flex-1">推荐</span>
            <span className="text-[10px] bg-white/10 px-1.5 rounded-full">12</span>
          </div>
          <div className="h-[36px] px-2 rounded-[8px] flex items-center gap-2 cursor-pointer text-[#8d989f] hover:bg-white/5 hover:text-white transition-colors">
            <Activity className="w-[14px] h-[14px]" />
            <span className="text-[12px] font-medium flex-1">结构健康</span>
            <span className="text-[10px] bg-[#9cf4d4]/20 text-[#9cf4d4] px-1.5 rounded-full">92</span>
          </div>
        </div>

        <div className="p-3 mb-2">
          <div className="p-3 bg-[#111619] border border-white/[0.07] rounded-[12px] h-[110px] flex flex-col">
            <div className="text-[12px] font-semibold text-white mb-1">自动整理</div>
            <div className="text-[10px] text-[#8d989f] leading-relaxed flex-1 mt-1">12 条建议可预览。确认后才写入结构层。</div>
            <button className="w-full h-[28px] rounded-[8px] bg-white/10 text-[11px] font-medium text-white hover:bg-white/20 transition-colors mt-2">查看建议</button>
          </div>
        </div>
      </div>

      {/* D. Central main workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* D1. Local toolbar */}
        <div className="h-[48px] bg-[#0d1215] border-b border-white/[0.07] px-4 flex items-center justify-between shrink-0">
          <div className="flex flex-col justify-center">
            <div className="text-[9px] text-[#8d989f] uppercase tracking-wider font-semibold">Dock / {selectedSpace}</div>
            <div className="text-[14px] font-medium text-white mt-0.5">任务控制台</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-[32px] px-3 rounded-[8px] bg-white/5 border border-white/[0.07] text-[12px] text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5" /> 视图：项目控制
            </button>
            <button className="h-[32px] px-3 rounded-[8px] bg-white/5 border border-white/[0.07] text-[12px] text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" /> 筛选
            </button>
            <button className="h-[32px] px-3 rounded-[8px] bg-white/5 border border-white/[0.07] text-[12px] text-[#e6eaed] hover:bg-white/10 transition-colors flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> 自定义
            </button>
          </div>
        </div>

        {/* D2. Space switcher strip */}
        <div className="h-[78px] bg-[#0e1316] border-b border-white/[0.07] flex flex-col justify-center px-4 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <div className="text-[10px] text-[#8d989f] uppercase tracking-wider font-semibold">当前 Library / Space</div>
            <div className="text-[10px] text-[#86d7ff] cursor-pointer hover:underline">管理视图模板</div>
          </div>
          <div className="flex gap-3">
            {spaces.map(space => (
              <div 
                key={space.name}
                onClick={() => setSelectedSpace(space.name)}
                className={`flex-1 h-[54px] rounded-[8px] border p-2 cursor-pointer flex flex-col justify-between transition-colors ${selectedSpace === space.name ? 'border-[#86d7ff]/40 bg-[#86d7ff]/5' : 'border-white/[0.07] hover:border-white/20 bg-white/[0.02]'}`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-[13px] font-medium truncate ${selectedSpace === space.name ? 'text-[#86d7ff]' : 'text-[#e6eaed]'}`}>{space.name}</span>
                  <span className="text-[10px] text-[#9cf4d4]">{space.health}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-[#8d989f]">
                  <span className="truncate">{space.type}</span>
                  {space.recs > 0 && <span className="bg-[#86d7ff]/20 text-[#86d7ff] px-1.5 rounded">{space.recs} 建议</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* D3. System signal strip */}
        <div className="h-[68px] border-b border-white/[0.07] flex shrink-0 divide-x divide-white/[0.07]">
          {[
            { label: '待归类', val: '24', icon: Inbox },
            { label: '待确认建议', val: '12', icon: Sparkles },
            { label: '孤立节点', val: '15', icon: Network },
            { label: '重复主题', val: '3', icon: Layers },
            { label: '停滞内容', val: '8', icon: Clock },
            { label: '结构健康', val: '92%', icon: Activity }
          ].map(sig => (
            <div key={sig.label} className="flex-1 flex items-center justify-center gap-3 hover:bg-white/[0.02] cursor-pointer transition-colors">
              <div className="w-[28px] h-[28px] flex items-center justify-center bg-white/[0.04] rounded-md border border-white/[0.05]">
                <sig.icon className="w-4 h-4 text-[#8d989f]" />
              </div>
              <div className="flex flex-col justify-center">
                <div className="text-[18px] font-medium leading-none mb-1 text-[#e6eaed]">{sig.val}</div>
                <div className="text-[10px] text-[#8d989f] tracking-wide leading-none">{sig.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* D4. Structure worklist table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-[32px] border-b border-white/[0.055] flex items-center px-4 text-[11px] font-medium text-[#8d989f] bg-[#0b0f11] shrink-0">
            <div className="w-[32px]"></div>
            <div className="flex-1 min-w-[150px]">文档 / 节点</div>
            <div className="w-[120px]">空间</div>
            <div className="w-[80px]">状态</div>
            <div className="w-[140px]">标签</div>
            <div className="w-[160px]">建议</div>
            <div className="w-[60px] text-right">分数</div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {docs.map(doc => (
              <div 
                key={doc.name}
                onClick={() => setSelectedDoc(doc.name)}
                className={`h-[54px] border-b border-white/[0.055] flex items-center px-4 cursor-pointer transition-colors ${selectedDoc === doc.name ? 'bg-[#86d7ff]/[0.07]' : 'hover:bg-white/[0.02]'}`}
              >
                <div className="w-[32px] flex items-center justify-start text-[#8d989f]">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-[150px] pr-2 flex flex-col justify-center">
                  <div className="text-[12px] font-medium text-[#e6eaed] truncate mb-0.5">{doc.name}</div>
                  <div className="text-[10px] text-[#8d989f] truncate">{doc.type}</div>
                </div>
                <div className="w-[120px] text-[12px] text-[#8d989f] truncate pr-2">{doc.space}</div>
                <div className="w-[80px]">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${doc.state === '活跃' ? 'bg-[#9cf4d4]/10 text-[#9cf4d4] border-[#9cf4d4]/20' : doc.state === '待确认' ? 'bg-[#86d7ff]/10 text-[#86d7ff] border-[#86d7ff]/20' : doc.state === '可合并' ? 'bg-[#c8a0f0]/10 text-[#c8a0f0] border-[#c8a0f0]/20' : doc.state === '孤立' ? 'bg-[#ffb4ab]/10 text-[#ffb4ab] border-[#ffb4ab]/20' : 'bg-white/10 text-[#8d989f] border-white/10'}`}>
                    {doc.state}
                  </span>
                </div>
                <div className="w-[140px] text-[10px] text-[#8d989f] truncate pr-2">{doc.tags}</div>
                <div className="w-[160px] text-[11px] text-[#e6eaed] truncate pr-2">{doc.rec}</div>
                <div className="w-[60px] text-right text-[12px] font-medium text-[#8d989f]">{doc.score}</div>
              </div>
            ))}
          </div>
        </div>

        {/* D5. Recommendation queue strip */}
        <div className="h-[110px] border-t border-white/[0.07] bg-[#0b0f11] flex flex-col justify-center px-4 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider">推荐队列</div>
            <div className="text-[10px] text-[#86d7ff] cursor-pointer hover:underline">全部预览</div>
          </div>
          <div className="flex gap-3">
            {recs.map(rec => (
              <div 
                key={rec.id}
                onClick={() => setSelectedAction(rec.id)}
                className={`flex-1 h-[86px] border-r border-white/[0.07] p-2 cursor-pointer flex flex-col justify-between transition-colors ${selectedAction === rec.id ? 'bg-[#86d7ff]/5' : 'hover:bg-white/[0.02]'}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <Sparkles className="w-3 h-3 text-[#c8a0f0] shrink-0" />
                    <span className="text-[11px] font-medium text-[#e6eaed] truncate">{rec.action}</span>
                  </div>
                  <span className="text-[9px] bg-[#c8a0f0]/10 text-[#c8a0f0] px-1 rounded border border-[#c8a0f0]/20 shrink-0 ml-1">{rec.confidence}</span>
                </div>
                <div className="text-[10px] text-[#8d989f] truncate mt-auto">
                  <span className="text-[#86d7ff]">{rec.type}</span> • {rec.target}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* E. Right inspector panel */}
      <div className="w-[318px] bg-[#0d1215] border-l border-white/[0.07] flex flex-col shrink-0 p-4 relative">
        {/* 1. Header */}
        <div className="mb-5">
          <div className="text-[9px] font-semibold text-[#8d989f] uppercase tracking-wider mb-2">Inspector</div>
          <div className="text-[16px] font-semibold text-white leading-tight mb-1">{selectedDoc}</div>
          <div className="text-[11px] text-[#8d989f]">Research Note · {selectedSpace} · 2h</div>
        </div>

        {/* 2. 当前建议 */}
        <div className="mb-5 p-3 bg-[#c8a0f0]/[0.08] border border-[#c8a0f0]/30 rounded-[12px]">
          <div className="flex items-center gap-1.5 mb-2 text-[#c8a0f0]">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[12px] font-medium">{selectedAction}</span>
          </div>
          <div className="text-[11px] text-[#e6eaed] mb-1">目标：{recs.find(r => r.id === selectedAction)?.target}</div>
          <div className="text-[11px] text-[#e6eaed] mb-3">影响：{recs.find(r => r.id === selectedAction)?.impact}</div>
          <div className="flex gap-2">
            <button className="flex-1 h-[28px] rounded-[8px] bg-[#c8a0f0]/20 text-[#c8a0f0] text-[11px] font-medium hover:bg-[#c8a0f0]/30 transition-colors">预览方案</button>
            <button className="px-3 h-[28px] rounded-[8px] bg-white/5 text-[#8d989f] text-[11px] font-medium hover:bg-white/10 transition-colors">忽略</button>
          </div>
        </div>

        {/* 3. 属性 table */}
        <div className="mb-5">
          <div className="text-[10px] font-semibold text-[#8d989f] uppercase tracking-wider mb-2">Properties</div>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Space</span>
              <span className="text-[#e6eaed]">{selectedSpace}</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Lens</span>
              <span className="text-[#e6eaed]">Project Control</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">State</span>
              <span className="text-[#86d7ff]">活跃</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Score</span>
              <span className="text-[#9cf4d4]">92%</span>
            </div>
            <div className="flex items-center justify-between h-[32px] text-[12px]">
              <span className="text-[#8d989f]">Tags</span>
              <span className="text-[#e6eaed] truncate max-w-[150px]">#Spatial #Architecture</span>
            </div>
          </div>
        </div>

        {/* 4. 操作规则 */}
        <div className="p-3 bg-[#151a1e] border border-white/[0.07] rounded-[12px] mb-auto">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#8d989f] shrink-0 mt-0.5" />
            <div className="text-[11px] text-[#8d989f] leading-relaxed">
              Dock 内默认只做预览、确认、整理和结构治理；点击“打开 Editor”才进入编辑器。点击 Space 不跳出 Dock，而是在当前 Dock 内切换 Space Scope 和 Lens。
            </div>
          </div>
        </div>

        {/* 5. Bottom actions */}
        <div className="flex gap-2 mt-4">
          <button 
            onClick={() => setActiveTab('editor')}
            className="flex-1 h-[32px] rounded-[8px] bg-white text-[#0b0f11] text-[12px] font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <PenTool className="w-3.5 h-3.5" /> 打开 Editor
          </button>
          <button 
            onClick={() => setActiveTab('mind')}
            className="flex-1 h-[32px] rounded-[8px] bg-white/10 text-white text-[12px] font-medium hover:bg-white/20 transition-colors flex items-center justify-center gap-1.5"
          >
            <Network className="w-3.5 h-3.5" /> 在 Mind 查看
          </button>
        </div>
      </div>
    </div>
  );
};


// 4. 编辑器视图 (Editor View) — 已替换为 DraftEditorView 组件
// 旧 mock EditorView 已移除，真实 Draft 编辑功能见 features/editor/DraftEditorView.tsx

// 5. 回顾视图 (Review View) - 高密度聚合仪表盘
// 此处为Mock功能，等待后端接入 — 所有统计数据、周总结、复盘内容均为Mock数据
const ReviewView = () => {
  const [isPeriodDropdownOpen, setIsPeriodDropdownOpen] = useState(false);
  const [periodType, setPeriodType] = useState<'日' | '周' | '月' | '年'>('周');

  const periodOptions: ('日' | '周' | '月' | '年')[] = ['日', '周', '月', '年'];

  // 模拟各个周期维度的历史报告数据
  const historyData: Record<string, string[]> = {
    '日': ['今天 (05.07)', '昨天 (05.06)', '前天 (05.05)', '选择其他日期...'],
    '周': ['本周 (05.01-05.07)', '上周 (04.24-04.30)', '前周 (04.17-04.23)', '查看更多历史周报...'],
    '月': ['本月 (2026年5月)', '上月 (2026年4月)', '2026年3月', '查看更多历史月报...'],
    '年': ['今年 (2026)', '去年 (2025)', '2024', '查看更多历史年报...']
  };

  return (
    <div className="max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-12">

      {/* 头部标题与控制区 */}
      <div className="mb-4 mt-2 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold mb-1 text-white tracking-tight">系统回顾与{periodType}报</h1>
          <p className="text-[#899298] text-[11px]">周期: 2026.05.01 - 2026.05.07 • 维护您的数字花园健康与项目流转</p>
        </div>

        <div className="flex items-center gap-3">
          {/* 周期/历史视图切换器 */}
          <div className="relative">
            <button
              onClick={() => setIsPeriodDropdownOpen(!isPeriodDropdownOpen)}
              className={`px-3 py-1.5 rounded-full border text-[10px] text-white flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,255,255,0.05)] transition-colors ${isPeriodDropdownOpen ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            >
              <Calendar className="w-3 h-3" /> {periodType}视图 <ChevronDown className="w-3 h-3 opacity-50" />
            </button>

            {/* 下拉历史报表选择面板 */}
            {isPeriodDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[#1c2023]/95 backdrop-blur-[40px] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2">
                  {/* 顶部分类 Tabs */}
                  <div className="flex bg-black/20 rounded-lg p-1 mb-2">
                    {periodOptions.map(pt => (
                      <button
                        key={pt}
                        onClick={() => setPeriodType(pt)}
                        className={`flex-1 text-[10px] py-1.5 rounded-md transition-all duration-200 ${periodType === pt ? 'bg-[#86d7ff]/20 text-[#86d7ff] font-medium shadow-sm' : 'text-[#899298] hover:text-white hover:bg-white/5'}`}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>

                  {/* 历史记录列表 */}
                  <div className="px-2 py-1">
                    <div className="text-[9px] font-semibold tracking-wider text-[#899298] uppercase mb-2">往期{periodType}报告</div>
                    <div className="space-y-0.5">
                      {historyData[periodType].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => setIsPeriodDropdownOpen(false)}
                          className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors flex items-center justify-between ${idx === 0 ? 'bg-white/10 text-white' : 'text-[#e0e3e6] hover:bg-white/5 hover:text-white'}`}
                        >
                          <span>{item}</span>
                          {/* 默认第一项为当前选中项 */}
                          {idx === 0 && <CheckCircle2 className="w-3 h-3 text-[#9cf4d4]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 shadow-[0_0_10px_rgba(255,255,255,0.05)]">
            <Download className="w-3 h-3" /> 导出报告
          </button>
        </div>
      </div>

      {/* ==========================================
          核心数据面板 (Core Data Panel) - 纯线条分割
          ========================================== */}
      <div className="bg-[#1c2023]/40 backdrop-blur-[20px] border border-white/5 rounded-[16px] overflow-hidden flex flex-col divide-y divide-white/5 mb-6 shadow-xl">

        {/* Row 1: 文本洞察与状态摘要 */}
        <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          {/* Col 1: 核心健康度 */}
          <div className="p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5 mb-3"><Activity className="w-3 h-3 text-[#9cf4d4]" /> 核心健康度</h3>
              <div className="flex items-end gap-1.5 mb-4">
                <span className="text-4xl font-bold text-white leading-none">92</span>
                <span className="text-xs text-[#899298] mb-1">/100</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#899298]">陈旧捕获</span>
                <span className="text-[#ffb4ab]">14 条待清</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#899298]">标签冗余</span>
                <span className="text-[#a8c8ff]">3 组建议合并</span>
              </div>
            </div>
          </div>

          {/* Col 2: 本周总结 */}
          <div className="p-4">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-3 flex items-center gap-1.5"><FileText className="w-3 h-3 text-[#86d7ff]" /> 本周总结</h3>
            <p className="text-[11px] text-[#e0e3e6] leading-relaxed text-justify">
              本周您的知识捕获量较上周提升了 <span className="text-[#9cf4d4] font-medium">15%</span>。在“空间计算”领域的探索逐渐深入，相关笔记数量达到 24 篇。整体系统保持健康，但仍有少量碎片信息停留在收件箱中未被处理。
            </p>
          </div>

          {/* Col 3: 本周复盘 */}
          <div className="p-4">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-3 flex items-center gap-1.5"><Target className="w-3 h-3 text-[#c8a0f0]" /> 本周复盘</h3>
            <ul className="space-y-2.5 text-[11px] text-[#e0e3e6]">
              <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3 h-3 text-[#9cf4d4] shrink-0 mt-0.5" /> 成功构建了本地优先架构的基础知识图谱。</li>
              <li className="flex items-start gap-1.5"><AlertCircle className="w-3 h-3 text-[#ffb4ab] shrink-0 mt-0.5" /> 对 React 性能优化的学习缺乏深度，笔记多为搬运。</li>
              <li className="flex items-start gap-1.5"><Sparkles className="w-3 h-3 text-[#86d7ff] shrink-0 mt-0.5" /> 建议下周重点输出一篇关于 UI 设计令牌的文章。</li>
            </ul>
          </div>

          {/* Col 4: 知识库本周状态 */}
          <div className="p-4 flex flex-col">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-3 flex items-center gap-1.5"><Database className="w-3 h-3 text-white" /> 知识库周状态</h3>
            <div className="space-y-3 flex-1 justify-center flex flex-col">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#e0e3e6] flex items-center gap-1.5"><FolderTree className="w-3 h-3 text-[#86d7ff]" /> Atlax 架构</span>
                <span className="text-[#9cf4d4]">+12 活跃</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#e0e3e6] flex items-center gap-1.5"><FolderTree className="w-3 h-3 text-[#9cf4d4]" /> 用户研究</span>
                <span className="text-[#899298]">稳定</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#e0e3e6] flex items-center gap-1.5"><FolderTree className="w-3 h-3 text-[#c8a0f0]" /> 设计规范</span>
                <span className="text-[#9cf4d4]">+3 更新</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: 数据流转漏斗 (Quick Notes & Drafts) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          {/* Quick Notes 状态 */}
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><Command className="w-3 h-3 text-white" /> Quick Notes 周吞吐量</h3>
              <span className="text-[8px] text-[#899298] border border-white/10 px-1.5 py-0.5 rounded uppercase">本周</span>
            </div>
            <div className="flex items-center justify-between mt-2 bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-white">56</span><span className="text-[9px] text-[#899298] mt-0.5">记录</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#9cf4d4]">32</span><span className="text-[9px] text-[#899298] mt-0.5">落库</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#ffb4ab]">8</span><span className="text-[9px] text-[#899298] mt-0.5">丢弃</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#86d7ff]">16</span><span className="text-[9px] text-[#899298] mt-0.5">未处理</span></div>
            </div>
          </div>

          {/* Drafts 状态 */}
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><PenTool className="w-3 h-3 text-white" /> Drafts 草稿箱流转</h3>
              <span className="text-[8px] text-[#899298] border border-white/10 px-1.5 py-0.5 rounded uppercase">本周</span>
            </div>
            <div className="flex items-center justify-between mt-2 bg-white/[0.02] rounded-xl p-3 border border-white/5">
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-white">24</span><span className="text-[9px] text-[#899298] mt-0.5">起草</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#9cf4d4]">10</span><span className="text-[9px] text-[#899298] mt-0.5">已发布</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#ffb4ab]">2</span><span className="text-[9px] text-[#899298] mt-0.5">废弃</span></div>
              <ChevronRight className="w-3.5 h-3.5 text-white/10" />
              <div className="flex flex-col items-center w-12"><span className="text-sm font-bold text-[#a8c8ff]">12</span><span className="text-[9px] text-[#899298] mt-0.5">搁置中</span></div>
            </div>
          </div>
        </div>

        {/* Row 3: 可视化与清理任务 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/5">
          {/* 周 Mind 视图 (占2列) */}
          <div className="lg:col-span-2 p-4 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><Network className="w-3 h-3 text-[#86d7ff]" /> 周 Mind 视图拓扑 (新增连接)</h3>
              <span className="text-[9px] text-[#86d7ff] bg-[#86d7ff]/10 border border-[#86d7ff]/20 px-2 py-0.5 rounded-full">+48 边 / +12 节点</span>
            </div>
            {/* 缩小版网络图谱渲染区 */}
            <div className="flex-1 bg-black/20 border border-white/5 rounded-xl relative overflow-hidden flex items-center justify-center min-h-[140px] group cursor-pointer">
              <div className="absolute inset-0 opacity-20 transition-opacity group-hover:opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #86d7ff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              <span className="absolute z-20 text-[9px] text-white bg-black/50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">点击进入完整 3D 视图</span>

              {/* Mock 节点连线 */}
              <svg className="absolute inset-0 w-full h-full opacity-40"><line x1="30%" y1="30%" x2="50%" y2="50%" stroke="#86d7ff" strokeWidth="1.5" /><line x1="50%" y1="50%" x2="40%" y2="70%" stroke="#9cf4d4" strokeWidth="1.5" /><line x1="30%" y1="30%" x2="70%" y2="40%" stroke="white" strokeWidth="0.5" /><line x1="70%" y1="40%" x2="50%" y2="50%" stroke="#c8a0f0" strokeWidth="1" /></svg>

              {/* Mock 节点实体 */}
              <div className="absolute w-3 h-3 rounded-full bg-[#86d7ff] top-[30%] left-[30%] shadow-[0_0_12px_#86d7ff]"></div>
              <div className="absolute w-4 h-4 rounded-full bg-[#9cf4d4] top-[50%] left-[50%] shadow-[0_0_15px_#9cf4d4]"></div>
              <div className="absolute w-2.5 h-2.5 rounded-full bg-[#c8a0f0] top-[70%] left-[40%] shadow-[0_0_10px_#c8a0f0]"></div>
              <div className="absolute w-2 h-2 rounded-full bg-white top-[40%] left-[70%]"></div>
            </div>
          </div>

          {/* 待清理任务 */}
          <div className="p-4 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><Trash2 className="w-3 h-3 text-[#ffb4ab]" /> 待清理建议</h3>
              <button className="text-[9px] text-[#86d7ff] hover:underline">一键执行 (3)</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-1.5">
              {[
                { title: "未命名的截图 2026-04-20", type: "孤立文件", action: "删除" },
                { title: "React 性能优化", type: "内容高度重合", action: "合并" },
                { title: "标签: 'design' & 'Design'", type: "大小写重复", action: "合一" },
              ].map((item, i) => (
                <div key={i} className="bg-white/[0.02] hover:bg-white/5 border border-white/5 rounded-lg p-2.5 flex justify-between items-center group transition-colors cursor-pointer">
                  <div className="overflow-hidden flex-1 pr-2">
                    <p className="text-[11px] text-white truncate mb-0.5">{item.title}</p>
                    <p className="text-[9px] text-[#ffb4ab]">{item.type}</p>
                  </div>
                  <button className="text-[9px] px-2 py-1 rounded bg-white/5 text-[#899298] opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-white transition-all">
                    {item.action}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          扩展简报/定制看板 (Pro Feature Showcase)
          ========================================== */}
      <div className="bg-gradient-to-br from-[#c8a0f0]/10 to-transparent backdrop-blur-[20px] border border-[#c8a0f0]/20 rounded-[16px] overflow-hidden flex flex-col divide-y divide-[#c8a0f0]/10 shadow-lg">

        {/* 顶栏标识 */}
        <div className="px-5 py-2.5 bg-[#c8a0f0]/5 flex items-center justify-between border-b border-[#c8a0f0]/10">
          <h2 className="text-[10px] font-bold text-[#c8a0f0] uppercase tracking-widest flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" /> 定制简报模块 (外部工作流接入)
          </h2>
          <span className="text-[9px] bg-[#c8a0f0]/20 text-[#c8a0f0] px-2 py-0.5 rounded-full border border-[#c8a0f0]/30 cursor-pointer hover:bg-[#c8a0f0]/30 transition-colors">配置展示位</span>
        </div>

        {/* 外部业务数据网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-[#c8a0f0]/10">
          {/* 周项目进度 */}
          <div className="p-5">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-4 flex items-center gap-1.5"><PieChart className="w-3 h-3 text-white" /> 周项目追踪</h3>
            <div className="mb-4">
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[11px] text-white font-medium">Atlax V2.0 Beta 冲刺</span>
                <span className="text-[10px] text-[#86d7ff] font-bold">78%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-[#86d7ff] rounded-full" style={{ width: '78%' }}></div></div>
            </div>
            <div>
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-[11px] text-[#e0e3e6] font-medium">Q3 宣发物料准备</span>
                <span className="text-[10px] text-[#9cf4d4] font-bold">45%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-[#9cf4d4] rounded-full" style={{ width: '45%' }}></div></div>
            </div>
          </div>

          {/* 看板流转统计 */}
          <div className="p-5">
            <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase mb-4 flex items-center gap-1.5"><Kanban className="w-3 h-3 text-white" /> 周项目看板 (Linear)</h3>
            <div className="flex gap-2.5 h-16">
              <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#9cf4d4]">12</span>
                <span className="text-[8px] text-[#899298] uppercase tracking-wider mt-0.5">已完成 (Done)</span>
              </div>
              <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#86d7ff]">5</span>
                <span className="text-[8px] text-[#899298] uppercase tracking-wider mt-0.5">进行中 (Doing)</span>
              </div>
              <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-lg flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#ffb4ab]">2</span>
                <span className="text-[8px] text-[#899298] uppercase tracking-wider mt-0.5">已阻塞 (Blocked)</span>
              </div>
            </div>
          </div>

          {/* Todo List 进展 */}
          <div className="p-5">
            <div className="flex justify-between items-center mb-3.5">
              <h3 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase flex items-center gap-1.5"><CheckSquare className="w-3 h-3 text-white" /> 个人 Todo 进展</h3>
              <span className="text-[9px] text-[#9cf4d4] bg-[#9cf4d4]/10 px-1.5 py-0.5 rounded border border-[#9cf4d4]/20">45/52 完成</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#9cf4d4] shrink-0 mt-0.5" />
                <span className="text-[11px] text-[#e0e3e6] line-through">更新空间 UI 设计规范文档</span>
              </div>
              <div className="flex items-start gap-2 opacity-50">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#9cf4d4] shrink-0 mt-0.5" />
                <span className="text-[11px] text-[#e0e3e6] line-through">修复编辑器左侧状态栏遮挡 Bug</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-3.5 h-3.5 border border-white/30 rounded shrink-0 mt-0.5 flex items-center justify-center hover:border-white transition-colors cursor-pointer"></div>
                <span className="text-[11px] text-white">筹备下周的同步架构技术评审</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 6. 设置视图 (Settings View)
// 此处为Mock功能，等待后端接入 — 金库路径、同步状态均为Mock数据
const SettingsView = () => (
  <div className="max-w-[600px] mx-auto animate-in fade-in duration-500">
    <div className="mb-6 mt-2">
      <h1 className="text-3xl font-semibold mb-2 text-white tracking-tight">系统设置</h1>
      <p className="text-[#899298] text-sm">配置您的本地金库与同步偏好。</p>
    </div>

    <div className="space-y-4">
      <GlassPanel className="p-6">
        <h2 className="text-base font-medium text-white mb-4 border-b border-white/10 pb-3 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[#86d7ff]" /> 本地存储库 (Local Vault)
        </h2>

        <div className="space-y-5">
          <div>
            <label className="text-xs text-[#899298] block mb-1.5">金库路径</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value="/Users/Admin/Documents/MindDock_Vault"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e0e3e6] focus:outline-none focus:border-[#86d7ff]/50"
              />
              <button className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition-colors">更改位置</button>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-white text-xs font-medium">离线优先模式</p>
              <p className="text-[#899298] text-[10px] mt-0.5">所有数据首先保存在本地设备上，确保断网可用。</p>
            </div>
            <div className="w-8 h-5 bg-[#86d7ff] rounded-full relative cursor-pointer shadow-[0_0_10px_rgba(134,215,255,0.3)]">
              <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#0b0f11] rounded-full"></div>
            </div>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="p-6">
        <h2 className="text-base font-medium text-white mb-4 border-b border-white/10 pb-3 flex items-center gap-2">
          <Cloud className="w-4 h-4 text-[#86d7ff]" /> 同步提供商
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 border border-[#86d7ff]/30 bg-[#86d7ff]/5 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                <Cloud className="w-4 h-4 text-[#86d7ff]" />
              </div>
              <div>
                <p className="text-white text-xs font-medium">Atlax Cloud 同步 (E2EE)</p>
                <p className="text-[#86d7ff] text-[10px] mt-0.5">已连接并实时同步中</p>
              </div>
            </div>
            <button className="text-xs text-[#899298] hover:text-white">断开连接</button>
          </div>
          <div className="flex items-center justify-between p-3 border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-[#899298]" />
              </div>
              <div>
                <p className="text-white text-xs font-medium">自托管 (WebDAV / S3)</p>
                <p className="text-[#899298] text-[10px] mt-0.5">连接到您自己的服务器</p>
              </div>
            </div>
            <span className="text-[#899298] text-xs">→</span>
          </div>
        </div>
      </GlassPanel>
    </div>
  </div>
);

// 7. 每日简报视图 (Daily Briefing View)
// 此处为Mock功能，等待后端接入 — 所有简报内容、进展、推荐均为Mock数据
const DailyBriefingView = () => {
  const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  return (
    <div className="max-w-[1200px] mx-auto animate-in fade-in duration-500 pb-12">
      {/* Newspaper Header */}
      <div className="border-b-[1.5px] border-white/20 pb-6 mb-8 pt-8">
        <h1 className="text-5xl font-bold tracking-tighter text-white uppercase text-center mb-4">Atlax Daily Briefing</h1>
        <div className="flex justify-between items-center text-[#899298] text-[10px] font-semibold tracking-widest uppercase border-y border-white/10 py-2.5">
          <span>Vol. 042</span>
          <span>{currentDate}</span>
          <span>Personal Edition</span>
        </div>
      </div>

      {/* Main Grid - Newspaper columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative">

        {/* Left Column (Main Article) */}
        <div className="lg:col-span-8 flex flex-col gap-10">

          {/* 昨日Mind视图 */}
          <section>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-5">
              <Network className="w-5 h-5 text-[#86d7ff]" />
              <h2 className="text-xl font-bold text-white tracking-tight uppercase">昨日 Mind 视图拓扑</h2>
            </div>

            <div className="aspect-[21/9] border border-white/5 bg-[#1c2023]/40 rounded-sm relative overflow-hidden flex items-center justify-center group mb-5">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #86d7ff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
              <div className="absolute w-40 h-40 border border-[#86d7ff]/20 rounded-full animate-[spin_60s_linear_infinite]"></div>
              <div className="absolute w-60 h-60 border border-white/5 rounded-full animate-[spin_90s_linear_infinite_reverse]"></div>
              <div className="relative z-10 text-center">
                <div className="w-12 h-12 rounded-full bg-[#86d7ff]/10 border border-[#86d7ff]/30 backdrop-blur-md flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-6 h-6 text-[#86d7ff]" />
                </div>
                <p className="text-xs text-[#899298] tracking-widest uppercase">3 Clusters • 12 New Edges</p>
              </div>
            </div>
            <p className="text-sm text-[#e0e3e6] leading-relaxed columns-1 md:columns-2 gap-8 text-justify">
              昨日您的神经图谱在<span className="text-[#86d7ff] font-medium">“空间计算”</span>与<span className="text-[#86d7ff] font-medium">“本地优先架构”</span>领域产生了高度的活跃。图谱算法为您自动建立并强化了多条新的语义链接，形成了一个连贯的思想脉络。这可能成为您下一篇技术博文的绝佳基础。您的数字花园正在茁壮成长，我们建议您进入“思维”选项卡进行深度整理。
            </p>
          </section>

          <hr className="border-t border-white/10 border-b-0" />

          {/* 昨日进展 & 今日推荐 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <section className="md:border-r border-white/10 md:pr-10">
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#9cf4d4]" /> 昨日进展简述
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#9cf4d4] shrink-0 mt-0.5" />
                  <span className="text-sm text-[#e0e3e6] leading-relaxed">完成了《Atlax 项目宣言》的初步修订并保存至本地金库。</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#9cf4d4] shrink-0 mt-0.5" />
                  <span className="text-sm text-[#e0e3e6] leading-relaxed">捕获了 14 条全新的网页剪报和 3 段音频备忘录。</span>
                </li>
                <li className="flex items-start gap-3 opacity-60">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0 mt-0.5" />
                  <span className="text-sm text-white leading-relaxed">系统自动清理并合并了 5 个陈旧的相似标签。</span>
                </li>
              </ul>
            </section>

            <section>
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#c8a0f0]" /> 今日重点推进
              </h3>
              <div className="space-y-6">
                <div className="group cursor-pointer">
                  <h4 className="text-sm font-semibold text-white group-hover:text-[#86d7ff] transition-colors mb-1">接续撰写: 空间界面</h4>
                  <p className="text-xs text-[#899298] leading-relaxed">
                    您的草稿《空间界面作为认知脚手架》已停滞。建议今天投入 25 分钟补全缺失的结论部分。
                  </p>
                </div>
                <div className="group cursor-pointer">
                  <h4 className="text-sm font-semibold text-white group-hover:text-[#86d7ff] transition-colors mb-1">回顾文献: CRDT 算法</h4>
                  <p className="text-xs text-[#899298] leading-relaxed">
                    您有 3 篇关于本地优先同步架构的未读高优文献，停留在您的阅读缓冲区。
                  </p>
                </div>
              </div>
            </section>
          </div>

        </div>

        {/* Vertical divider line for large screens */}
        <div className="hidden lg:block absolute left-[66.666%] top-0 bottom-0 w-px bg-white/10"></div>

        {/* Right Column (Side Panels) */}
        <div className="lg:col-span-4 flex flex-col gap-8 lg:pl-4">

          {/* Quick Notes & Drafts Status */}
          <section>
            <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-wider border-b border-white/10 pb-2">缓冲区载荷监控</h3>
            <div className="space-y-5">
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-xs text-[#899298] flex items-center gap-1.5"><Command className="w-3.5 h-3.5" /> Quick Notes</span>
                  <span className="text-xs font-semibold text-[#ffb4ab]">8 待处理</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-[#ffb4ab]" style={{ width: '75%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-xs text-[#899298] flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Drafts 积压</span>
                  <span className="text-xs font-semibold text-[#a8c8ff]">12 份草稿</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-[#a8c8ff]" style={{ width: '45%' }}></div>
                </div>
              </div>
            </div>
          </section>

          {/* 各个知识库状态 */}
          <section>
            <h3 className="text-xs font-bold text-white mb-3 uppercase tracking-wider border-b border-white/10 pb-2">金库同步追踪</h3>
            <div className="divide-y divide-white/5">
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#e0e3e6] group-hover:text-white transition-colors">Atlax 架构设计</span>
                <span className="text-[10px] text-[#9cf4d4] font-mono">+12 新节点</span>
              </div>
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#e0e3e6] group-hover:text-white transition-colors">设计规范 V2</span>
                <span className="text-[10px] text-[#9cf4d4] font-mono">+3 新节点</span>
              </div>
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#899298] group-hover:text-white transition-colors">用户研究数据库</span>
                <span className="text-[10px] text-[#899298] font-mono">稳定</span>
              </div>
              <div className="py-2.5 flex justify-between items-center group">
                <span className="text-xs text-[#899298] group-hover:text-white transition-colors">Q3 财务规划</span>
                <span className="text-[10px] text-[#899298] font-mono">稳定</span>
              </div>
            </div>
          </section>

          {/* 定制化看板预留 (Pro Feature) */}
          <section className="mt-2 border border-dashed border-[#c8a0f0]/30 bg-gradient-to-b from-[#c8a0f0]/5 to-transparent rounded-lg p-5 relative overflow-hidden group cursor-pointer hover:border-[#c8a0f0]/50 transition-colors">
            <div className="absolute top-0 right-0 bg-[#c8a0f0]/20 text-[#c8a0f0] text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider flex items-center gap-1">
              <Crown className="w-3 h-3" /> Pro 模块
            </div>
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-[#c8a0f0]" /> 业务定制看板
            </h3>
            <p className="text-xs text-[#899298] mb-5 leading-relaxed">
              您的工作流不仅限于知识。将 Jira、Linear 或 GitHub Issues 无缝集成到您的每日简报中。
            </p>
            <div className="grid grid-cols-2 gap-3 opacity-40 group-hover:opacity-80 transition-opacity">
              <div className="h-14 bg-[#1c2023]/40 rounded-md border border-white/10 flex flex-col items-center justify-center">
                <CheckCircle2 className="w-4 h-4 mb-1.5 text-[#86d7ff]" />
                <span className="text-[9px] text-white">Todo-list</span>
              </div>
              <div className="h-14 bg-[#1c2023]/40 rounded-md border border-white/10 flex flex-col items-center justify-center">
                <Layers className="w-4 h-4 mb-1.5 text-[#9cf4d4]" />
                <span className="text-[9px] text-white">项目进度</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};

// ==========================================
// 主应用壳 (Main App Shell)
// ==========================================

export default function WorkspacePage() {
  // ==========================================
  // To-do: 后端支持但当前设计未实现的功能
  // - handleLogout() (用户登出)
  // - loadData() (获取真实 Dock Items)
  // - handleCapture() (全局捕获新内容并入库)
  // - handleSaveEditor() (保存编辑器草稿或内容)
  // - loadItemRecommendations() (加载真实推荐数据)
  // - loadMindData() (加载真实图谱节点/边)
  // - WorkspaceTabs持久化逻辑 (openWorkspaceTab, etc.)
  // ==========================================

  const [activeTab, setActiveTab] = useState('home');
  const [showSourcePacket, setShowSourcePacket] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);
  const [userId, setUserId] = useState('_legacy');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const user = getCurrentUser()
    if (user) setUserId(user.id)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }, [])

  // 聚焦搜索相关状态
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navItems = [
    { id: 'home', icon: Home, label: '主页' },
    { id: 'mind', icon: Brain, label: '思维' },
    { id: 'dock', icon: Archive, label: '停靠区' },
    { id: 'editor', icon: PenTool, label: '编辑器' },
    { id: 'review', icon: BookOpen, label: '回顾' },
  ];

  // 监听全局快捷键唤起搜索 (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 搜索框关闭时清空输入
  useEffect(() => {
    if (!isSearchOpen) {
      setTimeout(() => setSearchQuery(''), 200);
    }
  }, [isSearchOpen]);

  return (
    <div className="min-h-screen bg-[#0b0f11] text-[#e0e3e6] font-sans selection:bg-[#86d7ff]/30 selection:text-white flex relative overflow-hidden">

      {/* A. Global Rail */}
      <aside className="fixed left-0 top-0 h-full z-50 bg-[#0b0f11] w-[48px] flex flex-col items-center py-4 border-r border-white/[0.07]">
        {/* Top logo mark */}
        <div className="mb-6 relative group cursor-pointer flex items-center justify-center w-8 h-8">
          <div className="absolute w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_10px_rgba(156,176,255,0.5),0_0_0_1.5px_rgba(156,176,255,0.7)] group-hover:scale-[1.02] z-0"></div>
          <div className="relative w-7 h-7 rounded-lg bg-gradient-to-br from-[#9cb0ff] to-[#6a7efc] shadow-[inset_0_1.5px_4px_rgba(255,255,255,0.5),0_3px_8px_rgba(0,0,0,0.2)] flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02] z-10 overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent"></div>
            <div className="relative w-1.5 h-1.5 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.3)]"></div>
          </div>
        </div>

        {/* Vertical icon navigation */}
        <nav className="flex flex-col gap-3 items-center flex-1 w-full">
          {navItems.map((item) => {
            const isActive = activeTab === item.id || (item.id === 'home' && activeTab === 'toolbox');
            return (
              <div
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`group cursor-pointer flex items-center justify-center w-[32px] h-[32px] rounded-[8px] relative transition-all ${isActive ? 'text-[#86d7ff] bg-white/5' : 'text-[#8d989f] hover:text-white hover:bg-white/5'}`}
              >
                {isActive && (
                  <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[2px] h-[16px] bg-[#86d7ff] rounded-r-full shadow-[0_0_8px_#86d7ff]"></div>
                )}
                <item.icon className="w-[16px] h-[16px]" />
              </div>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center w-full gap-3">
          <div
            onClick={() => setIsSearchOpen(true)}
            className="group cursor-pointer flex items-center justify-center w-[32px] h-[32px] rounded-[8px] transition-all text-[#8d989f] hover:text-white hover:bg-white/5"
          >
            <Search className="w-[16px] h-[16px]" />
          </div>

          <div
            onClick={() => setActiveTab('settings')}
            className={`group cursor-pointer flex items-center justify-center w-[32px] h-[32px] rounded-[8px] relative transition-all ${activeTab === 'settings' ? 'text-[#86d7ff] bg-white/5' : 'text-[#8d989f] hover:text-white hover:bg-white/5'}`}
          >
             {activeTab === 'settings' && (
                  <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-[2px] h-[16px] bg-[#86d7ff] rounded-r-full shadow-[0_0_8px_#86d7ff]"></div>
              )}
            <Settings className="w-[16px] h-[16px]" />
          </div>
        </div>
      </aside>

      {/* 顶部栏 & 主内容区 */}
      <div className="flex-1 ml-[48px] flex flex-col h-screen relative z-10">
        {/* C. Top bar */}
        <header className="flex justify-between items-center px-4 h-[44px] bg-[#0b0f11]/90 border-b border-white/[0.07] shrink-0 sticky top-0 z-40 backdrop-blur-md">
          {activeTab === 'editor' ? (
            <>
              {/* 编辑器特定面包屑导航 */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[#899298] hover:text-white cursor-pointer transition-colors">Atlax</span>
                <span className="text-[#899298]">/</span>
                <span className="text-[#899298] hover:text-white cursor-pointer transition-colors">编辑器</span>
                <span className="text-[#899298]">/</span>
                <span className="text-white font-medium cursor-pointer">空间界面作为认知...</span>
              </div>

              {/* 编辑器特定操作按钮 */}
              <div className="flex items-center gap-3">
                {/* 更多选项按钮 (下拉菜单) */}
                <div className="relative">
                  <button
                    onClick={() => setShowOptionsDropdown(!showOptionsDropdown)}
                    className={`p-2 rounded-full border transition-colors ${showOptionsDropdown ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-[#899298] hover:bg-white/10 hover:text-white'}`}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* 抽屉列表 / 下拉菜单 */}
                  {showOptionsDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1c2023]/90 backdrop-blur-[20px] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="py-1 flex flex-col">
                        <button
                          onClick={() => { setShowSourcePacket(!showSourcePacket); setShowOptionsDropdown(false); }}
                          className="px-4 py-2.5 text-xs text-[#899298] hover:text-white hover:bg-white/5 flex items-center justify-between transition-colors text-left w-full"
                        >
                          <div className="flex items-center gap-3">
                            <PanelLeft className="w-4 h-4" /> <span>源数据包</span>
                          </div>
                          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{showSourcePacket ? '隐藏' : '显示'}</span>
                        </button>
                        <button
                          onClick={() => { setShowInspector(!showInspector); setShowOptionsDropdown(false); }}
                          className="px-4 py-2.5 text-xs text-[#899298] hover:text-white hover:bg-white/5 flex items-center justify-between transition-colors text-left w-full"
                        >
                          <div className="flex items-center gap-3">
                            <PanelRight className="w-4 h-4" /> <span>检查器</span>
                          </div>
                          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{showInspector ? '隐藏' : '显示'}</span>
                        </button>
                        <div className="h-px bg-white/10 my-1"></div>
                        <button className="px-4 py-2.5 text-xs text-[#899298] hover:text-white hover:bg-white/5 flex items-center gap-3 transition-colors text-left w-full">
                          <Database className="w-4 h-4" /> <span>本地</span>
                        </button>
                        <button className="px-4 py-2.5 text-xs text-[#899298] hover:text-white hover:bg-white/5 flex items-center gap-3 transition-colors text-left w-full">
                          <Cloud className="w-4 h-4" /> <span>已保存</span>
                        </button>
                        <div className="h-px bg-white/10 my-1"></div>
                        <button className="px-4 py-2.5 text-xs text-[#e0e3e6] hover:text-white hover:bg-white/5 flex items-center gap-3 transition-colors text-left w-full">
                          <Share2 className="w-4 h-4" /> <span>分享</span>
                        </button>
                        <button className="px-4 py-2.5 text-xs text-white hover:bg-[#86d7ff]/20 bg-[#86d7ff]/10 flex items-center gap-3 transition-colors text-left w-full font-medium">
                          <Download className="w-4 h-4" /> <span>导出</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Left tabs */}
              <div className="flex gap-6 text-[14px] font-medium h-full items-end pb-[10px]">
                <span
                  onClick={() => setActiveTab('home')}
                  className={`cursor-pointer transition-colors ${activeTab === 'home' ? 'text-white border-b-2 border-[#86d7ff] pb-1.5' : 'text-[#8d989f] hover:text-white'}`}
                >
                  今日
                </span>
                <span
                  onClick={() => setActiveTab('briefing')}
                  className={`cursor-pointer transition-colors ${activeTab === 'briefing' ? 'text-white border-b-2 border-[#86d7ff] pb-1.5' : 'text-[#8d989f] hover:text-white'}`}
                >
                  每日简报
                </span>
                <span
                  onClick={() => setActiveTab('toolbox')}
                  className={`cursor-pointer transition-colors ${activeTab === 'toolbox' ? 'text-white border-b-2 border-[#86d7ff] pb-1.5' : 'text-[#8d989f] hover:text-white'}`}
                >
                  Toolbox
                </span>
              </div>
              
              {/* Right controls */}
              <div className="flex items-center gap-3">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-[#8d989f] absolute left-2.5" />
                  <input 
                    type="text" 
                    placeholder="搜索文档、空间、标签或命令..." 
                    className="w-[360px] h-[32px] bg-[#1c2023]/70 border border-white/[0.07] rounded-[8px] pl-8 pr-8 text-[12px] text-[#e6eaed] placeholder:text-[#8d989f] outline-none focus:border-[#86d7ff]/50 transition-colors"
                    onClick={() => setIsSearchOpen(true)}
                    readOnly
                  />
                  <div className="absolute right-2 flex gap-0.5">
                    <span className="px-1 py-0.5 bg-white/10 text-[9px] rounded border border-white/10 text-[#8d989f]">⌘</span>
                    <span className="px-1 py-0.5 bg-white/10 text-[9px] rounded border border-white/10 text-[#8d989f]">K</span>
                  </div>
                </div>
                
                <div className="flex items-center bg-[#1c2023]/70 border border-white/[0.07] rounded-[8px] p-0.5 h-[32px]">
                  <button className="px-2.5 h-full rounded-[6px] bg-white/10 text-white text-[12px] font-medium flex items-center justify-center">紧凑</button>
                  <button className="px-2.5 h-full rounded-[6px] text-[#8d989f] hover:text-white text-[12px] font-medium transition-colors flex items-center justify-center">检查器</button>
                </div>
              </div>
            </>
          )}
        </header>

        {/* 动态页面内容区 - 如果是 Dock 视图，彻底移除左右边距，实现无缝铺满 */}
        <main className={`flex-1 ${activeTab === 'editor' || activeTab === 'dock' || activeTab === 'mind' ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-12 custom-scrollbar'} ${activeTab === 'dock' || activeTab === 'mind' ? 'px-0' : 'px-8'}`}>
          {activeTab === 'home' && <HomeView />}
          {activeTab === 'briefing' && <DailyBriefingView />}
          {activeTab === 'toolbox' && <ToolboxView />}
          {activeTab === 'mind' && <MindView />}
          {activeTab === 'dock' && <DockView setActiveTab={setActiveTab} />}
          {activeTab === 'editor' && <DraftEditorView userId={userId} showSourcePacket={showSourcePacket} showInspector={showInspector} onToggleSourcePacket={() => setShowSourcePacket(v => !v)} onToggleInspector={() => setShowInspector(v => !v)} onToast={showToast} />}
          {activeTab === 'review' && <ReviewView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* ==========================================
          全局 MacOS 聚焦搜索层 (Spotlight Search Overlay) 
          ========================================== */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[100] bg-[#0b0f11]/40 backdrop-blur-sm flex justify-center items-start pt-[15vh] transition-all"
          onClick={() => setIsSearchOpen(false)}
        >
          {/* 搜索主容器 */}
          <div
            className={`w-[640px] max-w-[90vw] flex flex-col relative animate-in fade-in zoom-in-95 duration-200 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${searchQuery ? 'rounded-[20px]' : 'rounded-full'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* 顶部搜索框 (输入时顶部圆角，无输入时完全圆角/胶囊) */}
            <div className={`flex items-center px-5 h-14 bg-[#1c2023]/70 backdrop-blur-[40px] border-[0.5px] border-white/10 relative z-10 transition-all duration-300 ${searchQuery ? 'rounded-t-[20px] border-b-0' : 'rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}>
              <Search className="w-5 h-5 text-[#86d7ff] mr-3 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索 Atlax，或输入命令..."
                className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder:text-[#899298]/70 font-medium"
              />
              {searchQuery ? (
                <button onClick={() => setSearchQuery('')} className="p-1 rounded-full hover:bg-white/10 text-[#899298] hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-1 shrink-0 ml-3 opacity-50">
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono border border-white/10 text-white">⌘</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono border border-white/10 text-white">K</span>
                </div>
              )}
            </div>

            {/* 底部结果抽屉 (MacOS 液态毛玻璃效果) */}
            {searchQuery && (
              <div className="bg-[#1c2023]/70 backdrop-blur-[40px] border-[0.5px] border-white/10 border-t-0 rounded-b-[20px] overflow-hidden flex flex-col max-h-[60vh]">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mx-4"></div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3">

                  {/* 推荐结果模块 */}
                  <div className="mb-4">
                    <h4 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase px-3 mb-2">最佳匹配</h4>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#86d7ff]/10 cursor-pointer group transition-colors bg-white/5">
                        <div className="w-8 h-8 rounded-lg bg-[#86d7ff]/20 flex items-center justify-center text-[#86d7ff] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
                          <TerminalSquare className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <h5 className="text-sm font-medium text-white">空间 UI 架构 <span className="text-[#86d7ff]">({searchQuery})</span></h5>
                          <p className="text-[10px] text-[#899298]">保存在 停靠区 / 设计系统</p>
                        </div>
                        <span className="text-[10px] text-[#899298] opacity-0 group-hover:opacity-100 transition-opacity">跳转 ↵</span>
                      </div>
                    </div>
                  </div>

                  {/* 知识库结果 */}
                  <div className="mb-2">
                    <h4 className="text-[10px] font-semibold tracking-wider text-[#899298] uppercase px-3 mb-2">相关笔记与捕获</h4>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 cursor-pointer group transition-colors">
                        <FileText className="w-4 h-4 text-[#899298] group-hover:text-white" />
                        <h5 className="text-sm text-[#e0e3e6] group-hover:text-white flex-1">{searchQuery} 原型设计反馈</h5>
                        <span className="text-[10px] text-[#899298]">昨天</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 cursor-pointer group transition-colors">
                        <Brain className="w-4 h-4 text-[#899298] group-hover:text-[#a8c8ff]" />
                        <h5 className="text-sm text-[#e0e3e6] group-hover:text-white flex-1">包含 &ldquo;{searchQuery}&rdquo; 的神经元集群</h5>
                        <span className="text-[10px] text-[#899298]">思维导图</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 cursor-pointer group transition-colors">
                        <Settings className="w-4 h-4 text-[#899298] group-hover:text-[#9cf4d4]" />
                        <h5 className="text-sm text-[#e0e3e6] group-hover:text-white flex-1">搜索 {searchQuery} 相关的同步设置</h5>
                      </div>
                    </div>
                  </div>

                </div>

                {/* 底部操作提示栏 */}
                <div className="bg-black/20 px-4 py-2 flex items-center justify-between text-[10px] text-[#899298] border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="px-1 py-0.5 rounded bg-white/10 border border-white/10">↑</span><span className="px-1 py-0.5 rounded bg-white/10 border border-white/10">↓</span> 导航</span>
                    <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10">↵</span> 确认</span>
                  </div>
                  <span>Atlax 全局神经搜索</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 全局 CSS (Tailwind 中无法直接定义的伪元素/动画) */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(134, 215, 255, 0.3);
        }
      `}} />

      {/* Toast 通知 */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="px-4 py-2.5 bg-[#1c2023]/90 backdrop-blur-[20px] border border-white/10 rounded-xl shadow-2xl text-sm text-white">
            {toastMsg}
          </div>
        </div>
      )}
    </div>
  );
}
