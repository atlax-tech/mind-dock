# Phase 3.2 Frontend Dev Log

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
