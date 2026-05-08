# Atlax MindDock 本地结构算法与偏好蒸馏设计文档

版本：v1.2 Intelligent Local Preview
适用阶段：Phase 3.2：Golden Workspace 全量真实接入
核心目标：在既有 Local Preference Distillation Engine 基础上，补齐 Quick Capture、Tips、Drafts、Daily Brief、Review、Tools Hub、Import Control、Privacy Firewall 所需的本地智能规则和隐私边界。
状态标记：[LIVE] 已有真实实现 / [LOCAL-PREVIEW] 本地基础版必须实现 / [PRO-PREVIEW] 订阅功能预览 / [PLANNED] 后续规划 / [RESERVED] 未来预留

---

## 0. 2026-05-09 算法更新总则

### 0.1 本次更新目标

旧算法文档已经定义本地偏好蒸馏、候选召回、排序、推荐事件和反馈学习。本次更新不推翻旧设计，而是明确：第一版产品必须有“智能的样子”，即便暂时不用 LLM，也要通过真实本地数据和可解释规则让用户感知系统正在维护知识库。

### 0.2 智能感的第一版来源

第一版智能不依赖 LLM，来自：

1. Tips 积压检测。
2. Drafts 停滞检测。
3. 文档长期未打开检测。
4. 高频 tag / project / topic 检测。
5. Mind node / edge 周期变化统计。
6. RecommendationEngine 的候选召回和 Top-K 排序。
7. 用户接受 / 拒绝 / 修改 / 忽略反馈事件。
8. Home Widget / Daily Brief / Review 的行动建议展示。

---

## 0.3 新增算法场景

| 场景 | 状态 | 说明 |
|---|---|---|
| Quick Capture Landing | [LOCAL-PREVIEW] | Quick Capture 写入 Tips 后推荐 tag/project/node |
| Tips Cleanup Recommendation | [LOCAL-PREVIEW] | 检测 Tips 积压与推荐整理动作 |
| Draft Continuation Recommendation | [LOCAL-PREVIEW] | 检测停滞 Draft 并推荐继续编辑/归档/丢弃 |
| Daily Brief Recommendation | [LOCAL-PREVIEW] | 每日打开时基于本地状态生成行动建议 |
| Review Health Scoring | [LOCAL-PREVIEW] | Day/Week/Month/Year 周期健康分 |
| Mind Snapshot Selection | [LOCAL-PREVIEW] | 选择周期内新增/活跃/高连接节点生成快照 |
| Tool Recommendation | [PRO-PREVIEW] | 根据用户场景推荐 Tools Hub 中的模块，暂只展示 Preview |
| Import Source Recommendation | [PRO-PREVIEW] | 根据用户数据来源推荐导入源，暂只展示 Preview |
| Privacy Firewall Audit | [LOCAL-PREVIEW] | 记录本地算法运行和外部请求 |

---

## 0.4 Daily Brief 本地规则

Daily Brief 生成时机：

- 用户打开 Home。
- 用户点击 Daily Brief。
- 每日首次打开产品。

输入：

- captures。
- documents。
- mind_nodes。
- mind_edges。
- recommendations。
- recommendation_events。
- user_behavior_events。

基础规则：

```text
Tips 未处理数 >= 5
→ 推荐“整理 Quick Notes”

Draft 未编辑天数 >= 3
→ 推荐“继续编辑 / 归档 / 丢弃 Draft”

Document 未打开天数 >= 14 且 degree_score 高
→ 推荐“Review 高价值旧内容”

某 tag 最近 7 天出现次数 >= 3
→ 推荐“建立主题 / cluster”

某 project 最近 7 天有更新但没有 Review
→ 推荐“跟进项目”

昨日新增 mind_nodes > 0
→ 生成 Mind Snapshot
```

推荐必须写入 `recommendations` 或以 Brief runtime recommendation 形式展示。若展示给用户并可交互，必须写 `recommendation_events(shown)`。

---

## 0.5 Review 本地规则

Review 关注知识系统健康，不是日报。

健康分建议：

```text
health_score =
  0.25 * activity_score
+ 0.20 * organization_score
+ 0.20 * draft_pressure_score
+ 0.15 * tips_pressure_score
+ 0.10 * graph_connectivity_score
+ 0.10 * review_freshness_score
```

其中：

- activity_score：周期内创建/更新/打开行为。
- organization_score：tag/project/cluster 覆盖率。
- draft_pressure_score：Draft 积压越少越高。
- tips_pressure_score：Tips 积压越少越高。
- graph_connectivity_score：孤立节点越少越高。
- review_freshness_score：高价值内容长期未 review 越少越高。

周期支持：Day / Week / Month / Year。

---

## 0.6 Tips 算法

Tips 是 Quick Capture 默认落点。

关注指标：

- 未处理数量。
- 平均停留时间。
- 高频关键词。
- 与已有 tag/project/node 的匹配度。
- 是否适合转 Document。
- 是否适合合并到已有 Draft。

动作建议：

- `organize_tip`：整理单条 Tip。
- `batch_organize_tips`：批量整理 Tips。
- `convert_tip_to_document`：转正式文档。
- `merge_tip_to_draft`：合并到已有 Draft。
- `archive_tip`：归档。

---

## 0.7 Drafts 算法

Drafts 是 Editor 未完成工作区。

关注指标：

- 未编辑天数。
- 字数变化。
- 是否有标题。
- 是否已有 tag/project。
- 是否接近完成。
- 是否存在高频相关 Tips。

动作建议：

- `continue_draft`。
- `publish_draft`。
- `add_tags_to_draft`。
- `merge_tips_into_draft`。
- `archive_draft`。
- `discard_draft`。

---

## 0.8 Mind Snapshot 选择规则

Daily Brief / Review 中的 Mind Snapshot 不是全量图谱，而是周期内最值得展示的结构变化。

候选：

- 周期内新增节点。
- 周期内新增边。
- 周期内活跃度最高节点。
- 新形成 cluster。
- 从 isolated 变为 connected 的节点。

排序：

```text
snapshot_score =
  0.30 * recent_activity
+ 0.25 * new_edge_count
+ 0.20 * importance_score
+ 0.15 * user_interaction_score
+ 0.10 * novelty_score
```

---

## 0.9 Privacy Firewall 算法边界

Local Algorithm Engine 的硬约束：

1. 不得直接调用 fetch / axios / remote SDK。
2. 不得将 document markdown / plain_text 发送给外部服务。
3. 所有外部请求必须经过 ConnectorService。
4. ConnectorService 必须检查权限。
5. 每次外部请求必须写 AlgorithmAuditLog。
6. Local-only mode 开启时，ConnectorService 默认拒绝外部请求。

本地算法允许读取：

- documents。
- captures。
- tags。
- projects。
- mind_nodes。
- mind_edges。
- recommendations。
- events。

本地算法输出：

- recommendations。
- reason_json。
- audit logs。
- Daily Brief runtime result。
- Review runtime result。

---

## 0.10 与旧算法设计的关系

以下旧 v1.1 算法设计仍然有效：

- Local Preference Distillation Engine。
- Event Engine。
- Feature Engine。
- Local Index Engine。
- Candidate Engine。
- Ranking Engine。
- Explanation Engine。
- Delivery Engine。
- Feedback Learning Engine。
- Preference / Rhythm / Graph Update。

本 v1.2 更新只是明确 Golden Workspace 真实接入阶段的规则型智能场景与隐私防火墙边界。

---

# 附录：旧 v1.1 本地结构算法设计保留

# Atlax MindDock 本地结构算法与偏好蒸馏设计文档

版本：v1.1
适用阶段：后端第一阶段 Intelligence Spine 结构基线
核心目标：基于 `STRUCTURE_DESIGN.md` 四层对象模型，建立本地算法的边界、架构与数据闭环骨架。本文档已包含 MVP 核心推荐闭环，包括统一排序、自动落库、标签/项目/星群/链接推荐、反馈学习、冷启动策略。
状态标记：[MVP] 后端第一阶段必须实现 / [NEXT] 第二阶段增强 / [RESERVED] 未来预留
前置文档：`STRUCTURE_DESIGN.md`（已冻结，本文档不修改该文件）

---

## 1. 文档定位与算法边界

### 1.1 本文档是什么

本文档是 Atlax MindDock 的**本地结构算法设计文档**。它定义：

- 在 `STRUCTURE_DESIGN.md` 四层对象模型之上，算法如何运转
- 后端第一阶段算法数据闭环的依据
- 不接 LLM 时的本地智能骨架：**Local Preference Distillation Engine（本地偏好蒸馏引擎）**
- 算法的输入、输出、依赖表、状态分层

### 1.2 本文档不是什么

| 不是 | 原因 |
| --- | --- |
| LLM prompt 设计文档 | LLM 接入方案由独立文档负责 |
| 开放问答设计文档 | Chat 自由问答不在本地算法范围内 |
| 结构设计文档 | 对象模型、表结构、API 契约属于 `STRUCTURE_DESIGN.md` |
| 完整 ML/LLM 算法实现手册 | 本文只定义本地规则/启发式/可解释排序算法，不包含模型训练、向量模型、LLM prompt 或云端推理实现 |
| UI 说明书 | 前端交互规范由前端文档负责 |

### 1.3 本地算法能做

| 能力 | 说明 |
| --- | --- |
| 自动落库建议 | 新 Capture 进入后推荐归入的 project / cluster / tag |
| 标签推荐 | 基于内容和用户历史推荐标签 |
| 项目归属推荐 | 推荐 primary_project_id |
| 星群/节点归属推荐 | 推荐目标 cluster 或 parent node |
| 链接推荐 | 推荐有意义的 mind_edge |
| 草稿清理提醒 | 长期未编辑 draft 提醒归档或丢弃 |
| Quick Note 落地提醒 | 漂浮星辰提醒锚定 |
| 每日推荐 | 基于节律和偏好的轻量每日内容推送 |
| 周 Review 结构健康检查 | 孤立节点、停滞项目、重复主题检测 |
| 工作台类型推荐 | [NEXT] 基于星云链路、文档类型、Tag、关系和用户选择，推荐合适的 Workspace Pack |
| 链路结构识别 | [NEXT] 判断当前链路更像项目、知识库、研究专题、内容管线或 Review 对象 |
| 工作台 Preview Candidate 生成 | [RESERVED] 生成可预览、可修改、可确认的结构草案，不直接替用户创建最终系统 |

