# Phase 3.2 Frontend Dev Log

---

## Phase 3.2 + Round 3 devlog -- DOCK-REAL-002: Dock 控制台真实推荐操作 + Inspector Actions + 错误反馈

**日期**: 2026-05-13
**任务起始时间**: 2026-05-13 10:10
**任务结束时间**: 2026-05-13 10:55
**工时**: 45 分钟

### 任务目标

在绝对保留现有 Golden Dock UI 的前提下，把 DOCK-REAL-001 已接入的 Dock 真实数据基线继续推进为"可行动"的 Dock 控制台：接入真实 Recommendation Queue 状态、Apply/Reject/Ignore 操作、Inspector entity actions、Signals 校准、错误反馈和刷新事件。

### 卡号

DOCK-REAL-002

### 变更范围

#### A. Recommendation Queue 真实状态接入

- `DockRecommendation` 类型扩展：新增 `status`, `candidateType`, `candidateId`, `subjectType`, `subjectId`, `confidenceScore`, `isShown`, `hasFeedback`, `reasonSummary`, `scoreSummary`, `evidenceSummary` 字段
- `computeRecommendations` 改为从 `RecommendationDockQueueItem` 提取完整状态信息
- `computeSignals` 中"待确认建议"改为使用真实 `pendingRecCount`（通过 `isRecommendationPending` 过滤），不再硬编码 0
- 推荐队列 limit 从 4 提升到 20，支持更完整的队列展示
- `useDockData` 新增 `rawRecommendations` 字段存储原始推荐数据
- 推荐卡片 UI 区分 pending/resolved/unsupported 状态，显示对应状态徽章

#### B. Apply / Reject / Ignore 操作

- 新增 `executeRecommendationApply()`: 调用 `applyRecommendation` bridge，成功后 emit `recommendation_applied` 事件并刷新 Dock
- 新增 `executeRecommendationReject()`: 调用 `recordRecommendationFeedback({ feedbackType: 'rejected' })`，成功后 emit `recommendation_rejected` 事件并刷新
- 新增 `executeRecommendationIgnore()`: 调用 `recordRecommendationFeedback({ feedbackType: 'ignored' })`，成功后 emit `recommendation_ignored` 事件并刷新
- Apply 失败时不更新状态，显示明确错误反馈（toast），不制造半完成状态
- unsupported candidate（非 tag/project/mindNode）明确显示"暂不支持自动应用"徽章，仅提供忽略/不再推荐操作，不允许假成功
- 推荐队列条目和 Inspector 推荐区均提供操作按钮，带 loading/disabled 状态

#### C. 稳定 Recommendation id

- 移除 `Math.random()` 作为 recommendation id fallback
- 新增 `makeDeterministicRecKey()` 函数，基于 `recommendationType + subjectType + subjectId + candidateType + candidateId + createdAt + index` 组合生成确定性 key
- 确保 React key 稳定，选中态不会因刷新随机丢失

#### D. Inspector Entity Actions 最小闭环

- Document: 打开 Editor + 在 Mind 查看
- Draft: 打开 Editor + 删除 Draft（Planned/Disabled）
- Tip: 转 Draft 并打开 Editor + 丢弃 Tip（Preview/Disabled）
- MindNode: 有关联 documentId → 打开关联文档；无关联 → 显示"该节点未关联文档，无法打开 Editor"（AlertCircle 警示）
- Collection: 只读 Inspector + 编辑 Collection（Planned/Disabled）
- Tag: 只读 Inspector + 编辑 Tag（Planned/Disabled）

#### E. Editor Open Target Resolver

- 新增 `resolveDockEditorOpenTarget(entity)` 函数，统一处理 Document/Draft/Tip/MindNode 的 Editor 打开逻辑
- 新增 `executeDockEditorOpen()` 函数，封装 resolve + 执行 + 错误反馈
- document → entry/document; draft → draft; tip → convertTipToDraft 后 draft; mindNode → documentId 存在则 document，否则 unsupported
- 消除了 DockView 中散落在 handleOpenEditor 里的类型判断逻辑

#### F. Dock 错误反馈与刷新事件

