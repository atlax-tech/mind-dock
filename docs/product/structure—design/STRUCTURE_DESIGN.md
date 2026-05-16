# Atlax MindDock 结构化系统设计文档

版本：v1.2 Golden Workspace Integration
阶段：Phase 3.2：Golden Workspace 全量真实接入 / Intelligent Local Preview
核心范围：在既有 Atlax Intelligence Spine 四层对象模型基础上，补齐 Golden UI 所需的系统目录、简报、Review、Tools Hub、Import Control、Privacy Firewall 等结构边界。
状态标记：[LIVE] 已有真实实现 / [LOCAL-PREVIEW] 本地基础版必须接入 / [PRO-PREVIEW] 订阅功能预览 / [PLANNED] 后续规划 / [RESERVED] 未来预留

---

## 0. 2026-05-09 结构更新总则

### 0.1 为什么更新

当前前端已完成 Golden Workspace 级别的全量视觉重构，但大量页面仍未接入 Local Core 真实数据。旧结构设计能支撑 Capture / Document / MindNode / Recommendation / Event Spine，但没有完整覆盖新版前端新增的系统目录、Daily Brief、Review、Tools Hub、Pending Packets、Quick Capture、Drafts、Privacy Firewall 等产品结构。

本次更新目标不是推翻旧结构，而是在旧 Intelligence Spine 上增加 Golden Workspace 的结构接入层。

### 0.2 核心原则

1. **不新增平行主线。** Quick Capture、Drafts、Tips、Pending Packets 都必须进入 Intelligence Spine，不能成为 UI 私有状态。
2. **系统目录优先于普通文件夹。** Tips、Drafts、Pending Packets、Archive 是系统级 collection，不只是前端命名。
3. **Brief / Review 是结构投影。** Daily Brief 和 Review 不直接创造核心资产，只读取 events、documents、captures、mind_nodes、recommendations 等数据生成统计和建议。
4. **Tools Hub 是能力注册表。** 第一版主要是工具卡片状态、权限、预览，不要求插件运行时。
5. **Privacy Firewall 是横切层。** 所有外部连接、LLM、插件、云存储、导入源都必须走 Connector / Permission / Audit 机制。
6. **所有智能推荐必须可解释。** recommendation.reason_json 必须保留 evidence。
7. **所有高级能力必须有状态。** Live / Local Preview / Pro Preview / Setup Required / Planned / Reserved。

---

## 0.3 新增/强化对象总览

| 对象 | 状态 | 说明 |
|---|---|---|
| SystemCollection | [LOCAL-PREVIEW] | 系统目录：Tips / Drafts / Pending Packets / Archive |
| Tip | [LOCAL-PREVIEW] | Quick Capture 产生的轻量内容，可实现为 Capture + Document projection，不必第一版单独建表 |
| Draft | [LOCAL-PREVIEW] | Editor 自动保存草稿，可实现为 Document(status=draft) + system_collection='drafts' |
| BriefReport | [LOCAL-PREVIEW] | Daily Brief 的运行时视图对象，可先不持久化 |
| ReviewReport | [LOCAL-PREVIEW] | Review 的周期诊断视图对象，可先不持久化 |
| ToolCard | [PRO-PREVIEW] | Tools Hub 能力卡片注册项 |
| Connector | [LOCAL-PREVIEW] | 外部连接器抽象：LLM / Cloud / Import / Plugin |
| ConnectorPermission | [LOCAL-PREVIEW] | 连接器权限声明与授权状态 |
| AlgorithmAuditLog | [LOCAL-PREVIEW] | 本地算法分析和外部请求审计日志 |
| ImportSourceDefinition | [PRO-PREVIEW] | 导入源定义：Notion / Obsidian / 微信 / 小红书等 |
| ImportControlItem | [LOCAL-PREVIEW] | Pending Packets / Import Control Center 的导入入口状态 |

---

## 0.4 SystemCollection 设计

### 0.4.1 定义

SystemCollection 是 Atlax 内置系统目录，不应被用户误删。

```ts
type SystemCollectionType =
  | 'tips'
  | 'drafts'
  | 'pending_packets'
  | 'archive'
  | 'documents'
```

### 0.4.2 MVP 映射策略

第一版可以不新增复杂表，优先通过 documents / captures 字段表达：

- Tips：`captures.capture_type='quick_capture'` 或 `documents.system_collection='tips'`。
- Drafts：`documents.status='draft'` 或 `documents.system_collection='drafts'`。
- Pending Packets：`captures.capture_type='import_packet'` 或 `source_items` / `import_items`。
- Archive：`documents.status='archived'`。

建议后续正式表：

```text
system_collections
- id
- user_id
- workspace_id
- type
- name
- is_system
- sort_order
- created_at
- updated_at
```

---

## 0.5 Quick Capture / Tips 结构流

```text
Quick Capture 输入
→ captures(status=raw, capture_type=quick_capture, capture_source=manual)
→ normalize
→ documents(status=captured/suggested, system_collection=tips)
→ mind_nodes(state=drifting/suggested)
→ recommendations(type=landing/tag/project/cluster)
→ Home / Daily Brief / Review 读取 Tips 状态
```

要求：

- Quick Capture 不能只写 local state。
- Tips 必须参与 recommendation engine。
- Tips 必须被 Daily Brief / Review 统计。
- Tips 必须可转正式 Document。

---

## 0.6 Drafts 结构流

```text
Editor New Draft
→ documents(status=draft, system_collection=drafts)
→ autosave 更新 markdown/plain_text/content_hash
→ Drafts list 可见
→ manual save / publish
→ documents(status=active)
→ mind_nodes 更新或生成
→ recommendations 更新
```

要求：

- autosave 只保存内容，不触发重型结构化重算。
- manual save / publish 触发结构化检查。
- Drafts 必须被 Home / Daily Brief / Review 读取。

---

## 0.7 Daily Brief 结构

Daily Brief 是视图聚合对象，第一版可按需计算，不强制持久化。

输入：

- captures。
- documents。
- mind_nodes。
- mind_edges。
- recommendations。
- recommendation_events。
- user_behavior_events。

输出结构：

```ts
interface DailyBriefReport {
  date: string
  yesterdayProgress: {
    thoughtsCaptured: number
    packetsToDock: number
    documentsUpdated: number
    draftsResolved: number
  }
  recommendations: BriefRecommendation[]
  knowledgeHealth: KnowledgeBaseHealth[]
  tipsStatus: CollectionStatus
  draftsStatus: CollectionStatus
  mindSnapshot: MindSnapshot
  customModules: BriefModuleState[]
}
```

---

## 0.8 Review 结构

Review 是周期诊断对象，与 Daily Brief 不同。

```ts
type ReviewRange = 'day' | 'week' | 'month' | 'year'

interface ReviewReport {
  range: ReviewRange
  periodStart: string
  periodEnd: string
  healthScore: KnowledgeHealthScore
  mindSnapshot: MindSnapshot
  maintenanceActions: MaintenanceAction[]
  nextCycleRecommendations: Recommendation[]
  collectionStats: CollectionStatus[]
}
```

Review 不直接创建文档，只产生维护建议。用户执行建议时再更新 documents / captures / recommendations / events。

---

## 0.9 Tools Hub 结构

Tools Hub 第一版是工具注册表和订阅能力橱窗。

```ts
type ToolStatus = 'live' | 'local_preview' | 'pro_preview' | 'setup_required' | 'planned'

type ToolCategory =
  | 'brief_modules'
  | 'dock_templates'
  | 'home_customization'
  | 'mind_views'
  | 'editor_templates'
  | 'llm_settings'
  | 'plugin_center'
  | 'import_export'
  | 'cloud_storage'

interface ToolCard {
  id: string
  category: ToolCategory
  title: string
  description: string
  status: ToolStatus
  requiredPlan?: 'free' | 'pro'
  requiredConnectorId?: string
  detailMarkdown?: string
}
```

第一版可以静态注册工具卡，但状态和详情必须真实，不做假启用。

---

## 0.10 Import Control / Pending Packets 结构

Pending Packets 是导入资料和待解析内容停靠区。

```ts
type ImportSourceStatus = 'available' | 'preview' | 'planned'

type ImportSourceKind =
  | 'manual'
  | 'file'
  | 'markdown_folder'
  | 'notion'
  | 'obsidian'
  | 'wechat'
  | 'xiaohongshu'
  | 'douyin'
  | 'bilibili'
  | 'zhihu'
```

第一版：

- manual / file 可做基础入口。
- notion / obsidian / markdown_folder 做 Preview。
- 中国大陆社交媒体来源做 Planned。

---

## 0.11 Privacy Firewall 结构

Privacy Firewall 是横切层。

```ts
interface Connector {
  id: string
  type: 'llm' | 'cloud_storage' | 'import_source' | 'plugin'
  name: string
  status: 'disabled' | 'enabled' | 'requires_setup'
  permissions: ConnectorPermission[]
}

interface ConnectorPermission {
  id: string
  connectorId: string
  scope: 'read_local_documents' | 'write_local_documents' | 'network_access' | 'send_to_llm' | 'read_files' | 'write_files'
  granted: boolean
}

interface AlgorithmAuditLog {
  id: string
  userId: string
  workspaceId: string
  actor: 'local_algorithm' | 'connector' | 'plugin'
  action: string
  dataScope: string
  networkAccessed: boolean
  connectorId?: string
  createdAt: string
}
```

要求：

- Local Algorithm Engine 不允许直接使用网络请求。
- 所有外部请求必须经过 ConnectorService。
- audit log 必须记录是否外联。
- 默认 Local-only mode = true。

---

## 0.12 与旧结构设计的关系

以下旧 v1.0 Intelligence Spine 结构设计仍然有效，尤其是：

- Capture / Document / MindNode / MindEdge / Cluster / Recommendation / RecommendationEvent / UserBehaviorEvent。
- 快速输入闭环。
- 编辑闭环。
- 管理闭环。
- 工作区闭环。
- 反馈闭环。
- 四层对象模型。

本 v1.2 更新只是在其上增加 Golden Workspace 所需的系统目录、简报、Review、Tools、Import、Firewall 结构。

---

# 附录：旧 v1.0 Intelligence Spine 详细结构设计保留

# Atlax MindDock 结构化系统设计文档

版本：v1.0 Intelligence Spine
阶段：后端第一阶段开发前结构设计
核心范围：知识智能主干（Atlax Intelligence Spine）驱动下的四层对象模型与闭环系统
状态标记：[CURRENT-FE + MVP-BE] 前端已有 IndexedDB，后端需落地 / [MVP-BE] 纯后端新建 / [NEXT] 第二阶段增强 / [RESERVED] 未来预留

---

## 1. 文档定位

### 1.1 本文档是什么

本文档是 Atlax MindDock 后端第一阶段开发前的**结构设计说明书**。它定义：

- 数据对象是什么，彼此关系如何
- 状态如何变化，谁触发变化
- 模块如何协作，数据如何在模块间流动
- 后端第一阶段应该先建哪些表和接口

### 1.2 本文档不是什么

| 不是 | 原因 |
| --- | --- |
| UI 说明书 | 视觉规范、组件树、CSS 变量由前端设计文档负责 |
| 算法公式文档 | TF-IDF、向量相似度、图聚类算法的细节由算法文档负责 |
| 未来幻想清单 | 所有能力必须标注 [CURRENT-FE + MVP-BE] / [MVP-BE] / [NEXT] / [RESERVED] |
| API 详细规范 | 只定义契约骨架，完整 OpenAPI spec 由接口文档负责 |

### 1.3 状态标记约定

全文统一使用以下标记：

| 标记 | 含义 | 判断标准 |
| --- | --- | --- |
| [CURRENT-FE + MVP-BE] | 前端已有 IndexedDB/UI，后端 MVP 必须落地 | 可在 apps/web 中找到对应代码 + 后端需建表/API |
| [MVP-BE] | 纯后端新建，前端尚无持久化对应 | 后端 MVP 阶段从零建表 |
| [NEXT] | 第二阶段增强 | MVP 稳定后再建 |
| [RESERVED] | 未来预留 | 只定义表结构和 API 骨架，不做实现 |

---

## 2. 产品结构总览

### 2.1 核心概念：Atlax Intelligence Spine（知识智能主干）

Atlax Intelligence Spine 不是一项功能，而是产品的主链路骨架：