### 1.4 本地算法不能做

| 不能 | 原因 |
| --- | --- |
| 开放式复杂问答 | 需要语义理解和推理，属于 LLM 范畴 |
| 高质量长文语义总结 | 需要深度语言生成能力 |
| 深层推理 | 无法进行因果推理、逻辑链推导 |
| 替用户做最终决策 | 所有推荐必须可撤销、可修正 |
| 心理分析或情绪诊断 | 算法只观察行为，不评价人格和心理状态 |
| 冷启动高精准 | 冷启动只能做到"合理"，数据积累后才能"很准" |
| 自动生成完美工作台 | 本地算法只能生成结构草案，最终选择必须由用户确认 |
| 替用户决定最终生产结构 | 用户的显式选择必须优先于算法判断 |
| 在无预览情况下直接大规模创建 database / board | 会破坏用户信任，必须先 Preview 再 Confirm |
| 凭空创造无限模板 | 工作台推荐必须基于有限 StructurePack / WorkspacePack 注册表 |

---

## 2. 与 LLM 的关系

### 2.1 核心结论

> **Atlax 免费版智能体验不应依赖 LLM 成立。LLM 是增强器，不是发动机。**

### 2.2 分工边界

```
┌─────────────────────────────────────────────────────┐
│                   Atlax 智能体系                       │
├─────────────────────────┬───────────────────────────┤
│   Local Algorithm       │   LLM（后续接入）           │
│   本地结构算法            │   大语言模型增强             │
├─────────────────────────┼───────────────────────────┤
│ 长期记忆                 │ 语义增强                   │
│ 用户习惯学习              │ 长文总结                   │
│ 结构判断                 │ 表达生成                   │
│ 低成本推荐               │ 开放式问答                 │
│ 隐私优先                 │ 复杂意图理解               │
│ 快速响应                 │ 跨文档深度关联             │
│ 可解释反馈闭环           │                            │
│ 完全离线可用             │                            │
└─────────────────────────┴───────────────────────────┘
```

### 2.3 本地算法的独立价值

本地算法不是 LLM 的低配替代品，而是：

1. **长期记忆层**：记录用户在 Atlax 中的所有行为轨迹，形成持续偏好画像
2. **结构导航层**：基于知识图谱结构给出推荐，不依赖语义理解
3. **隐私边界层**：所有核心计算在本地完成，不上传原始内容
4. **反馈闭环层**：记录每一次推荐的接受/拒绝/修正，持续调整权重
5. **低延迟层**：毫秒级响应，不等待远程模型推理

### 2.4 LLM 的增强定位

LLM 在后续阶段的角色：

- 对本地算法产出的候选做语义排序增强
- 生成推荐的解释文字（explanation text）
- 处理开放式用户提问
- Chat 中的自由对话
- 跨语言内容理解

**LLM 不能替代本地算法，因为：**
- LLM 不理解用户的长期行为模式
- LLM 无法持续学习用户偏好
- LLM 每次推理成本高、延迟高
- LLM 不适合记录用户反馈闭环

---

## 3. Local Preference Distillation Engine（本地偏好蒸馏引擎）

### 3.1 概念定义

**Local Preference Distillation Engine**（中文：本地偏好蒸馏引擎）是 Atlax 本地算法的核心概念。

这里的"蒸馏"不是模型蒸馏（Knowledge Distillation），而是：

> 将用户的每一次操作、每一次反馈，持续转化为结构化的偏好画像数据。

它是一组持续运行的规则和统计算法，负责从 `user_behavior_events`、`recommendation_events`、`captures`、`documents` 等表中提取信号，更新偏好画像表。

### 3.2 蒸馏的不是模型，是行为

```
用户行为 ──→ 事件记录 ──→ 信号提取 ──→ 偏好更新 ──→ 推荐增强
   │            │            │            │
   │    user_behavior_    preference_    下次推荐
   │    events           profiles        权重调整
   │    recommendation_  rhythm_
   │    events           profiles
```

### 3.3 画像定义

以下每个画像单独说明来源事件、依赖表、用途、MVP/NEXT 状态。

---

#### 3.3.1 Topic Preference（主题偏好）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户长期关注的主题领域及其权重分布 |
| **来源事件** | document_created、document_saved、capture confirmed、tag_added、node_clicked |
| **依赖表** | documents、captures、mind_nodes、document_tags、tags、user_behavior_events |
| **用途** | 新内容自动落库时优先匹配高频主题；每日推荐中优先展示活跃主题相关内容 |
| **MVP/NEXT** | [NEXT] preference_profiles.category_weights |

---

#### 3.3.2 Project Preference（项目偏好）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户在各项目上的活跃度和投入分布 |
| **来源事件** | document_created、document_saved、project_changed、node_clicked |
| **依赖表** | documents.primary_project_id、projects、mind_nodes、user_behavior_events |
| **用途** | 新 content 推荐 primary_project_id；停滞项目检测；周 Review 项目状态 |
| **MVP/NEXT** | [NEXT] preference_profiles |

---

#### 3.3.3 Tag Preference（标签偏好）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户常用的标签以及系统推荐标签的接受率 |
| **来源事件** | tag_added、tag_removed、recommendation_accepted（recommendation_type=tag） |
| **依赖表** | document_tags、tags、recommendations、recommendation_events |
| **用途** | 自动标签推荐；标签补全；降低被反复拒绝的标签推荐权重 |
| **MVP/NEXT** | [NEXT] preference_profiles.tag_preferences |

---

#### 3.3.4 Source Preference（来源偏好）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户输入内容的来源分布（manual/mind_star/import/web_clip/voice） |
| **来源事件** | document_created、capture confirmed、import_item_confirmed |
| **依赖表** | captures.capture_source、documents.source_type、source_items |
| **用途** | 导入时根据历史来源判断归类优先级；不同来源类型的内容给予不同默认置信度 |
| **MVP/NEXT** | [NEXT] preference_profiles.source_preferences |

---

#### 3.3.5 Time Rhythm（时间节律）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户使用 Atlax 的时间分布（活跃时段、周几最活跃、输入频率） |
| **来源事件** | open_document、manual_save、auto_save、document_created |
| **依赖表** | documents（created_at、updated_at、last_opened_at）、user_behavior_events |
| **用途** | 在用户活跃时段推送推荐；在非活跃时段降低打扰；判断内容沉默期 |
| **MVP/NEXT** | [NEXT] rhythm_profiles.active_hours、rhythm_profiles.input_frequency |

---

#### 3.3.6 Editing Habit（编辑习惯）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户的编辑行为模式（手动保存频率、auto save 频率、卡住模式、常用文档类型） |
| **来源事件** | manual_save、auto_save、open_document、close_document |
| **依赖表** | documents、user_behavior_events |
| **用途** | 卡住检测；编辑辅助触发时机；自动保存频率自适应 |
| **MVP/NEXT** | [NEXT] 存入 rhythm_profiles 或独立 habit 字段 |

---

#### 3.3.7 Recommendation Feedback Pattern（推荐接受/拒绝模式）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户对不同推荐类型的接受率、修改率、拒绝率、忽略率 |
| **来源事件** | recommendation accepted/rejected/modified/ignored |
| **依赖表** | recommendations、recommendation_events |
| **用途** | 调整不同推荐类型的默认 confidence_threshold；高拒绝类型降权；高接受类型提升展示优先级 |
| **MVP/NEXT** | [MVP] 事件记录；[NEXT] 反馈模式自动调整权重 |

---

#### 3.3.8 Graph Structure Habit（图谱结构习惯）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户在星云树中的操作模式（是否偏好星群组织、是否频繁建立手动连线、是否经常拖拽调整布局） |
| **来源事件** | node_moved、edge_created、edge_rejected、node_landed |
| **依赖表** | mind_nodes、mind_edges、graph_layouts、user_behavior_events |
| **用途** | 判断是否自动生成更多建议连线；是否降低自动连线频率；星群重算触发策略 |
| **MVP/NEXT** | [NEXT] 存入 graph_signals 或关联偏好 |

---

#### 3.3.9 Review Rhythm（Review 节奏）

| 维度 | 内容 |
| --- | --- |
| **含义** | 用户进行 Review 的频率和时机（是否定期打开 Review、是否响应 Review 建议） |
| **来源事件** | review_opened、action_clicked、review_snoozed |
| **依赖表** | user_behavior_events、recommendation_events |
| **用途** | 在用户习惯的 Review 时间点推送周报；避免在不合适时间推送 Review |
| **MVP/NEXT** | [NEXT] rhythm_profiles.review_cycle_days |

---

## 4. 总体算法架构

### 4.1 架构主干

```text
Event Engine
    ↓
Feature Engine
    ↓
Local Index Engine
    ↓
Candidate Engine
    ↓
Ranking Engine
    ↓
Explanation Engine
    ↓
Delivery Engine
    ↓
Feedback Learning Engine
    ↓
Preference / Rhythm / Graph Update
```

### 4.2 各 Engine 详细定义

---

#### 4.2.1 Event Engine（事件引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | 前端所有用户操作（输入、点击、拖拽、保存、反馈） |
| **输出** | 写入 `user_behavior_events`、`recommendation_events`、`graph_events` |
| **依赖表** | user_behavior_events、recommendation_events、graph_events |
| **服务功能** | 统一事件采集，为所有后续算法提供事件数据基础 |
| **MVP/NEXT/RESERVED** | [MVP] user_behavior_events + recommendation_events 写入 |

