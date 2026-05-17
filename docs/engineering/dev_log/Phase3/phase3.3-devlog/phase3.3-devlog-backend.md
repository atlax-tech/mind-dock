# Phase3.3 后端/领域层开发日志

> 阶段基线文件，Phase3.3 后端/领域层开发日志记录于此。

---

## Phase3.3 +Round 5 devlog -- P33-RUNTIME-001 Embedded Model Provider & Capability Modes

**日期**: 2026-05-17
**任务起始时间**: 07:40
**任务结束时间**: 08:20
**工时**: 40分钟

### 任务目标

建立 Phase 3.3 的模型运行层基础，让嵌入式模型能力以 Provider 形式进入系统：
1. 定义 EmbeddedModelProvider / ReasoningProvider 接口和 EmbeddingResult / SummaryResult / ExplanationResult 返回类型
2. 定义 CapabilityMode（core / model_available / degraded）和 ModelAvailability（available / unavailable / initializing / error）
3. 实现 PrivacyFirewall 最小实现（validateProviderOutput + assertNoBusinessAccess）
4. 实现 DevEmbeddedModelProvider / DevReasoningProvider 确定性 Mock Provider
5. 实现 ModelProviderRegistry（含安全调用方法 generateEmbedding / generateSummary / generateExplanation）
6. 实现 getCapabilityStatus() 全局函数和 initDevProviders() 环境边界控制
7. Settings UI 最小接入"智能能力"面板
8. 确保所有失败可降级，Core Mode 下系统可运行

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `packages/domain/src/intelligence/provider.ts` | 新增 Provider 接口、Result 类型、CapabilityMode、ModelAvailability、CapabilityStatus | +56 |
| `packages/domain/src/intelligence/privacy.ts` | 新增 PrivacyFirewall 接口和 createPrivacyFirewall 工厂函数 | +58 |
| `packages/domain/src/intelligence/index.ts` | 新增 provider 和 privacy 子模块导出 | +18 |
| `apps/web/lib/modelProvider.ts` | 新增 DevEmbeddedModelProvider、DevReasoningProvider、ModelProviderRegistry、全局函数 | +264 |
| `apps/web/app/workspace/page.tsx` | SettingsView 新增"智能能力 (Intelligence)"面板 | +50 |
| `apps/web/tests/model-provider.test.ts` | 新增 30 项测试（Core Mode / Dev Provider / Registry Safe Methods / Fallback / Mode Priority / PrivacyFirewall / 环境边界） | +330 |

### 遇到的问题及解决方式

1. **unused parameter lint 错误**：Dev Provider 的 `options` / `context` 参数未使用触发 `@typescript-eslint/no-unused-vars`。解决方案：重命名为 `_options` / `_context` 前缀。
2. **non-null assertion lint 错误**：测试中 `result.data!` / `result.topics!` 触发 `@typescript-eslint/no-non-null-assertion`。解决方案：改用 `as Float32Array` / `as string[]` 类型断言。
3. **process.env.NODE_ENV 只读**：测试中直接赋值 `process.env.NODE_ENV = 'production'` 触发 TS2540。解决方案：改用 vitest 的 `vi.stubEnv('NODE_ENV', 'production')` + `vi.unstubAllEnvs()`。
4. **PrivacyFirewall unused imports**：privacy.ts 导入了 EmbeddingResult/SummaryResult/ExplanationResult 但未使用。解决方案：移除未使用的类型导入。
5. **QA 返修：自动初始化副作用**：模块加载时自动调用 `initDevProviders()` 导致开发环境直接进入 Model Available，违反"由开发/测试环境显式调用"的规划。解决方案：移除自动调用，仅保留 `window` 挂载调试方法。
6. **QA 返修：mode 判断优先级**：原逻辑先判断 available 再判断 error，导致一个 Provider error 另一个 available 时仍显示 model_available。解决方案：改为 error 优先判断——任何 error 即 degraded，无 error 再看 available。
7. **QA 返修：PrivacyFirewall 校验过松**：原 `isAllowedResultType` 仅检查 `success + modelProvider`，不合规对象也能通过。解决方案：收紧为必须包含 `success + modelProvider + modelName + modelVersion`，success:false 允许只有 error，success:true 必须包含 data+dim 或 summary 或 explanation。