```
输入 → 接住 → 标准化 → 内容入库 → 结构化 → 推荐 → 用户修正 → 反馈记录 → 下次更准
```

它是贯穿 Home、Mind、Dock、Editor、WorkspaceTabs 所有模块的**数据生命线**。任何内容进入系统后，无论是 Mind 星辰输入框的一句话、Editor 保存的一篇文档、还是 Dock 批量导入的文件，都必须沿着这条主干流动，不存在旁路。

### 2.2 产品结构图

```
                    ┌──────────────────────────────────────┐
                    │        Atlax Intelligence Spine       │
                    │         知识智能主干 / 本地智能骨架        │
                    └──────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
   ┌──────────┐               ┌──────────────┐              ┌──────────┐
   │  Home    │               │  Mind Star   │              │  Import  │
   │  入口页   │               │  Input/Editor │              │  批量导入  │
   └────┬─────┘               └──────┬───────┘              └────┬─────┘
        │                            │                           │
        └────────────────────────────┼───────────────────────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │     Capture     │  ← 原始输入层
                            │   原始内容捕获     │
                            └────────┬────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │  Document / Block / Source    │  ← 内容层 Content Layer
                     │  长期内容资产                    │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │  MindNode / MindEdge / Cluster│  ← 结构层 Structure Layer
                     │  结构化知识投影                  │
                     └───────────────┬───────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
        ┌──────────┐          ┌──────────┐          ┌──────────────┐
        │   Dock   │◄────────►│   Mind   │◄────────►│   Editor     │
        │ 知识库管理 │ 双向联动  │ 星云树视图 │ 保存触发  │  工作行为层   │
        └──────────┘          └──────────┘          └──────────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │  Recommendation / UserEvent   │  ← 智能层 Intelligence Layer
                     │  Review 预留                    │
                     └───────────────────────────────┘
```

### 2.3 产品原则

Atlax 不是"一堆页面 + 一个编辑器 + 一个图谱"，而是：

> 编辑产生内容 → 内容进入结构 → 结构形成星云 → 星云反过来帮助用户管理和思考

核心原则：

1. **Home** 是默认入口页 [CURRENT-FE + MVP-BE]，用户从这里开始工作。
2. **Mind** 是星云树知识视图，是核心视觉舞台 [CURRENT-FE + MVP-BE]，只展示结构化结果，不展示全部数据。
3. **Dock** 是知识库管理区，是 Mind 的结构化后台 [CURRENT-FE + MVP-BE]。
4. **Editor** 是工作行为层，通过 WorkspaceTabs 打开，不作为一级导航 [CURRENT-FE + MVP-BE]。
5. **WorkspaceTabs** 是工作区标签系统，负责打开、关闭、激活、恢复、置顶 [CURRENT-FE + MVP-BE]。
6. 取消 Entry 模块，避免产品心智分裂 [CURRENT-FE：前端已无独立 Entry 页面]。
7. Review / Chat / Calendar / Widgets 当前只做入口或结构预留 [CURRENT-FE：浮动工具入口 + RESERVED：后端表结构]，不进入本阶段主交付。
8. Editor 保存必须触发结构化流程 [MVP-BE]。
9. Dock 和 Mind 必须双向联动 [MVP-BE]。
10. Mind 不展示全部数据，只展示结构化结果 [CURRENT-FE：前端概念，MVP-BE：后端保证]。

长期结构原则补充：

11. Atlax 的长期方向不是要求用户先搭建 database / board / workspace，而是允许系统基于已有星云链路、文档类型、Tag、关系和用户选择，推荐可预览、可修改、可确认的工作台结构草案 [NEXT / RESERVED]。该能力不进入当前 MVP 主交付，MVP 仅保留通用推荐字段和事件扩展空间。

---

## 3. 产品主闭环

以下 5 条闭环是后端第一阶段必须打通的完整链路。每条闭环都是一个不可拆分的原子交付单元。

### 3.1 快速输入闭环 [MVP-BE]

```
Mind Star Input（星辰输入框）
  → POST /api/captures → 写入 captures 表，status=raw
  → normalize → 生成 Document（status=captured）
  → classify + extract → 生成 MindNode（state=drifting/suggested）
  → Landing Suggestion → 前端展示推荐落点
  → User Feedback（接受/拒绝/拖动）→ POST /api/recommendations/{id}/feedback
  → 写入 recommendation_events
```

**触发者**：用户在 Mind 星辰输入框输入内容并提交

**涉及表**：captures → documents → mind_nodes → recommendation_events

**同步变化**：Mind 画布出现新节点（漂浮或建议状态），Dock 列表出现新条目

### 3.2 编辑闭环 [MVP-BE]

```
Editor Manual Save（Cmd+S / 显式 Save 按钮）
  → PUT /api/documents/{id}
  → Extract Plain Text（从 Markdown / Block JSON）
  → Update Document（更新 plain_text、content_hash、updated_at）
  → Update MindNode（更新 summary、activity_score、updated_at）
  → Recompute Relations（触发 edge 重算）
  → Refresh Dock List + Mind Canvas
```

**触发者**：用户在 Editor 中手动保存文档（Cmd+S / 显式 Save）

**涉及表**：documents → mind_nodes → mind_edges

**同步变化**：Mind 中对应节点摘要和活跃度更新，Dock 中更新时间刷新

**保存分层说明**：
- **自动保存**（idle debounce / 关闭标签 / 切换文档）：仅保存文档内容、草稿状态、`content_hash`，不触发完整结构化重算。
- **手动保存**（Cmd+S / 显式 Save）：触发完整编辑闭环，包括 plain_text 提取、MindNode 更新、Edge 重算。
- **轻量结构化检查**（idle debounce / 关闭标签 / 切换文档时可选触发）：只做基本的 content_hash 比对和 node 存在性校验，不执行昂贵的 edge recompute。

### 3.3 管理闭环 [MVP-BE]

```
Dock 修改标签/项目/归档状态
  → PUT /api/documents/{id}（properties 更新）
  → 写入 document_tags（标签关系变更）
  → 更新 documents.primary_project_id（项目归属变更）
  → Update Structure Layer（节点归属变化）
  → Mind Recompute Nodes/Edges/Clusters（重算星群归属和连线）
  → Refresh Mind Canvas
```

**触发者**：用户在 Dock 中修改文档属性

**涉及表**：documents → document_tags → mind_nodes → mind_edges → clusters → tags

**同步变化**：Mind 中节点位置、星群归属、连线强度和类型同步变化

### 3.4 工作区闭环 [CURRENT-FE + MVP-BE]

```
WorkspaceTabs 打开/关闭/激活/置顶
  → 写入 workspace_open_tabs（upsert）
  → 更新 workspace_sessions（active_tab_id, last_activity_at）
  → 持久化至后端
  → 刷新后 restoreWorkspaceTabs 恢复全部标签状态
```

**触发者**：用户操作 WorkspaceTabs（打开文档、关闭标签、切换标签、置顶）

**涉及表**：workspace_sessions → workspace_open_tabs

**同步变化**：无跨模块同步，仅 WorkspaceTabs 自身状态持久化

### 3.5 反馈闭环 [MVP-BE 数据预留]

```
用户接受/拒绝/修改推荐
  → POST /api/recommendations/{id}/feedback
  → 写入 recommendation_events（event_type=accepted/rejected/modified/ignored）
  → 写入 user_behavior_events（如需记录操作上下文）
  → 后续算法学习（NEXT：更新 preference_profiles、调整 confidence 权重）
```

**触发者**：用户在 Mind 或 Dock 中对推荐落点做出反馈

**涉及表**：recommendation_events → user_behavior_events → [NEXT] preference_profiles

**同步变化**：MVP 阶段仅记录事件，不做实时权重调整；NEXT 阶段回馈算法

---

## 4. 四层对象模型

从原来的 Content / Structure / View 三层升级为四层，**新增 Intelligence Layer**。它是自动落库、推荐、Review、Nudge 的数据基础，但本文档只定义对象和关系，不展开算法细节。

### 4.1 Content Layer 内容层 [CURRENT-FE + MVP-BE]

内容层负责保存真实内容，是长期资产层。必须稳定、可导出、可迁移。

| 对象 | 状态 | 含义 |
| --- | --- | --- |
| Document | [CURRENT-FE + MVP-BE] | 一篇完整文档，长期内容资产。不等于 Entry。 |
| Block | [CURRENT-FE + MVP-BE] | 文档中的块（段落、标题、列表、代码等） |
| Asset | [MVP-BE] | 图片、附件、音频、视频封面等二进制资源 |
| Capture | [CURRENT-FE + MVP-BE] | 临时输入或碎片记录，不等于 dockItem |
| SourceItem | [MVP-BE] | 外部来源数据（微信文章、B站视频等原始引用） |
| ImportJob | [NEXT] | 批量导入任务 |
| ImportItem | [NEXT] | 导入任务中的单条记录 |
| Version | [NEXT] | 文档版本历史 |

**关键区别**：

- `Document !== Entry`：Entry 是历史概念，正在废弃。Document 是长期内容资产，包含 markdown / plain_text / block_json 三种格式。
- `Capture !== DockItem`：Capture 是原始输入记录。DockItem 如果存在，只能是视图/管理投影，不应成为核心资产模型。

### 4.2 Structure Layer 结构层 [CURRENT-FE + MVP-BE]

结构层负责把内容变成知识网络，是 Atlax 最重要的资产层。

| 对象 | 状态 | 含义 |
| --- | --- | --- |
| MindNode | [CURRENT-FE + MVP-BE] | 星云树中的节点，是内容的结构投影 |
| MindEdge | [CURRENT-FE + MVP-BE] | 节点之间的关系 |
| Cluster | [CURRENT-FE + MVP-BE] | 星群/主题团簇 |
| Project | [CURRENT-FE + MVP-BE] | 项目，对应前端 Collection（collectionType=project） |
| Topic | [CURRENT-FE + MVP-BE] | 主题 |
| Tag | [CURRENT-FE + MVP-BE] | 标签 |
| TimelineAnchor | [NEXT] | 时间锚点（日期、周、月等时间维度聚合） |
| GraphLayout | [CURRENT-FE + MVP-BE] | 节点布局缓存（x, y, z, pinned） |

**关键设计**：

- MindNode 不是独立创建的对象，而是内容的结构投影。**文档类型节点默认 1 Document ↔ 1 MindNode**。Project / Topic / Tag / Source / Cluster Center 类型节点可以没有 Document。一个聚合节点可以关联多个 Documents（通过 `mind_node_documents` 关联表）。
- MindEdge 的多条边可能连接同一对节点（不同 relation_type），不允许重复边但允许同节点对多条不同类型边。

### 4.3 Intelligence Layer 智能层 [新增，MVP-BE]

**这是本次重构新增的层**。它是自动落库反馈、推荐优化、用户偏好学习的持久化基础。

| 对象 | 状态 | 含义 |
| --- | --- | --- |
| UserBehaviorEvent | [MVP-BE] | 用户操作行为事件（拖动节点、修改归属、手动连线等） |
| Recommendation | [MVP-BE] | 推荐对象（落点、连线、星群等），含状态与置信度 |
| RecommendationEvent | [MVP-BE] | 推荐事件日志（生成、展示、接受、拒绝、修改、忽略） |
| FeatureSnapshot | [NEXT] | 内容特征快照（用于训练和回溯对比） |
| PreferenceProfile | [NEXT] | 用户偏好画像（分类权重、标签偏好、时间偏好等） |
| RhythmProfile | [NEXT] | 用户使用节律画像（活跃时段、输入频率、回顾周期） |
| GraphSignal | [RESERVED] | 图谱健康信号（孤立节点、停滞项目、重复主题等） |
| AlgorithmCache | [RESERVED] | 算法中间结果缓存（向量、聚类中间态等） |
| StructurePack | [RESERVED] | 可被算法推荐和调用的结构包定义，例如项目看板、知识库、研究专题 |
| WorkspaceRecommendationCandidate | [RESERVED] | 基于某条星云链路生成的工作台候选草案，只用于 Preview，不直接创建最终数据 |
| GraphFeatureSnapshot | [NEXT] | 针对根节点 / 链路提取的结构特征快照，是 FeatureSnapshot 在 graph-chain 场景下的扩展 |
| Collection | [RESERVED] | 未来 database / board / workspace 的数据集合抽象，不进入 MVP |
| CollectionView | [RESERVED] | 未来 table / board / inbox / review 等视图配置抽象，不进入 MVP |
| RecordNodeLink | [RESERVED] | 未来 collection record 与 mind_node / document 的映射关系 |

