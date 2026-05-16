# Atlax MindDock Architecture

| 文档信息 | 内容 |
|---|---|
| 文档版本 | v1.0 Golden Workspace Integration Architecture |
| 当前阶段 | Phase 3.2：Golden Workspace 全量真实接入 |
| 当前分支 | `feature/local-core-phase-1` |
| 最后更新 | 2026-05-09 |

---

## 1. 架构目标

当前架构目标不是重写系统，而是在保持现有 Golden UI 的前提下，把已经存在的 Local Core / Intelligence Spine 能力接回前端，让产品形成可内测的 Desktop Preview。

核心目标：

```text
Golden UI
→ View Model / Hooks
→ Repository
→ @atlax/domain
→ IndexedDB / Dexie
→ Local Intelligence Engine
→ Recommendation / Event Spine
```

---

## 2. 当前架构现实

根据 2026-05-09 功能审计，当前项目没有传统远程后端/API Server。所谓“后端”主要由三部分组成：

1. `@atlax/domain`：领域包，包含 Local Core 服务、推荐、事件、候选召回、领域类型与测试。
2. `apps/web/lib/repository.ts`：Web 侧本地 repository / Dexie 适配层。
3. 浏览器 IndexedDB / Dexie：本地持久化数据库。

新 `/workspace` 前端已完成视觉重构，但大量真实本地数据能力尚未接入。

---

## 3. 架构原则

1. **UI 不直接读写 IndexedDB。** UI 通过 hooks / view model 调用 repository / domain service。
2. **业务逻辑不写在 React 组件里。** `/workspace/page.tsx` 必须逐步拆分。
3. **Local Core 是产品发动机。** Capture、Document、MindNode、Recommendation、Event 必须走统一 spine。
4. **Brief / Review 是视图聚合。** 不应复制业务数据。
5. **Tools Hub 是能力注册表。** 不应一开始实现插件运行时。
6. **Privacy Firewall 是横切层。** 所有外部 connector 统一经过权限与审计。
7. **Desktop-first。** Web App 是开发形态，最终形态是 Desktop App。

---

## 4. 目标分层架构

```text
┌─────────────────────────────────────────────┐
│ Golden Workspace UI                         │
│ Home / Daily Brief / Review / Dock / Mind   │
│ Editor / Tools Hub / Settings               │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ View Models / Hooks                         │
│ useHomeIntelligence / useDailyBrief         │
│ useReviewReport / useQuickCapture           │
│ useDrafts / useTips / useDockQueue          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Application Services                        │
│ BriefService / ReviewService                │
│ QuickCaptureService / DraftService          │
│ ToolRegistryService / ConnectorService      │
│ PrivacyFirewallService                      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Domain Core                                 │
│ CaptureFlow / RecommendationEngine          │
│ CandidateRecall / FeedbackService           │
│ EventSpine / MindGraphService               │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Local Persistence                           │
│ Repository / Dexie / IndexedDB              │
└─────────────────────────────────────────────┘
```

---

## 5. 核心应用服务

### 5.1 QuickCaptureService

职责：

- 接收全局 Quick Capture 输入。
- 创建 captureType=`quick_capture`。
- 写入 Tips 系统目录。
- 调用 Local Core 生成 Document / MindNode / Recommendation。
- 返回 UI 所需反馈。

禁止：

- 只写 local state。
- 绕过 recommendation/event spine。

### 5.2 DraftService

职责：

- 创建 Draft。
- Autosave。
- 恢复 Draft。
- 转正式 Document。
- 丢弃 Draft。
- 为 Brief / Review 提供 Draft 统计。

Draft 映射建议：

- `documents.status='draft'`。
- `system_collection='drafts'`。

### 5.3 BriefService

职责：

- 聚合 Daily Brief 数据。
- 生成昨日进展。
- 生成今日推荐。
- 生成 Tips / Drafts 状态。
- 生成 Mind Snapshot。
- 标注 custom modules 状态。

BriefService 第一版可按需计算，不强制持久化。

### 5.4 ReviewService

职责：

- 按 Day / Week / Month / Year 聚合知识库状态。
- 计算 health score。
- 生成 Maintenance Actions。
- 生成 Next Cycle Recommendations。
- 生成周期 Mind Snapshot。

### 5.5 ToolRegistryService

职责：