### 自动验证结果

- `pnpm validate`：✅ 通过（0 errors, 16 warnings, 1059 tests passed）
- `pnpm build:web`：✅ 通过（Compiled successfully, 所有页面正常生成）

### 手工验证步骤

1. 启动开发服务器，确认 Dock / Mind / Editor / Review / Search 基础链路不崩
2. 打开 Settings 页面，确认"智能能力 (Intelligence)"面板展示"核心模式 · 仅本地规则引擎可用"
3. 在浏览器 Console 中执行 `initDevProviders()`，再执行 `getCapabilityStatus()` 确认返回 `mode: 'model_available'`
4. 刷新 Settings 页面，确认展示"开发模式 · Mock Provider 可用"
5. 确认 Core Mode 下所有基础页面正常运行

### 当前风险及影响范围

| 风险项 | 等级 | 影响 |
|--------|------|------|
| Dev Provider embedding 为伪向量 | 🟡 中 | simpleHash + Math.sin 生成的 Float32Array 不具备语义相似性，仅用于链路验证，不可用于真实相似度计算 |
| PrivacyFirewall 为运行时检查 | 🟡 中 | assertNoBusinessAccess 通过属性名检查，无法防止 Provider 通过闭包/间接引用访问业务库 |
| Registry 单例无并发保护 | 🟢 低 | 当前为单线程 Web 环境，无并发风险；Web Worker 场景需另行处理 |
| initDevProviders 环境检查依赖 process.env | 🟢 低 | 浏览器环境 process.env 由构建工具注入，Vite/Next.js 均支持 |

---

## Phase3.3 +Round 4 devlog -- P33-INT-STORE-001 Intelligence Store 数据层 + Repository Selector

**日期**: 2026-05-17
**任务起始时间**: 06:15
**任务结束时间**: 06:35
**工时**: 20分钟

### 任务目标

将 Phase3.3 的智能对象从规划文档落成真实 IndexedDB 数据层与统一 Repository Selector 出口：
1. 新增 9 张 Intelligence Store 表到 Dexie v27 schema
2. 定义所有 Intelligence Store 对象的领域类型（含 ID 策略和完整审计字段）
3. 实现 intelligenceRepository.ts（27 个 typed repository 方法 + 5 个 selector 方法）
4. 确保严格 workspace 隔离、upsert 去重、stale/expired 标记能力
5. 不接真实模型、不计算 embedding、不改页面视觉

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `packages/domain/src/intelligence/types.ts` | 新增 9 个 Intelligence Store 领域类型 + IntelligenceAuditFields 公共接口 | +90 |
| `packages/domain/src/intelligence/ids.ts` | 新增 9 个 ID 生成函数（6 个稳定 ID + 3 个多实例 ID） | +30 |
| `packages/domain/src/intelligence/index.ts` | barrel 文件导出所有类型和 ID 函数 | +20 |
| `packages/domain/src/index.ts` | 添加 intelligence 子模块导出 | +1 |
| `apps/web/lib/db.ts` | 新增 v27 schema（9 张表 + 索引）、9 个 Record/Persisted 类型对、9 个表导出 | +200 |
| `apps/web/lib/intelligenceRepository.ts` | 新增 27 个 repository 方法 + 5 个 selector 方法 + 4 个 ViewModel 类型 | +420 |
| `apps/web/tests/intelligence-store.test.ts` | 新增 32 项测试（Schema/CRUD/Stale-Expired/Dedup/Workspace-Isolation/Selector） | +570 |

### 遇到的问题及解决方式