**MVP 必须实现**：`recommendations` 和 `recommendation_events`、`user_behavior_events` 三张表，作为反馈闭环的数据基础。即使 MVP 阶段不接算法，也必须记录这些事件，避免后续补数据。

### 4.4 View Layer 视图层 [CURRENT-FE]

视图层不直接创造业务数据，只负责用不同方式呈现结构和内容。

| 视图 | 状态 | 数据来源 |
| --- | --- | --- |
| Home（入口页） | [CURRENT-FE + MVP-BE] | recent_documents + user_info + projects |
| Mind（星云树） | [CURRENT-FE + MVP-BE] | mind_nodes + mind_edges + clusters + graph_layouts |
| Dock List | [CURRENT-FE + MVP-BE] | documents + mind_nodes + projects + tags + document_tags |
| Dock Card | [CURRENT-FE + MVP-BE] | documents + summary + source + cluster + tags |
| Dock Finder | [NEXT] | projects / topics / sources / dates + documents |
| Editor（标签形式） | [CURRENT-FE + MVP-BE] | documents + blocks + properties |
| Floating Tools | [CURRENT-FE] | 入口预留，各工具后续独立接入 |

---

## 5. 核心对象生命周期

每个生命周期说明：谁触发、写入哪些表、哪些模块会同步变化。

### 5.1 Capture 生命周期 [MVP-BE]

```
raw → normalized → suggested → anchored / rejected / manual_adjusted → archived
```

**状态转换规则**：
- 用户接受推荐落点后：suggested → anchored
- 用户拒绝推荐落点后：suggested → rejected
- 用户手动调整落点后：suggested 或 anchored → manual_adjusted
- 用户主动归档或长期低活跃：anchored / manual_adjusted → archived

> **注意**：`ignored` 只能作为 recommendation 的事件状态（recommendation_events.event_type=ignored），不作为 captures.status。`archived` 是 Capture 的终态之一，不等于 anchored。

| 状态 | 触发者 | 写入表 | 同步变化 |
| --- | --- | --- | --- |
| raw | 用户输入（星辰输入框/粘贴/导入） | captures（status=raw） | Mind：无（尚未投影） |
| normalized | 系统标准化流程 | captures（analysis_json 填充） | 无 |
| suggested | 系统分类+落点计算 | captures（status=suggested），mind_nodes（state=drifting/suggested），documents（status=captured） | Mind：新节点出现在建议位置；Dock：新条目出现 |
| anchored | 用户确认落点 或 高置信度自动锚定 | captures（status=anchored），mind_nodes（state=anchored），recommendation_events | Mind：节点进入稳定位置；Dock：状态更新 |
| rejected | 用户拒绝推荐落点 | captures（status=rejected），recommendation_events | Mind：节点回到漂浮区 |
| manual_adjusted | 用户手动拖动到新位置 | captures（status=manual_adjusted），mind_nodes（更新 parent_node_id/cluster_id），user_behavior_events | Mind：节点移动到新位置；Dock：项目/标签同步更新 |
| archived | 长期未编辑/用户主动归档 | captures（status=archived），mind_nodes（state=archived） | Mind：节点亮度降低；Dock：归档分区 |

### 5.2 Document 生命周期 [MVP-BE]

```
draft → captured → suggested → active → archived → deleted
```

| 状态 | 触发者 | 写入表 | 同步变化 |
| --- | --- | --- | --- |
| draft | Editor 自动保存草稿 | documents（status=draft），editor_drafts（前端 IndexedDB） | 无 |
| captured | Capture 标准化后生成 | documents（status=captured），关联 captures.generated_document_id | Dock：新文档可见 |
| suggested | 系统分类完成，等待确认 | documents（status=suggested） | Mind：对应节点 state=suggested |
| active | 用户确认或编辑保存 | documents（status=active） | Mind：节点 state=active；Dock：文档可编辑 |
| archived | 用户归档 | documents（status=archived，archived_at 填充） | Mind：节点 state=archived；Dock：移入归档区 |
| deleted | 用户删除 | documents（软删除或标记 status=deleted），mind_nodes（级联处理），mind_edges（级联删除） | Mind：节点移除或标记孤立；Dock：条目消失 |

**关键约束**：删除 Document 时，对应 MindNode 不能直接物理删除，应先检查是否还有其他 Document 关联该 Node（如多个文档属于同一主题节点），避免破坏性孤儿节点。

### 5.3 MindNode 生命周期 [CURRENT-FE + MVP-BE]

```
drifting → suggested → anchored → active → dormant / isolated / archived
```

| 状态 | 触发者 | 写入表 | 同步变化 |
| --- | --- | --- | --- |
| drifting | Capture 生成新节点，低置信度 | mind_nodes（state=drifting） | Mind：外围漂浮星尘 |
| suggested | 系统推荐落点，中等置信度 | mind_nodes（state=suggested，填充 cluster_id 候选） | Mind：节点显示建议连线 |
| anchored | 用户确认或高置信自动锚定 | mind_nodes（state=anchored，填充 parent_node_id/cluster_id） | Mind：节点进入稳定星群位置 |
| active | 最近被编辑、访问或关联增强 | mind_nodes（state=active，更新 activity_score） | Mind：节点视觉呼吸效果 |
| dormant | 长期未访问（如 30 天） | mind_nodes（state=dormant） | Mind：节点亮度降低 |
| isolated | 关联的 Document 被删除且无其他关联 | mind_nodes（state=isolated） | Mind：周围无线或仅有弱线 |
| archived | 用户归档该节点对应的所有内容 | mind_nodes（state=archived） | Mind：节点移至星云边缘 |

### 5.4 MindEdge 生命周期 [CURRENT-FE + MVP-BE]

```
suggested → confirmed / rejected / hidden
```

| 状态 | 触发者 | 写入表 | 同步变化 |
| --- | --- | --- | --- |
| suggested | 系统关系生成（内容相似、同项目、同标签等） | mind_edges（status=suggested，created_by=system） | Mind：虚线弱连线 |
| confirmed | 用户确认 或 系统高置信自动确认 或 用户手动创建 | mind_edges（status=confirmed，created_by=user/system） | Mind：实线稳定连线；Dock：关系字段更新 |
| rejected | 用户拒绝系统建议连线 | mind_edges（status=rejected） | Mind：连线消失 |
| hidden | 用户手动隐藏某条线 | mind_edges（status=hidden） | Mind：连线不显示但数据保留 |

### 5.5 Recommendation 生命周期 [MVP-BE]

```
generated → shown → accepted / rejected / modified / ignored → learned / cooled_down
```

**字段语义**：
- `subject_type` / `subject_id`：被推荐处理的对象，例如 `capture`/`document`/`node`
- `candidate_type` / `candidate_id`：推荐候选目标，例如 `project`/`tag`/`cluster`/`node`/`document`
- `recommendation_type`：推荐类型，枚举为 `landing`/`link`/`tag`/`project`/`cluster`/`review`/`nudge`

**Top-K 候选推荐**：同一 subject 可以生成多个 candidate。用户接受一个后，其他同类候选进入 `ignored` 或 `cooled_down`。

| 状态 | 触发者 | 写入表 | 同步变化 |
| --- | --- | --- | --- |
| generated | 系统分析后生成推荐 | recommendations（status=generated）→ recommendation_events（event_type=generated） | 无 |
| shown | 前端展示推荐给用户 | recommendations（status=shown）→ recommendation_events（event_type=shown） | Mind/Dock：推荐 UI 展示 |
| accepted | 用户接受推荐 | recommendations（status=accepted）→ recommendation_events（event_type=accepted），mind_nodes（更新 state），user_behavior_events | Mind：节点落定；Dock：状态更新 |
| rejected | 用户拒绝推荐 | recommendations（status=rejected）→ recommendation_events（event_type=rejected），user_behavior_events | Mind：节点回退漂浮 |
| modified | 用户修改推荐后接受 | recommendations（status=modified）→ recommendation_events（event_type=modified），user_behavior_events | Mind：节点落到修改后的位置 |
| ignored | 推荐展示后用户未操作超时 或 同类其他候选被接受 | recommendations（status=ignored）→ recommendation_events（event_type=ignored） | 无即时变化 |
| learned | NEXT：被算法学习吸收 | [NEXT] preference_profiles | 后续推荐权重调整 |
| cooled_down | 同类推荐冷却期 | recommendations（status=cooled_down）→ recommendation_events（event_type=cooled_down） | 短期内不再推同类建议 |

**MVP 关键约束**：必须从第一个 Capture 开始记录推荐事件。`recommendations` 表维护推荐对象的当前状态，`recommendation_events` 表作为不可变事件日志。状态变更时同步写入两表。

---

## 6. 数据表设计

每张表按以下格式定义：

- **表名**
- **状态**：[CURRENT-FE + MVP-BE] / [MVP-BE] / [NEXT] / [RESERVED]
- **用途**：一句话说明表的作用
- **核心字段**：关键字段和类型
- **服务闭环**：该表参与哪些闭环
- **迁移建议**：当前前端 IndexedDB 已有结构如何迁移到后端表

---

### 6.1 users

- **状态**：[MVP-BE]
- **用途**：用户账户基础信息
- **核心字段**：
  - `id` TEXT PK（UUIDv7，Atlax App User ID，可本地预生成）
  - `auth_provider` TEXT nullable（supabase/oauth/apple/google）
  - `auth_user_id` TEXT nullable UNIQUE（Supabase Auth UID 等第三方认证 ID）
  - `display_name` TEXT NOT NULL
  - `email` TEXT
  - `avatar_url` TEXT
  - `locale` TEXT DEFAULT 'zh-CN'
  - `timezone` TEXT DEFAULT 'Asia/Shanghai'
  - `plan` TEXT DEFAULT 'free'
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：所有闭环（用户身份基础）
- **迁移建议**：[CURRENT-FE] 前端 localStorage + IndexedDB 中隐式存在 userId（硬编码 `_legacy` 或 Supabase auth uid）。**关键设计**：`users.id` 为 Atlax 本地业务主键，不直接使用第三方 Auth UID。MVP 可将 Supabase Auth UID 写入 `auth_user_id`，通过 `auth_provider='supabase'` 标识。`auth_user_id` 设置 UNIQUE 约束以保证一对一映射。

### 6.2 workspaces

- **状态**：[MVP-BE]
- **用途**：用户工作空间，一个用户可有多个 workspace
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `name` TEXT NOT NULL
  - `mode` TEXT DEFAULT 'local'（local/cloud）
  - `root_node_id` TEXT FK→mind_nodes（该 workspace 的根知识节点）
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：所有闭环（数据隔离）
- **迁移建议**：[CURRENT-FE] 前端未显式建模 workspace。MVP 阶段每用户默认创建一个 workspace。

### 6.3 workspace_sessions

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：工作区会话，记录用户当前活跃标签和工作状态
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `active_tab_id` TEXT FK→workspace_open_tabs
  - `last_activity_at` TIMESTAMPTZ NOT NULL
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：工作区闭环（3.4）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `workspaceSessions` 表。结构一致，直接迁移。id 生成规则：`makeWorkspaceSessionId(userId)` → 后端保持相同。