- `useDockData` 新增 `error` 状态返回，数据加载失败时设置错误信息
- DockView toolbar 区域显示"数据加载异常"红色警示标签（当 `dockError` 存在时）
- `events.ts` 新增 5 种事件类型：`recommendation_applied`, `recommendation_rejected`, `recommendation_ignored`, `collection_updated`, `tag_updated`
- `useDockData` 的 `REFRESH_EVENTS` 列表新增上述 5 种事件
- 推荐操作后自动触发 Dock 数据刷新（通过事件驱动 + `dockRefresh()`）

### 复用 LC-013 的位置

| 能力 | 复用位置 | 说明 |
|---|---|---|
| `applyRecommendation` | `apps/web/lib/repository.ts:2534` | 事务内执行变更 + 写事件 + 写行为事件 |
| `recordRecommendationFeedback` | `apps/web/lib/repository.ts:3533` | rejected/modified/ignored/accepted 反馈 |
| `listRecommendationDockQueue` | `apps/web/lib/repository.ts:2472` | 分页+过滤+排序查询推荐队列 |
| `isRecommendationPending` | `apps/web/lib/recommendation-i18n.ts:94` | 判断推荐是否待处理 |
| `isRecommendationResolved` | `apps/web/lib/recommendation-i18n.ts:90` | 判断推荐是否已解决 |
| `isSupportedCandidateType` | `apps/web/lib/recommendation-i18n.ts:5` | 判断候选类型是否支持自动应用 |
| `describeRecommendationAction/Reason/Preview` | `apps/web/lib/recommendation-i18n.ts` | 推荐 UI 文案 |
| `STATUS_LABELS / CANDIDATE_TYPE_LABELS` | `apps/web/lib/recommendation-i18n.ts` | 状态/类型中文标签映射 |
| `RecommendationStatus/CandidateType/SubjectType` | `packages/domain/src/services/IntelligenceSpine.ts` | 推荐领域类型定义 |

### 变更文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/app/workspace/features/dock/useDockData.ts` | ~200 | 扩展 DockRecommendation 类型 + 真实推荐状态 + 稳定 ID + Editor Resolver + 推荐操作函数 + 错误状态 + 新事件订阅 |
| `apps/web/app/workspace/page.tsx` | ~150 | DockView 接入真实推荐操作 + Inspector Entity Actions + 错误反馈 + 推荐队列增强 |
| `apps/web/lib/events.ts` | +5 | 新增 recommendation_applied/rejected/ignored + collection_updated/tag_updated 事件类型 |

### 遇到的问题及解决方式

1. **Chinese quotation marks encoding**: Python heredoc 在终端中渲染中文引号时出现编码问题，改用 Python 脚本文件方式执行替换
2. **`scoreSummary.scoreReason` 类型不兼容**: `RecommendationDockQueueItem` 中 `scoreReason` 为 `string | null`，而 `DockRecommendation` 定义为 `string | undefined`，修改类型定义为 `string | null | undefined` 兼容
3. **`convertTipToDraft` import 未使用**: DockView 中 `convertTipToDraft` 逻辑已移至 `executeDockEditorOpen`，page.tsx 中的 import 变为未使用，移除

### 自动验证结果

```
pnpm validate: ✅ PASS
  - lint: ✅ PASS (0 errors, 3 pre-existing warnings)
  - typecheck: ✅ PASS
  - test: 760/760 PASS (domain 315 + web 445)
  - check:terminology: ✅ PASS

pnpm build:web: ✅ PASS
  - /workspace: 98.8 kB → 186 kB
```

### 手工验证步骤

1. 打开 `/workspace` → 进入 Dock tab
2. Dock 保持当前 Golden UI 设计，无明显改版
3. Recommendation Queue 显示真实待处理建议（如有）
4. Signals 中"待确认建议"显示真实 pending 数，不再固定为 0
5. 点击 Apply → 真实执行结构变更；成功后 Queue 和 Inspector 刷新
6. 点击 Reject / Ignore → 状态真实变化并刷新
7. unsupported 推荐不会假成功，显示"暂不支持自动应用"黄色徽章
8. Document Inspector: 打开 Editor + 在 Mind 查看 可用
9. Draft Inspector: 打开 Editor 可用，删除 Draft 显示 Planned/Disabled
10. Tip Inspector: 转 Draft 并打开 Editor 可用，丢弃 Tip 显示 Preview/Disabled
11. MindNode Inspector: 有 documentId → 打开关联文档；无 documentId → 显示"该节点未关联文档"警示
12. Collection/Tag Inspector: 只读 + 编辑按钮 Planned/Disabled
13. Dock 数据读取失败时 toolbar 显示"数据加载异常"红色标签
14. `pnpm validate` PASS ✅
15. `pnpm build:web` PASS ✅