---

#### 4.2.2 Feature Engine（特征引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | captures.raw_text、documents.markdown、documents.plain_text、document_tags、mind_nodes |
| **输出** | 内容特征、结构特征、行为特征、时间特征、来源特征 |
| **依赖表** | captures、documents、document_tags、mind_nodes、mind_edges、clusters、tags |
| **服务功能** | 为新内容提取多维特征，支撑候选召回和排序 |
| **MVP/NEXT/RESERVED** | [MVP] 基础特征提取（关键词、时间、来源）；[NEXT] feature_snapshots 落表；[NEXT] Graph Chain Feature Extraction |

---

#### 4.2.3 Local Index Engine（本地索引引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | documents.plain_text、document_tags、mind_nodes、tags |
| **输出** | 倒排索引、标签索引、时间桶索引、关键词索引 |
| **依赖表** | documents、document_tags、mind_nodes、tags、clusters |
| **服务功能** | 为候选召回提供高效的检索能力 |
| **MVP/NEXT/RESERVED** | [MVP] 基础内存索引；[RESERVED] algorithm_cache 落盘索引 |

---

#### 4.2.4 Candidate Engine（候选召回引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | subject_type、subject_id、推荐场景类型 |
| **输出** | Candidate[]，每个 Candidate 包含 candidate_type、candidate_id、confidence_score |
| **依赖表** | captures、documents、mind_nodes、mind_edges、clusters、projects、tags、document_tags |
| **服务功能** | 根据不同推荐场景召回候选集（landing candidates、tag candidates、link candidates 等） |
| **MVP/NEXT/RESERVED** | [MVP] 基础 landing/tag 候选；[NEXT] 完整候选类型；[NEXT] Workspace Pack Candidate Recall；[RESERVED] Preview Candidate Builder |

---

#### 4.2.5 Ranking Engine（排序引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | Candidate[] + 用户偏好权重 |
| **输出** | 排序后的 Candidate[]，附带 confidence_score |
| **依赖表** | [NEXT] preference_profiles、[NEXT] rhythm_profiles |
| **服务功能** | 对候选集打分排序，选出 Top-K |
| **MVP/NEXT/RESERVED** | [MVP] 基础规则排序；[NEXT] 偏好加权排序；[NEXT] Explicit User Choice Weighting |

Smart Workspace Recommendation 的排序是 [NEXT] 支线，不影响 MVP。它不只依赖算法观测输入，也依赖用户显式选择。

系统观测输入：

- `graph_features`
- `document_features`
- `tag_distribution`
- `relation_features`
- `behavior_features`
- `time_features`

用户显式输入：

- `user_goal`
- `preferred_view`
- `automation_level`
- `selected_pack`
- `rejected_pack`
- `risk_tolerance`

建议公式 [NEXT]：

```text
final_score =
  0.35 * graph_match_score
+ 0.25 * content_match_score
+ 0.15 * behavior_preference_score
+ 0.15 * explicit_user_choice_score
+ 0.10 * confidence_safety_score
```

用户显式选择可作为 hard constraint 或 soft boost。算法不应覆盖用户明确选择；当选择与观测信号冲突时，应降级为解释和风险提示，而不是直接替用户决定。

---

#### 4.2.6 Explanation Engine（解释引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | 排好序的 Candidate[] |
| **输出** | 每个 Candidate 附带 reason_json |
| **依赖表** | 无独立表，写入 recommendations.reason_json |
| **服务功能** | 为每个推荐生成可解释的理由 |
| **MVP/NEXT/RESERVED** | [MVP] 基础 reason_json；[NEXT] LLM 增强解释文本 |

Workspace Recommendation [NEXT] 的解释必须补充：为什么推荐这个工作台类型、哪些链路特征支持该推荐、哪些内容低置信、哪些字段 / 视图会被创建、哪些内容会进入 Inbox 等待用户确认。

---

#### 4.2.7 Delivery Engine（交付引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | 最终推荐结果 + reason_json |
| **输出** | 写入 recommendations 表，生成 recommendation_events(event_type=generated/shown) |
| **依赖表** | recommendations、recommendation_events |
| **服务功能** | 将推荐结果持久化并标记为已展示 |
| **MVP/NEXT/RESERVED** | [MVP] |

---

#### 4.2.8 Feedback Learning Engine（反馈学习引擎）

| 维度 | 内容 |
| --- | --- |
| **输入** | 用户反馈（accepted/rejected/modified/ignored） |
| **输出** | 更新 recommendations.status、追加 recommendation_events |
| **依赖表** | recommendations、recommendation_events、user_behavior_events |
| **服务功能** | 记录反馈闭环，为偏好蒸馏提供数据 |
| **MVP/NEXT/RESERVED** | [MVP] 事件记录；[NEXT] 实时权重调整 |

未来工作台推荐的学习事件包括 `workspace_pack_selected`、`workspace_pack_rejected`、`preview_field_modified`、`preview_view_changed`、`generation_confirmed`、`generation_cancelled`、`low_confidence_item_moved_to_inbox`。这些事件用于更新用户对工作台形态、视图偏好、自动化程度、风险容忍度的偏好。MVP 阶段只要求 `recommendation_events` / `user_behavior_events` 能扩展记录，不要求实时学习。

---

#### 4.2.9 Preference / Rhythm / Graph Update（偏好/节律/图谱更新）

| 维度 | 内容 |
| --- | --- |
| **输入** | user_behavior_events、recommendation_events 的累积数据 |
| **输出** | 更新 preference_profiles、rhythm_profiles、graph_signals |
| **依赖表** | preference_profiles、rhythm_profiles、graph_signals |
| **服务功能** | 定期（每日/每周）批量更新偏好画像，支撑下次推荐 |
| **MVP/NEXT/RESERVED** | [NEXT] preference_profiles + rhythm_profiles；[RESERVED] graph_signals |

---

## 5. 统一事件模型

### 5.1 核心原则

> **没有事件模型，就没有本地智能。**

所有用户操作都必须转化为标准化事件，写入对应事件表。算法通过消费事件来更新偏好画像和推荐策略。

### 5.2 事件分类

---

#### 5.2.1 Content Events（内容事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `document_created` | API 创建 Document / Capture 标准化生成 Document | user_behavior_events | 更新文档计数、主题分布、来源偏好 |
| `document_saved` | Editor Manual Save（Cmd+S） | user_behavior_events | 编辑闭环触发结构化重算 |
| `document_archived` | 用户归档文档 | user_behavior_events | 更新项目活跃度、节点状态 |
| `document_deleted` | 用户删除文档 | user_behavior_events | 级联处理 mind_node_documents、mind_edges |

---

#### 5.2.2 Editor Events（编辑器事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `manual_save` | Cmd+S / 显式 Save 按钮 | user_behavior_events | 编辑习惯节律、内容变更检测、结构化重算触发 |
| `auto_save` | Editor autosave / idle debounce | user_behavior_events | 编辑频率统计、工作时段判断 |
| `open_document` | 通过 WorkspaceTabs 打开文档 | user_behavior_events（更新 documents.last_opened_at） | 内容活跃度、时间节律 |
| `close_document` | 关闭 Editor 标签 | user_behavior_events | 编辑会话时长统计 |

---

#### 5.2.3 Mind Events（星云树事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `node_clicked` | 用户点击 Mind 节点 | user_behavior_events | 节点关注度、主题偏好 |
| `node_moved` | 用户拖拽节点 | user_behavior_events、graph_layouts | 布局习惯、图谱结构习惯 |
| `edge_created` | 用户手动创建连线 / 拖动建立关系 | user_behavior_events、mind_edges | 关系偏好、图谱结构习惯 |
| `edge_rejected` | 用户拒绝系统建议连线 | user_behavior_events、mind_edges | 推荐反馈模式、降低该类连线权重 |
| `node_landed` | 用户确认节点落点 | user_behavior_events、mind_nodes、recommendation_events | 自动落库精度评估、偏好更新 |

---

#### 5.2.4 Dock Events（管理区事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `tag_added` | 用户在 Dock 中为文档添加标签 | document_tags、user_behavior_events | 标签偏好、标签推荐 |
| `tag_removed` | 用户在 Dock 中移除标签 | document_tags、user_behavior_events | 标签偏好 |
| `project_changed` | 用户修改文档的 primary_project_id | documents、user_behavior_events | 项目偏好、归属推荐 |
| `batch_archived` | Dock 批量归档 | documents、user_behavior_events | 归档行为模式 |

---

#### 5.2.5 Recommendation Events（推荐事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `generated` | 系统算法生成推荐 | recommendations、recommendation_events | 推荐量统计 |
| `shown` | 前端展示推荐给用户 | recommendations、recommendation_events | 曝光量统计 |
| `accepted` | 用户接受推荐 | recommendations、recommendation_events | 正反馈权重提升 |
| `rejected` | 用户拒绝推荐 | recommendations、recommendation_events | 负反馈权重降低 |
| `modified` | 用户修改推荐后接受 | recommendations、recommendation_events | 半正反馈，记录修改方向 |
| `ignored` | 用户未操作超时 / 同类其他候选被接受 | recommendations、recommendation_events | 弱负反馈 |
| `cooled_down` | 同类推荐冷却期 | recommendations、recommendation_events | 推荐频率控制 |
| `previewed` | [NEXT] 用户打开工作台推荐 Preview | recommendation_events | Preview 曝光统计 |
| `workspace_pack_selected` | [NEXT] 用户选择工作台结构包 | recommendation_events、user_behavior_events | 工作台形态偏好 |
| `workspace_pack_rejected` | [NEXT] 用户拒绝工作台结构包 | recommendation_events、user_behavior_events | 降低同类 pack 权重 |
| `preview_field_modified` | [NEXT] 用户修改 Preview 字段 | recommendation_events、user_behavior_events | 字段偏好、自动化程度偏好 |
| `preview_view_changed` | [NEXT] 用户调整 Preview 视图 | recommendation_events、user_behavior_events | 视图偏好 |
| `low_confidence_item_moved_to_inbox` | [NEXT] 低置信内容进入 Inbox | recommendation_events、user_behavior_events | 风险容忍度偏好 |
| `generation_confirmed` | [RESERVED] 用户确认从 Preview 创建结构草案 | recommendation_events、user_behavior_events | 生成确认率 |
| `generation_cancelled` | [RESERVED] 用户取消从 Preview 创建结构草案 | recommendation_events、user_behavior_events | 取消原因和风险阈值 |