### 6.4 workspace_open_tabs

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：工作区打开的标签页，持久化标签状态
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `session_id` TEXT NOT NULL FK→workspace_sessions
  - `tab_type` TEXT NOT NULL（editor/home/mind/dock/project）
  - `title` TEXT NOT NULL
  - `path` TEXT NOT NULL
  - `document_id` TEXT FK→documents
  - `is_pinned` BOOLEAN DEFAULT FALSE
  - `is_active` BOOLEAN DEFAULT FALSE
  - `sort_order` INTEGER NOT NULL
  - `opened_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：工作区闭环（3.4）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `workspaceOpenTabs` 表。结构一致，直接迁移。注意 document_id 从 INTEGER 改为 TEXT。

### 6.5 documents

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：长期内容资产，一篇完整文档。**不等于 Entry。**
- **核心字段**：
  - `id` TEXT PK（UUIDv7 / ULID）
  - `legacy_local_id` INTEGER nullable（兼容前端历史 IndexedDB 的 INTEGER id，迁移后保留用于 backward reference）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `title` TEXT NOT NULL
  - `slug` TEXT
  - `document_type` TEXT NOT NULL（note/meeting/idea/task/reading）
  - `status` TEXT NOT NULL（draft/captured/suggested/active/archived/deleted）
  - `primary_project_id` TEXT FK→projects（文档的主要归属项目，MVP 简洁方案）
  - `markdown` TEXT（长期资产格式）
  - `plain_text` TEXT（搜索和算法输入）
  - `block_json` JSONB（编辑器结构）
  - `properties_json` JSONB（属性、来源元数据）
  - `source_type` TEXT DEFAULT 'manual'
  - `source_url` TEXT
  - `source_ref_id` TEXT（外键指向 source_items）
  - `word_count` INTEGER DEFAULT 0
  - `reading_time` INTEGER DEFAULT 0
  - `content_hash` TEXT（去重用）
  - `structure_recompute_status` TEXT DEFAULT 'idle'（idle/pending/in_progress/done/error，记录结构化重算状态）
  - `sync_status` TEXT DEFAULT 'local'（local/pending/synced/error，IndexedDB ↔ 后端双写状态）
  - `archived_at` TIMESTAMPTZ
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
  - `last_opened_at` TIMESTAMPTZ
- **服务闭环**：编辑闭环（3.2）、管理闭环（3.3）、快速输入闭环（3.1）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `entries` 表即为 documents。当前字段：id (INTEGER), userId, sourceDockItemId, title, content, type, tags, project, actions, createdAt, archivedAt。**重要变化**：
  - `id` INTEGER → TEXT（UUIDv7），原 INTEGER id 迁移至 `legacy_local_id`
  - `content` → 拆为 `markdown` + `plain_text` + `block_json`
  - `sourceDockItemId` → 改为 `capture_id` FK→captures
  - 新增 `workspace_id`、`slug`、`source_type`、`source_url`、`content_hash`、`word_count`、`last_opened_at`
  - 新增 `structure_recompute_status`（结构化重算状态）、`sync_status`（双写同步状态）
  - 废弃 `actions` 字段（转为 block 内 todo）
- **主键迁移策略**：旧 INTEGER id 通过 `INSERT INTO documents (id, legacy_local_id, ...) VALUES (gen_uuidv7(), old_integer_id, ...)` backward fill。所有 FK（如 captures.generated_document_id、workspace_open_tabs.document_id）同步转为 TEXT。

### 6.6 document_blocks

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：文档的块级结构，支撑 Block Markdown 编辑器
- **核心字段**：
  - `id` TEXT PK
  - `document_id` TEXT NOT NULL FK→documents
  - `parent_block_id` TEXT FK→document_blocks
  - `block_type` TEXT NOT NULL（paragraph/heading/bullet_list/...）
  - `sort_order` INTEGER NOT NULL
  - `markdown` TEXT
  - `text` TEXT
  - `attrs_json` JSONB
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：编辑闭环（3.2）
- **迁移建议**：[CURRENT-FE] 前端未显式存储 blocks 表，Editor 以整体 content/markdown 存储。MVP 阶段 Editor 保存时同时写入 block 拆分。document_id 为 TEXT（UUIDv7）。

### 6.7 assets

- **状态**：[MVP-BE]
- **用途**：二进制资源（图片、附件、音频封面等）
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `document_id` TEXT FK→documents
  - `asset_type` TEXT NOT NULL（image/file/audio/video）
  - `filename` TEXT
  - `mime_type` TEXT
  - `size_bytes` INTEGER
  - `local_path` TEXT（本地存储路径）
  - `remote_url` TEXT（云端 URL，NEXT）
  - `hash` TEXT
  - `metadata_json` JSONB
  - `created_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：编辑闭环（3.2）
- **迁移建议**：[CURRENT-FE] 前端未独立建模。MVP 阶段新建。

### 6.8 captures

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：原始输入记录。**不等于 DockItem。**
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `legacy_local_id` INTEGER nullable
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `raw_text` TEXT NOT NULL（原始输入文本）
  - `capture_type` TEXT NOT NULL（quick_text/mind_star/chat_message/clipboard/web_clip/voice/image）
  - `capture_source` TEXT NOT NULL（text/voice/import/chat/manual）
  - `status` TEXT NOT NULL（raw/normalized/suggested/anchored/rejected/manual_adjusted/archived）
  - `topic` TEXT
  - `source_type` TEXT DEFAULT 'manual'
  - `source_url` TEXT
  - `generated_document_id` TEXT FK→documents
  - `generated_node_id` TEXT FK→mind_nodes
  - `suggestions_json` JSONB（系统生成的建议）
  - `user_tags` JSONB（用户手动标签）
  - `analysis_json` JSONB（标准化/抽取/分类的中间结果）
  - `confidence_score` REAL DEFAULT 0
  - `processed_at` TIMESTAMPTZ
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：快速输入闭环（3.1）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `dockItems` 表即为 captures。当前字段：id (INTEGER), userId, rawText, topic, sourceType, status, suggestions, userTags, selectedActions, selectedProject, sourceId, parentId, processedAt, createdAt。**重要变化**：
  - `id` INTEGER → TEXT（UUIDv7），原 INTEGER id 迁移至 `legacy_local_id`
  - `sourceType` → `capture_source`
  - 新增 `capture_type`（区分星辰输入/粘贴/语音等）
  - 新增 `workspace_id`、`capture_source`、`source_url`、`generated_document_id`、`generated_node_id`、`analysis_json`、`confidence_score`
  - `suggestions` → `suggestions_json`
  - `sourceId`/`parentId`（链式关联）→ 保留但移至 `metadata_json`
  - `selectedProject` → 通过 Document.properties_json 表达

### 6.9 source_items

- **状态**：[MVP-BE]
- **用途**：外部来源引用（微信文章、B站视频、小红书笔记等），不保存原始内容，只保存引用和元数据
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `source_type` TEXT NOT NULL（wechat/xiaohongshu/douyin/bilibili/obsidian/notion/web/manual）
  - `source_url` TEXT
  - `source_title` TEXT
  - `source_author` TEXT
  - `platform` TEXT（wechat/xiaohongshu/douyin/bilibili）
  - `captured_at` TIMESTAMPTZ
  - `metadata_json` JSONB
  - `import_job_id` TEXT FK→import_jobs（NEXT）
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：快速输入闭环（3.1）、导入流程（NEXT）
- **迁移建议**：[CURRENT-FE] 前端无此表。MVP 新建。来源信息当前嵌入 dockItems 的 sourceType 字段。

### 6.10 import_jobs

- **状态**：[NEXT]
- **用途**：批量导入任务
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `source_type` TEXT NOT NULL
  - `status` TEXT NOT NULL（pending/parsing/parsing_complete/previewing/confirmed/importing/done/failed）
  - `total_count` INTEGER DEFAULT 0
  - `parsed_count` INTEGER DEFAULT 0
  - `imported_count` INTEGER DEFAULT 0
  - `failed_count` INTEGER DEFAULT 0
  - `options_json` JSONB
  - `error_log` TEXT
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：导入流程（NEXT）
- **迁移建议**：MVP 不做导入，NEXT 阶段新建。

### 6.11 import_items

- **状态**：[NEXT]
- **用途**：导入任务中的单条记录
- **核心字段**：
  - `id` TEXT PK
  - `import_job_id` TEXT NOT NULL FK→import_jobs
  - `source_type` TEXT NOT NULL
  - `raw_path` TEXT
  - `raw_url` TEXT
  - `raw_title` TEXT
  - `raw_content_hash` TEXT
  - `aud_json` JSONB（Atlax Universal Document 格式）
  - `status` TEXT NOT NULL（pending/parsed/matched/imported/failed/duplicate）
  - `matched_document_id` TEXT FK→documents
  - `error_message` TEXT
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：导入流程（NEXT）
- **迁移建议**：同 import_jobs。

### 6.12 mind_nodes

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：星云树节点，内容的结构投影。Document 类型节点默认 1:1 关联；Project/Topic/Tag/Source/Cluster Center 类型节点可独立存在。
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `node_type` TEXT NOT NULL（root/domain/project/topic/document/fragment/source/tag/question/insight/time）
  - `state` TEXT NOT NULL（drifting/suggested/anchored/active/dormant/isolated/archived/conflicted）
  - `title` TEXT NOT NULL
  - `subtitle` TEXT
  - `summary` TEXT
  - `color_key` TEXT
  - `icon_key` TEXT
  - `weight` REAL DEFAULT 1
  - `importance_score` REAL DEFAULT 0
  - `activity_score` REAL DEFAULT 0
  - `confidence_score` REAL DEFAULT 0
  - `degree_score` REAL DEFAULT 0
  - `cluster_id` TEXT FK→clusters
  - `parent_node_id` TEXT FK→mind_nodes
  - `source_type` TEXT
  - `metadata_json` JSONB
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
  - `last_visited_at` TIMESTAMPTZ
- **服务闭环**：快速输入闭环（3.1）、编辑闭环（3.2）、管理闭环（3.3）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `mindNodes` 表。当前字段：id, userId, nodeType, label, state, documentId, degreeScore, recentActivityScore, documentWeightScore, userPinScore, clusterCenterScore, positionX, positionY, metadata, createdAt, updatedAt。**重要变化**：
  - `label` → `title`（语义更清晰）
  - **移除 `document_id` 字段**：Document ↔ MindNode 关系下沉到 `mind_node_documents` 关联表
  - 新增 `workspace_id`、`subtitle`、`summary`、`color_key`、`icon_key`、`weight`、`importance_score`、`activity_score`、`confidence_score`、`cluster_id`、`parent_node_id`、`source_type`、`last_visited_at`
  - 位置字段 `positionX/positionY` → 拆分至 `graph_layouts` 表
  - 评分字段保留但语义对齐：`degreeScore`→`degree_score`，`recentActivityScore`→`activity_score`

### 6.12b mind_node_documents [新增]

- **状态**：[MVP-BE]
- **用途**：MindNode 与 Document 的多对多关联表。替代 mind_nodes.document_id 单 FK。
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `node_id` TEXT NOT NULL FK→mind_nodes
  - `document_id` TEXT NOT NULL FK→documents
  - `relation_type` TEXT NOT NULL（primary/associated/reference/derived/source_projection）
  - `created_by` TEXT DEFAULT 'system'（user/system/import）
  - `created_at` TIMESTAMPTZ NOT NULL
  - UNIQUE(node_id, document_id, relation_type)
- **约束**：
  - 每个 `document` 类型 node 应有一条 `relation_type=primary` 记录。
  - 聚合节点（Project/Topic/Cluster Center）可有多条 `relation_type=associated` 记录。
  - 一个 document 在同一 workspace 下最多只能有一个 `relation_type=primary` 的 node 关联。
  - Project / Topic / Tag / Cluster Center 类型节点可以没有 document。
  - 删除 Document 前，检查 node 是否仍有其他 primary document 关联。
- **服务闭环**：编辑闭环（3.2）、管理闭环（3.3）、快速输入闭环（3.1）
- **迁移建议**：[CURRENT-FE] 前端 mindNodes.documentId (INTEGER) 迁移为 `mind_node_documents` 单条记录，`relation_type=primary`，`created_by=system`。

### 6.13 mind_edges

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：节点之间的关系连线
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `source_node_id` TEXT NOT NULL FK→mind_nodes
  - `target_node_id` TEXT NOT NULL FK→mind_nodes
  - `relation_type` TEXT NOT NULL（parent_child/reference/backlink/semantic/tag_related/project_related/source_related/temporal/manual/suggested/conflict）
  - `direction` TEXT DEFAULT 'undirected'
  - `confidence` REAL DEFAULT 0
  - `strength` REAL DEFAULT 0
  - `status` TEXT NOT NULL（suggested/confirmed/rejected/hidden）
  - `evidence_json` JSONB（推荐理由）
  - `created_by` TEXT DEFAULT 'system'（user/system/import）
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：编辑闭环（3.2）、管理闭环（3.3）、快速输入闭环（3.1）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `mindEdges` 表。当前字段：id, userId, sourceNodeId, targetNodeId, edgeType, strength, source, confidence, reason, createdAt, updatedAt。**重要变化**：
  - `edgeType` → `relation_type`（语义对齐）
  - `source` → `created_by`
  - `reason` → `evidence_json`（支持多理由结构化）
  - 新增 `workspace_id`、`direction`、`status`