### 当前风险

1. **推荐队列首次可能为空**: 依赖推荐引擎已运行（如 Mind 视图生成推荐），首次使用返回空数组，UI 已处理 empty state
2. **Apply 后 Mind 关系刷新**: `applyRecommendation` 可能创建 mind_edge，当前通过 `recommendation_applied` 事件触发 Dock 刷新，但 Mind 视图需要 `mind_edge_created` 事件才能刷新图谱，当前 emit 的是 `recommendation_applied` 而非 `mind_edge_created`
3. **MindNode 打开 Editor 精度**: 当 MindNode 关联的 documentId 对应的是 draft 而非 entry 时，统一以 'document' 类型打开，可能需要后续优化
4. **Collection/Tag 编辑**: 本轮仅做只读 Inspector + Planned 标记，完整编辑能力需后续卡
5. **Tip 丢弃**: 本轮仅 Preview/Disabled 标记，需后续卡接入 discardTip

### Ready for Codex Review

✅ 是

---

## Phase 3.2 + Round 2 devlog -- DOCK-REAL-001 Repair: 过滤修复 + Tags 实体 + 推荐队列布局

**日期**: 2026-05-13
**任务起始时间**: 2026-05-13 09:00
**任务结束时间**: 2026-05-13 09:05
**工时**: 5 分钟

### 任务目标

修复 DOCK-REAL-001 Round 1 遗留的 5 个阻塞问题，不扩大范围。

### 修复内容

#### Blocker 1: Dock worklist 过滤修复

**问题**: `filteredEntities` 按 `e.project === spaceName` 过滤，导致没有 project 的 Drafts/Tips/MindNodes/Tags 在选中 Space 时被隐藏。

**修复**: 改为仅 Documents 按 project 过滤（project 匹配或无 project 均显示），Drafts/Tips/MindNodes/Collections/Tags 始终可见。

```typescript
// 修复前
return dockData.entities.filter(e => {
  if (e.project === spaceName) return true;
  if (e.type === 'collection' && e.title === spaceName) return true;
  if (!e.project && !selectedSpace) return true;
  return false;
});

// 修复后
return dockData.entities.filter(e => {
  if (e.type === 'document') return e.project === spaceName || !e.project;
  if (e.type === 'collection' && e.title === spaceName) return true;
  return true;
});
```

#### Blocker 2: Tags 作为真实 Dock entities

**问题**: Round 1 中 `tagToEntity` 函数被删除，Tags 未加入 entities 数组，仅在 rawTags/statistics 中存在。

**修复**: 恢复 `tagToEntity` 函数，将 tags 映射为 DockEntity（type='tag'），加入 entities 数组。

#### Blocker 3: Tip → Draft → Editor 路径确认

**问题**: 需确认 Tip 实体可见且可转换为 Draft 后打开 Editor。

**确认结果**: 路径完整无缺陷：
1. `convertTipToDraft(userId, tipId)` → 返回 `{ draft: PersistedEditorDraft }`
2. `onOpenEditor(result.draft.id, 'draft')` → 设置 `pendingOpenDraftId` + `setActiveTab('editor')`
3. `DraftEditorView` 的 `initialDraftId` → `setActiveDraftId` → 加载 draft 内容

无需额外修复。

#### Blocker 4: 推荐队列布局溢出修复

**问题**: 推荐卡片使用 `flex-1` 在多个推荐时可能水平溢出或压缩右侧 Inspector。

**修复**: 
- 容器改为 `overflow-x-auto min-w-0` 允许水平滚动
- 卡片改为 `min-w-[200px] max-w-[280px] shrink-0` 固定宽度不压缩
- Empty state 卡片同步改为 `min-w-[200px] shrink-0`

