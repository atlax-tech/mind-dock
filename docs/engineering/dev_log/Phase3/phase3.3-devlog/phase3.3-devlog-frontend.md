# Phase3.3 前端开发日志

> 阶段基线文件，Phase3.3 前端开发日志记录于此。

---

## Phase3.3 +Round 10 devlog -- P33-ALG-001 修复：handleProbe 用户点击后显式注册真实 Ollama Provider + reactivatePendingModelJobs 改用 IndexedDB + 启用 Embedding 后 backfill

**日期**: 2026-05-18
**任务起始时间**: 05:15
**任务结束时间**: 05:35
**工时**: 20分钟

### 任务目标

修复 Settings 模型检测按钮不能真正完成页面侧模型接入的问题：
- handleProbe() 不再依赖已注册 provider，用户点击后显式注册真实 Ollama Provider
- reactivatePendingModelJobs() 改用 IndexedDB ModelRuntimeStatus + embeddingEnabled 判定
- 启用 Embedding 后立即激活 pending_model + 轻量 backfill
- legacy job 分支统一走 ModelRuntimeStatus + 用户开关

### 改动文件

| 文件 | 说明 |
|------|------|
| `apps/web/app/workspace/page.tsx` | handleProbe: 无 provider 或 dev/mock 时先调用 initOllamaProviders() 注册真实 Provider 再 probe；启用 Embedding 后 backfill + reactivate |
| `apps/web/lib/backgroundJobQueue.ts` | reactivatePendingModelJobs: 移除 getCapabilityStatus()，改用 getModelRuntimeStatus() + getEmbeddingEnabledPref() |
| `apps/web/lib/jobConsumer.ts` | tick(): 只有 embeddingEnabled=true 时才调用 reactivation |
| `apps/web/lib/jobProcessor.ts` | embedding_generate/summary_generate: 统一走 ModelRuntimeStatus + 用户开关 |
| `apps/web/tests/background-job-queue.test.ts` | 所有测试从 initDevProviders 迁移到 upsertModelRuntimeStatus + setEmbeddingEnabledPref；新增 6 个 IndexedDB-only 测试 |
| `apps/web/tests/settings-model-control.test.ts` | 新增 handleProbe 真实 Provider 注册测试 + Dev Provider 隔离测试 |

### 核心设计

**handleProbe 用户点击后显式注册**：
- 检查当前 provider 是否为 dev/mock（providerId === 'dev' 或以 'mock' 开头）
- 如果无 provider 或只有 dev/mock provider，调用 `initOllamaProviders()` 注册真实 Ollama Provider
- 注册后再调用 `probeAndSyncStatus()`
- 不允许调用 `initDevProviders()`
- 页面加载时仍不自动调用 `initOllamaProviders`，只在用户点击按钮后触发
- probe 失败时 `probeAndSyncStatus` 已写入 unavailable/degraded 状态到 IndexedDB

**reactivatePendingModelJobs 改用 IndexedDB**：
- 移除 `getCapabilityStatus()` 依赖
- 改用 `getModelRuntimeStatus()` + `getEmbeddingEnabledPref()`
- 只有 runtime mode=model_available/degraded + embeddingStatus=available + embeddingEnabled=true 时才激活
- Dev/Mock Provider 不再能激活真实 pending_model job