1. **non-null assertion lint 错误**：`record.id!` 在 mark stale/expired 方法中触发 `@typescript-eslint/no-non-null-assertion`。解决方案：改为 `if (record.id) await db.table.update(record.id, ...)` 安全访问模式。
2. **测试 unused imports**：测试文件导入了未使用的 ID 生成函数和 list 方法。解决方案：移除未使用的导入。
3. **Dexie 复合索引 keyPath 格式**：`schema.indexes[].keyPath` 对复合索引返回字符串数组而非括号表示法。解决方案：测试中使用 `JSON.stringify(i.keyPath)` 比对。
4. **stale boolean 索引查询**：IndexedDB 中 `true !== 1`，无法用数字 `1` 查到 boolean `true` 的记录。解决方案：改用 `[userId+workspaceId]` 索引查询后内存 `filter(r => r.stale === true)` 验证。

### 自动验证结果

- `pnpm validate`：✅ 通过（0 errors, 16 warnings, 1022 tests passed）
- `pnpm build:web`：✅ 通过（Compiled successfully, 所有页面正常生成）

### 手工验证步骤

1. 启动开发服务器，确认 Dock / Mind / Editor / Review / Search 基础链路不崩
2. 打开浏览器 DevTools → Application → IndexedDB → AtlaxDB，确认 9 张新表存在
3. 确认新表为空初始化，旧表数据完整
4. 确认 React 页面不直接 import 新增智能表

### 当前风险及影响范围

| 风险项 | 等级 | 影响 |
|--------|------|------|
| embeddingRef 占位字段未定义存储格式 | 🟡 中 | 当前 embeddingRef 为 string 类型，后续接入真实模型时需定义具体引用格式（如向量数据库 ID 或文件路径） |
| selector 方法未接入页面 | 🟢 低 | selector 返回稳定 ViewModel 但尚未被任何页面使用，需后续任务卡接入 |
| 后台 job 扫描未实现 | 🟢 低 | stale/expired 索引已就绪但无后台扫描任务，需后续任务卡实现 |
| SearchIndexRecord 搜索为内存过滤 | 🟡 中 | 当前 searchIndexRecords 使用 `[userId+workspaceId]` 索引 + 内存 keywordTokens 过滤，大数据量下性能不佳，后续需优化为全文索引 |

---

## Phase3.3 +Round 3 QA Fix devlog -- P33-SAFE-001 appEvents 持久化 + workspace 隔离补齐

**日期**: 2026-05-17
**任务起始时间**: 18:10
**任务结束时间**: 18:40
**工时**: 30分钟

### 任务目标

修复 P33-SAFE-001 QA 中发现的两个 blocker：

1. `appEvents` 持久化实际失效：`recordEvent()` 和 `migrateFromLocalStorage()` 写入 `appEventsTable` 时没有生成 `id`，`.catch(() => {})` 吞掉失败，导致 IndexedDB 持久化/迁移可能实际没有发生
2. `resolveRecommendationCandidate()` 和 `getDockItemForUser()` 只判断 `userId`，没有判断 `workspaceId`，导致同一用户下不同 workspace 的数据可被串读

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `apps/web/lib/events.ts` | 新增 `deterministicHash()` + `makeAppEventId()` 确定性 ID 生成方法，基于 userId/eventType/ts/payload | +10 |
| `apps/web/lib/events.ts` | `recordEvent()` 写入时带 `id` + payload 参数传入 makeAppEventId | +2/-1 |
| `apps/web/lib/events.ts` | `migrateFromLocalStorage()` 迁移旧事件时为每条生成确定性 `id`，改用 `bulkPut` 幂等写入 | +5/-3 |
| `apps/web/lib/events.ts` | `recordEvent()` 写入失败不再静默吞掉，改为 `console.warn` | +1/-1 |
| `apps/web/lib/repository.ts` | `resolveRecommendationCandidate()` 6 个 candidate 类型全部添加 `workspaceId === DEFAULT_WORKSPACE_ID` 校验 | +6/-6 |
| `apps/web/lib/repository.ts` | `getDockItemForUser()` 添加 `workspaceId !== DEFAULT_WORKSPACE_ID` 校验 | +1/-1 |
| `apps/web/tests/events.test.ts` | 新增 4 项 appEvents 持久化测试，migrateFromLocalStorage 测试通过 mock localStorage 真实通过 | +90 |
| `apps/web/tests/repository.test.ts` | 新增 8 项跨 workspace 隔离测试（6 项 resolveRecommendationCandidate + 2 项 createDockItem chain link） | +180 |