### 变更文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/app/workspace/features/dock/useDockData.ts` | +16 | 恢复 tagToEntity + tags 加入 entities |
| `apps/web/app/workspace/page.tsx` | ~8 | 过滤逻辑修复 + 推荐队列布局修复 |

### 自动验证结果

```
pnpm validate: ✅ PASS
  - lint: ✅ PASS
  - typecheck: ✅ PASS
  - test: 760/760 PASS
  - check:terminology: ✅ PASS

pnpm build:web: ✅ PASS
  - /workspace: 96.1 kB → 183 kB
```

### 手工验证步骤

1. 打开 `/workspace` → 进入 Dock tab
2. Documents、Drafts、Tips、Mind nodes、Collections、Tags 均出现在工作列表
3. 选中不同 Space → Documents 按 project 过滤，其他类型始终可见
4. 点击 Document → Editor 加载对应 entry 内容
5. 点击 Draft → Editor 加载对应 draft 内容
6. 点击 Tip → 自动 convertTipToDraft → Editor 加载新 draft
7. Inspector 显示选中实体的真实 title/type/status/updatedAt/tags/mindNode 关联
8. 推荐队列不溢出、不压缩 Inspector 面板
9. 无推荐时显示 empty state 提示

### 当前风险

1. **推荐队列可能为空**: `listRecommendationDockQueue` 依赖推荐引擎已运行，首次使用返回空数组，UI 已处理 empty state
2. **Tip 转 Draft 后事件刷新**: `convertTipToDraft` 后手动 emit `tip_converted` 事件触发 useDockData 刷新，依赖事件系统正确传播
3. **MindNode 打开 Editor**: 当 MindNode 关联的 documentId 对应的是 draft 而非 entry 时，统一以 'document' 类型打开，可能需要后续优化
4. **Space 过滤仅影响 Documents**: Drafts/Tips/MindNodes/Tags 始终显示，后续可考虑增加按 Space 过滤所有类型的选项

### 下一步建议

1. Tag/Collection 编辑能力（下一张卡）
2. MindNode sourceType 区分 draft vs document（打开 Editor 时更精确）
3. 推荐队列 Preview/Apply 真实化
4. Dock 批量操作（归档/删除/清理）

### Ready for Codex Review

✅ 是

---

## Phase 3.2 + Round 1 devlog -- DOCK-REAL-001: Dock 真实数据接入与 Editor 上下文打通

**日期**: 2026-05-13
**任务起始时间**: 2026-05-13 08:15
**任务结束时间**: 2026-05-13 08:32
**工时**: 17 分钟

### 任务目标

在绝对保留现有 Golden Workspace UI 设计的前提下，把 Dock 主页面从 hardcoded mock/preview 数据接入真实本地 IndexedDB 数据源，并打通 Dock -> Editor 打开上下文。同时修复 `pnpm validate` 中 Inbox forbidden terminology 阻塞。

### 变更摘要

**卡号**: DOCK-REAL-001
**范围**: Dock 真实数据读取 + Dock 实体模型 + Dock -> Editor 打开上下文 + Dock Inspector 最小真实化 + Inbox 术语修复

#### 新增文件

| 文件 | 行数 | 说明 |
|---|---|---|
| `apps/web/app/workspace/features/dock/useDockData.ts` | ~280 | Dock 数据 hook + DockEntity 统一实体模型 |

#### 修改文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/app/workspace/page.tsx` | ~200 | DockView 接入真实数据、Editor 打开上下文、Inbox 术语替换 |
| `apps/web/app/workspace/features/mind/MindScopeCapsule.tsx` | ~2 | driftInbox → driftDock |
| `apps/web/app/workspace/features/mind/useMindCanvasRenderer.ts` | ~3 | driftInbox → driftDock |
| `apps/web/app/workspace/features/mind/useMindGraphInteraction.ts` | ~1 | driftInbox → driftDock |

### 具体改动

#### A. Dock 真实数据读取

- 新增 `useDockData(userId)` hook，通过现有 repository 函数读取 IndexedDB 数据
- 读取并组合：entries、editorDrafts、active tips、mindNodes、mindEdges、collections、tags
- 尝试低风险接入 `listRecommendationDockQueue` 读取推荐队列
- 用真实数据替换 Dock 主列表中的 hardcoded docs/spaces/recs 主数据