### 6.14 clusters

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：星群/主题团簇，图谱算法/视觉层的主题团簇，在 Mind 视图中形成星云雾区。**Cluster 不等于 Project**。
- **关键概念**：
  - **Project** 是用户可管理的业务组织单位。
  - **Cluster** 是图谱算法/视觉层的主题团簇。
  - Cluster 可以由系统自动生成（算法聚类），也可以绑定 Project 或 Topic。
  - 一个 Project 可以绑定 `default_cluster_id`（快速切换到对应星群视图）。
  - 不是所有 Cluster 都是 Project，也不是所有 Project 都只能有一个 Cluster。
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `cluster_type` TEXT NOT NULL（domain/project/topic/source/time/import_batch/temporary）
  - `title` TEXT NOT NULL
  - `summary` TEXT
  - `center_node_id` TEXT FK→mind_nodes
  - `bound_project_id` TEXT FK→projects（该 Cluster 绑定的 Project，nullable）
  - `bound_topic_id` TEXT FK→mind_nodes（该 Cluster 绑定的 Topic 节点，nullable）
  - `generation_source` TEXT DEFAULT 'system'（system/manual/project_binding/topic_binding）
  - `color_key` TEXT
  - `confidence` REAL DEFAULT 0
  - `node_count` INTEGER DEFAULT 0
  - `metadata_json` JSONB
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：管理闭环（3.3）
- **迁移建议**：[CURRENT-FE] 前端 `collections` 表部分承担星群角色但没有显式 cluster 表。MVP 阶段新建 clusters 表，project/topic 类型的 collection 可自动映射为 cluster（绑定 `bound_project_id`）。

### 6.15 projects

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：用户可管理的业务组织单位，是 Document 的组织容器。
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `name` TEXT NOT NULL
  - `description` TEXT
  - `icon` TEXT
  - `color` TEXT
  - `parent_id` TEXT FK→projects
  - `sort_order` INTEGER DEFAULT 0
  - `collection_type` TEXT NOT NULL（folder/project/area/archive）
  - `default_cluster_id` TEXT FK→clusters（该 Project 绑定的默认星群视图，nullable）
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：管理闭环（3.3）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `collections` 表。结构基本一致，新增 `default_cluster_id`。直接迁移。

### 6.16 tags

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：标签
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `name` TEXT NOT NULL
  - `created_at` TIMESTAMPTZ NOT NULL
  - UNIQUE(user_id, name)
- **服务闭环**：管理闭环（3.3）、快速输入闭环（3.1）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `tags` 表。id 生成规则：`${userId}_${makeTagId(name)}` → 后端保持一致。

### 6.16b document_tags [新增]

- **状态**：[MVP-BE]
- **用途**：Document 与 Tag 的多对多关联表。支撑 Dock 标签筛选和算法反馈需求。
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `document_id` TEXT NOT NULL FK→documents
  - `tag_id` TEXT NOT NULL FK→tags
  - `source` TEXT NOT NULL DEFAULT 'user'（user/system/import）
  - `confidence_score` REAL DEFAULT 0
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **约束**：`UNIQUE(document_id, tag_id)`
- **服务闭环**：管理闭环（3.3）、快速输入闭环（3.1）、反馈闭环（3.5）
- **迁移建议**：[CURRENT-FE] 前端 IndexedDB `entryTagRelations` 表即为 document_tags 前身。MVP 建表后，前端标签关系迁移至本表。系统推荐标签（source=system）通过 recommendation 流程写入。

### 6.17 graph_layouts

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：Mind 画布中节点的布局缓存（位置、速度、固定状态）
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `node_id` TEXT NOT NULL FK→mind_nodes
  - `layout_scope` TEXT NOT NULL（global/cluster/focus）
  - `x` REAL NOT NULL
  - `y` REAL NOT NULL
  - `z` REAL DEFAULT 0
  - `vx` REAL DEFAULT 0
  - `vy` REAL DEFAULT 0
  - `pinned` BOOLEAN DEFAULT FALSE
  - `metadata_json` JSONB
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：编辑闭环（3.2，更新节点位置）、管理闭环（3.3，重排星群时更新布局）
- **约束**：`UNIQUE(workspace_id, node_id, layout_scope)`
- **迁移建议**：[CURRENT-FE] 前端 MindNode 表内嵌 `positionX`/`positionY` 字段。MVP 阶段分离到独立的 `graph_layouts` 表，每个 MindNode 对应一条 layout 记录。

### 6.18 graph_events

- **状态**：[CURRENT-FE + MVP-BE]
- **用途**：图谱操作事件日志（自动落库、用户拖拽、自动连线），支持撤销
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `event_type` TEXT NOT NULL（auto_landing/node_moved/edge_created/edge_deleted/layout_changed）
  - `target_type` TEXT NOT NULL（node/edge/cluster/document）
  - `target_id` TEXT NOT NULL
  - `before_json` JSONB
  - `after_json` JSONB
  - `reason_json` JSONB
  - `reversible` BOOLEAN DEFAULT TRUE
  - `created_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：所有闭环（事件溯源）
- **迁移建议**：[CURRENT-FE] 前端 `knowledgeEvents` 表即为 graph_events。当前字段：id, userId, eventType, targetType, targetId, metadata, createdAt。**重要变化**：`metadata` → 拆分为 `before_json`/`after_json`/`reason_json`，支持撤销。

### 6.19 graph_signals

- **状态**：[RESERVED]
- **用途**：图谱健康信号（孤立节点、停滞项目、重复主题等），Review 功能的数据基础
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `signal_type` TEXT NOT NULL（orphan_node/stale_document/missing_link/repeated_topic/project_stalled/weekly_summary/question_prompt）
  - `target_node_id` TEXT FK→mind_nodes
  - `target_document_id` TEXT FK→documents
  - `severity` TEXT
  - `title` TEXT NOT NULL
  - `description` TEXT
  - `data_json` JSONB
  - `status` TEXT DEFAULT 'active'
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：Review（RESERVED）
- **迁移建议**：[CURRENT-FE] 前端无此表。RESERVED。

### 6.20 user_behavior_events

- **状态**：[MVP-BE]
- **用途**：用户操作行为事件（拖动节点、修改归属、手动连线等），是反馈闭环的数据基础
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `event_type` TEXT NOT NULL（move_node/change_cluster/manual_link/accept_suggestion/reject_suggestion/drag_layout）
  - `target_type` TEXT NOT NULL（node/edge/document/cluster）
  - `target_id` TEXT NOT NULL
  - `from_context_json` JSONB（操作前上下文）
  - `to_context_json` JSONB（操作后上下文）
  - `session_id` TEXT FK→workspace_sessions
  - `sync_status` TEXT DEFAULT 'local'（local/pending/synced/error）
  - `created_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：反馈闭环（3.5）
- **迁移建议**：[CURRENT-FE] 前端无显式 behavior event 表。MVP 新建。当前用户操作（拖动、修改归属）应改为写入此表。

### 6.21 recommendations [新增，核心]

- **状态**：[MVP-BE]
- **用途**：推荐对象主表。维护推荐的当前状态与置信度，是 `recommendation_events` 的聚合投影。
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `subject_type` TEXT NOT NULL（capture/document/node，被推荐处理的对象类型）
  - `subject_id` TEXT NOT NULL（被推荐处理的对象 ID）
  - `recommendation_type` TEXT NOT NULL（landing/link/tag/project/cluster/review/nudge）
  - `candidate_type` TEXT NOT NULL（project/tag/cluster/node/document，推荐候选目标类型）
  - `candidate_id` TEXT NOT NULL（推荐候选目标 ID）
  - `status` TEXT NOT NULL（generated/shown/accepted/rejected/modified/ignored/cooled_down）
  - `confidence_score` REAL DEFAULT 0
  - `reason_json` JSONB（推荐理由）
  - `created_at` TIMESTAMPTZ NOT NULL
  - `updated_at` TIMESTAMPTZ NOT NULL
- **未来扩展字段 / 通用推荐抽象**：
  | 字段 | 状态 | 说明 |
  | --- | --- | --- |
  | `source_type` | [MVP-BE / NEXT-compatible] | 推荐来源类型，例如 capture/document/mind_node/graph_chain |
  | `source_id` | [MVP-BE / NEXT-compatible] | 推荐来源对象 ID |
  | `source_context_json` | [NEXT] | 额外上下文，例如 root_node_id、selected_chain_ids、graph_scope |
  | `target_type` | [MVP-BE / NEXT-compatible] | 推荐目标类型，例如 tag/project/cluster/mind_edge/workspace_pack/collection_view |
  | `target_id` | [MVP-BE / NEXT-compatible] | 推荐目标 ID，可为空 |
  | `candidate_payload_json` | [NEXT] | 非简单目标推荐的候选草案，例如 workspace preview |
  | `reason_codes_json` | [MVP-BE] | 可解释推荐理由编码 |
  | `confidence_score` | [MVP-BE] | 置信度 |
  | `status` | [MVP-BE] | generated/shown/accepted/rejected/modified/ignored/expired |
- **扩展说明**：
  - `target_type` 将当前 tag/project/cluster/link 推荐抽象为统一目标类型，未来可扩展到 `workspace_pack`，但 `workspace_pack` 推荐不属于当前 MVP 必做项。
  - `candidate_payload_json` 在 MVP 阶段可为空；NEXT / RESERVED 阶段用于承载 Preview Candidate，例如工作台结构草案、待确认字段、低置信内容列表。
  - 旧字段 `subject_type` / `subject_id` / `recommendation_type` / `candidate_type` / `candidate_id` 保留，MVP 可继续使用；新增字段用于向通用推荐对象渐进兼容。
- **约束**：
  - 状态变更时同步追加 `recommendation_events` 记录。
  - `UNIQUE(user_id, workspace_id, subject_type, subject_id, recommendation_type, candidate_type, candidate_id)`
  - 同一 subject 可生成多个 candidate（Top-K 候选推荐）；用户接受一个后，其他同类候选进入 `ignored`/`cooled_down`。
- **服务闭环**：反馈闭环（3.5）、快速输入闭环（3.1）
- **迁移建议**：[CURRENT-FE] 前端无此表。MVP 从第一个 Capture 开始记录。

### 6.21b recommendation_events

- **状态**：[MVP-BE]
- **用途**：推荐事件日志（不可变），记录推荐的完整生命周期事件。是反馈闭环的事件溯源表。
- **核心字段**：
  - `id` TEXT PK（UUIDv7）
  - `recommendation_id` TEXT NOT NULL FK→recommendations
  - `user_id` TEXT NOT NULL FK→users
  - `workspace_id` TEXT NOT NULL FK→workspaces
  - `event_type` TEXT NOT NULL（generated/shown/accepted/rejected/modified/ignored/cooled_down）
  - `event_payload` JSONB（事件附加数据，如修改后的 candidate、用户反馈细节）
  - `session_id` TEXT FK→workspace_sessions
  - `sync_status` TEXT DEFAULT 'local'（local/pending/synced/error）
  - `created_at` TIMESTAMPTZ NOT NULL
- **事件类型扩展**：
  | event_type | 状态 | 说明 |
  | --- | --- | --- |
  | `generated` / `shown` / `accepted` / `rejected` / `modified` / `ignored` / `cooled_down` | [MVP-BE] | 当前推荐生命周期事件 |
  | `previewed` | [NEXT] | 用户打开推荐候选 Preview |
  | `workspace_pack_selected` | [NEXT] | 用户选择某个工作台结构包，作为算法输入 |
  | `workspace_pack_rejected` | [NEXT] | 用户拒绝某个工作台结构包 |
  | `preview_field_modified` | [NEXT] | 用户在 Preview 中修改字段 |
  | `preview_view_changed` | [NEXT] | 用户在 Preview 中切换或调整视图 |
  | `low_confidence_item_moved_to_inbox` | [NEXT] | 低置信条目被放入 Inbox 等待确认 |
  | `generation_confirmed` | [RESERVED] | 用户确认从 Preview 创建结构草案 |
  | `generation_cancelled` | [RESERVED] | 用户取消从 Preview 创建结构草案 |