### 遇到的问题及解决方式

1. **appEvents 持久化静默失败**：`appEventsTable.add()` 不带 `id` 时，Dexie 不会自动生成主键，写入失败被 `.catch(() => {})` 吞掉。解决方案：新增 `deterministicHash()` + `makeAppEventId()` 生成确定性 ID，确保每次写入都带 `id`。ID 基于 `userId|eventType|ts|payload` 的 DJB2 哈希，同一事件数据始终生成相同 ID。
2. **Math.random 导致 ID 不稳定**：原 `makeAppEventId` 使用 `Math.random()`，导致同一事件数据每次生成不同 ID，无法用于幂等写入和去重。解决方案：改用 `deterministicHash` 基于 payload 内容生成确定性后缀。
3. **localStorage 迁移重复执行风险**：原代码使用 `bulkAdd`，如果迁移中途失败后重试，已写入的记录会导致主键冲突。解决方案：改用 `bulkPut`，幂等写入。
4. **migrateFromLocalStorage 测试在 Node.js 中无法运行**：`migrateFromLocalStorage` 有 `typeof window === 'undefined'` 守卫，Node.js 测试环境直接 return。解决方案：在测试中 mock `globalThis.window` 和 `globalThis.localStorage`，使用 fake localStorage 实现。
5. **appEvents 写入失败无感知**：`.catch(() => {})` 完全静默吞掉错误，导致"内存可用但持久化失败"问题难以发现。解决方案：改为 `.catch(err => console.warn('[events] appEvents write failed:', err?.message))`，保留非阻塞语义但增加可观察性。
6. **getDockItemForUser 影响 createDockItem chain validation**：`getDockItemForUser` 添加 workspaceId 检查后，`createDockItem` 中通过 `getDockItemForUser` 验证 sourceId/parentId 的逻辑自动获得跨 workspace 隔离能力，无需额外修改。

### 自动验证结果

- `pnpm validate`：✅ 通过（0 errors, 16 warnings, 990 tests passed, 0 skipped）
- `pnpm build:web`：✅ 通过
- rg `it.skip|describe.skip|test.skip` events.test.ts：✅ 无匹配

### 手工验证步骤

1. 启动开发服务器，创建一条 capture，等待 1-2 秒
2. 打开浏览器 DevTools → Application → IndexedDB → AtlaxDB → appEvents，确认有记录且包含 `id` 和 `workspaceId: 'default'`
3. 确认 `clearEventLog` 后 IndexedDB 中对应记录被清除
4. 确认推荐候选不会解析到其他 workspace 的 entry/document/dockItem/tag/project/mindNode

### 当前风险及影响范围

| 风险项 | 等级 | 影响 |
|--------|------|------|
| deterministicHash 碰撞概率 | 🟢 极低 | DJB2 哈希 + ts + userId 组合，实际碰撞概率可忽略；且 bulkPut 幂等 |
| getDockItemForUser workspaceId 检查影响面广 | 🟡 中 | 该函数被 21 处调用，添加 workspaceId 检查后所有调用点都获得隔离，但需确认没有合法的跨 workspace 读取需求 |

---

## Phase3.3 +Round 2 Review Fix devlog -- P33-SAFE-001 Draft workspaceId + Trash-first 修复

**日期**: 2026-05-17
**任务起始时间**: 17:30
**任务结束时间**: 18:00
**工时**: 30分钟

### 任务目标

修复 P33-SAFE-001 Review 中发现的 Draft 主链路 workspaceId 校验缺失和 delete_all 不可逆删除问题：