- 注册 Tools Hub 卡片。
- 提供状态：Live / Local Preview / Pro Preview / Setup Required / Planned。
- 提供详情抽屉数据。
- 阻止未实现功能执行假动作。

### 5.6 ImportControlService

职责：

- 管理 Pending Packets。
- 管理导入源状态。
- 创建 manual packet / file packet。
- 展示 Notion / Obsidian / 社交媒体导入路线图。

### 5.7 ConnectorService

职责：

- 所有外部连接统一入口。
- 管理 LLM / Cloud / Import / Plugin connector。
- 检查权限。
- 写 audit log。

### 5.8 PrivacyFirewallService

职责：

- Local-only mode。
- Kill switch。
- 权限检查。
- 算法审计。
- 阻止 Local Algorithm Engine 直接联网。

---

## 6. 前端页面接入策略

### 6.1 `/workspace` 拆分

当前 `/workspace/page.tsx` 不应继续作为巨型内联视觉原型。建议拆分：

```text
apps/web/app/workspace/page.tsx
apps/web/components/workspace/WorkspaceShell.tsx
apps/web/components/workspace/GlobalRail.tsx
apps/web/components/workspace/TopBar.tsx
apps/web/components/home/HomeDashboard.tsx
apps/web/components/brief/DailyBriefView.tsx
apps/web/components/review/ReviewView.tsx
apps/web/components/dock/DockView.tsx
apps/web/components/mind/MindView.tsx
apps/web/components/editor/EditorView.tsx
apps/web/components/tools/ToolsHubView.tsx
apps/web/components/capture/QuickCaptureBar.tsx
```

### 6.2 数据 hooks

建议新增或收敛：

```text
useCurrentUser()
useWorkspaceSession()
useQuickCapture()
useTips()
useDrafts()
useHomeIntelligence()
useDailyBrief()
useReviewReport(range)
useDockQueue()
useMindGraph()
useToolRegistry()
usePrivacyFirewall()
```

---

## 7. Editor 架构

第一版推荐接入 Milkdown。

结构：

```text
EditorView
├─ SourcePacketPanel
├─ MarkdownEditorCanvas(Milkdown)
└─ InspectorPanel
```

数据流：

```text
New Draft
→ DraftService.createDraft
→ Milkdown onChange
→ debounce autosave
→ DraftService.autosave
→ Manual Save / Publish
→ DraftService.publishDraft
→ Document / MindNode / Recommendation 更新
```

---

## 8. Privacy Firewall 架构

```text
Local Algorithm Engine
        ↓
PrivacyFirewallService
        ↓
ConnectorService
        ↓
External Provider / Cloud / Plugin / Import Source
```

硬约束：

- Local Algorithm Engine 不允许直接 import 网络 SDK。
- 所有 connector 必须注册权限。
- 所有外部请求必须写 AlgorithmAuditLog。
- Local-only 开启时拒绝外部请求。

---

## 9. Desktop App 策略

当前开发形态是 Web App，但最终形态是 Desktop App。

建议顺序：

1. 先完成 Web Preview 的 Local Core 接入。
2. 再包装 Desktop Preview。
3. 优先考虑 Tauri。
4. 若 Tauri 阻塞，可用 Electron 作为内测包临时方案。
5. Desktop 层强化本地文件系统、网络权限、Connector 权限和 Privacy Firewall。

---

## 10. 内测包最小架构验收

必须跑通：

```text
Quick Capture
→ Tips
→ Recommendation
→ Dock 整理
→ Editor Draft
→ Publish Document
→ MindNode 可见
→ Daily Brief 统计
→ Review 统计
→ Privacy Firewall 显示本地算法未联网
```

---

## 11. 下一阶段架构风险

| 风险 | 说明 | 处理 |
|---|---|---|
| 巨型 React 文件继续膨胀 | `/workspace/page.tsx` 过大，难维护 | FE-REAL-001 起逐步拆分 |
| UI 状态绕过 Local Core | 会导致智能闭环断裂 | 所有输入必须进 spine |
| Editor 技术路线摇摆 | 会拖慢产品成立 | 第一版固定 Milkdown 优先 |
| Tools Hub 假动作 | 会损害内测信任 | 状态化，不假启用 |
| Privacy Firewall 只做 UI | 隐私承诺不可信 | 需要 ConnectorService / AuditLog 基础层 |
| Desktop 打包过早 | 如果 Web 还没接真实数据，打包没有意义 | 先 Web Preview 跑通主路径 |