- **扩展说明**：MVP 只需保留 `event_type` 的可扩展性，不要求实现全部事件。用户显式选择是算法输入，不只是 UI 行为，未来会进入偏好蒸馏闭环。
- **服务闭环**：反馈闭环（3.5）、快速输入闭环（3.1）
- **迁移建议**：[CURRENT-FE] 前端无此表。MVP 新建。与 `recommendations` 在同一事务内写入。

### 6.22 feature_snapshots

- **状态**：[NEXT]
- **用途**：内容特征快照，用于训练和回溯对比
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `document_id` TEXT FK→documents
  - `feature_type` TEXT NOT NULL（tfidf/embedding/entity/classification）
  - `feature_data` JSONB NOT NULL
  - `model_version` TEXT
  - `created_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：反馈闭环（3.5，NEXT 阶段的算法输入）
- **迁移建议**：NEXT 新建。

### 6.23 preference_profiles

- **状态**：[NEXT]
- **用途**：用户偏好画像
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `category_weights` JSONB（各分类权重）
  - `tag_preferences` JSONB（标签偏好）
  - `time_preferences` JSONB（时间段偏好）
  - `source_preferences` JSONB（来源偏好）
  - `confidence_threshold` REAL DEFAULT 0.55
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：反馈闭环（3.5，NEXT）
- **迁移建议**：NEXT 新建。

### 6.24 rhythm_profiles

- **状态**：[NEXT]
- **用途**：用户使用节律画像
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `active_hours` JSONB（活跃时段分布）
  - `input_frequency` JSONB（输入频率统计）
  - `review_cycle_days` INTEGER（回顾周期，天）
  - `peak_productivity_windows` JSONB
  - `updated_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：Review/Nudge（NEXT）
- **迁移建议**：NEXT 新建。

### 6.25 algorithm_cache

- **状态**：[RESERVED]
- **用途**：算法中间结果缓存
- **核心字段**：
  - `id` TEXT PK
  - `user_id` TEXT NOT NULL FK→users
  - `cache_type` TEXT NOT NULL（embedding/clustering/similarity）
  - `cache_key` TEXT NOT NULL
  - `cache_data` JSONB NOT NULL
  - `expires_at` TIMESTAMPTZ
  - `created_at` TIMESTAMPTZ NOT NULL
- **服务闭环**：未来算法加速
- **迁移建议**：RESERVED。

---

## 7. 模块协作设计

以下说明每个模块如何与其他模块协作完成闭环。不是 UI 说明，而是**数据如何流动、状态如何传递**。

### 7.1 Home（入口页）[CURRENT-FE + MVP-BE]

**职责**：用户进入产品后的默认起点，不对接核心业务数据创建。

**协作行为**：

| 行为 | 数据来源 | 目标 |
| --- | --- | --- |
| 显示最近文档 | GET `/api/documents?sort=recent&limit=20` [CURRENT-FE IndexedDB，MVP-BE 后端 API] | WorkspaceTabs：点击打开 Editor 标签 |
| 新建文档入口 | 前端路由 `/editor/new` | Editor：创建空白 Draft，自动保存后生成 Document [MVP-BE] |
| 上传入口 | [RESERVED] 文件上传 → ImportJob | Dock：后续进入 Import Staging |
| 项目入口 | GET `/api/projects` [CURRENT-FE + MVP-BE] | Dock：切换到项目筛选视图 |

**MVP 关键交付**：Home 能通过 `GET /api/documents?sort=recent&limit=20` 获取最近文档列表（此 API 替代独立的 `recent_documents` 表）。

### 7.2 Mind（星云树视图）[CURRENT-FE + MVP-BE]

**职责**：知识结构的可视化呈现，只展示结构化结果，不展示全部数据。

**协作行为**：

| 行为 | 触发 | 写入/读取 | 联动模块 |
| --- | --- | --- | --- |
| 加载全局星云 | Mind 页面激活 | GET `/api/mind/graph` [MVP-BE] → mind_nodes + mind_edges + clusters + graph_layouts | Dock（如打开）：同步 selection |
| 星辰输入 | 用户在 Star Input 输入 | POST `/api/captures` [MVP-BE] → captures → documents → mind_nodes → recommendations + recommendation_events | Dock：新增条目；Editor：可打开对应 Document |
| 点击节点 | 用户点击 Mind 节点 | GET `/api/mind/nodes/{id}` [MVP-BE] | Dock：同步定位；Editor：可选打开 |
| 拖动节点 | 用户拖拽节点 | PATCH `/api/mind/nodes/{id}/layout` [CURRENT-FE，MVP-BE] + user_behavior_events | Dock：无变化（仅布局） |
| 拖动建立关系 | 用户拖节点到另一个节点 | POST `/api/mind/edges` [MVP-BE] + user_behavior_events | Dock：关系字段更新 |
| 落库反馈 | 用户确认/拒绝推荐 | POST `/api/recommendations/{id}/feedback` [MVP-BE] → recommendations + recommendation_events | Dock：状态更新 |
| Focus Mode | 用户点击项目/主题节点 | 前端视图状态，数据不变 | Dock：同步定位到对应项目 |

### 7.3 Dock（知识库管理区）[CURRENT-FE + MVP-BE]

**职责**：Mind 的结构化后台，Editor 的内容仓库。管理所有已进入系统的数据对象。

**协作行为**：

| 行为 | 触发 | 写入/读取 | 联动模块 |
| --- | --- | --- | --- |
| 列表加载 | Dock 页面激活 | GET `/api/dock/items` [MVP-BE] → documents + mind_nodes + tags | Mind：如打开，同步 selection |
| 选中文档 | 点击列表项 | 更新 WorkspaceSelection → dock | Mind：高亮对应节点 |
| 修改标签/项目 | 行内编辑属性 | PUT `/api/documents/{id}`（properties 更新）→ 触发管理闭环 | Mind：重算节点归属和连线 |
| 批量归档 | 多选 + 归档操作 | PATCH `/api/documents/batch` [MVP-BE] → 更新 status | Mind：节点 state → archived |
| 批量导入 | [NEXT] | POST `/api/import/jobs` | Mind：分批生成节点 |
| 待确认项 | 查看 suggested 状态的内容 | GET `/api/dock/items?status=suggested` | Mind：对应节点闪烁提示 |

### 7.4 Editor（工作行为层）[CURRENT-FE + MVP-BE]

**职责**：内容生产区，以 WorkspaceTabs 标签页形式打开。手动保存触发结构化流程。

**协作行为**：

| 行为 | 触发 | 写入/读取 | 联动模块 |
| --- | --- | --- | --- |
| 新建文档 | Cmd+N / Home 新建 | POST `/api/documents` [MVP-BE]（空文档，status=draft） | WorkspaceTabs：打开新标签 |
| 打开文档 | Home/Dock/Mind 点击 | GET `/api/documents/{id}` [MVP-BE] → markdown + block_json | WorkspaceTabs：打开/激活标签 |
| 自动保存 | Editor autosave / idle debounce / 关闭标签 / 切换文档 | PUT `/api/documents/{id}` [MVP-BE]（仅保存文档内容、草稿状态、content_hash）+ 前端 editorDrafts IndexedDB | 不触发结构化重算 |
| 手动保存 | Cmd+S / 显式 Save | PUT `/api/documents/{id}` → **触发完整编辑闭环** → extract plain text → update mind_node → recompute edges | Mind：节点更新；Dock：时间/摘要刷新 |
| 属性编辑 | Editor 侧边 Properties 面板 | PUT `/api/documents/{id}`（properties 更新）→ **触发管理闭环** | Mind：节点归属更新；Dock：列表刷新 |

**保存分层说明**（与 3.2 节一致）：
- **自动保存**：仅保存文档内容、草稿状态、`content_hash`，不触发完整结构化重算。
- **手动保存**（Cmd+S / 显式 Save）：触发完整编辑闭环，包括 plain_text 提取、MindNode 更新、Edge 重算。
- **轻量结构化检查**（idle debounce / 关闭标签 / 切换文档时可选触发）：只做 content_hash 比对和 node 存在性校验。

### 7.5 WorkspaceTabs（工作区标签系统）[CURRENT-FE + MVP-BE]

**职责**：管理多个打开的页面标签，支持打开、关闭、激活、恢复、置顶。

**协作行为**：

| 行为 | 触发 | 写入/读取 | 联动 |
| --- | --- | --- | --- |
| 打开标签 | 打开文档/项目/页面 | openWorkspaceTab() → workspace_open_tabs upsert + workspace_sessions update [CURRENT-FE IndexedDB，MVP-BE 后端 API] | 仅自身 |
| 关闭标签 | 点击关闭按钮 | closeWorkspaceTab() → delete tab + 激活下一个 [CURRENT-FE] | 仅自身 |
| 激活标签 | 点击标签 | activateWorkspaceTab() → 更新 is_active [CURRENT-FE] | 仅自身 |
| 置顶标签 | 右键置顶 | pinWorkspaceTab() → 更新 is_pinned [CURRENT-FE] | 仅自身 |
| 恢复标签 | 页面刷新后 | restoreWorkspaceTabs() → 从后端/IndexedDB 加载 [CURRENT-FE] | 仅自身 |

### 7.6 Floating Tools（浮动工具栏）[CURRENT-FE 入口 + RESERVED 后端]

**当前阶段**：只做入口样式和状态预留，不做完整功能。

| 工具 | 当前 | 后续（RESERVED） |
| --- | --- | --- |
| Chat | 浮动按钮入口 | 知识库问答，基于 graph context，不把所有文档塞入 prompt |
| Review | 浮动按钮入口 | 周报、健康检查，数据来源：graph_signals + documents + graph_events |
| Calendar | 浮动按钮入口 | 时间回看、Time Machine，数据来源：timeline_anchors |
| Widgets | 浮动按钮入口 | 小组件系统，数据来源：各功能独立接入 |

---

## 8. API 契约

按闭环组织 API，不按页面堆 API。每个 API 标注状态、闭环归属、字段契约。

### 8.1 POST /api/captures

- **状态**：[MVP-BE]
- **闭环**：快速输入闭环（3.1）
- **用途**：接收用户原始输入（星辰输入框、粘贴、导入）
- **触发来源**：Mind Star Input、Home Quick Input、Dock 手动添加
- **请求字段**：
  - `raw_text` string required
  - `capture_type` string required（quick_text/mind_star/clipboard）
  - `capture_source` string required（text/manual）
  - `source_url` string optional
  - `client_mutation_id` string required（幂等键，UUIDv7）
- **响应字段**：
  - `capture_id` string（UUIDv7）
  - `document_id` string（UUIDv7）
  - `node_id` string（UUIDv7）
  - `landing` object { status, confidence_score, candidate_type, candidate_id, reason[] }
- **写入表**：captures → documents → mind_nodes → recommendations + recommendation_events（同一事务）
- **触发事件**：recommendation_events（event_type=generated）

### 8.2 PUT /api/documents/{id}

- **状态**：[MVP-BE]
- **闭环**：编辑闭环（3.2）、管理闭环（3.3）
- **用途**：更新文档内容或属性。手动保存时触发完整编辑闭环；自动保存仅写入内容。
- **触发来源**：Editor 手动保存（Cmd+S）、Editor 自动保存、Dock 属性编辑
- **请求字段**：
  - `title` string optional
  - `markdown` string optional
  - `block_json` JSONB optional
  - `plain_text` string optional
  - `properties_json` JSONB optional（tags、project_id、status）
  - `save_mode` string optional（auto/manual），默认 manual
  - `client_mutation_id` string required（幂等键，UUIDv7）
  - `version` integer required（乐观锁版本号）
- **响应字段**：
  - `document` object（全量返回更新后的 Document）
  - `mind_node_updated` boolean
  - `structure_recompute_status` string
- **写入表**：documents（→ 若 save_mode=manual 则级联更新 mind_nodes、mind_edges）
- **触发事件**：若 manual：document_saved → extract → update node → recompute edges → refresh

### 8.2b GET /api/documents（列表/最近文档）

- **状态**：[MVP-BE]
- **闭环**：管理闭环（3.3）
- **用途**：获取文档列表，支持排序和筛选。`sort=recent` 替代独立的 `recent_documents` 表。
- **触发来源**：Home 最近文档、Dock 列表加载
- **请求字段**：
  - `sort` string optional（recent/updated_desc/updated_asc/created_desc/title_asc），默认 updated_desc
  - `status` string optional
  - `project_id` string optional
  - `limit` integer optional（默认 20）