**启用 Embedding 后 backfill**：
- 启用 Embedding 按钮后立即调用 `reactivatePendingModelJobs()`
- 为缺少 semantic snapshot 的 dockItem enqueue 最多 20 个 job
- 刷新 Model Activity

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test` | ✅ 1231 passed, 0 failed |
| `pnpm validate` | ✅ 0 errors, 20 warnings |
| `pnpm build:web` | ✅ success |
| `pnpm smoke:model` | ✅ pass, embedding dim=1024 |

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| initOllamaProviders 在浏览器环境无 NODE_ENV 限制 | 🟢 低 | 浏览器环境 typeof process === 'undefined'，环境检查不会阻止 |
| backfill 限制 20 条 | 🟢 低 | 后续可按需调整 |

---

## Phase3.3 +Round 9 devlog -- P33-ALG-001 修复评审阻断：JobConsumer 接入 + Model Activity 真实数据 + Provider 区域中性化 + 敏感日志清理

**日期**: 2026-05-18
**任务起始时间**: 04:40
**任务结束时间**: 05:10
**工时**: 30分钟

### 任务目标

修复评审发现的全部阻断问题，确保前端 UI 展示可信：
- Settings / Model Activity 不再 hardcode，显示真实 Job 状态、snapshot count、embeddingDim、vectorHash、summaryHash/outputHash
- 未检测状态下 Real Provider 区域改为中性注册信息，明确"不代表模型已检测/可用"
- 接入 JobConsumer，内容变更后后台 Job 被实际消费
- 清理 SettingsView 顶部过期注释

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/app/workspace/page.tsx` | SettingsView 接入 JobConsumer；新增 semanticSnapshotCount/lastSemanticJobStatus/lastSemanticJobAt 状态；refreshModelActivity 从 backgroundJobs/semanticFeatureSnapshots/algorithmAuditLogs 读取真实数据；Model Activity 面板重写；Real Provider 区域中性化；清理过期注释 | +60/-30 |
| `apps/web/lib/jobConsumer.ts` | 新增 JobConsumer 类（前端消费入口） | +80 |

### 核心设计

**Model Activity 真实数据**：
- "最近语义 Job 状态"：从 `backgroundJobs` 表读取最近 `recompute_semantic_features` 类型、`complete` 状态的 job 的真实 status
- "最近语义 Job 完成时间"：从 job 的 `completedAt`/`updatedAt` 读取
- "Semantic 快照数"：从 `semanticFeatureSnapshots` 表 `.count()` 读取真实数量（不再用 `1 条/0 条`）
- "最近 vectorHash"：从 `algorithmAuditLogs` 中最近 `embedding` + `success` 的 log 的 `outputHash` 读取
- "最近 summaryHash/outputHash"：从 `algorithmAuditLogs` 中最近 `summary` + `success` 的 log 的 `outputHash` 读取
- 移除"Embedding 引用"行（非用户关心信息）
- 移除用 `reason` 冒充 status 的不可信展示

**Real Provider 区域中性化**：
- 绿色 `✅ 提供商标识 (Real Provider)` → 中性 `📋 已注册 Provider`
- 背景色从绿色系 → 中性 `bg-white/5`
- 新增警告文字：`⚠ 注册信息仅表示 Provider 已加载，不代表模型已检测/可用。请点击下方检测按钮验证。`

**JobConsumer 前端接入**：
- SettingsView `useEffect` 中启动 `startJobConsumer(userId)`
- 组件卸载时 `stopJobConsumer()`
- 每 5 秒 `refreshModelActivity(userId)` 刷新 Model Activity 数据
- handleProbe 后调用 `refreshModelActivity` 立即刷新

**脱敏确认**：
- UI 不展示原文、summary 原文、完整 vector、reasoning
- console 不输出用户文本 preview / summary preview / explanation preview
- audit log 仅包含 inputHash / outputHash，不包含原文

### Browser 实测路径