MVP 只要求事件表能扩展记录这些类型，不要求实现工作台推荐事件学习。

---

#### 5.2.6 Review Events（回顾事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `review_opened` | 用户打开 Review 页面 | user_behavior_events | Review 节奏、周报推送时机 |
| `action_clicked` | 用户在 Review 中点击行动建议 | user_behavior_events | Review 建议效果评估 |
| `review_snoozed` | 用户推迟 Review | user_behavior_events | Review 推送频率调整 |

---

#### 5.2.7 Nudge Events（推送事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `nudge_shown` | 系统推送提示 | user_behavior_events | 推送曝光统计 |
| `nudge_clicked` | 用户点击推送 | user_behavior_events | 推送效果正反馈 |
| `nudge_dismissed` | 用户关闭推送 | user_behavior_events | 推送负反馈 |
| `nudge_muted` | 用户主动关闭某类推送 | user_behavior_events | 推送冷却策略 |

---

#### 5.2.8 Import Events（导入事件）

| 事件类型 | 触发来源 | 写入表 | 后续算法用途 |
| --- | --- | --- | --- |
| `import_started` | 用户发起导入任务 | user_behavior_events | 来源偏好、导入频率 |
| `import_item_confirmed` | 用户确认导入条目归类 | user_behavior_events | 导入归类准确度 |
| `import_item_rejected` | 用户拒绝导入归类建议 | user_behavior_events | 导入归类算法优化 |

---

## 6. 特征工程

### 6.1 特征来源总览

特征工程从五类数据源中提取信号，支撑候选召回和排序。

---

#### 6.1.1 内容特征

| 特征 | 数据来源 | 用途 |
| --- | --- | --- |
| title | documents.title | 主题判断、归属匹配 |
| plain_text | documents.plain_text | 全文相似度、关键词提取 |
| markdown headings | documents.markdown 解析 | 文档结构识别 |
| task blocks | documents.markdown 解析 | 行动项检测、待办提醒 |
| links | documents.markdown 解析 | 外部引用关系 |
| word_count | documents.word_count | 内容规模判断 |
| content_hash | documents.content_hash | 去重、变更检测 |

---

#### 6.1.2 结构特征

| 特征 | 数据来源 | 用途 |
| --- | --- | --- |
| node_type | mind_nodes.node_type | 判断节点角色（document/project/topic 等） |
| cluster_id | mind_nodes.cluster_id | 星群归属 |
| degree_score | mind_nodes.degree_score | 连接强度 |
| mind_edges | mind_edges（relation_type、strength） | 关系类型和强度 |
| document_tags | document_tags（tag_id、source） | 标签关联 |
| primary_project_id | documents.primary_project_id | 项目归属 |

---

#### 6.1.3 行为特征

| 特征 | 数据来源 | 用途 |
| --- | --- | --- |
| opened | documents.last_opened_at / user_behavior_events | 内容关注度 |
| edited | documents.updated_at / user_behavior_events | 内容活跃度 |
| manual_saved | user_behavior_events(event_type=manual_save) | 编辑习惯 |
| auto_saved | user_behavior_events(event_type=auto_save) | 编辑习惯 |
| node_moved | user_behavior_events(event_type=node_moved) | 图谱交互习惯 |
| recommendation_accepted | recommendation_events(event_type=accepted) | 推荐接受模式 |
| recommendation_rejected | recommendation_events(event_type=rejected) | 推荐拒绝模式 |
| tag_manually_added | document_tags(source=user) | 标签偏好 |

---

#### 6.1.4 时间特征

| 特征 | 数据来源 | 用途 |
| --- | --- | --- |
| created_at | documents.created_at | 内容年龄 |
| updated_at | documents.updated_at | 活跃度衰减 |
| last_opened_at | documents.last_opened_at | 沉默期判断 |
| active hour | user_behavior_events.created_at 聚合 | 活跃时段、推送时机 |
| dormant days | last_opened_at 距今 | 冷却/Review 触发 |
| weekly rhythm | 按周聚合行为频率 | 周 Review 时机 |

---

#### 6.1.5 来源特征

| 特征 | 数据来源 | 用途 |
| --- | --- | --- |
| manual | documents.source_type='manual' / captures.capture_source='manual' | 人工记录 |
| mind_star | captures.capture_source='mind_star' | 星辰输入 |
| import | documents.source_type 指向导入来源 | 导入内容 |
| web_clip | captures.capture_type='web_clip' | 网页剪藏 |
| voice | captures.capture_type='voice' | 语音输入 |
| chat_message | captures.capture_type='chat_message' | Chat 引导 |

---

### 6.2 MVP 阶段特征策略

- [MVP] 不落完整 `feature_snapshots` 表
- [MVP] 特征以内存计算为主，字段值直接取自业务表
- [MVP] `recommendations.reason_json` 必须保留基础 evidence，支撑可解释推荐

---

## 7. 候选召回抽象

### 7.1 Candidate 统一模型

所有推荐统一抽象为 **Candidate**。一个 Subject 可对应多个 Candidate。

```
Subject（被推荐对象）          Candidate（推荐候选目标）
─────────────────────        ─────────────────────────
subject_type                 candidate_type
subject_id                   candidate_id
                              + confidence_score
                              + reason_json
```

### 7.2 Candidate 类型

| Candidate 类型 | candidate_type 枚举值 | 说明 |
| --- | --- | --- |
| Landing Candidate | `project` / `cluster` / `node` | 新内容归入的容器 |
| Tag Candidate | `tag` | 推荐标签 |
| Link Candidate | `node`（作为 edge target） | 推荐连线目标 |
| Review Candidate | `document` / `node` / `cluster` | Review 中推荐关注的对象 |
| Cleanup Candidate | `document` | 待清理的草稿 |
| Quick Note Landing Candidate | `project` / `cluster` / `node` | 漂浮星辰推荐落点 |
| Nudge Candidate | 推送行动建议 | Chat 推送中推荐的下一步操作 |
| Workspace Pack Candidate | `workspace_pack` | [NEXT] 未来 Mind root node / graph_chain 场景触发的工作台类型候选 |
| Workspace Preview Candidate | `workspace_preview` | [RESERVED] 可预览、可修改、可确认的工作台结构草案 |
| Collection View Candidate | `collection_view` | [RESERVED] 未来 table / board / inbox / review 等视图候选 |

MVP 候选仍然以 landing/tag/project/cluster/link 为主。`workspace_pack_candidate` 只在未来 Mind root node / graph_chain 场景触发，不扩大当前 MVP 召回范围。

### 7.3 Candidate 到 recommendations 表的映射

每个 Candidate 必须能完整映射到 `recommendations` 表的字段：

| Candidate 属性 | recommendations 字段 |
| --- | --- |
| 被推荐对象类型 | `subject_type` |
| 被推荐对象 ID | `subject_id` |
| 推荐类型 | `recommendation_type` |
| 候选目标类型 | `candidate_type` |
| 候选目标 ID | `candidate_id` |
| 置信度 | `confidence_score` |
| 推荐理由 | `reason_json` |

未来通用推荐抽象还可映射到 `STRUCTURE_DESIGN.md` 中预留的 `source_type` / `source_id` / `target_type` / `target_id` / `candidate_payload_json`。其中 `candidate_payload_json` 在 MVP 可为空，未来用于承载 workspace preview，不要求当前实现。

### 7.4 MVP 召回策略

- [MVP] 关键词匹配（从 documents.title + plain_text 提取）
- [MVP] 标签重叠度（document_tags）
- [MVP] 项目归属匹配（primary_project_id）
- [MVP] 时间上下文（最近活跃项目/主题优先）
- [MVP] 基础去重（content_hash）

---

## 8. MVP / NEXT / RESERVED 状态分层

### 8.1 MVP（后端第一阶段必须实现）

| 交付项 | 说明 |
| --- | --- |
| `recommendations` 表写入 | 从第一个 Capture 开始记录每条推荐 |
| `recommendation_events` 表写入 | 记录 generated/shown/accepted/rejected/modified/ignored |
| `user_behavior_events` 表写入 | 记录关键用户操作（node_moved、edge_created、tag_added、project_changed 等） |
| 基础自动落库候选 | 新 Capture → 生成 landing candidates（project/cluster） |
| 基础 tag 候选 | 基于关键词和已有标签推荐 tag |
| 基础 project 候选 | 推荐 primary_project_id |
| 基础 cluster 候选 | 推荐目标 cluster_id |
| 基础 reason_json | 每条推荐附带至少一条 evidence |
| 通用 recommendation 兼容字段 | 不新增工作台生成能力；仅保留 `target_type` / `candidate_payload_json` 等兼容设计，且 `candidate_payload_json` 在 MVP 可为空 |

### 8.2 NEXT（第二阶段增强）