- **响应字段**：
  - `documents` Document[]
  - `total` integer
- **写入表**：无（纯读）
- **说明**：此 API 代理 Home 的 `GET /api/documents/recent` 和 Dock 的部分列表需求。`GET /api/dock/items` 在此基础上返回更多 Dock 专属数据（facets、mind_node 关联等）。

### 8.2c PATCH /api/documents/batch

- **状态**：[MVP-BE]
- **闭环**：管理闭环（3.3）
- **用途**：批量更新文档（归档、状态变更等）
- **触发来源**：Dock 批量归档
- **请求字段**：
  - `document_ids` string[] required
  - `updates` object required（如 { status: "archived" }）
  - `client_mutation_id` string required（幂等键，UUIDv7）
- **响应字段**：
  - `updated_count` integer
  - `failed_ids` string[]
- **写入表**：documents（→ 触发管理闭环，mind_nodes/mind_edges 异步更新）
- **触发事件**：batch_update_completed

### 8.2d PATCH /api/mind/nodes/{id}/layout

- **状态**：[CURRENT-FE + MVP-BE]
- **闭环**：Mind 视图交互
- **用途**：更新节点布局位置（拖动后持久化）
- **触发来源**：Mind 拖动节点
- **请求字段**：
  - `x` real required
  - `y` real required
  - `pinned` boolean optional
  - `client_mutation_id` string required（幂等键，UUIDv7）
  - `version` integer required（乐观锁版本号）
- **写入表**：graph_layouts → user_behavior_events

### 8.3 GET /api/mind/graph

- **状态**：[MVP-BE]
- **闭环**：所有闭环（Mind 主视图数据源）
- **用途**：获取星云树全局图谱数据
- **触发来源**：Mind 页面激活、Dock 联动刷新
- **请求字段**：
  - `scope` string optional（global/cluster/focus），默认 global
  - `cluster_id` string optional（scope=cluster 时必传）
  - `node_id` string optional（scope=focus 时必传）
- **响应字段**：
  - `nodes` MindNode[]
  - `edges` MindEdge[]
  - `clusters` Cluster[]
  - `layouts` GraphLayout[]
- **写入表**：无（纯读）
- **触发事件**：无

### 8.4 GET /api/mind/nodes/{id}

- **状态**：[MVP-BE]
- **闭环**：编辑闭环（3.2）
- **用途**：获取节点详情，包含关联文档（通过 mind_node_documents）、关系、Dock 路径
- **触发来源**：Mind 点击节点
- **请求字段**：无
- **响应字段**：
  - `node` MindNode
  - `document` Document
  - `relations` { incoming, outgoing, suggested }
  - `dock_path` array（从根到该节点的路径）
  - `signals` array（NEXT）
- **写入表**：无
- **触发事件**：无

### 8.5 POST /api/mind/edges

- **状态**：[MVP-BE]
- **闭环**：管理闭环（3.3）
- **用途**：手动创建/确认节点关系
- **触发来源**：Mind 拖动建立关系、Dock 批量确认关系
- **请求字段**：
  - `source_node_id` string required
  - `target_node_id` string required
  - `relation_type` string required
  - `status` string required（confirmed）
- **响应字段**：
  - `edge` MindEdge
- **写入表**：mind_edges → user_behavior_events → graph_events
- **触发事件**：relation_confirmed

### 8.6 POST /api/mind/nodes/{id}/land

- **状态**：[MVP-BE]
- **闭环**：快速输入闭环（3.1）、反馈闭环（3.5）
- **用途**：用户确认节点落点（拖动到目标节点/星群）
- **触发来源**：Mind 拖动节点到星群、点击确认建议
- **请求字段**：
  - `target_node_id` string required
  - `relation_type` string required
  - `user_confirmed` boolean required
- **响应字段**：
  - `node` MindNode（更新后的节点）
  - `edge` MindEdge（创建的连线）
- **写入表**：mind_nodes（更新 parent_node_id/cluster_id/state）→ mind_node_documents（如适用）→ mind_edges → user_behavior_events → recommendations + recommendation_events
- **触发事件**：node_landed

### 8.7 GET /api/dock/items

- **状态**：[MVP-BE]
- **闭环**：管理闭环（3.3）
- **用途**：获取 Dock 管理视图数据
- **触发来源**：Dock 页面激活
- **请求字段**：
  - `view` string optional（list/card），默认 list
  - `status` string optional（过滤状态）
  - `project_id` string optional
  - `tag_id` string optional
  - `sort` string optional（updated_desc/updated_asc/created_desc/title_asc/recent）
  - `page` integer optional
  - `page_size` integer optional
- **响应字段**：
  - `items` DockItem[]
  - `facets` { projects, tags, sources, statuses }
  - `total` integer
- **写入表**：无（纯读）
- **触发事件**：无

### 8.8 POST /api/recommendations/{id}/feedback

- **状态**：[MVP-BE]
- **闭环**：反馈闭环（3.5）
- **用途**：记录用户对推荐的反馈，更新 recommendations 状态 + 追加 recommendation_events
- **触发来源**：Mind 落库反馈、Dock 确认建议
- **请求字段**：
  - `event_type` string required（accepted/rejected/modified/ignored）
  - `event_payload` JSONB optional（修改细节）
  - `idempotency_key` string required（幂等键，UUIDv7）
- **响应字段**：
  - `recommendation_id` string
  - `event_id` string
  - `new_status` string
- **写入表**：recommendations（更新 status）→ recommendation_events（追加事件）→ user_behavior_events（如适用）
- **触发事件**：recommendation_feedback_received

### 8.9 POST /api/import/jobs

- **状态**：[NEXT]
- **闭环**：导入流程（NEXT）
- **用途**：创建批量导入任务
- **触发来源**：Dock 导入按钮、Home Upload 入口
- **请求字段**：
  - `source_type` string required（obsidian/notion/markdown_files）
  - `options` object optional（preserve_folder_structure, preserve_tags, staging_first）
- **响应字段**：
  - `job_id` string
  - `status` string
- **写入表**：import_jobs → import_items（异步处理）
- **触发事件**：import_job_created

### 8.9b POST /api/mind/chains/{root_node_id}/workspace-recommendations

- **状态**：[RESERVED]
- **闭环**：Smart Workspace Recommendation（未来预留）
- **用途**：基于根节点及其链路上下文生成未来工作台推荐候选。该 API 不进入当前 MVP，不要求后端现在实现。
- **请求字段**：
  - `root_node_id` string required
  - `scope_depth` number optional
  - `user_goal` string optional
  - `preferred_view` string optional
  - `automation_level` string optional
- **响应字段**：
  - `candidates[]`
    - `candidate_id` string
    - `pack_id` string
    - `pack_name` string
    - `confidence_score` number
    - `reason[]`
    - `preview_summary` object
    - `low_confidence_items[]`
- **写入表**：无 MVP 写入要求；未来可写入 workspace_recommendation_candidates、recommendation_events。
- **触发事件**：未来可追加 `previewed`、`workspace_pack_selected` 等 recommendation_events。

### 8.10 GET /api/review/weekly

- **状态**：[RESERVED]
- **闭环**：Review（RESERVED）
- **用途**：获取周报数据
- **响应字段**：
  - `summary` string
  - `highlights` array
  - `stale_projects` array
  - `signals` array
- **写入表**：无（纯读 graph_signals + documents + graph_events）

### 8.11 GET /api/chat/nudges/next

- **状态**：[RESERVED]
- **闭环**：Chat/Nudge（RESERVED）
- **用途**：获取下一条系统提示/反问
- **响应字段**：
  - `nudge_type` string
  - `title` string
  - `description` string
  - `target_node_id` string optional
  - `action_suggestion` object optional
- **写入表**：无

---

## 9. 数据一致性与事务边界

后端 MVP 必须保证以下操作的数据一致性和可靠性。

### 9.1 关键事务边界

1. **POST /api/captures 快速输入事务**
   - capture、document、mind_node 创建必须在同一数据库事务内完成。
   - recommendation 记录在同一事务内初始生成。
   - 任一步骤失败，整体回滚，返回明确错误码。

2. **PUT /api/documents/{id} 文档保存**
   - 文档内容保存必须可靠（markdown、block_json、content_hash 写入不可丢失）。
   - 结构化重算（plain_text 提取 → MindNode 更新 → Edge 重算）可以异步执行，但必须通过 `structure_recompute_status` 字段追踪状态（idle → pending → in_progress → done / error）。
   - 自动保存（save_mode=auto）仅写 content，不触发重算。

3. **POST /api/recommendations/{id}/feedback 推荐反馈**
   - 更新 recommendations.status 和追加 recommendation_events 必须在同一事务内。
   - 反馈失败时不阻塞用户主操作（前端乐观更新），但后端必须记录 retry 状态。
   - 推荐反馈失败的事件标记 `sync_status=error`，由后台 job 重试。

### 9.2 降级与容错策略

1. **graph_events 写入降级**
   - graph_events 写入失败时，事件暂存于内存 buffer，批量重试。
   - 连续失败 3 次后降级为本地 IndexedDB 写入，标记 `sync_status=error`。

2. **user_behavior_events 写入降级**
   - behavior event 写入失败时，事件缓存在本地队列（最多 500 条），网络恢复后批量上传。
   - 超过 500 条时 FIFO 丢弃最旧事件并记录 warning。

3. **IndexedDB ↔ 后端双写策略**
   - MVP 阶段以本地 IndexedDB 数据为准，后端作为同步目标。
   - 写入流程：本地 IndexedDB 写入成功 → 标记 `sync_status=pending` → 异步写后端 → 成功后标记 `sync_status=synced`。
   - 后端写入失败时，保留 `sync_status=error`，下次同步周期重试。
   - 读取流程：优先读后端（如有），后端不可用时读本地 IndexedDB。

4. **冲突处理**
   - MVP 阶段采用 last-write-wins 策略（以 `updated_at` 最大的版本为准）。
   - 冲突检测通过 `content_hash` 比对实现。
   - 冲突发生时，旧版本保存到 `documents.properties_json._conflict_backup`。

### 9.3 异步处理约定

- 结构化重算（extract plain text → update node → recompute edges）通过后台 job 异步执行。
- jobs 表（MVP 可用简单内存队列）追踪 retry 状态。
- 异步任务失败不阻塞 API 响应，前端通过 `structure_recompute_status` 轮询进展。

### 9.4 统一字段约定（本地优先同步预留）

为支持本地优先（local-first）架构和后续云同步，核心可变业务表建议统一预留以下字段。MVP 不一定实现完整云同步，但字段预留可避免后续大规模迁移。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `client_id` | TEXT | 客户端生成的唯一 ID（UUIDv7），用于离线写入和冲突检测 |
| `device_id` | TEXT | 产生该记录的设备标识 |
| `client_created_at` | TIMESTAMPTZ | 客户端记录的创建时间 |
| `client_updated_at` | TIMESTAMPTZ | 客户端记录的最后更新时间 |
| `server_updated_at` | TIMESTAMPTZ | 服务端最后确认写入时间 |
| `sync_status` | TEXT | 同步状态，默认 `'local'`（local/pending/synced/error/conflict） |
| `deleted_at` | TIMESTAMPTZ | 软删除时间，nullable |
| `version` | INTEGER | 乐观锁版本号，默认 1 |

**适用表范围**（核心可变业务表）：

```
documents
document_blocks
captures
mind_nodes
mind_edges
clusters
projects
tags
document_tags
graph_layouts
recommendations
recommendation_events
user_behavior_events
workspace_sessions
workspace_open_tabs
```

### 9.5 API 幂等性约定

所有写接口应支持 `client_mutation_id`（或 `idempotency_key`），防止网络重试导致重复写入。

**必覆盖接口**：

| 接口 | 幂等键字段 |
| --- | --- |
| `POST /api/captures` | `client_mutation_id` 写入 captures.client_id |
| `PUT /api/documents/{id}` | `client_mutation_id` header + documents.version 乐观锁 |
| `POST /api/recommendations/{id}/feedback` | `idempotency_key` 写入 recommendation_events.client_id |
| `PATCH /api/documents/batch` | `client_mutation_id` header，服务端幂等去重 |
| `PATCH /api/mind/nodes/{id}/layout` | `client_mutation_id` header + graph_layouts.version 乐观锁 |