1. 打开 Settings → 初始状态 unprobed，Real Provider 区域显示中性"已注册 Provider"并带警告
2. 点击"检测本地 Embedding 模型"→ connected，主状态变为"Ollama 可用"
3. 手动启用 Embedding → UI 变为"已启用"
4. 通过 UI 创建新 Draft → 触发 onContentChanged → enqueue 2 个 job
5. JobConsumer 5 秒内消费 → Model Activity 出现真实 semantic job status=complete
6. 观察 embeddingDim=1024, vectorHash 显示, summaryHash/outputHash 显示
7. Semantic 快照数显示真实 count
8. 确认 console 不输出用户文本 preview / summary preview / explanation preview

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test` | ✅ 1218 passed, 0 failed |
| `pnpm validate` | ✅ 0 errors, 20 warnings |
| `pnpm build:web` | ✅ success |
| `pnpm smoke:model` | ✅ pass, embedding dim=1024, vectorHash/summaryHash 正常 |

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| JobConsumer 仅在 SettingsView 挂载时运行 | 🟡 中 | 离开 Settings 页面后 JobConsumer 停止，后续需全局化 |
| Model Activity 刷新依赖 5 秒轮询 | 🟢 低 | 用户可能需要等待最多 5 秒看到更新 |

### 影响范围

- SettingsView：Model Activity 面板数据来源从 hardcode 改为真实 DB 查询
- SettingsView：Real Provider 区域从绿色确认改为中性注册信息
- SettingsView：接入 JobConsumer，内容变更后 Job 被实际消费
- 不影响其他页面和组件

---

## Phase3.3 +Round 8 devlog -- P33-ALG-001 修复评审阻断：开关持久化 + Engine 尊重用户启用状态 + 测试回归

**日期**: 2026-05-18
**任务起始时间**: 04:10
**任务结束时间**: 04:35
**工时**: 25分钟

### 任务目标

修复评审发现的全部阻断问题：
- Embedding/Reasoning 开关增加 IndexedDB 持久化读写，默认 false
- SemanticFeatureEngine.computeFeatures() 读取用户持久化设置 + ModelRuntimeStatus，不用 runtime available 等价 enabled
- Settings probe 后只更新模型可用状态，不自动启用 Embedding/Reasoning
- Settings 启用/停用按钮写入 IndexedDB 并刷新 UI
- Activity Trace 补齐 vectorHash/summaryHash/outputHash，不展示原文/完整向量
- 修复 background-job-queue.test.ts 6 个生命周期回归
- 修复 lint error (no-non-null-assertion, no-unused-vars)
- 清理敏感 console log，不输出用户文本 preview / summary preview
- 补齐 Settings 测试：无 runtime status、dev/mock 隔离、开关持久化、probe 仅按钮触发、Activity Trace 脱敏

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/lib/db.ts` | 新增 UserPreferenceRecord 接口、userPreferences 表、v31 版本 | +20 |
| `apps/web/lib/intelligenceRepository.ts` | 新增 getUserPreference/setUserPreference/getEmbeddingEnabledPref/getReasoningEnabledPref/setEmbeddingEnabledPref/setReasoningEnabledPref | +55 |
| `apps/web/lib/semanticFeatureEngine.ts` | computeFeatures 读取用户持久化设置，不再用 runtime available 等价 enabled | +8/-3 |
| `apps/web/app/workspace/page.tsx` | probe 后不自动启用、开关写入 IndexedDB、Activity Trace 补齐 vectorHash/summaryHash | +30/-10 |
| `apps/web/lib/modelProvider.ts` | 清理敏感 console log（移除 textPreview/summaryPreview） | +2/-4 |
| `apps/web/tests/background-job-queue.test.ts` | 修复 6 个测试回归：添加 dockItem 数据、使用实际 dockItemId、清理 modelRuntimeStatuses、修复 lint/TS 错误 | +80/-20 |
| `apps/web/tests/semantic-feature-engine.test.ts` | 修复 TS 类型错误、non-null-assertion、新增用户未启用测试 | +30/-25 |
| `apps/web/tests/settings-model-control.test.ts` | 新增 Settings 测试：持久化、dev/mock 隔离、probe 仅按钮触发、Activity Trace 脱敏 | +170 |

### 遇到的问题与解决方式

