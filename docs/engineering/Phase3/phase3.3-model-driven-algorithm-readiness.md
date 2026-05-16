# Phase 3.3 Model-Driven Algorithm Readiness — 算法就绪评估

> 本文档评估 Phase 3.3 模型驱动算法的就绪状态，梳理现有确定性推荐能力、反馈事件管道、以及 Phase 3.3 的算法升级路径。
> 生成日期：2026-05-16

---

## Current Deterministic Recommendation Capabilities

当前系统已具备的确定性推荐能力：

### IntelligenceSpine 核心函数

| 函数 | 位置 | 能力 |
|------|------|------|
| `generateBasicCandidates` | IntelligenceSpine | 基于关键词的候选生成，从已有 tag/project/mindNode 中匹配 |
| `scoreBasicCandidatesForRecommendation` | IntelligenceSpine | 对候选进行评分，输出 confidence 分值 |

### 推荐类型

| 类型 | 说明 |
|------|------|
| `tag` | 标签推荐 — 基于已有标签关键词匹配 |
| `project` | 项目推荐 — 基于已有项目关键词匹配 |
| `mindNode link` | 心智节点关联推荐 — 基于节点内容关键词匹配 |

### 推荐消费端

| 消费端 | 能力 |
|--------|------|
| Dock recommendation queue | 列表/应用/拒绝/忽略推荐，带反馈记录 |
| Mind recommendation inspector | 为心智节点生成并应用推荐 |

---

## Current Feedback Events

当前系统已记录的反馈事件管道：

### 推荐反馈

| 函数 | 反馈类型 | 说明 |
|------|----------|------|
| `recordRecommendationFeedback` | accepted | 用户接受了推荐 |
| `recordRecommendationFeedback` | rejected | 用户拒绝了推荐 |
| `recordRecommendationFeedback` | ignored | 用户忽略了推荐 |
| `recordRecommendationFeedback` | modified | 用户修改后接受了推荐 |

### 推荐事件

| 函数 | 事件类型 | 说明 |
|------|----------|------|
| `recordRecommendationEvent` | recommendation_shown | 推荐被展示给用户 |
| `recordRecommendationEvent` | recommendation_applied | 推荐被应用 |

### 用户行为

| 函数 | 说明 |
|------|------|
| `recordUserBehaviorEvent` | 用户行为追踪，记录通用行为事件 |

### 展示追踪（P32-CLOSEOUT-003 新增）

| 函数 | 说明 |
|------|------|
| `markRecommendationShown` | 推荐首次展示及 drawer/inspector 打开时标记为 shown，带去重保护 |

---

## How shown/accepted/rejected/ignored Enter Phase 3.3

四种反馈信号在 Phase 3.3 中的进入方式：

### shown（展示）

- **当前状态**：P32-CLOSEOUT-003 新增追踪，作为 impression 数据进入反馈循环
- **Phase 3.3 进入方式**：shown 数据将用于过滤已展示推荐，避免重复推送；同时作为展示频次信号参与评分衰减

### accepted（接受）

- **当前状态**：已通过 `recordRecommendationFeedback` 追踪
- **Phase 3.3 进入方式**：作为正信号进入评分，提升同类推荐的 confidence 和排序权重

### rejected（拒绝）

- **当前状态**：已通过 `recordRecommendationFeedback` 追踪
- **Phase 3.3 进入方式**：作为负信号进入评分，降低同类推荐的 confidence 和排序权重

### ignored（忽略）

- **当前状态**：已通过 `recordRecommendationFeedback` 追踪
- **Phase 3.3 进入方式**：作为弱负信号进入评分，轻微降低同类推荐的 confidence

### Phase 3.3 反馈评分策略

Phase 3.3 应使用以上信号调整推荐 confidence 和排序：

```
adjusted_confidence = base_confidence
                    + α × (accepted_count / shown_count)
                    - β × (rejected_count / shown_count)
                    - γ × (ignored_count / shown_count)
```

其中 α > β > γ，具体参数需通过实验调优。

---

## LocalHealthReport as Health Signal Source

### 当前能力

`getLocalHealthReport` 提供以下数据结构：

| 字段 | 说明 |
|------|------|
| `score` | 健康度总分 |
| `level` | 健康等级 |
| `signals` | 健康信号列表 |
| `suggestions` | 改善建议列表 |
| `sections` | 分区健康详情 |

### 信号类型