| 交付项 | 说明 |
| --- | --- |
| `preference_profiles` 建表与更新 | 用户偏好画像定期更新 |
| `rhythm_profiles` 建表与更新 | 用户节律画像定期更新 |
| `feature_snapshots` 建表 | 内容特征快照落表 |
| 每日推荐 | 基于节律和偏好的每日内容推荐 |
| 草稿清理提醒 | 长期 draft 文档提醒 |
| Quick Note 落地提醒 | 漂浮星辰锚定提醒 |
| 周 Review 初版 | 结构健康检查、周报生成 |
| 反馈学习权重调整 | 根据 recommendation_events 自动调整推荐置信度阈值 |
| graph_chain feature extraction | 针对根节点 / 链路提取图谱结构特征 |
| workspace_pack_candidate recall | 从有限 WorkspacePack / StructurePack 注册表召回候选 |
| explicit_user_choice weighting | 将用户目标、视图偏好、自动化程度等显式选择纳入排序 |
| workspace recommendation explanation | 解释推荐类型、链路证据、低置信内容和 Preview 变化 |
| workspace recommendation event learning | 从工作台选择、拒绝、预览修改等事件中蒸馏偏好 |

### 8.3 RESERVED（未来预留）

| 交付项 | 说明 |
| --- | --- |
| `graph_signals` 高级健康检查 | 孤立节点检测、停滞项目检测、重复主题检测、知识图谱混乱度评分 |
| `algorithm_cache` | Embedding 缓存、聚类中间态缓存 |
| LLM 增强 | 语义排序、解释文本生成、长文总结 |
| Chat Nudge 深度策略 | 个性化语气、上下文感知推送、多轮对话 |
| preview candidate builder | 生成可预览、可修改、可确认的工作台结构草案 |
| collection / view / record generation | 从 Preview 确认后创建集合、视图、记录等结构 |
| structure pack marketplace | 结构包市场或第三方结构包分发机制 |
| LLM semantic enhancement for workspace recommendation | 用 LLM 增强工作台推荐的语义理解和解释，不改变本地算法优先的主线 |

---

### 8.4 Smart Workspace Recommendation 预留设计 [NEXT / RESERVED]

Smart Workspace Recommendation 不是让本地算法直接替用户搭建最终系统，而是让算法基于星云链路和用户显式选择，生成可预览、可修改、可确认的工作台结构草案。

1. **能力定义**：[NEXT] 从 Mind root node / graph_chain 中识别当前知识链路更适合的 Workspace Pack，例如项目管理看板、知识库 Database、研究 / 学习专题、周 Review 工作台、内容生产管线。
2. **触发场景**：[NEXT] 用户在 Mind / 星云树中点击一个根节点、一条链路，或显式选择“推荐工作台形态”时触发。
3. **输入信号**：[NEXT] 当前根节点、链路结构、相关文档类型、tag 分布、mind_nodes / mind_edges / clusters、用户历史行为、用户显式选择。
4. **推荐输出**：[NEXT] 输出 workspace_pack_candidate Top-K，包含 pack_id、pack_name、confidence_score、reason_codes、preview_summary、low_confidence_items。
5. **用户选择如何影响排序**：[NEXT] `user_goal`、`preferred_view`、`automation_level`、`selected_pack`、`rejected_pack` 可作为 hard constraint 或 soft boost。用户明确选择优先于算法判断。
6. **Preview Candidate 原则**：[RESERVED] 先 Preview 再 Create。Preview Candidate 只能展示拟创建的字段、视图、记录映射和低置信 Inbox，不直接创建最终 database / board / collection。
7. **反馈如何进入本地偏好蒸馏**：[NEXT] `workspace_pack_selected`、`workspace_pack_rejected`、`preview_field_modified`、`preview_view_changed`、`low_confidence_item_moved_to_inbox` 等事件进入 `recommendation_events` / `user_behavior_events`，用于更新工作台形态、视图偏好、自动化程度、风险容忍度。
8. **MVP 不做什么**：[MVP] 不新增工作台生成能力，不创建 collection / view / record，不实现模板市场，不把 workspace_pack 推荐作为必做项；只保留通用 `target_type` / `candidate_payload_json` 与事件类型扩展的兼容空间。

## 9. 与 STRUCTURE_DESIGN.md 的字段对齐表

以下列出算法依赖的所有结构对象与其在 `STRUCTURE_DESIGN.md` 中的表名对齐关系。

| 结构对象 | 表名（结构文档） | 算法用途 | MVP 状态 |
| --- | --- | --- | --- |
| Capture | `captures` | 原始输入，是自动落库推荐的 subject | [MVP] |
| Document | `documents` | 长期内容资产，特征提取来源，可作为推荐 subject 或 candidate | [MVP] |
| Document Tag Relation | `document_tags` | 文档标签关联，支撑标签推荐和标签偏好 | [MVP] |
| Project | `projects` | 组织容器，落库候选目标，项目偏好 | [MVP] |
| Tag | `tags` | 标签推荐候选，标签偏好 | [MVP] |
| Mind Node | `mind_nodes` | 星云节点，结构投影，归属推荐 subject 或 candidate | [MVP] |
| Mind Edge | `mind_edges` | 节点关系，链接推荐 candidate 或反馈证据 | [MVP] |
| Cluster | `clusters` | 星群/主题团簇，落库候选目标 | [MVP] |
| Graph Layout | `graph_layouts` | 节点布局缓存，拖动行为记录 | [MVP] |
| Recommendation | `recommendations` | 推荐对象主表，维护推荐状态 | [MVP] |
| Recommendation Event | `recommendation_events` | 推荐事件日志，不可变事件溯源 | [MVP] |
| User Behavior Event | `user_behavior_events` | 用户行为事件，偏好蒸馏数据源 | [MVP] |
| Feature Snapshot | `feature_snapshots` | 内容特征快照，训练/回溯 | [NEXT] |
| Preference Profile | `preference_profiles` | 用户偏好画像，排序加权 | [NEXT] |
| Rhythm Profile | `rhythm_profiles` | 用户节律画像，推送时机 | [NEXT] |
| Graph Feature Snapshot | `graph_feature_snapshots` | 链路级图谱特征快照，是 feature_snapshots 的 graph-chain 场景扩展 | [NEXT] |
| Graph Signal | `graph_signals` | 图谱健康信号，Review 数据基础 | [RESERVED] |
| Algorithm Cache | `algorithm_cache` | 算法中间结果缓存 | [RESERVED] |
| Structure Pack | `structure_packs` | 工作台结构包注册表 | [RESERVED] |
| Workspace Recommendation Candidate | `workspace_recommendation_candidates` | 工作台推荐候选预览 | [RESERVED] |
| Collection / Collection View / Record Link | `collections` / `collection_views` / `record_node_links` | 未来集合、视图、星云映射抽象 | [RESERVED] |

### 9.1 字段命名对齐声明

本文档全文使用 `STRUCTURE_DESIGN.md` 定义的新字段命名：

| 字段用途 | 新命名 | 旧命名（已废弃） |
| --- | --- | --- |
| 被推荐处理的对象 | `subject_type` / `subject_id` | ~~target_type / target_id~~ |
| 推荐候选目标 | `candidate_type` / `candidate_id` | ~~recommended_target_id~~ |
| 通用推荐来源 | `source_type` / `source_id` | 无 |
| 通用推荐目标 | `target_type` / `target_id` | 无；这是 `STRUCTURE_DESIGN.md` 为 NEXT-compatible 推荐抽象重新引入的字段，不等同于旧废弃含义 |
| 复杂候选草案 | `candidate_payload_json` | 无 |

**废弃命名说明**：旧语义下的 `target_type` / `target_id` 已废弃；新语义下的 `target_type` / `target_id` 是 `STRUCTURE_DESIGN.md` 中为 tag/project/cluster/mind_edge/workspace_pack 等通用推荐目标预留的 NEXT-compatible 字段。`recommended_target_id` 仍不使用。

---

## 10. 下一轮待补充内容

> **状态说明**：✅ = 已完成（Round 2，第11-16章） | ⬜ = 待后续轮次补充

### 10.1 排序与评分公式

- ✅ 统一排序公式（Ranking Score）→ 第11章
- ✅ 自动落库候选评分详细公式 → 第12章
- ✅ 标签推荐评分公式 → 第13章
- ✅ 链接推荐评分公式 → 第14章
- ✅ 反馈学习权重更新公式 → 第15章
- ✅ 偏好衰减公式 → 第15章

### 10.2 详细算法

- ✅ 自动落库详细算法（类型识别、候选召回策略、置信度分级）→ 第12章
- ✅ 标签推荐详细算法 → 第13章
- ✅ 项目归属推荐详细算法 → 第13章
- ✅ 链接推荐详细算法 → 第14章
- ⬜ 每日推荐算法
- ⬜ 周 Review 算法（数据采集、主题分析、项目健康、建议生成）
- ⬜ 草稿清理算法
- ⬜ Quick Note 落地算法
- ⬜ Chat Nudge 算法（触发条件、模板选择、冷却策略）

### 10.3 反馈学习

- ✅ 反馈学习公式 → 第15章
- ✅ 正反馈/负反馈权重映射表 → 第15章
- ✅ 冷却机制参数 → 第15章

### 10.4 评估与测试

- ✅ 用户数据阶段划分与各阶段期望指标 → 第16章
- ⬜ 算法评估指标定义（Top-1 Accept Rate、Top-3 Accept Rate、Recovery Rate 等）
- ⬜ 测试集设计
- ⬜ 模拟数据生成方案

### 10.5 接口对齐

- ✅ 推荐接口的完整请求/响应示例 → 第12-14章各算法示例
- ⬜ 各 Engine 与 API 契约的精确对应关系

---

## 11. 统一排序公式

### 11.1 设计原则

> **一份公式，多场景复用。不同推荐场景只调整权重，不重写公式。**

本排序公式是 Atlax 本地算法唯一的评分入口。`Candidate Engine` 召回候选集后，全部送入 `Ranking Engine` 通过本公式打分排序。

### 11.2 Base Ranking Formula