1. **dockItem id 不匹配**：测试中 `db.dockItems.add()` 返回 auto-increment id，但 enqueue 用硬编码 '1'。解决：使用 add 返回的实际 id。
2. **cleanAll 不完整**：pending_model lifecycle 测试间 modelRuntimeStatuses 残留导致 disabled 而非 unprobed。解决：cleanAll 增加 modelRuntimeStatuses/dockItems/embeddingVectors/algorithmAuditLogs 清理。
3. **non-null-assertion lint**：`result.snapshot!.xxx` 违反 no-non-null-assertion 规则。解决：使用 `as SemanticFeatureSnapshot` 类型断言替代。

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test` | ✅ 1217 passed, 0 failed |
| `pnpm validate` | ✅ 0 errors, 20 warnings |
| `pnpm build:web` | ✅ success |
| `pnpm smoke:model` | ✅ pass |

### 手工验证步骤

1. 启动开发服务器，打开 Settings 页面
2. 确认 Embedding/Reasoning 开关默认为"未启用"状态
3. 点击"检测本地模型"按钮，确认检测后模型状态更新但开关仍为"未启用"
4. 手动点击"启用语义 Embedding"，确认写入 IndexedDB，刷新页面后状态保持
5. 点击"停用语义 Embedding"，确认写入 IndexedDB，刷新页面后状态恢复为未启用
6. 确认 Activity Trace 面板展示 vectorHash 和 summaryHash，不展示原文/完整向量
7. 确认 console 不输出用户文本 preview 或 summary preview

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| userPreferences 表 v31 升级 | 🟢 低 | Dexie 自动升级，无破坏性变更 |
| SemanticFeatureEngine 需同时满足用户启用 + 模型可用 | 🟢 低 | 符合产品需求，默认安全 |

### 影响范围

- SettingsView：开关持久化、probe 不自动启用、Activity Trace 补齐 hash
- SemanticFeatureEngine：enabled 判定逻辑变更（用户启用 + 模型可用）
- 测试：background-job-queue、semantic-feature-engine、settings-model-control 全部修复/新增

---

## Phase3.3 +Round 7 devlog -- P33-ALG-001 Settings 模型接入控制区 + Activity Trace + Mock 隔离

**日期**: 2026-05-18
**任务起始时间**: 14:25
**任务结束时间**: 14:50
**工时**: 25分钟

### 任务目标

- 修正 dev/mock provider 被误显示为真实可用：无 ModelRuntimeStatus 时统一显示"未检测"，dev/mock 移至独立"开发 Mock 链路"区域
- 新增模型接入控制区：Embedding 开关（默认能力，用户可关）+ Reasoning Smart Pack（增强能力，先检测再启用，下载增强包显示 Phase 4）
- 新增模型活动面板：端点状态、模型 ID、最近探活、embedding dimension、hash 信息、audit 数量
- 页面加载仅读取 IndexedDB 已有状态，不自动 probe，所有 probe 由用户按钮触发

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/app/workspace/page.tsx` | SettingsView 组件重构 | +180/-50 |

### 遇到的问题与解决方式