| 信号 | 说明 |
|------|------|
| `isolated_mind_nodes` | 孤立心智节点 — 无关联 entry 的 mind node |
| `stale_drafts` | 过期草稿 — 长时间未更新的 draft |
| `stale_tips` | 过期闪念 — 长时间未处理的 tip |
| `duplicate_tags` | 重复标签 — 语义重复的 tag |
| `weakly_classified` | 弱分类条目 — 缺少 tag/project 的 entry |
| `orphan_documents` | 孤立文档 — 无关联 mind node 的 document |

### P32-CLOSEOUT-003 增强

- Suggestions 现在具有 `navigationTarget`，支持导航至 Dock 维护队列

### Phase 3.3 消费方式

Phase 3.3 应消费这些信号触发维护动作：

- `isolated_mind_nodes` → 触发关联推荐生成
- `stale_drafts` → 触发归档提醒
- `duplicate_tags` → 触发合并建议
- `weakly_classified` → 触发分类推荐
- `orphan_documents` → 触发节点关联推荐

---

## Review Suggestions → Dock Maintenance Queue

### 当前状态（P32-CLOSEOUT-003）

- 建议可导航至处理上下文 (Dock/Mind/Editor)
- 但不创建可执行任务

### Phase 3.3 目标

将建议转化为 Dock 可执行维护任务：

### 维护动作类型

| 动作类型 | 说明 | 来源信号 |
|----------|------|----------|
| `link_node` | 关联心智节点 | isolated_mind_nodes, orphan_documents |
| `add_tag` | 添加标签 | weakly_classified |
| `add_project` | 添加项目 | weakly_classified |
| `merge_duplicate_tag` | 合并重复标签 | duplicate_tags |
| `archive_stale` | 归档过期条目 | stale_drafts, stale_tips |

### 动作特性

- **可确认**：每个动作需用户确认后执行
- **可撤销**：每个动作执行后可回退

---

## Editor Metadata/Source Packet as Algorithm Input

### P32-CLOSEOUT-003 增强

- Draft `sourceEntryId`/`sourceType` 现在在 Source Packet 中暴露
- Tags 和 project metadata 在 Inspector 中可编辑

### Phase 3.3 消费方式

| 元数据 | 算法输入用途 |
|--------|-------------|
| `sourceEntryId` | 关联源文档，作为推荐上下文锚点 |
| `sourceType` | 区分来源类型，不同来源类型获得不同推荐策略（document-derived draft 获得不同建议） |
| `tags` | 作为推荐特征，参与 Jaccard 相似度计算 |
| `project` | 作为推荐特征，参与项目维度匹配 |

---

## Phase 3.3 Does NOT Directly Use LLM

Phase 3.3 的所有算法保持本地和确定性：

| 约束 | 说明 |
|------|------|
| 无外部 API 调用 | 不调用任何外部 LLM 服务 |
| 本地确定性 | 所有计算在客户端完成 |
| 轻量相似度 | title/content token overlap + tag/project Jaccard + recency decay |
| 规则评分 | 基于规则的评分 + 反馈权重调整 |

### 轻量相似度算法

```
similarity(A, B) = w1 × token_overlap(title_A, title_B)
                + w2 × token_overlap(content_A, content_B)
                + w3 × jaccard(tags_A, tags_B)
                + w4 × jaccard(projects_A, projects_B)
                + w5 × recency_decay(timestamp_A, timestamp_B)
```

其中 w1 + w2 + w3 + w4 + w5 = 1，recency_decay 使用指数衰减函数。

---

## Phase 3.3 First Round Tasks

Phase 3.3 首轮任务清单：

| # | 任务 | 优先级 | 依赖 |
|---|------|--------|------|
| 1 | **Local recommendation trigger** — Document/Draft/Tip 创建或发布时自动生成推荐 | 🔴 P0 | 无 |
| 2 | **Lightweight similarity** — title/content token overlap + tag/project Jaccard + recency decay 评分 | 🔴 P0 | 无 |
| 3 | **Feedback scoring** — 使用 shown/accepted/rejected/ignored 信号调整推荐 confidence 和排序 | 🔴 P0 | Task 2 |
| 4 | **Shown tracking consumption** — 消费 P32-CLOSEOUT-003 的 shown 追踪数据，过滤已展示推荐 | 🟡 P1 | Task 3 |
| 5 | **Maintenance action queue** — 将 Review suggestions 转化为 Dock 可执行任务，支持确认/撤销 | 🟡 P1 | Task 1, Task 3 |
| 6 | **Metadata source of truth** — 确立 tags/project 作为推荐特征的单一事实来源 | 🟡 P1 | Task 2 |