1. repository.ts 中所有 Draft 主链路 get/update/delete 必须校验 workspaceId
2. publishDraftToDocument 更新原文档时必须同时校验 userId + workspaceId
3. discardDraft delete_all 删除原文档时必须同时校验 userId + workspaceId
4. 正常产品 UI 不得传 { confirmed: true } 触发不可逆删除原文档
5. DraftEditorView 的 delete_all 路径改为 Trash-first
6. 增加测试覆盖：cross-workspace 隔离 + 产品路径不触发不可逆删除

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `apps/web/lib/repository.ts` | `getDraft` 添加 `draft.workspaceId !== DEFAULT_WORKSPACE_ID` 校验 | +1 |
| `apps/web/lib/repository.ts` | `updateDraft` 添加 `draft.workspaceId !== DEFAULT_WORKSPACE_ID` 校验 | +1 |
| `apps/web/lib/repository.ts` | `publishDraftToDocument` 添加 draft workspaceId 校验 + `entriesTable.get(sourceEntryId)` 添加 workspaceId 校验 | +2 |
| `apps/web/lib/repository.ts` | `discardDraft` 添加 workspaceId 校验 + delete_all 改为 Trash-first（MindNode archived + entry archivedAt）+ 移除 options 参数和 assertNotIrreversible | +8/-6 |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | 移除 `{ confirmed: true }` 传递，按钮/描述/确认词/Toast 全部改为 Trash-first 语义 | +6/-6 |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | `handleDiscard` 移除 `options` 参数 | +1/-1 |
| `apps/web/tests/draft-repository.test.ts` | 全部重写：测试数据添加 workspaceId，delete_all 改为归档断言，新增 6 项 cross-workspace 隔离测试 + 2 项产品路径不可逆删除测试 | +120/-80 |
| `apps/web/tests/lifecycle-guards.test.ts` | Draft delete_all 测试从 confirmed guard 改为 Trash-first 验证，添加 workspaceId | +20/-15 |
| `apps/web/tests/dock-editor-003.test.ts` | 5 处 entriesTable.add() 添加 workspaceId | +5 |

### 遇到的问题及解决方式

1. **discardDraft delete_all 语义变更导致 confirmed 参数多余**：delete_all 从物理删除改为归档后，不再是不可逆操作，`assertNotIrreversible` guard 和 `options.confirmed` 参数失去意义。解决方案：移除 `discardDraft` 的 `options` 参数和 guard 检查，UI 层不再需要传 `confirmed: true`。
2. **测试数据缺少 workspaceId 导致 publishDraftToDocument 创建新 entry 而非更新**：`dock-editor-003.test.ts` 中 `entriesTable.add()` 缺少 `workspaceId`，导致 `publishDraftToDocument` 中 `entriesTable.get(sourceEntryId)` 匹配不到原始 entry（因为 workspaceId 校验不通过），从而创建了新 entry。解决方案：为所有直接插入的测试数据添加 `workspaceId: DEFAULT_WORKSPACE_ID`。
3. **lifecycle-guards.test.ts 中 Draft delete_all 测试与 Trash-first 语义冲突**：原测试验证"无 confirmed 时抛错"，但 Trash-first 改造后 delete_all 不再需要 confirmed。解决方案：重写测试为验证"delete_all 归档 entry 而非物理删除"。

### 自动验证结果

- `pnpm validate`：✅ 通过（0 errors, 16 warnings, 977 tests passed）
- `pnpm build:web`：✅ 通过
- rg 检查 `confirmed:\s*true` 在 apps/web/app 中：✅ 无匹配（UI 不传 confirmed:true）
- rg 检查 `confirmed:\s*true` 在 apps/web/lib 中：✅ 仅 removeMindEdge 内部使用（设计如此）
- rg 检查 `editorDraftsTable.get|entriesTable.get` 在 repository.ts 中：✅ Draft 主链路均带 workspaceId 校验

### 手工验证步骤