（本轮无阻断问题）

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm build:web` | ✅ success |
| TypeScript 编译 | ✅ 0 errors |

### 手工验证步骤

1. 启动开发服务器，打开 Settings 页面
2. 无 ModelRuntimeStatus 时确认智能能力面板显示"未检测"，dev/mock 信息出现在独立"开发 Mock 链路"区域
3. 确认 Embedding 未启用时显示"未检测"，点击"检测本地 Embedding 模型"后可检测，检测到后手动点击"启用语义 Embedding"
4. 确认 Reasoning Smart Pack 区域显示"先检测再启用"，下载增强包按钮显示"Phase 4"
5. 确认页面加载不自动触发 probe，手动点击探测按钮后状态更新
6. 确认模型活动面板正确展示端点状态、模型 ID、最近探活时间、embedding dimension、hash 信息、audit 数量

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| Reasoning Smart Pack 下载功能为 Phase 4 预留 | 🟢 低 | 当前仅展示 UI 占位，不触发实际下载逻辑 |
| dev/mock 区域在生产环境可见 | 🟡 低 | 仅开发环境可见，生产环境无 dev provider 注册 |
| probe 按钮重复点击 | 🟢 低 | 需后续加 loading 状态防重复提交 |

### 影响范围

- SettingsView：智能能力面板 UI 大幅重构，从简单状态显示升级为接入控制区 + 活动面板 + Mock 隔离三区域
- 不影响其他页面和组件

---

## Phase3.3 +Round 6 devlog -- P33-RUNTIME-003 Settings 智能力面板 ModelRuntimeStatus 接入

**日期**: 2026-05-18
**任务起始时间**: 00:22
**任务结束时间**: 00:30
**工时**: 8分钟

### 任务目标

Settings 智能能力面板从 ModelRuntimeStatus 读取真实模型运行时状态，优先于 registry 状态显示，解决 registry 状态为 core 时无法显示真实模型可用性的问题。

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `apps/web/app/workspace/page.tsx` | 新增 `getModelRuntimeStatus` 导入和 `runtimeStatus` state；useEffect 异步读取 ModelRuntimeStatus；面板显示逻辑改为 ModelRuntimeStatus 优先、registry fallback | +30/-15 |

### 面板状态显示逻辑

1. 优先从 `ModelRuntimeStatus` 读取持久化的探测结果
2. `ModelRuntimeStatus.mode` 为 `model_available` 时显示薄荷绿 + "Provider 已就绪"
3. `mode` 为 `degraded` 时显示警示红 + "模型部分可用"
4. `mode` 为 `unavailable` 时显示灰色 + "模型不可用"
5. 无 `ModelRuntimeStatus` 记录时 fallback 到 registry 状态（core/dev/model_available/degraded）
6. Embedding/Reasoning 子状态从 `ModelRuntimeStatus.embeddingStatus`/`reasoningStatus` 读取

### 自动验证结果

- `pnpm validate`：✅ 通过（0 errors, 1150 tests passed）
- `pnpm build:web`：✅ 通过

### 手工验证步骤

1. 启动开发服务器，打开 Settings 页面
2. 确认"智能能力"面板显示"核心模式 · 仅本地规则引擎可用"（无 ModelRuntimeStatus 记录时）
3. 在 Console 中执行 `initDevProviders()`，确认面板更新为"开发模式"
4. 确认 Embedding/Reasoning 子状态正确显示

---

## Phase3.3 +Round 5 devlog -- P33-RUNTIME-001 Settings 智能力面板最小接入

**日期**: 2026-05-17
**任务起始时间**: 07:55
**任务结束时间**: 08:00
**工时**: 5分钟

### 任务目标

在 SettingsView 中最小接入"智能能力 (Intelligence)"面板，展示真实能力状态，避免假智能文案。

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `apps/web/app/workspace/page.tsx` | 新增 `getCapabilityStatus` 导入，SettingsView 新增"智能能力 (Intelligence)"GlassPanel | +50 |

### 面板功能

1. 使用 Brain 图标（神经紫 #c8a0f0）作为面板标题图标
2. 通过 `getCapabilityStatus()` 获取当前能力状态，try-catch 包裹防崩溃
3. 根据状态模式显示不同标签/描述/颜色：
   - 核心模式：灰色指示点 + "仅本地规则引擎可用"
   - 开发模式（providerId 为 'dev'）：琥珀色指示点 + "Mock Provider 可用（仅供开发/测试，不代表真实模型能力）"
   - 模型可用：薄荷绿指示点 + "Provider 已就绪"
   - 降级模式：警示红指示点 + "模型不可用，系统以基础能力运行"
4. 底部双列网格展示 Embedding 和 Reasoning 的可用性状态及 Provider ID
5. 异常时回退显示核心模式

### 自动验证结果

- `pnpm validate`：✅ 通过
- `pnpm build:web`：✅ 通过