```
final_score =
    content_similarity_score    * w1
  + structure_affinity_score   * w2
  + user_history_score         * w3
  + graph_proximity_score      * w4
  + rhythm_match_score         * w5
  + recent_activity_score      * w6
  + source_context_score       * w7
  + manual_signal_score        * w8
  - negative_feedback_penalty
  - cooldown_penalty
  - chaos_penalty
```

### 11.3 各 score 定义

| score | 含义 | 数据来源 | MVP 状态 |
| --- | --- | --- | --- |
| `content_similarity_score` | subject 与 candidate 的内容相似度（关键词匹配、标题相似度、标签重叠度） | documents.title、documents.plain_text、document_tags、tags | [MVP] |
| `structure_affinity_score` | subject 与 candidate 在 document_type、node_type 等结构属性上的匹配度 | documents.document_type、mind_nodes.node_type | [MVP] |
| `user_history_score` | 用户历史上对同类 candidate 的接受频率 | [NEXT] preference_profiles | [NEXT] |
| `graph_proximity_score` | subject 与 candidate 在图谱上的距离（同 cluster、相邻节点、共享边） | mind_nodes.cluster_id、mind_edges | [MVP] |
| `rhythm_match_score` | 推荐时机与用户活跃节律的匹配度 | [NEXT] rhythm_profiles | [NEXT] |
| `recent_activity_score` | candidate 的近期活跃度（最近被编辑、被打开、被关联） | documents.updated_at、documents.last_opened_at、mind_nodes.activity_score | [MVP] |
| `source_context_score` | subject 与 candidate 在来源类型上的相似度 | captures.capture_source、documents.source_type | [MVP] |
| `manual_signal_score` | 用户显式操作信号（手动连线、手动拖入星群、手动添加标签） | user_behavior_events | [MVP] |

### 11.4 三档惩罚

| penalty | 含义 | 数据来源 | MVP 状态 |
| --- | --- | --- | --- |
| `negative_feedback_penalty` | 历史上同类推荐被拒绝的惩罚 | recommendation_events(event_type=rejected) | [MVP] |
| `cooldown_penalty` | 近期已推送过同类推荐的冷却惩罚 | recommendation_events(event_type=shown/cooled_down) | [MVP] |
| `chaos_penalty` | 推荐可能导致图谱混乱度的惩罚（如推荐链接到已高连接的节点） | mind_nodes.degree_score | [MVP] |

### 11.5 场景权重矩阵

不同推荐场景使用同一公式，但权重配比不同：

| 场景 | w1 | w2 | w3 | w4 | w5 | w6 | w7 | w8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 自动落库 | 0.30 | 0.20 | [NEXT] | 0.20 | [NEXT] | 0.15 | 0.10 | 0.05 |
| 标签推荐 | 0.40 | 0.05 | [NEXT] | 0.10 | [NEXT] | 0.15 | 0.10 | 0.20 |
| 项目推荐 | 0.20 | 0.25 | [NEXT] | 0.20 | [NEXT] | 0.20 | 0.10 | 0.05 |
| 链接推荐 | 0.25 | 0.10 | [NEXT] | 0.30 | [NEXT] | 0.15 | 0.10 | 0.10 |
| 星群推荐 | 0.15 | 0.15 | [NEXT] | 0.35 | [NEXT] | 0.20 | 0.05 | 0.10 |

> [NEXT] 标记的权重在 MVP 阶段设为 0 或使用默认值，NEXT 阶段接入 preference_profiles / rhythm_profiles 后启用。

### 11.6 reason_json 中的 score_breakdown

每条推荐写入 `recommendations.reason_json` 时，必须包含 `score_breakdown`，记录各项得分：

```json
{
  "score_breakdown": {
    "content_similarity_score": 0.82,
    "structure_affinity_score": 0.65,
    "user_history_score": null,
    "graph_proximity_score": 0.71,
    "rhythm_match_score": null,
    "recent_activity_score": 0.55,
    "source_context_score": 0.60,
    "manual_signal_score": 0.00,
    "negative_feedback_penalty": 0.00,
    "cooldown_penalty": 0.00,
    "chaos_penalty": 0.05,
    "final_score": 0.73
  },
  "top_evidence": [
    "内容关键词与项目「Atlax 产品设计」高度匹配",
    "该节点与你最近活跃的 3 个节点位于同一星群",
    "过去 7 天内你编辑过该项目"
  ]
}
```

> `null` 表示该因子在当前阶段不可用（非错误）。

### 11.7 MVP 缺失因子处理规则

MVP 阶段以下因子不可用：`user_history_score`（依赖 [NEXT] preference_profiles）、`rhythm_match_score`（依赖 [NEXT] rhythm_profiles）。处理规则：

1. **[NEXT] 因子在 MVP 阶段不可用时，不直接按 0 拉低 final_score。** 直接置 0 会导致不可用因子稀释可用因子的有效得分，对冷启动用户不公。

2. **MVP 阶段只对 enabled signals 参与加权求和。** 即只对标记为 [MVP] 的 score 及其 weight 求和。

3. **归一化公式**：
   ```
   final_score = sum(score_i * weight_i for enabled signals) / sum(weight_i for enabled signals) - penalties
   ```
   其中 `enabled signals` 为当前阶段可用的信号（MVP: content_similarity、structure_affinity、graph_proximity、recent_activity、source_context、manual_signal）。

4. **reason_json.score_breakdown 中不可用因子记录为 null**（已在 11.6 示例中体现）。null 明确表示"不可用"而非"得分为 0"。

5. **penalties 始终参与扣分**。negative_feedback_penalty、cooldown_penalty、chaos_penalty 在 MVP 阶段均为可用因子，直接从归一化后得分中减去。

6. **NEXT 阶段接入 preference_profiles / rhythm_profiles 后，恢复完整权重矩阵。** 届时移除归一化逻辑，直接使用原始加权求和公式（第 11.2 节）。

---

## 12. 自动落库算法

### 12.1 算法目标

当 Capture / Document 进入系统后，自动落库算法回答四个问题：

1. 这条内容是什么类型？
2. 它应该归入哪个 project / cluster / node？
3. 有多大的把握？
4. 应该自动锚定还是等待用户确认？

### 12.2 完整流程

```
Capture / Document 输入
    ↓
Normalize（标准化 raw_text → plain_text，识别 capture_type）
    ↓
Extract Features（第6章五大特征）
    ↓
Candidate Recall（召回 project / cluster / node 候选）
    ↓
Ranking（第11章排序公式，场景=自动落库）
    ↓
Confidence Decision（三段式决策）
    ↓
写入 recommendations（每个 candidate 一条记录）
    ↓
生成 reason_json（附带 score_breakdown）
    ↓
前端展示推荐
    ↓
User Feedback（accepted / rejected / modified / ignored）
    ↓
写入 recommendation_events + user_behavior_events
    ↓
后续学习（第15章反馈学习）
```

### 12.3 候选召回策略

| 候选类型 | candidate_type | 召回来源 | MVP 状态 |
| --- | --- | --- | --- |
| 项目候选 | `project` | documents.primary_project_id 为最近活跃项目的 documents；用户手动关联过的 projects | [MVP] |
| 星群候选 | `cluster` | mind_nodes.cluster_id 为活跃 cluster；与 subject 关键词匹配的 cluster | [MVP] |
| 节点候选 | `node` | 与 subject 内容相似的 mind_nodes；同 tag 的 mind_nodes；同 source_type 的 mind_nodes | [MVP] |

### 12.4 三段式置信度决策

```
高置信（final_score >= 0.85）：
  → 自动锚定
  → recommendations.status = accepted
  → mind_nodes.state = anchored
  → 前端展示"已归入 xxx，可撤销"
  → 必须同时生成 recommendation_events(event_type=accepted)

中置信（0.55 <= final_score < 0.85）：
  → 推荐 Top-K（K ≤ 3）
  → recommendations.status = generated → shown
  → mind_nodes.state = suggested
  → 前端展示候选列表，等待用户确认
  → 用户操作后写入 recommendation_events

低置信（final_score < 0.55）：
  → 不强制结构化
  → mind_nodes.state = drifting
  → 仅写入一条 recommendations（status = generated，不 shown）
  → 可在后续 Dock/Mind 中手动处理
```

### 12.5 写入 recommendations 的字段规范

每个 candidate 生成一条 `recommendations` 记录：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `subject_type` | `capture` 或 `document` | 被推荐处理的对象类型 |
| `subject_id` | capture.id 或 document.id | 被推荐处理的对象 ID |
| `recommendation_type` | `landing` | 推荐类型 |
| `candidate_type` | `project` / `cluster` / `node` | 候选目标类型 |
| `candidate_id` | project.id / cluster.id / node.id | 候选目标 ID |
| `confidence_score` | final_score | 排序得分 |
| `reason_json` | score_breakdown + top_evidence | 推荐理由 |

### 12.6 reason_json 示例（自动落库，中置信）

```json
{
  "score_breakdown": {
    "content_similarity_score": 0.78,
    "structure_affinity_score": 0.65,
    "graph_proximity_score": 0.71,
    "recent_activity_score": 0.55,
    "source_context_score": 0.60,
    "manual_signal_score": 0.00,
    "final_score": 0.70
  },
  "top_evidence": [
    "内容关键词与项目「Atlax 产品设计」的 5 篇文档高度匹配",
    "该内容与星群「产品迭代」中的 3 个节点有共享标签",
    "最近 3 次类似内容你都确认归入该项目"
  ]
}
```

---

## 13. 标签 / 项目 / 星群推荐算法

### 13.1 Tag Recommendation（标签推荐）

#### 输入

- `subject_type` = `capture` 或 `document`
- `subject_id` = capture.id 或 document.id
- 推荐上下文：用户正在编辑 / Dock 中查看 / Capture 刚进入系统

#### 候选来源