1. 启动开发服务器，打开 DraftEditorView，创建一个有 sourceEntryId 的草稿
2. 点击"丢弃草稿并归档原文档"按钮，输入 ARCHIVE 确认
3. 确认草稿状态变为 discarded，原文档 MindNode 状态变为 archived（而非被物理删除）
4. 确认原文档 entry 仍存在于 IndexedDB 中（archivedAt 字段被设置）
5. 确认 Toast 显示"已丢弃草稿并归档原文档"而非"已删除草稿及原文档"

### 当前风险及影响范围

| 风险项 | 等级 | 影响 |
|--------|------|------|
| 非 Draft 函数的 entriesTable.get() 仍只校验 userId | 🟡 中 | `updateEntry`、`getEntryById`、`addEntryRelation` 等函数的 `.get()` 调用未校验 workspaceId，多 workspace 场景可能串读。建议后续任务卡统一处理 |
| DiscardMode 类型名 delete_all 语义已变 | � 低 | delete_all 现在行为是归档而非删除，类型名可能误导。后续可考虑重命名为 archive_with_entry |
| lifecycle-guards.test.ts 中 Draft delete_all guard 测试被移除 | 🟢 低 | 原有的"无 confirmed 抛错"测试被替换为 Trash-first 验证，如果未来需要恢复 confirmed guard 需重新添加 |

---

## Phase3.3 +Round 1 Review Fix devlog -- P33-SAFE-001 Review FAIL 修复

**日期**: 2026-05-17
**任务起始时间**: 16:50
**任务结束时间**: 17:10
**工时**: 20分钟

### 任务目标

修复 P33-SAFE-001 Review 中发现的 6 个 FAIL 项：

1. DraftEditorView.tsx 对 entriesTable 的直接依赖 → 改用 repository scoped API
2. localHealthReport.ts 绕过 repository scope 直接读核心表 → 改用 [userId+workspaceId] 复合索引
3. repository.ts 中非 workspace 复合索引 + filter 的查询 → 改为 workspace scoped 查询
4. useMindGraph.ts 直接传 { confirmed: true } 绕过不可逆删除 guard → 设计 removeMindEdge safe API
5. clearEventLog 按 userId 清理 → 改为按 [userId+workspaceId] 清理
6. devlog 中"待执行"状态 → 更新为实际通过结果

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | 移除 `entriesTable` 导入，改用 `getEntryById` repository 方法（带 userId + workspaceId 校验） | +3/-2 |
| `apps/web/lib/repository.ts` | 新增 `getEntryById(userId, entryId)` 方法，校验 userId + workspaceId | +8 |
| `apps/web/lib/localHealthReport.ts` | 所有直接表查询从 `where('userId') + filter` 改为 `where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID])` | +12/-8 |
| `apps/web/lib/repository.ts` | `findMindNodeByDocumentId` / `findMindNodeBySourceType` 从 `where('userId') + filter` 改为 `where('[userId+workspaceId]') + filter` | +4/-4 |
| `apps/web/lib/repository.ts` | `listArchivedMindNodes` 从 `where('[userId+state]') + filter` 改为 `where('[userId+workspaceId]') + filter(state)` | +2/-2 |
| `apps/web/lib/repository.ts` | `findActiveDraftBySourceEntryId` / `loadEditorDraft` / `deleteEditorDraft` / `saveEditorDraft` 从 `where('[userId+X]') + filter(workspaceId)` 改为 `where('[userId+workspaceId]') + filter(X)` | +8/-8 |
| `apps/web/lib/repository.ts` | 新增 `removeMindEdge(userId, edgeId)` 产品安全 API，JSDoc 标注为产品路径专用 | +5 |
| `apps/web/app/workspace/features/mind/useMindGraph.ts` | 3 处 `deleteMindEdge(userId, ..., { confirmed: true })` 改为 `removeMindEdge(userId, ...)` | +3/-3 |
| `apps/web/lib/events.ts` | `clearEventLog` 从 `where('userId').equals(userId)` 改为 `where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID])` | +2/-1 |
| `apps/web/tests/local-health-report.test.ts` | 导入 DEFAULT_WORKSPACE_ID，9 处 db.table().add() 添加 workspaceId | +10 |
| `apps/web/tests/dock-editor-003.test.ts` | 导入 DEFAULT_WORKSPACE_ID，2 处 table.add() 添加 workspaceId | +3 |