**实现约定**：
- 服务端按 `(user_id, client_mutation_id)` 去重，重复请求返回已有结果（不重复执行）。
- 幂等窗口至少保留 24 小时。
- `client_mutation_id` 由客户端生成（UUIDv7），一次用户操作使用同一个 ID。

---

## 10. 后端第一阶段落地路线

按闭环拆解 Phase，不按页面拆。

### Phase 0：代码事实扫描与 Schema 对齐 [MVP-BE 前置]

- **目标**：全面扫描前端 IndexedDB schema、Domain types、API 调用，确认当前实际数据结构和后端目标之间的 gap。
- **交付**：
  - 当前 IndexedDB 表清单与字段映射文档（含 INTEGER → UUIDv7 主键迁移方案）
  - 前端 Domain Type 与后端目标 Schema 的 diff 报告
- **不做**：任何后端代码

### Phase 1：统一数据骨架 [MVP-BE]

- **目标**：建立后端核心数据表，完成用户、工作空间、文档的基础 CRUD。使用 UUIDv7/ULID 主键。
- **表结构**：users [MVP-BE]、workspaces [MVP-BE]、documents [CURRENT-FE + MVP-BE]、document_blocks [CURRENT-FE + MVP-BE]、tags [CURRENT-FE + MVP-BE]、assets [MVP-BE]
- **API**：POST /api/documents、PUT /api/documents/{id}（支持 save_mode）、GET /api/documents/{id}、GET /api/documents?sort=recent
- **验收标准**：
  - 用户可创建 Document（UUIDv7 主键）
  - Editor 可保存和读取 Document（含 markdown + block_json，自动/手动保存区分）
  - Tag CRUD 正常
- **不做**：Mind 相关表、Capture 流程、导入

### Phase 2：Capture → Document → MindNode 最小闭环 [MVP-BE]

- **目标**：打通快速输入闭环的核心链路。
- **表结构**：captures [CURRENT-FE + MVP-BE]、mind_nodes [CURRENT-FE + MVP-BE]、mind_node_documents [MVP-BE]、mind_edges [CURRENT-FE + MVP-BE]、clusters [CURRENT-FE + MVP-BE]、graph_layouts [CURRENT-FE + MVP-BE]、graph_events [CURRENT-FE + MVP-BE]、source_items [MVP-BE]、projects [CURRENT-FE + MVP-BE]
- **API**：POST /api/captures（事务内创建 capture + document + mind_node + recommendations）、GET /api/mind/graph、GET /api/mind/nodes/{id}、POST /api/mind/edges、POST /api/mind/nodes/{id}/land
- **验收标准**：
  - Mind 输入一句话后，生成 Capture → Document → MindNode，同时写入 mind_node_documents
  - Mind 画布能加载节点、连线、星群
  - 用户可拖动节点确认落点
- **不做**：推荐系统算法、批量导入

### Phase 3：Dock / Mind / Editor 同步闭环 [MVP-BE]

- **目标**：打通管理闭环和编辑闭环，实现双向联动。
- **表结构**：完成所有 [CURRENT-FE + MVP-BE] / [MVP-BE] 表的字段和索引
- **API**：GET /api/dock/items、PUT /api/documents/{id}（触发结构化流程，异步重算 + structure_recompute_status）、PATCH /api/mind/nodes/{id}/layout、PATCH /api/documents/batch
- **关键交付**：
  - Editor 手动保存后触发结构化流程（extract plain text → update node → recompute edges，异步追踪）
  - Dock 修改标签/项目后 Mind 关系同步变化
- **不做**：大型图谱性能优化、WebSocket 实时同步

### Phase 4：Recommendation / RecommendationEvent / UserBehaviorEvent 反馈闭环 [MVP-BE]

- **目标**：建立推荐对象 + 推荐事件 + 用户行为事件的完整记录，为后续算法学习建立数据基础。
- **表结构**：recommendations [MVP-BE]、recommendation_events [MVP-BE]、user_behavior_events [MVP-BE]
- **API**：POST /api/recommendations/{id}/feedback
- **验收标准**：
  - 推荐生成时写入 recommendations + recommendation_events
  - 用户接受/拒绝推荐后更新 recommendations.status + 追加 recommendation_events
  - 用户拖动节点或修改归属后写入 user_behavior_events
  - 删除文档后不产生破坏性孤儿节点
- **不做**：preference_profiles 自动更新、算法权重实时调整

### Phase 5：Review / Nudge 数据预留 [NEXT + RESERVED]

- **目标**：建立 Review 和 Chat/Nudge 所需的数据表骨架，不做功能实现。
- **表结构**：graph_signals [RESERVED]、feature_snapshots [NEXT]、preference_profiles [NEXT]、rhythm_profiles [NEXT]、algorithm_cache [RESERVED]
- **API**：GET /api/review/weekly [RESERVED]、GET /api/chat/nudges/next [RESERVED]
- **验收标准**：表结构存在、API 骨架定义完成，入口 UI 可展示但不假装已有完整智能能力
- **不做**：实际 Review 算法、Chat 智能问答、Nudge 策略

---

## 11. 验收标准

### 11.1 可测试验收清单

以下每条都必须可被手动或自动测试验证：

1. [MVP-BE] Mind 输入一句话后，系统生成 Capture、Document、MindNode 三对象，同时写入 mind_node_documents。
2. [MVP-BE] Dock 列表能看到该 Document。
3. [MVP-BE] Editor 能通过 WorkspaceTabs 打开该 Document。
4. [MVP-BE] Editor 手动保存后，Mind 中对应节点更新 `updated_at` 和 `summary`；自动保存不触发。
5. [MVP-BE] Dock 修改标签/项目后，Mind 中节点关系和星群归属同步变化。
6. [MVP-BE] 用户确认/拒绝推荐落点后，`recommendations.status` 更新 + `recommendation_events` 追加记录。
7. [MVP-BE] 用户拖动节点或修改归属后，`user_behavior_events` 表写入对应记录。
8. [CURRENT-FE → MVP-BE] 刷新页面后，WorkspaceTabs 恢复之前的标签状态。
9. [MVP-BE] 删除 Document 后，检查 mind_node_documents 关联，正确标记 isolated 或级联处理。
10. [RESERVED] Review / Chat 入口存在于浮动工具栏，但不返回假装有完整智能能力的数据。
11. [MVP-BE] `GET /api/documents?sort=recent&limit=20` 返回最近文档列表（替代 recent_documents 独立表）。
12. [MVP-BE] POST /api/captures 的事务性：任一环节失败全部回滚。

### 11.2 必须避免的错误模式

| 错误 | 检查方法 |
| --- | --- |
| 把结构文档写成 UI 说明书 | 检查：有无 CSS 变量、组件树、视觉规范？应无。 |
| 把算法公式大量塞进结构文档 | 检查：TF-IDF/向量公式细节是否在本文件？应在算法文档。 |
| 制造新的 Entry 模块 | 检查：表中是否有 entry 命名？应为 document。 |
| Dock 和 Mind 成为两套状态 | 检查：Dock 修改标签是否触发 Mind 重算？API 设计已保证。 |
| Review / Chat / Widgets 提升为当前主导航 | 检查：主导航是否只有 Home/Mind/Dock？是。 |
| 未来能力写成已完成 | 检查：所有表是否都有 [CURRENT-FE + MVP-BE] / [MVP-BE] / [NEXT] / [RESERVED] 标记？是。 |
| Editor 保存只停留在文本层 | 检查：PUT /api/documents/{id} 手动保存是否触发结构化流程？是。 |
| 推荐没有事件记录 | 检查：POST /api/recommendations/{id}/feedback 是否存在？是。 |
| 后端误认为 [CURRENT] 表已在 BE 存在 | 检查：所有 [CURRENT] 已替换为 [CURRENT-FE + MVP-BE] 或 [MVP-BE]。 |

---

## 附录 A：当前前端 IndexedDB → 后端表映射速查

| 前端 IndexedDB 表名 | 后端目标表名 | 状态 | 关键差异 |
| --- | --- | --- | --- |
| dockItems | captures | [CURRENT-FE + MVP-BE] | id INTEGER→UUIDv7；新增 capture_type、workspace_id、confidence_score |
| entries | documents | [CURRENT-FE + MVP-BE] | id INTEGER→UUIDv7 (legacy_local_id)；content 拆为 markdown/plain_text/block_json；sourceDockItemId→capture_id |
| tags | tags | [CURRENT-FE + MVP-BE] | id→UUIDv7 |
| collections | projects | [CURRENT-FE + MVP-BE] | id→UUIDv7；新增 default_cluster_id |
| mindNodes | mind_nodes | [CURRENT-FE + MVP-BE] | 移除 document_id（下沉至 mind_node_documents）；positionX/Y→graph_layouts；label→title |
| mindEdges | mind_edges | [CURRENT-FE + MVP-BE] | edgeType→relation_type；source→created_by；reason→evidence_json |
| knowledgeEvents | graph_events | [CURRENT-FE + MVP-BE] | metadata→拆分为 before/after/reason |
| temporalActivities | timeline_anchors | [NEXT] | 结构对齐 |
| entryTagRelations | document_tags | [MVP-BE] | 从 [NEXT] 提升为 MVP-BE；source 字段区分 user/system/import |
| entryRelations | — | [NEXT] | 重构为 document_relations |
| workspaceSessions | workspace_sessions | [CURRENT-FE + MVP-BE] | 结构一致 |
| workspaceOpenTabs | workspace_open_tabs | [CURRENT-FE + MVP-BE] | document_id INTEGER→TEXT |
| recentDocuments | — | [移除] | 由 GET /api/documents?sort=recent 替代 |
| editorDrafts | editor_drafts | [MVP 保留前端 IndexedDB] | 后端以 documents.status=draft 支撑基础草稿；跨端草稿恢复升级为 NEXT-BE |
| chatSessions | chat_sessions | [RESERVED] | 结构预留 |
| widgets | widgets | [RESERVED] | 结构预留 |
| — | mind_node_documents | [MVP-BE] | **新增**（替代 mind_nodes.document_id） |
| — | recommendations | [MVP-BE] | **新增**（推荐对象主表） |
| — | recommendation_events | [MVP-BE] | **新增**（推荐事件日志） |
| — | user_behavior_events | [MVP-BE] | **新增** |
| — | graph_signals | [RESERVED] | **新增** |
| — | feature_snapshots | [NEXT] | **新增** |
| — | preference_profiles | [NEXT] | **新增** |
| — | rhythm_profiles | [NEXT] | **新增** |
| — | algorithm_cache | [RESERVED] | **新增** |
| — | source_items | [MVP-BE] | **新增** |
| — | document_blocks | [CURRENT-FE + MVP-BE] | **新增**（document_id TEXT FK） |
| — | assets | [MVP-BE] | **新增** |
| — | graph_layouts | [CURRENT-FE + MVP-BE] | **新增**（从 mind_nodes 分离） |
| — | clusters | [CURRENT-FE + MVP-BE] | **新增**（从 collections 概念独立，新增 bound_project_id 等） |
| — | import_jobs | [NEXT] | **新增** |
| — | import_items | [NEXT] | **新增** |
| — | structure_packs | [RESERVED] | **新增**（结构包注册表） |
| — | workspace_recommendation_candidates | [RESERVED] | **新增**（工作台推荐候选预览） |
| — | graph_feature_snapshots | [NEXT] | **新增**（链路级图谱特征快照；是 feature_snapshots 的 graph-chain 场景扩展） |
| — | collections | [RESERVED] | **新增**（未来 database / board 数据集合；不进入 MVP） |
| — | collection_properties | [RESERVED] | **新增**（未来集合字段定义） |
| — | collection_records | [RESERVED] | **新增**（未来集合记录） |
| — | collection_views | [RESERVED] | **新增**（未来集合视图配置） |
| — | record_node_links | [RESERVED] | **新增**（未来记录与星云节点映射） |

---

## 附录 B：名词对齐表

| 旧名词（废弃） | 新名词 | 说明 |
| --- | --- | --- |
| Entry | Document | Entry 模块已取消，Entry 对象废弃 |
| DockItem | Capture（原始）/ DockViewItem（视图） | dockItem 不再作为核心资产模型 |
| Suggestion | Recommendation | 统一为推荐概念 |
| KnowledgeEvent | GraphEvent | 语义对齐到图谱事件 |
| TemporalActivity | TimelineAnchor | NEXT 阶段 |