| 来源 | 说明 | 依赖表 |
| --- | --- | --- |
| 内容关键词匹配 | 从 subject 的 title + plain_text 提取关键词，匹配已有 tag 名称 | documents、tags |
| 相似文档的标签 | 找到与 subject 内容相似的文档，提取其标签作为候选 | document_tags、tags |
| 用户常用标签 | 用户历史上手动添加频率最高的标签 | document_tags(source=user) |
| 同项目关联标签 | subject 所属 project 下其他文档的标签 | documents.primary_project_id、document_tags |

#### 关键评分因子

- 关键词与 tag 名称的匹配度（权重最高）
- 该 tag 在相似文档中的出现频率
- 用户历史上接受 tag 推荐的频率（NEXT）
- 该 tag 是否曾被用户拒绝过（惩罚）

#### 输出到 recommendations

| 字段 | 值 |
| --- | --- |
| `subject_type` | `capture` 或 `document` |
| `subject_id` | 对应 ID |
| `recommendation_type` | `tag` |
| `candidate_type` | `tag` |
| `candidate_id` | tag.id |
| `confidence_score` | 排序得分 |
| `reason_json` | score_breakdown |

#### reason_json 示例

```json
{
  "score_breakdown": {
    "content_similarity_score": 0.85,
    "structure_affinity_score": 0.20,
    "graph_proximity_score": 0.40,
    "recent_activity_score": 0.35,
    "source_context_score": 0.10,
    "manual_signal_score": 0.00,
    "final_score": 0.72
  },
  "top_evidence": [
    "文档中出现「产品设计」「UX」等关键词",
    "同项目的 3 篇文档也使用了该标签",
    "该标签是你最常用的 5 个标签之一"
  ]
}
```

#### 用户反馈影响

| 反馈 | 影响 |
| --- | --- |
| accepted → 写入 document_tags(source=system)，提升该 tag 相关性 | document_tags、recommendation_events |
| rejected → 记录负反馈，该 tag 在未来对同类内容的推荐中降权 | recommendation_events(event_type=rejected) |
| modified（用户选了系统推荐的另一个 tag）→ 提升最终选择的 tag | recommendation_events(event_type=modified) |
| ignored → 弱负反馈 | recommendation_events(event_type=ignored) |

---

### 13.2 Project Recommendation（项目推荐）

#### 输入

- `subject_type` = `capture` 或 `document`
- `subject_id` = 对应 ID

#### 候选来源

| 来源 | 说明 | 依赖表 |
| --- | --- | --- |
| 内容相似度匹配 | subject 关键词与各 project 下文档的关键词匹配 | documents、projects |
| 最近活跃项目 | 用户最近 7 天内编辑过的 documents 所属 projects | documents.primary_project_id、documents.updated_at |
| 来源匹配 | 同 source_type 的 documents 归属的 projects | documents.source_type、documents.primary_project_id |
| 用户手动关联 | 用户历史上通过 project_changed 事件修改到的 projects | user_behavior_events(event_type=project_changed) |

#### 关键评分因子

- 项目下文档与 subject 的内容相似度（平均/最高）
- 项目的最近活跃度
- 用户历史上将类似内容归入该项目的频率（NEXT）
- 该项目的文档数量（越多越稳定，但权重不能过高）

#### 输出到 recommendations

| 字段 | 值 |
| --- | --- |
| `subject_type` | `capture` 或 `document` |
| `subject_id` | 对应 ID |
| `recommendation_type` | `project` |
| `candidate_type` | `project` |
| `candidate_id` | project.id |
| `confidence_score` | 排序得分 |
| `reason_json` | score_breakdown |

#### reason_json 示例

```json
{
  "score_breakdown": {
    "content_similarity_score": 0.75,
    "structure_affinity_score": 0.60,
    "graph_proximity_score": 0.50,
    "recent_activity_score": 0.80,
    "source_context_score": 0.40,
    "manual_signal_score": 0.00,
    "final_score": 0.68
  },
  "top_evidence": [
    "你最近 5 天持续编辑该项目",
    "项目下已有 12 篇相关文档",
    "内容主题与该项目高度一致"
  ]
}
```

#### 用户反馈影响

| 反馈 | 影响 |
| --- | --- |
| accepted → 更新 documents.primary_project_id，提升该 project 对同类内容的权重 | documents、recommendation_events |
| rejected → 记录负反馈，该 project 对同类内容降权 | recommendation_events(event_type=rejected) |
| project_changed → 强正反馈给最终 project | user_behavior_events |

---

### 13.3 Cluster Recommendation（星群推荐）

#### 输入

- `subject_type` = `node`（被推荐的 mind_node）
- `subject_id` = node.id

#### 候选来源

| 来源 | 说明 | 依赖表 |
| --- | --- | --- |
| 关键词与 cluster 签名匹配 | subject 节点关键词与 cluster.keyword_signature 匹配 | clusters |
| 标签与 cluster 签名匹配 | subject 关联的 tags 与 cluster.tag_signature 匹配 | clusters、document_tags |
| 图谱邻近 cluster | 与 subject node 有 edge 关系的 node 所属的 cluster | mind_edges、mind_nodes.cluster_id |
| 来源一致 cluster | 同 source_type 的 nodes 集中分布的 cluster | mind_nodes.source_type、clusters |

#### 关键评分因子

- cluster.keyword_signature 与 subject 的匹配度
- cluster 的 coherence_score（星群内聚度）
- subject 与 cluster 内节点的 graph distance
- cluster 的 activity_score（近期活跃度）

#### 输出到 recommendations

| 字段 | 值 |
| --- | --- |
| `subject_type` | `node` |
| `subject_id` | node.id |
| `recommendation_type` | `cluster` |
| `candidate_type` | `cluster` |
| `candidate_id` | cluster.id |
| `confidence_score` | 排序得分 |
| `reason_json` | score_breakdown |

#### reason_json 示例

```json
{
  "score_breakdown": {
    "content_similarity_score": 0.70,
    "structure_affinity_score": 0.55,
    "graph_proximity_score": 0.80,
    "recent_activity_score": 0.60,
    "source_context_score": 0.35,
    "manual_signal_score": 0.00,
    "final_score": 0.66
  },
  "top_evidence": [
    "该节点与星群「产品迭代」内 4 个节点有直接连线",
    "节点的 3 个标签与星群标签签名高度重叠",
    "星群内聚度高（coherence_score=0.82），说明主题明确"
  ]
}
```

#### 用户反馈影响

| 反馈 | 影响 |
| --- | --- |
| accepted → 更新 mind_nodes.cluster_id，可能触发星群重算 | mind_nodes、clusters |
| node_landed（用户拖动到 cluster）→ 强正反馈 | user_behavior_events、mind_nodes |
| rejected → 记录负反馈，降低该 cluster 对同类节点权重 | recommendation_events |

---

## 14. 链接推荐算法

### 14.1 算法目标

链接推荐为 subject（document / node）推荐有意义的 `mind_edge` 连接。推荐的是**边建议**，不是直接创建边。

> MVP 约束：只做 Top-3 链接建议，不自动创建边。自动创建边属于 NEXT 或 RESERVED。

### 14.2 输入

- `subject_type` = `document` 或 `node`
- `subject_id` = document.id 或 node.id

### 14.3 候选召回来源

| 来源 | 说明 | 召回方式 |
| --- | --- | --- |
| 相似文档 | 与 subject 内容最相似的 Top-N 文档对应节点 | plain_text 关键词匹配 |
| 同 tag 文档 | 与 subject 共享 tag 的文档对应节点 | document_tags 交集 |
| 同 project 文档 | 与 subject 同 primary_project_id 的文档对应节点 | documents.primary_project_id |
| 同 cluster 节点 | 与 subject 同 cluster_id 的 mind_nodes | mind_nodes.cluster_id |
| 最近共同编辑 | 与 subject 在同一次编辑会话中被操作过的文档 | user_behavior_events 时间窗口 |
| 图谱邻近 | 与 subject 在图上距离为 2 跳（朋友的朋友）的节点 | mind_edges 二级遍历 |

### 14.4 评分因子

| 因子 | 权重 | 说明 |
| --- | --- | --- |
| 内容相似度 | 0.25 | subject 与 candidate 的 plain_text 关键词匹配 |
| tag 重叠度 | 0.15 | 共享 tag 数量 / 各自 tag 总数 |
| 项目一致性 | 0.10 | 是否同 primary_project_id |
| 图谱距离 | 0.20 | 图上最短路径距离的倒数 |
| 时间接近 | 0.10 | created_at 或 updated_at 的时间差 |
| 用户连线习惯 | 0.15 | 用户历史上手动连线的频率模式（NEXT） |
| 负反馈惩罚 | 0.05 | candidate 对应 edge 曾被用户拒绝过 |

### 14.5 输出到 recommendations

| 字段 | 值 |
| --- | --- |
| `subject_type` | `document` 或 `node` |
| `subject_id` | 对应 ID |
| `recommendation_type` | `link` |
| `candidate_type` | `node`（作为 edge target） |
| `candidate_id` | mind_node.id（推荐连线到的目标节点） |
| `confidence_score` | 排序得分 |
| `reason_json` | score_breakdown + 推荐关系类型 |

### 14.6 reason_json 示例

```json
{
  "score_breakdown": {
    "content_similarity_score": 0.78,
    "structure_affinity_score": 0.40,
    "graph_proximity_score": 0.65,
    "recent_activity_score": 0.45,
    "source_context_score": 0.30,
    "manual_signal_score": 0.00,
    "final_score": 0.62
  },
  "suggested_relation_type": "reference",
  "top_evidence": [
    "两篇文档标题关键词高度重叠",
    "共享 3 个标签",
    "同属项目「Atlax 产品设计」"
  ]
}
```

### 14.7 推荐数量控制

| 场景 | 最大推荐数 |
| --- | --- |
| 新建文档 | 3 |
| 新建碎片 | 2 |
| Mind 节点详情 | 3 |
| Dock 批量整理 | 每条最多 2 |

### 14.8 显示原则