### 遇到的问题及解决方式

1. **DraftEditorView 直接依赖 entriesTable**：UI 组件直接 import `entriesTable` 绕过了 repository 层的 workspace scope 保护。解决方案：新增 `getEntryById(userId, entryId)` repository 方法，内部校验 userId + workspaceId。
2. **localHealthReport 用 where('userId') + filter**：健康报告直接读核心表时未使用复合索引，多 workspace 下会读到其他 workspace 数据。解决方案：全部改为 `where('[userId+workspaceId]').equals([userId, DEFAULT_WORKSPACE_ID])`。
3. **useMindGraph 传 confirmed:true 绕过 guard**：UI 直接传 `confirmed: true` 使得不可逆删除 guard 形同虚设。解决方案：新增 `removeMindEdge` 安全 API，UI 调用该 API 而非直接调用 `deleteMindEdge`。

### 自动验证结果

- `pnpm validate`：✅ 通过（0 errors, 16 warnings, 965 tests passed）
- `pnpm build:web`：✅ 通过
- rg 检查 UI 主路径不直接 import 核心 db tables：✅ 通过
- rg 检查 repository 主链路不再出现核心表 where('userId') + workspace filter：✅ 通过（仅 debug-only 方法使用 where('userId')）
- rg 检查正常 UI 不传 confirmed:true 到 deleteMindNode/deleteMindEdge/deleteChatSession/deleteEditorDraft：✅ 通过（UI 使用 removeMindEdge 替代）

### 手工验证步骤

1. 启动开发服务器，确认 Dock / Mind / Editor / Review / Search 基础链路不崩
2. 打开 DraftEditorView，确认 initialEntryId 打开的文档不会跨 workspace 串读
3. 在 Mind 视图中删除一条边，确认使用 removeMindEdge 而非 deleteMindEdge + confirmed:true
4. 检查 localHealthReport 数据，确认只统计当前 workspace 的数据

### 当前风险及影响范围

| 风险项 | 等级 | 影响 |
|--------|------|------|
| Draft 主链路 workspaceId 校验尚未完成 | 🟡 中 | getDraft/updateDraft/publishDraftToDocument/discardDraft 仍只校验 userId，未校验 workspaceId（Round 2 修复） |
| discardDraft delete_all 仍为物理删除 | 🟡 中 | delete_all 模式仍物理删除 entry 和 MindNode，需改为 Trash-first（Round 2 修复） |

---

## Phase3.3 +Round 1 devlog -- P33-SAFE-001 Data Safety Gate + workspaceId Migration

**日期**: 2026-05-17
**任务起始时间**: 14:30
**任务结束时间**: 16:45
**工时**: 2小时15分钟

### 任务目标