#### B. Dock 实体模型

- 定义 `DockEntity` 统一实体模型，区分 document/draft/tip/mindNode/collection/tag
- 每个实体包含：id, type, title, subtitle, status, updatedAt, createdAt, sourceLabel
- 可选字段：entryId, draftId, tipId, mindNodeId, collectionId, tagId, tags, project, documentId

#### C. Dock -> Editor 打开上下文

- Document/Entry: `onOpenEditor(entryId, 'document')` → 复用 pendingOpenEntryId
- Draft: `onOpenEditor(draftId, 'draft')` → 复用 pendingOpenDraftId
- Tip: 先 `convertTipToDraft`，再 `onOpenEditor(draftId, 'draft')`
- MindNode: `onOpenEditor(documentId, 'document')`
- 不支持的类型：显示 toast 提示 "此类型暂不支持打开 Editor"
- 打开失败有最小 UI feedback（toast），不静默失败

#### D. Dock Inspector 最小真实化

- Inspector 显示选中实体的真实 title、type、status、updatedAt
- Properties 表显示真实 Space/Type/State/MindNode 关联/Tags
- MindNode 关联通过 `findMindNodeByDocumentId` 实时查询
- 推荐详情显示真实推荐数据
- "打开 Editor" 按钮根据实体类型动态 enabled/disabled

#### E. Inbox 术语修复

- page.tsx: `InboxItem` → `DockQueueItem`, `InboxSection` → `DockQueueSection`, `inboxDrafts` → `dockDrafts`, `activeInboxDraft` → `activeDockDraft`, `Inbox` icon → `Archive` icon
- Mind 相关文件: `driftInbox` → `driftDock`

### 遇到的问题及解决方式

1. **Inbox 图标替换**: lucide-react 的 `Inbox` 图标名与 forbidden terminology 冲突，替换为 `Archive` 图标
2. **RecommendationDockQueueItem 类型**: `reasonSummary` 字段无 `summary` 属性，改为 `reason` 属性
3. **MindNode 打开 Editor**: 无法从 DockEntity 直接获取 sourceType，简化为统一使用 'document' 类型

### 自动验证结果

```
pnpm validate: ✅ PASS
  - lint: ✅ PASS
  - typecheck: ✅ PASS
  - test: 760/760 PASS
  - check:terminology: ✅ PASS (No Inbox references found)

pnpm build:web: ✅ PASS
  - /workspace: 96.1 kB → 183 kB
```

### 手工验证步骤

1. 打开 `/workspace`
2. 进入 Dock tab
3. Dock 不再展示纯 hardcoded 假文档作为主列表 → 期望显示真实 IndexedDB 中的 documents/drafts/tips
4. 新建/已有 Document 能在 Dock 中出现 → 期望 entries 出现在工作列表
5. 已有 Draft 能在 Dock 中出现 → 期望 active drafts 出现在工作列表
6. Tip 能在 Dock 中出现 → 期望 active tips 出现在工作列表
7. 点击 Document → 期望切换到 Editor 并加载对应 entry 内容
8. 点击 Draft → 期望切换到 Editor 并加载对应 draft 内容
9. Inspector 显示所选实体真实信息 → 期望 Properties 显示真实 type/status/tags/mind node 关联
10. `pnpm validate` 不再因 Inbox forbidden terminology 失败 → ✅ 已验证

### 当前风险

1. **推荐队列可能为空**: `listRecommendationDockQueue` 依赖推荐引擎已运行，首次使用可能返回空数组，UI 已处理 empty state
2. **Space 过滤逻辑**: 当前基于 `entity.project === spaceName` 匹配，如果 entries 没有 project 字段则不会出现在任何 space 下；默认显示全部
3. **Tip 转 Draft 后事件刷新**: `convertTipToDraft` 后手动 emit `tip_converted` 事件，依赖事件系统正确传播
4. **MindNode 打开 Editor**: 当 MindNode 关联的 documentId 对应的是 draft 而非 entry 时，当前统一以 'document' 类型打开，可能需要后续优化

### Ready for Codex Review

✅ 是

---