- 系统推荐链接在 Mind 中使用**虚线**展示
- 用户确认后转为**实线**
- 用户拒绝过的链接**不重复推荐**
- 用户 ignore 的链接**7天内冷却**
- 跨 cluster 链接**优先用于洞察推荐**，不直接污染主结构

### 14.9 用户反馈处理

| 反馈 | 处理 |
| --- | --- |
| accepted | 创建 mind_edges(status=confirmed, created_by=system)，写入 user_behavior_events |
| rejected | 记录负反馈，写入 mind_edges(status=rejected)，降低该类 link recommendation 权重 |
| edge_created（用户手动创建）| 强正反馈，标记 mind_edges(created_by=user)，提升该类连线模式 |
| delete_suggested_edge | 强负反馈，记录被删边类型，长期降低同类推荐 |

---

## 15. 反馈学习机制

### 15.1 设计原则

> **MVP 阶段只必须记录事件，不强制实时更新 preference_profiles。NEXT 阶段再做批量权重更新。**

反馈闭环分两层：
1. **事件记录层** [MVP]：所有反馈写入 `recommendation_events` + `user_behavior_events`
2. **权重更新层** [NEXT]：定期从事件表批量更新 `preference_profiles`

### 15.2 反馈类型与含义

#### 推荐反馈（写入 recommendation_events）

| event_type | 含义 | 信号强度 | 对算法的影响 |
| --- | --- | --- | --- |
| `accepted` | 用户直接接受推荐 | +1.0 | 强正反馈：提升相关 candidate_type、tag/project/cluster 的权重 |
| `modified` | 用户修改推荐后接受 | +0.5 | 半正反馈：降低原候选权重，提升用户最终选择的候选权重 |
| `rejected` | 用户明确拒绝推荐 | -1.0 | 强负反馈：降低相似推荐，记录拒绝模式 |
| `ignored` | 推荐展示后用户未操作超时 / 同类其他候选被接受 | -0.2 | 弱负反馈：不等同于拒绝，只是用户未关注 |
| `cooled_down` | 同类推荐进入冷却期 | 中性 | 用于频率控制，不直接调整权重 |

#### 行为反馈（写入 user_behavior_events）

| event_type | 含义 | 信号强度 | 对算法的影响 |
| --- | --- | --- | --- |
| `tag_added` | 用户手动添加标签 | +1.2 | 强正反馈：提升该 tag 与当前 document topic 的相关性 |
| `tag_removed` | 用户移除标签 | -0.8 | 强负反馈：降低该 tag 推荐权重 |
| `project_changed` | 用户修改 primary_project_id | +1.0 | 强正反馈：提升最终 project，降低原 project |
| `edge_created`（手动）| 用户手动创建连线 | +1.5 | 最强正反馈：记录连线模式，未来自动推荐同模式连线 |
| `delete_suggested_edge` | 用户删除系统建议的连线 | -1.2 | 强负反馈：降低该类 link recommendation |
| `edge_rejected` | 用户拒绝系统建议连线 | -1.0 | 强负反馈 |
| `node_moved` | 用户拖拽节点 | +0.6 | 弱正反馈：更新布局偏好 |
| `node_landed` | 用户确认节点落点 | +1.0 | 强正反馈：提升最终 cluster/position |

### 15.3 权重更新公式

```
weight_new = weight_old * decay + signal * learning_rate
```

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `decay` | 0.96 | 旧权重衰减因子。用户偏好会变化，旧偏好随时间自然衰减 |
| `learning_rate` | 0.08 | 单次反馈对权重的影响幅度。一次行为不能过度影响算法 |

**使用示例**：

```
某 tag 被用户接受 3 次，初始权重 0.50：

第 1 次：0.50 * 0.96 + 1.0 * 0.08 = 0.56
第 2 次：0.56 * 0.96 + 1.0 * 0.08 = 0.62
第 3 次：0.62 * 0.96 + 1.0 * 0.08 = 0.68

同一 tag 后续被拒绝 1 次：
第 4 次：0.68 * 0.96 + (-1.0) * 0.08 = 0.57
```

### 15.4 MVP 阶段的反馈规则

#### 必须同时写入两表

| 反馈场景 | recommendation_events | user_behavior_events |
| --- | --- | --- |
| 用户接受推荐 | ✅ event_type=accepted | ✅ 记录操作上下文 |
| 用户拒绝推荐 | ✅ event_type=rejected | ✅ 记录操作上下文 |
| 用户修改推荐 | ✅ event_type=modified，event_payload 记录修改细节 | ✅ 记录修改前后 |
| 推荐 ignored | ✅ event_type=ignored | ❌ 无需单独写（无用户操作） |
| 用户手动 add tag | ❌ 非推荐触发，不写此表 | ✅ event_type=tag_added |
| 用户修改 project | ❌ 非推荐触发，不写此表 | ✅ event_type=project_changed |
| 用户拖拽节点 | ❌ 非推荐触发，不写此表 | ✅ event_type=node_moved |
| 用户确认节点落点 | 见下方双路径规则 | 见下方双路径规则 |

#### node_landed 双路径写入规则

`node_landed` 事件存在两种触发来源，需区分处理：

| 来源 | 判断条件 | recommendation_events | user_behavior_events |
| --- | --- | --- | --- |
| 推荐驱动 | `node_landed` 来源于某条 `recommendation`（存在 `recommendation_id`） | ✅ `event_type=accepted`，关联该 `recommendation_id` | ✅ `event_type=node_landed` |
| 纯手动行为 | `node_landed` 为用户纯手动行为，**不存在** `recommendation_id` | ❌ 不写此表（避免误记为"接受推荐"） | ✅ `event_type=node_landed` |

> **设计意图**：避免将用户纯手动行为误记为"接受推荐"，防止 feedback loop 虚假正反馈污染偏好信号。

#### 事务性要求

- `recommendations.status` 更新 + `recommendation_events` 追加必须在同一事务内
- `user_behavior_events` 可以非事务写入（不阻塞主路径），但必须标记 `sync_status`

### 15.5 NEXT 阶段的批量更新

NEXT 阶段通过后台 Job 定期执行：

1. 每日：聚合昨日所有 `recommendation_events` + `user_behavior_events`
2. 应用 `weight_new = weight_old * decay + signal * learning_rate` 批量更新 `preference_profiles`
3. 更新 `rhythm_profiles`（活跃时段、输入频率等统计）
4. 若连续出现同类推荐高拒绝率（> 60%），自动提升 `confidence_threshold`（即更保守）

---

## 16. 冷启动与置信度策略

### 16.1 设计原则

> **冷启动不承诺高精准。冷启动优先使用内容相似度、标题关键词、最近活跃项目。成熟阶段才使用用户历史偏好加权。**

冷启动不是算法的缺陷，而是诚实。冷启动阶段的目标是：合理、低打扰、可修正。

### 16.2 用户数据阶段划分

| 阶段 | 条件 | 策略 |
| --- | --- | --- |
| **Cold Start（冷启动）** | documents < 30 条 或 推荐反馈 < 10 条 | 保守推荐，降低自动锚定比例 |
| **Early Learning（初步学习）** | documents 30-150 条 | 允许 Top-K 推荐，少量自动锚定 |
| **Mature（成熟）** | documents 150+ 条且反馈稳定 | 提高 user_history_score 权重，提高自动落库比例 |

### 16.3 Cold Start 策略

#### 可用信号

| 信号 | 用途 |
| --- | --- |
| content_similarity_score | 内容关键词与已有文档的匹配 |
| 标题关键词 | 快速判断主题方向 |
| 最近活跃项目 | 按最近编辑时间排序的 projects |
| source_context_score | 同来源类型的内容归类到一起 |
| 标签重叠 | 如果用户已手动添加了一些标签 |

#### 禁用信号

| 信号 | 原因 |
| --- | --- |
| user_history_score | 数据不足，不可信 |
| rhythm_match_score | 节律画像未建立 |
| preference_profiles | NEXT 才建表 |

#### 自动锚定阈值调整

```
冷启动：auto_anchor_threshold = 0.90（极保守）
初步学习：auto_anchor_threshold = 0.85
成熟：auto_anchor_threshold = 0.80
```

### 16.4 Early Learning 策略

- 允许 Top-3 推荐（中置信 0.55-0.85）
- 少量自动锚定（high >= 0.85）
- 推荐频率：同类推荐至少间隔 24 小时
- 重点收集反馈数据，不急于优化精准度

### 16.5 Mature 策略

- 启用 `user_history_score`（接入 preference_profiles）
- 启用 `rhythm_match_score`（接入 rhythm_profiles）
- 提高自动落库比例（降低 threshold 到 0.80）
- 参考正反馈/负反馈历史调整权重
- 支持跨星群洞察推荐

### 16.6 连续错误保护

如果系统检测到连续错误：

| 条件 | 保护策略 |
| --- | --- |
| 同类推荐连续 3 次被拒绝 | 该推荐类型进入冷却（7 天），confidence_threshold + 0.10 |
| 5 分钟内拒绝 2 次同类推荐 | 当前会话中不再展示同类推荐 |
| 用户手动 undo 推荐结果 | 该 candidate 长期降权，标记为 learned negative |
| 周内某类推荐拒绝率 > 50% | 降低该类推荐的 confidence 上限，减少推荐数量 |

### 16.7 各阶段期望指标（不承诺，仅参考）

| 阶段 | Top-1 Accept | Top-3 Accept | Silent Success（自动落库不修改） |
| --- | --- | --- | --- |
| Cold Start | 35%+ | 55%+ | 40%+ |
| Early Learning | 45%+ | 65%+ | 50%+ |
| Mature | 60%+ | 85%+ | 70%+ |

> 以上为稳定后的预期值，实际效果取决于用户数据质量和行为一致性。

---

**Round 2 到此结束。第10章中已标记的内容为本轮完成项，剩余 ⬜ 条目为后续轮次待补充内容。**