完成 Phase3.3 的数据安全地基收口：
1. 为核心本地业务数据补 workspaceId migration 与 workspace scope 保护
2. 收口旧 `_legacy` fallback 风险
3. 阻断 seed/debug route 在生产环境暴露
4. 收口 localStorage 直接使用边界
5. 把破坏性删除/归档语义统一为 Trash-first / 可恢复优先
6. 保证旧数据迁移后仍可读，不破坏 Phase3.2 已有真实功能

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `packages/domain/src/workspace/types.ts` | 新增 `DEFAULT_WORKSPACE_ID` 常量和 `WorkspaceId` 类型 | +3 |
| `packages/domain/src/workspace/index.ts` | 导出新常量和类型 | +2 |
| `apps/web/lib/db.ts` | 新增 version 26 schema（workspaceId + [userId+workspaceId] 复合索引 + appEvents 表），17 个 record 类型添加 workspaceId 字段，FALLBACK_USER_ID 添加 @migration-only JSDoc | +120 |
| `apps/web/lib/repository.ts` | 16 处写入函数添加 workspaceId，40+ 处查询函数切换到复合索引或添加 filter，5 个 debug-only 方法，4 个 delete 函数添加 confirmed 守卫 | +200 |
| `apps/web/lib/events.ts` | 事件日志从 localStorage 迁移到 IndexedDB appEvents 表，保持同步 API，添加幂等迁移逻辑 | +80 |
| `apps/web/app/workspace/page.tsx` | 移除 useState('_legacy')，改用 auth 模块获取用户 ID，移除直接 localStorage 操作 | +8 |
| `apps/web/app/seed/page.tsx` | 添加 production 环境 notFound() 守卫 | +3 |
| `apps/web/app/seed-mind/page.tsx` | 添加 production 环境 notFound() 守卫 | +3 |
| `apps/web/app/workspace/features/mind/useMindGraph.ts` | 3 处 deleteMindEdge 调用添加 { confirmed: true } | +3 |
| `apps/web/tests/mind-edge-ops.test.ts` | 14 处 deleteMindEdge 添加 { confirmed: true } | +14 |
| `apps/web/tests/chat-session.test.ts` | 4 处 deleteChatSession 添加 { confirmed: true } | +4 |
| `apps/web/tests/mind-graph.test.ts` | 2 处 deleteMindNode + 1 处 deleteMindEdge 添加 { confirmed: true } | +3 |
| `apps/web/tests/mind-layout-persistence.test.ts` | 2 处 deleteMindEdge 添加 { confirmed: true } | +2 |

### 遇到的问题及解决方式

1. **Dexie version 26 复合索引设计**：核心表已有 [userId+state]、[userId+draftKey] 等复合索引，不能简单全部替换为 [userId+workspaceId]。解决方案：主查询切换到 [userId+workspaceId]，保留特定用途的复合索引并添加 workspaceId filter。
2. **events.ts 同步 API 约束**：IndexedDB 是异步存储，但 recordEvent/getEventLog/clearEventLog 是同步 API。解决方案：内存缓存作为同步读取的事实来源，IndexedDB 写入为 fire-and-forget，首次读取时异步 hydrate。
3. **Mind Edge 删除的合法场景**：边（Edge）没有软删除/归档替代方案，用户显式删除边或图结构重组时需要物理删除。解决方案：新增 `removeMindEdge` 产品安全 API，内部委托 `deleteMindEdge(userId, edgeId, { confirmed: true })`。

### 自动验证结果

- `pnpm validate`：✅ 通过（0 errors, 16 warnings, 965 tests passed）
- `pnpm build:web`：✅ 通过（Compiled successfully, 所有页面正常生成）
- TypeScript 类型检查：✅ 通过（tsc --noEmit 零错误）

### 手工验证步骤

1. 启动开发服务器，确认 Dock / Mind / Editor / Review / Search 基础链路不崩
2. 创建新 Dock Item，确认 IndexedDB 中该记录包含 workspaceId: 'default'
3. 访问 /seed 和 /seed-mind 页面，确认开发环境正常可用
4. 检查 IndexedDB appEvents 表，确认事件日志已写入
5. 检查 localStorage，确认不再存在 atlax_event_log_* 数据（迁移后已清除）

### 当前风险及影响范围

| 风险项 | 等级 | 影响 |
|--------|------|------|
| 旧数据迁移兼容性 | 🟡 中 | version 26 upgrade 函数将旧数据 workspaceId 设为 'default'，但大量数据迁移可能导致首次打开时短暂卡顿 |
| events.ts 首次 hydrate 延迟 | 🟡 低 | 首次调用 getEventLog 时异步 hydrate，在 hydrate 完成前返回空数组，可能导致首次加载时指标数据为空 |
| workspaceSessions/OpenTabs/RecentDocuments 无 workspaceId | 🟢 极低 | 这些表是 UI/session state，当前单 workspace 阶段无影响，多 workspace 时需另开卡片处理 |
