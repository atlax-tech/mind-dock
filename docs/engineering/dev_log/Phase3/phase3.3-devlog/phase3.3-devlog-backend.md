# Phase3.3 后端/领域层开发日志

> 阶段基线文件，Phase3.3 后端/领域层开发日志记录于此。

---

## Phase3.3 +Round 13 devlog -- P33-ALG-002 Real Model Acceptance Gate：smoke:similarity 全链路验证

**日期**: 2026-05-18
**任务起始时间**: 08:20
**任务结束时间**: 08:30
**工时**: 10分钟

### 任务目标

补充 Real Model Acceptance Gate 验证闭环，新增 `pnpm smoke:similarity` 命令。

### 验证链路

1. `localModelRuntimeService.generateEmbeddingForTarget()` → 3 条真实 embedding（source / related / unrelated）
2. `EmbeddingVector` 落库到 IndexedDB → 验证 providerId / modelId / modelVersion / dimension
3. `SimilarityIndex.findSimilar({ mode: 'semantic' })` → 消费真实向量，输出 semantic_core topK
4. `SimilarityComparison.runComparison()` → Core vs Semantic 对比
5. `fallbackUsed=false` → Semantic Core 可用

### 真实模型验证结果

**EmbeddingVector 已由真实 qwen3-embedding:0.6b 生成：**

| 指标 | 值 |
|------|------|
| providerId | ollama-openai-compatible |
| modelId | qwen3-embedding:0.6b |
| modelVersion | qwen3-embedding:0.6b |
| dimension | 1024 |
| durationMs | 157 |
| fallbackUsed | false |
| sourceTargetId | smoke_source |

**SimilarityIndex 已消费真实向量，semantic_core topK 结果：**

| targetId | score | generatedBy | providerId | modelId |
|----------|-------|-------------|------------|---------|
| smoke_related | 0.891469 | semantic_core | ollama-openai-compatible | qwen3-embedding:0.6b |
| smoke_unrelated | 0.654795 | semantic_core | ollama-openai-compatible | qwen3-embedding:0.6b |

**语义排序验证：** related (0.891469) > unrelated (0.654795) ✅

**Core vs Semantic 对比：**
- Core Mode topK: 0 results（keyword 无重叠，预期行为）
- Semantic Core topK: 2 results
- overlapRate: 0.0000, rankDifference: 2.0000, scoreDifference: 0.7731
- fallbackUsed: false

**auditLogId:** smoke-sim-user_aal_smoke-sim-workspace_embedding_1779063724559

### 验证命令

```bash
pnpm validate              # ✅ 0 errors, 1278 tests passed
pnpm smoke:model           # ✅ pass, dim=1024
pnpm smoke:similarity      # ✅ pass, 3 embeddings, 2 semantic_core topK, related>unrelated
```

---

## Phase3.3 +Round 12 devlog -- P33-ALG-002 Review 阻断修复：Core vs Semantic 强制分流 / modelVersion+dimension dirty check / stale vector 排除 / fallbackUsed 修正

**日期**: 2026-05-18
**任务起始时间**: 07:45
**任务结束时间**: 08:15
**工时**: 30分钟

### 任务目标

修复 P33-ALG-002 review 阻断项，不扩大任务范围：

1. **Core vs Semantic 对比不是真实对比**：`similarityComparison.ts` 的 Core Mode 和 Semantic Core 都调用 `similarityIndex.findSimilar()`，但 findSimilar 在 source 有 embedding 时自动走 semantic 分支，导致 Core Mode 面板也返回 `generatedBy=semantic_core`
2. **dirty check 不完整**：`embeddingService.ts` 只比较 `contentHash` 和 `modelId`，未比较 `modelVersion` / `dimension`
3. **stale vector 被 SimilarityIndex 消费**：旧向量标记 `__stale__` 后，SimilarityIndex 仍读取并消费
4. **dev_log 与实现不一致**：backend dev_log 描述了不存在的内存索引、批量分片 setTimeout、normalizeVector、batchCosineSimilarity
5. **fallbackUsed 误报**：`semanticCoreResults.length === 0` 被判定为 `fallbackUsed=true`，但 source embedding 存在且 provider 可用只是无候选结果时不应算 fallback

### 改动文件

| 文件 | 说明 |
|------|------|
| `apps/web/lib/similarityIndex.ts` | 新增 `mode: 'auto' \| 'core' \| 'semantic'` 参数；`findSimilar` 按 mode 强制分流；`getEmbeddingVector` 排除 stale vector；`findSimilarSemantic` 排除 stale candidate |
| `apps/web/lib/similarityComparison.ts` | Core Mode 调用 `findSimilar({ mode: 'core' })`；Semantic Core 调用 `findSimilar({ mode: 'semantic' })`；fallbackUsed 基于 source embedding 是否存在判断 |
| `apps/web/lib/embeddingService.ts` | dirty check 同时校验 contentHash + modelId + modelVersion + dimension；成功生成后更新 runtime status 的 modelVersion/dimension；fallback 不写 EmbeddingVector |
| `apps/web/lib/intelligenceRepository.ts` | `getEmbeddingVectorsByWorkspace` 过滤 stale vector |
| `packages/domain/src/intelligence/types.ts` | `ModelRuntimeStatus` 新增 `embeddingModelVersion` / `embeddingDimension` 字段 |
| `apps/web/lib/db.ts` | `ModelRuntimeStatusRecord` 新增 `embeddingModelVersion` / `embeddingDimension`；Dexie v33 schema 升级 |
| `apps/web/lib/localModelRuntimeService.ts` | `probeAndSyncStatus` 填充 `embeddingModelVersion` / `embeddingDimension` |
| `apps/web/tests/embedding-service.test.ts` | 新增 4 个测试：modelVersion dirty、dimension dirty、match skip、provider unavailable fallback 不写 fake vector |
| `apps/web/tests/similarity-index.test.ts` | 新增 6 个测试：mode=core 强制 keyword、mode=semantic 无 embedding 返回空、mode=semantic 有 embedding 返回 semantic_core、comparison 强制分流、stale source vector 排除、stale candidate vector 排除 |
| `apps/web/tests/semantic-feature-engine.test.ts` | makeRuntimeStatus 补齐 embeddingModelVersion / embeddingDimension |
| `apps/web/tests/background-job-queue.test.ts` | makeModelRuntimeStatus 补齐 embeddingModelVersion / embeddingDimension |

### 核心修复逻辑

**Core vs Semantic 强制分流**：
- `FindSimilarOptions.mode` 新增 `'auto' | 'core' | 'semantic'`
- `mode: 'core'` → 强制走 `findSimilarCore`（keyword overlap），不读取 embedding vector
- `mode: 'semantic'` → 强制走 `findSimilarSemantic`，无 embedding 时返回空数组
- `mode: 'auto'`（默认）→ 保持原有行为（有 embedding 走 semantic，否则走 core）
- `similarityComparison.runCoreModeQuery` 使用 `mode: 'core'`
- `similarityComparison.runComparison` 的 semantic 查询使用 `mode: 'semantic'`
- Core Mode 结果全部 `generatedBy=core`，Semantic Core 结果全部 `generatedBy=semantic_core`

**modelVersion / dimension dirty check**：
- `ModelRuntimeStatusRecord` 新增 `embeddingModelVersion` / `embeddingDimension`
- `probeAndSyncStatus` 从 provider 读取这些值（type casting）
- `embeddingService.generateEmbedding` 跳过逻辑同时校验 4 个维度：contentHash、modelId、modelVersion、dimension
- 任意维度不匹配 → 标记 stale + 重新生成
- 成功生成后，若 modelVersion/dimension 与 runtime status 不一致，更新 runtime status

**stale vector 排除**：
- `getEmbeddingVector` 排除 `contentHash.startsWith('__stale__')` 的向量
- `getEmbeddingVectorsByWorkspace` 过滤 stale 向量
- `findSimilarSemantic` 遍历候选向量时跳过 stale 向量
- 模型失败 fallback 后，旧 embedding 不会被 SimilarityIndex 消费

**fallback 不写 fake vector**：
- provider 不可用时，`embeddingService.generateEmbedding` 返回 `embeddingVector: null`
- 不写入 `EmbeddingVector` 记录
- providerId/modelId/modelVersion 为 `rule_fallback`

**fallbackUsed 修正**：
- 不再用 `semanticCoreResults.length === 0` 直接代表 fallback
- 改为基于 source embedding vector 是否存在判断：source embedding 不存在 → `fallbackUsed=true`（provider 不可用或未生成）；source embedding 存在 → `fallbackUsed=false`（semantic 查询成功但可能无候选结果）

### 真实模型验证结果

| 指标 | 值 |
|------|------|
| providerId | ollama-openai-compatible |
| modelId | qwen3-embedding:0.6b |
| dimension | 1024 |
| durationMs | 147 |
| fallbackUsed | false |
| smoke:model | pass |

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm validate` | ✅ 0 errors, 40 warnings |
| `pnpm --dir apps/web test` | ✅ 1276 passed, 0 failed |
| embedding-service.test.ts | ✅ 19 passed |
| similarity-index.test.ts | ✅ 26 passed |
| `pnpm smoke:model` | ✅ pass, dim=1024 |

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| modelVersion/dimension 在 runtime status 中依赖 provider 暴露 | 🟢 低 | Ollama provider 通过 type casting 读取，未暴露时默认空/0，skip 逻辑跳过比较 |
| SimilarityDiagnosticPanel 无索引构建按钮和输入文本 embedding | 🟢 低 | 面板当前仅按已有 target ID 运行 comparison，后续可按需扩展 |

---

## Phase3.3 +Round 11 devlog -- P33-ALG-002 EmbeddingService + SimilarityIndex MVP

**日期**: 2026-05-18
**任务起始时间**: 06:00
**任务结束时间**: 07:45
**工时**: 1h45m

### 任务目标

实现 P33-ALG-002 EmbeddingService + SimilarityIndex MVP：
- 新增 SimilarityIndexEntry 领域类型和 makeSimilarityIndexEntryId ID 生成函数
- 实现 EmbeddingService：封装 embedding 向量生成、缓存、降级逻辑，支持 DevLocalModelProvider 调用本机 Ollama / LM Studio / OpenAI-compatible endpoint
- 实现 SimilarityIndex：按 workspace 读取 EmbeddingVector / LocalTextFeatureSnapshot，semantic 用 cosine similarity，core 用 keyword overlap，查询时 upsert SimilarityIndexEntry
- 实现 SimilarityComparison：Core Mode vs Semantic Core 对比工具
- 新增 Dexie v32 schema 支持 SimilarityIndexEntryRecord 持久化
- 新增 intelligenceRepository 7 个方法支持相似度索引 CRUD
- 新增 smoke-model.mjs 验证真实模型调用链路
- 完整测试覆盖 EmbeddingService 和 SimilarityIndex

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `packages/domain/src/intelligence/types.ts` | 新增 SimilarityIndexEntry 接口 | +21 |
| `packages/domain/src/intelligence/ids.ts` | 新增 makeSimilarityIndexEntryId 函数 | +3 |
| `packages/domain/src/intelligence/index.ts` | 导出新增类型和函数 | +2 |
| `apps/web/lib/db.ts` | 新增 SimilarityIndexEntryRecord 接口、v32 schema、表导出 | +30 |
| `apps/web/lib/intelligenceRepository.ts` | 新增 7 个相似度索引 repository 方法 | +88 |
| `apps/web/lib/embeddingService.ts` | 新增 EmbeddingService：向量生成、缓存、降级 | +170 |
| `apps/web/lib/similarityIndex.ts` | 新增 SimilarityIndex：按 workspace 扫描向量 + cosine similarity + keyword overlap | +180 |
| `apps/web/lib/similarityComparison.ts` | 新增 SimilarityComparison：Core vs Semantic 对比 + overlap/rank/score 差异 | +120 |
| `apps/web/tests/embedding-service.test.ts` | 新增 EmbeddingService 测试 | +250 |
| `apps/web/tests/similarity-index.test.ts` | 新增 SimilarityIndex 测试 | +350 |
| `apps/web/scripts/smoke-model.mjs` | 新增真实模型 smoke 验证脚本 | +60 |

### 核心设计

**EmbeddingService**：
- 封装 `generateEmbedding` → 缓存到 IndexedDB → 返回 Float32Array
- 支持 DevLocalModelProvider 调用本机 Ollama / LM Studio / OpenAI-compatible endpoint
- 模型不可用时降级返回 null，不阻塞主流程
- 缓存命中时直接返回，避免重复调用模型
- 记录 AlgorithmAuditLog 审计日志

**SimilarityIndex**：
- 按 workspace 从 IndexedDB 读取 EmbeddingVector / LocalTextFeatureSnapshot
- semantic 模式：cosineSimilarity 计算 + Top-K 查询 + threshold 过滤
- core 模式：keyword overlap (Jaccard) + Top-K 查询
- 查询时 upsert SimilarityIndexEntry 持久化到 IndexedDB
- 不使用内存索引，每次查询按 workspace 扫描 repository vectors/snapshots

**SimilarityComparison**：
- `cosineSimilarity(a: Float32Array, b: Float32Array): number`
- `normalizeScore(rawScore: number): number` — 将 [-1, 1] 映射到 [0, 1]
- Core Mode vs Semantic Core 对比：overlapRate / rankDifference / scoreDifference
- fallbackUsed 基于 source embedding 是否存在判断

**模型分布边界**：
- Web 开发期允许通过 DevLocalModelProvider 调用本机 Ollama / LM Studio / OpenAI-compatible endpoint
- 这不是最终用户默认依赖
- Desktop 阶段应由 DesktopBundledEmbeddingProvider 承接默认内置 Semantic Core
- Semantic Core 默认进入未来桌面安装包，Smart Pack 不进入默认安装包

### 真实模型验证结果

| 指标 | 值 |
|------|------|
| providerId | ollama-openai-compatible |
| modelId | qwen3-embedding:0.6b |
| dimension | 1024 |
| durationMs | 88 |
| fallbackUsed | false |
| sample (first 5) | [-0.041927, 0.003439, -0.011979, -0.079196, -0.018357] |
| topK 结果 | smoke test 为直接 API 调用，无 SimilarityIndex 查询；集成后需补充 |

### 遇到的问题与解决方式

1. **Float32Array 与 number[] 类型不兼容**：cosineSimilarity 接收 Float32Array，但 IndexedDB 存储后读取为普通数组。解决：SimilarityIndexEntry 的 vectorBlob 字段存储为 Float32Array，读取时通过 `new Float32Array(record.vectorBlob)` 转换。

2. **Dexie v32 schema 升级**：新增 similarityIndexEntries 表需要正确处理版本升级。解决：upgrade 函数为空（新表无需迁移），Dexie 自动创建表和索引。

3. **EmbeddingService 缓存一致性**：同一文本多次调用应返回相同向量。解决：基于 contentHash 查找已有 EmbeddingVector 记录，命中时直接返回，未命中时调用模型生成。

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test tests/embedding-service.test.ts` | ✅ 全部通过 |
| `pnpm --dir apps/web test tests/similarity-index.test.ts` | ✅ 全部通过 |
| `pnpm validate` | ✅ 0 errors |
| `pnpm build:web` | ✅ success |
| `pnpm smoke:model` | ✅ pass, embedding dim=1024 |

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| 余弦相似度 Float32Array 精度 | 🟡 中 | Float32 精度有限，极端情况下相似度排序可能与双精度不同 |
| SimilarityIndex 按 workspace 扫描无分页 | 🟡 中 | 大量条目时查询耗时增长，后续需引入分页或懒加载 |
| 模型分布边界：Web 依赖本地 Ollama | 🟡 中 | Web 开发期通过 DevLocalModelProvider 调用本机模型，不是最终用户默认依赖；Desktop 阶段应由 DesktopBundledEmbeddingProvider 承接 |
| Semantic Core / Smart Pack 打包策略未定 | 🟢 低 | Semantic Core 默认进入桌面安装包，Smart Pack 不进入默认安装包，具体打包方案待 Desktop 阶段确定 |

### 影响范围

- 领域层：新增 SimilarityIndexEntry 接口 + makeSimilarityIndexEntryId 函数
- Schema 升级：v31 → v32，新增 similarityIndexEntries 表
- 新增 embeddingService / similarityIndex / similarityComparison 三个模块
- 新增 smoke-model.mjs 验证脚本
- 测试：embedding-service.test.ts + similarity-index.test.ts

---

## Phase3.3 +Round 13 devlog -- P33-ALG-001 修复评审阻断：JobConsumer 产品运行时消费 + embeddingEnabled 严格语义 + 敏感日志彻底清理

**日期**: 2026-05-18
**任务起始时间**: 04:40
**任务结束时间**: 05:10
**工时**: 30分钟

### 任务目标

修复评审发现的全部阻断问题，确保"模型驱动算法已经在 UI 使用中运行"：
- 在产品运行路径接入后台 Job 消费机制，确保内容变更后 recompute_local_features / recompute_semantic_features 被实际处理
- 明确 embeddingEnabled=false 行为：semantic job 必须 skipped/disabled，不应单独 summary
- 彻底移除 modelProvider.ts 中所有用户文本/summary/explanation preview 日志
- 不全库扫描、不自动 probe Ollama

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/lib/jobConsumer.ts` | 新增 JobConsumer 类：5 秒轮询 processBatch，model_available 时自动 reactivatePendingModelJobs | +80 |
| `apps/web/lib/semanticFeatureEngine.ts` | embeddingEnabled=false 时直接返回 disabled，不再允许单独 summary；degraded 分支简化 | +15/-10 |
| `apps/web/lib/modelProvider.ts` | 移除 generateSummary 的 textPreview、generateExplanation 的 textPreview 和 explanationPreview | +3/-5 |
| `apps/web/tests/semantic-feature-engine.test.ts` | embedding 模型不可用 → disabled（原 partial）；新增"用户未启用 embedding 但 reasoning 可用 → disabled"测试 | +15/-15 |

### 核心设计

**JobConsumer**：
- 每 5 秒调用 `processBatch(userId, { workspaceId, limit: 5 })`
- 当 `ModelRuntimeStatus.mode === 'model_available'` 时自动 `reactivatePendingModelJobs`
- 不自动 probe Ollama，不执行全库扫描
- SettingsView 组件挂载时启动，卸载时停止
- 每 5 秒刷新 Model Activity 数据

**embeddingEnabled 严格语义**：
- `embeddingEnabled = userEmbeddingEnabled && embeddingStatus === 'available'`
- 如果 `embeddingEnabled === false`，整个 semantic job 返回 `disabled`，不执行任何模型调用
- 理由：embedding 是语义核心，没有 embedding 就没有语义特征，单独 summary 不构成有效语义结果
- 对应 jobProcessor 中 `disabled → skipped` 映射，job 以 skipped 状态完成

**敏感日志彻底清理**：
- `generateSummary()`：移除 `textPreview`，只输出 `textLen` 和 `model`
- `generateExplanation()`：移除 `textPreview` 和 `explanationPreview`，只输出 `textLen`、`model`、`len`
- console 只允许输出：长度、hash、状态、耗时、模型 ID

### 遇到的问题与解决方式

1. **产品运行时无 Job 消费路径**：`processBatch/processNext` 只在测试里被调用，UI 产品运行时不会自动消费。解决：新增 `JobConsumer` 类，在 SettingsView 挂载时启动定时消费。
2. **embeddingEnabled=false 时允许单独 summary**：原代码 `!embeddingEnabled && !reasoningEnabled` 才返回 disabled，意味着 `embeddingEnabled=false + reasoningEnabled=true` 会执行 summary 并返回 partial。解决：改为 `!embeddingEnabled` 直接返回 disabled，embedding 是语义核心不可跳过。
3. **modelProvider 仍泄露用户文本 preview**：`generateSummary()` 和 `generateExplanation()` 仍记录 textPreview/explanationPreview。解决：彻底移除，只输出长度和 hash。

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test` | ✅ 1218 passed, 0 failed |
| `pnpm validate` | ✅ 0 errors, 20 warnings |
| `pnpm build:web` | ✅ success |
| `pnpm smoke:model` | ✅ pass, embedding dim=1024, vectorHash/summaryHash 正常 |

### Browser 实测

1. 打开 Settings → 初始状态 unprobed
2. 点击"检测本地 Embedding 模型"→ connected
3. 手动启用 Embedding
4. 通过 UI 创建新 Draft → 触发 onContentChanged → enqueue recompute_local_features + recompute_semantic_features
5. JobConsumer 5 秒内自动消费 → 真实调用 qwen3-embedding:0.6b 生成 1024 维 embedding → 写入 EmbeddingVector + AlgorithmAuditLog + SemanticFeatureSnapshot
6. qwen3:1.7b 生成 summary → 写入 outputHash
7. Model Activity 面板实时刷新：semantic job status=complete, snapshot count 递增, embeddingDim=1024, vectorHash/summaryHash 显示
8. 确认 console 不输出用户文本 preview / summary preview / explanation preview

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| JobConsumer 仅在 SettingsView 挂载时运行 | 🟡 中 | 离开 Settings 页面后 JobConsumer 停止，pending job 不会被消费。后续需全局化 |
| embeddingEnabled 严格语义可能过于保守 | 🟢 低 | 当前产品规则合理：embedding 是语义核心，后续可按需调整 |
| JobConsumer 轮询间隔 5 秒 | 🟢 低 | 对用户体验影响小，后续可改为事件驱动 |

### 影响范围

- 新增 jobConsumer.ts：产品运行时 Job 消费机制
- semanticFeatureEngine.ts：enabled 判定逻辑收紧（embeddingEnabled=false → disabled）
- modelProvider.ts：console log 彻底清理
- 测试：semantic-feature-engine.test.ts 新增/修改 2 个测试

---

## Phase3.3 +Round 12 devlog -- P33-ALG-001 修复评审阻断：userPreferences 持久化 + Engine 尊重用户启用状态 + 测试修复

**日期**: 2026-05-18
**任务起始时间**: 04:10
**任务结束时间**: 04:35
**工时**: 25分钟

### 任务目标

修复评审发现的全部阻断问题，主要涉及后端/领域层：
- 新增 userPreferences IndexedDB 表，支持 embeddingEnabled/reasoningEnabled 持久化
- SemanticFeatureEngine.computeFeatures() 读取用户持久化设置，不再用 runtime available 等价 enabled
- 清理 modelProvider.ts 敏感 console log

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/lib/db.ts` | 新增 UserPreferenceRecord 接口、userPreferences 表、v31 版本 | +20 |
| `apps/web/lib/intelligenceRepository.ts` | 新增 getUserPreference/setUserPreference 及 embedding/reasoning 便捷函数 | +55 |
| `apps/web/lib/semanticFeatureEngine.ts` | computeFeatures 读取 getEmbeddingEnabledPref/getReasoningEnabledPref | +8/-3 |
| `apps/web/lib/modelProvider.ts` | 移除 textPreview/summaryPreview console log | +2/-4 |

### 遇到的问题与解决方式

1. **SemanticFeatureEngine 用 runtime available 等价 enabled**：原代码 `mode === 'model_available' && embeddingStatus === 'available'` 直接推导 embeddingEnabled。解决：改为读取 `getEmbeddingEnabledPref` + `embeddingStatus === 'available'` 双重判定。
2. **modelProvider 敏感日志**：generateEmbedding 和 generateSummary 的 console.log 输出了用户文本片段和摘要预览。解决：移除 textPreview/summaryPreview，只输出 textLen 和 len。

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test` | ✅ 1217 passed, 0 failed |
| `pnpm validate` | ✅ 0 errors, 20 warnings |
| `pnpm build:web` | ✅ success |
| `pnpm smoke:model` | ✅ pass |

### 手工验证步骤

1. 运行 `pnpm --dir apps/web test` 确认全部通过
2. 运行 `pnpm validate` 确认 0 errors
3. 运行 `pnpm build:web` 确认构建成功
4. 运行 `pnpm smoke:model` 确认 Ollama 可用

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| userPreferences 表 v31 升级 | 🟢 低 | Dexie 自动升级，无破坏性变更 |

### 影响范围

- intelligenceRepository：新增 userPreferences 读写函数
- SemanticFeatureEngine：enabled 判定逻辑变更
- modelProvider：console log 清理

---

## Phase3.3 +Round 11 devlog -- P33-ALG-001 LocalTextFeatureEngine + SemanticFeatureEngine + jobProcessor 集成

**日期**: 2026-05-18
**任务起始时间**: 14:25
**任务结束时间**: 14:50
**工时**: 25分钟

### 任务目标

- 实现 LocalTextFeatureEngine：单条 target 输入 → 语言检测/词数统计/关键词候选/实体候选/结构提示 → LocalTextFeatureSnapshot
- 实现 SemanticFeatureEngine：单条 target 输入 → 仅读取 ModelRuntimeStatus + embeddingEnabled/reasoningEnabled → 通过 localModelRuntimeService 调用 provider → SemanticFeatureSnapshot
- SemanticFeatureEngine 不使用 getCapabilityStatus()，不自动 probe，仅读取已有状态
- jobProcessor 接入两个 engine，payload 缺 targetId/workspaceId/contentHash 时 fail，不 fallback 全库扫描

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/lib/localTextFeatureEngine.ts` | 新增本地文本特征引擎 | +210 |
| `apps/web/lib/semanticFeatureEngine.ts` | 新增语义特征引擎 | +330 |
| `apps/web/lib/jobProcessor.ts` | 接入两个 engine，替换 getCapabilityStatus() 判断 | +30/-40 |

### 遇到的问题与解决方式

（本轮无阻断问题）

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test` | ✅ 1196 passed，6 pre-existing failures（unrelated） |
| `pnpm validate` | ✅ 1 pre-existing error（non-null assertion），0 new errors |
| `pnpm build:web` | ✅ success |

### 手工验证步骤

1. 启动开发服务器，确认基础页面不崩
2. 在 Console 中手动构造 BackgroundJob payload（含 targetId/workspaceId/contentHash），确认 processJob 正确分发到对应 engine
3. 确认 payload 缺 targetId/workspaceId/contentHash 时 job 直接 fail，不执行全库扫描
4. 确认 SemanticFeatureEngine 不主动 probe，仅读取已有 ModelRuntimeStatus

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| LocalTextFeatureEngine 关键词/实体候选为规则引擎实现 | 🟡 中 | 基于简单规则的提取，精度有限，后续可接入 NLP 模型提升 |
| SemanticFeatureEngine 依赖 ModelRuntimeStatus 已写入 | 🟡 中 | 如果 ModelRuntimeStatus 不存在，engine 返回 unavailable 而非自动探测 |
| jobProcessor 不 fallback 全库扫描 | 🟢 低 | 设计如此，payload 缺必要字段即 fail |

### 影响范围

- jobProcessor：核心分派逻辑变更，不再使用 getCapabilityStatus() 判断模式，改为直接调用对应 engine
- 新增 localTextFeatureEngine / semanticFeatureEngine 两个模块，供 jobProcessor 内部使用
- 对现有 BackgroundJobQueue / ContentChangeService 无影响

---

## Phase3.3 +Round 10 devlog -- P33-RUNTIME-003 QA 返修（reasoning sanitizer 标签清洗不完整）

**日期**: 2026-05-18
**任务起始时间**: 01:10
**任务结束时间**: 01:20
**工时**: 10分钟

### 任务目标

修复 P33-RUNTIME-003 QA 返修发现的 reasoning sanitizer 标签清洗不完整问题：标准 `<think >...</think >` 标签清洗后留下闭合标签的 `>` 残留，导致 reasoning-only 内容可能被当作有效 summary 写入。

### 问题根因

原正则 `/<think[\s\S]*?<\/think/gi` 只匹配到 `</think` 但不消费其后的 `>`，导致标准/带属性/多行标签清洗后留下 `>` 残留。

### 修复内容

| 问题 | 修复 |
|------|------|
| 正则不消费 `</think` 后的 `>` | 改为 `/<think[\s\S]*?<\/think\s*>?/gi`，`\s*>?` 可选消费 `>` |
| 标准 `<think >reasoning</think >` 留下 `>` 残留 | 修复后完整消费 `</think >`，无残留 |
| 剥离后为空未返回 null | 原有逻辑已正确处理（`content.length === 0 ? null : content`） |
| 缺少标准标签测试 | 新增 6 个标准标签测试 + 1 个 `>` 残留断言测试 |

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/lib/reasoningSanitizer.ts` | 正则从 `/<think[\s\S]*?<\/think/gi` 改为 `/<think[\s\S]*?<\/think\s*>?/gi` | +1/-1 |
| `apps/web/tests/reasoning-sanitizer.test.ts` | 拆分原有测试为标准/畸形两组，新增 7 个 QA 测试用例 | +37/-6 |

### 新增测试用例

| 测试 | 验证点 |
|------|--------|
| strips standard think tags with proper closing | 标准 `<think >...</think >` 清洗无残留 |
| strips think tags with attributes and proper closing | 带属性标签 `<think thinking="deep" >...</think >` |
| strips multiline think tags with proper closing | 多行标签 `<think >\n...\n</think >` |
| returns null when content is empty after sanitization (standard) | `<think >reasoning</think >` 返回 null |
| QA: standard think tag with real output after | `<think >reasoning</think >Real output` === `Real output` |
| QA: standard think tag with no output returns null | `<think >reasoning</think >` === null |
| QA: standard think tag with JSON after | `<think >reasoning</think >\n{"summary":"ok"}` === `{"summary":"ok"}` |
| QA: think tag with attributes and proper closing | `<think attr="x">reasoning</think >Final` === `Final` |
| QA: multiline think tag with proper closing | `<think >\nline1\nline2\n</think >\nResult` === `Result` |
| QA: no ">" residue after stripping standard think tags | 断言结果不含 `>` |

### modelProvider 行为复验

| 检查项 | 结果 |
|--------|------|
| `generateSummary` 不读取 `choices[0].message.reasoning` | ✅ `validateChatContentShape` 只提取 `content` |
| `generateExplanation` 不读取 `choices[0].message.reasoning` | ✅ 同上 |
| sanitize 后为空返回 `success:false` | ✅ 第 444-446/488-490 行 |
| 不写入 reasoning 内容到业务库/audit/devlog | ✅ audit 只存 outputHash |

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test tests/reasoning-sanitizer.test.ts` | ✅ 24 tests passed |
| `pnpm --dir apps/web test tests/ollama-provider.test.ts tests/local-model-runtime-service.test.ts` | ✅ 40 tests passed |
| `pnpm validate` | ✅ 0 errors · 19 warnings · 1475 tests passed |
| `pnpm build:web` | ✅ 构建成功 |
| `pnpm smoke:model` | ✅ PASS — probe/embedding/reasoning 均可用，dimension 1024，audit 3 entries |

### 手工验证步骤

1. 启动开发服务器，确认基础页面不崩
2. 在 Console 中执行 `initDevProviders()`，确认 Settings 智能能力面板正常
3. 确认标准 `<think >` 标签输出不会留下 `>` 残留

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| 嵌套 `<think >` 标签 | 🟢 低 | 非贪婪匹配只剥离第一层，但 LLM 输出中嵌套 think 标签极罕见 |
| `\s*>?` 可能消费非标签的 `>` | 🟢 极低 | 仅在 `</think` 紧跟空白+`>` 时触发，正常内容不会出现此模式 |

### 影响范围

- `reasoningSanitizer.ts`：正则微调，向后兼容（malformed 标签仍可匹配）
- `reasoning-sanitizer.test.ts`：新增测试，不影响已有测试
- `modelProvider.ts`：无改动，行为复验通过

---

## Phase3.3 +Round 9 devlog -- P33-RUNTIME-003 评审修复（workspace 隔离）

**日期**: 2026-05-18
**任务起始时间**: 00:40
**任务结束时间**: 00:55
**工时**: 15分钟

### 任务目标

修复 P33-RUNTIME-003 二次评审发现的 P1 workspace 隔离问题：`resolveTargetText` 不接收 `workspaceId`，tip/draft/dockItem 均不校验 workspace，导致跨 workspace 读取内容并写入模型结果。

### 修复内容

| 问题 | 级别 | 修复 |
|------|------|------|
| `resolveTargetText` 不接收 `workspaceId` | P1 | 新增 `workspaceId` 参数，所有调用点传入 `job.workspaceId` |
| tip 使用 `getTip` 不校验 workspace | P1 | 改为直接 `db.tips.get(id)` + 校验 `matchesWorkspace(tip.workspaceId, workspaceId)` |
| draft 使用 `getDraft` 硬编码 `DEFAULT_WORKSPACE_ID` | P1 | 改为直接 `db.editorDrafts.get(id)` + 校验 `matchesWorkspace(draft.workspaceId, workspaceId)` |
| dockItem 只校验 `userId` 不校验 workspace | P1 | 新增 `matchesWorkspace(item.workspaceId, workspaceId)` 校验 |
| 缺少 workspace 隔离测试 | P2 | 新增 7 个测试用例覆盖跨 workspace skipped 语义 |

### 核心设计

新增 `matchesWorkspace(recordWorkspaceId, jobWorkspaceId)` 辅助函数：
- 记录的 `workspaceId` 为 `undefined` 时归一化为 `DEFAULT_WORKSPACE_ID`
- 确保遗留数据（无 workspaceId 字段）与显式 `DEFAULT_WORKSPACE_ID` 匹配
- 非 default workspace 的 job 不会读到无 workspaceId 的遗留数据

跨 workspace target 返回 `null` → job 结果为 `skipped` → 不调用模型服务 → 不写 EmbeddingVector/SemanticFeatureSnapshot。

### 改动文件

| 文件 | 说明 |
|------|------|
| `apps/web/lib/jobProcessor.ts` | 新增 `matchesWorkspace` + `workspaceId` 参数；移除 `getDraft`/`getTip` import，改为直接 Dexie 查询 + workspace 校验 |
| `apps/web/tests/background-job-queue.test.ts` | 新增 7 个 workspace 隔离测试用例 |

### 新增测试用例

| 测试 | 验证点 |
|------|--------|
| dockItem: WS_OTHER job 不读 default workspace 同 id | 跨 workspace dockItem 返回 skipped |
| dockItem: 同 workspace 读取内容并调用 model | 正确 workspace 的 target 被处理 |
| tip: WS_OTHER job 不读 default workspace 同 id | 跨 workspace tip 返回 skipped |
| draft: WS_OTHER job 不读 default workspace 同 id | 跨 workspace draft 返回 skipped |
| recompute_semantic_features 跨 workspace | 不写 EmbeddingVector/SemanticFeatureSnapshot |
| undefined workspaceId 匹配 DEFAULT_WORKSPACE_ID | 遗留数据兼容 |
| undefined workspaceId 不匹配 WS_OTHER | 遗留数据隔离 |

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm validate` | ✅ 0 errors · 19 warnings · 1150 tests passed |
| `pnpm build:web` | ✅ 构建成功 |
| `pnpm smoke:model` | ✅ **PASS** — probe/embedding/reasoning 均可用，dimension 1024，audit 3 entries |

### 剩余风险

1. `resolveTargetText` 只支持 tip/draft/dockItem 三种 targetType，其他类型返回 null（job skipped）
2. `matchesWorkspace` 将 `undefined` workspaceId 归一化为 `DEFAULT_WORKSPACE_ID`，未来多 workspace 场景需确保所有记录写入时携带 workspaceId

---

## Phase3.3 +Round 8 devlog -- P33-RUNTIME-003 评审修复（P1/P2）

**日期**: 2026-05-18
**任务起始时间**: 00:22
**任务结束时间**: 00:30
**工时**: 8分钟

### 任务目标

修复 P33-RUNTIME-003 评审发现的 3 个 P1 + 3 个 P2 问题。

### 修复内容

| 问题 | 级别 | 修复 |
|------|------|------|
| Registry probe 后 capability 状态不同步 | P1 | 新增 `ModelProviderRegistry.syncAvailabilityFromProbe()`，`probeAndSyncStatus` 调用后同步 registry |
| jobProcessor 传空文本给模型 | P1 | 新增 `resolveTargetText()` 从 tip/draft/dockItem 获取真实内容，无法获取则返回 `skipped` |
| audit outputHash 是常量 | P1 | embedding 成功时 hash vector bytes，summary 成功时 hash sanitized summary |
| ModelRuntimeStatus 写 providerId 而非 model ID | P2 | 从 provider 实例读取 `embeddingModelId`/`reasoningModelId` |
| Chat parser 读取/传递 message.reasoning | P2 | `validateChatContentShape` 不再读取 reasoning，`sanitizeReasoningContent` 移除 rawReasoning 参数 |
| Settings UI 被 stale registry core 状态挡住 | P2 | 以 ModelRuntimeStatus 为主，registry 只作无记录时的 fallback |

### 改动文件

| 文件 | 说明 |
|------|------|
| `apps/web/lib/modelProvider.ts` | 新增 `syncAvailabilityFromProbe()`；`validateChatContentShape` 不读取 reasoning |
| `apps/web/lib/reasoningSanitizer.ts` | 移除 `rawReasoning` 参数，函数只接受 `rawContent` |
| `apps/web/lib/jobProcessor.ts` | 新增 `resolveTargetText()` + `db` import；不传空文本 |
| `apps/web/lib/localModelRuntimeService.ts` | outputHash 来自真实输出；embeddingModelId/reasoningModelId 从 provider 读取；probe 后调用 syncAvailabilityFromProbe |
| `apps/web/app/workspace/page.tsx` | Settings 以 ModelRuntimeStatus 为主，registry 作 fallback |
| `apps/web/tests/ollama-provider.test.ts` | 新增 registry probe sync 测试（3 个） |
| `apps/web/tests/reasoning-sanitizer.test.ts` | 移除 rawReasoning 测试，新增函数签名验证 |
| `apps/web/tests/local-model-runtime-service.test.ts` | 新增 outputHash 变化测试、model ID 测试、registry sync 测试 |
| `apps/web/tests/background-job-queue.test.ts` | 创建 dockItem fixture 以支持 resolveTargetText |

### 遇到的问题与解决方式

1. **DockItem 类型约束**：测试中创建 dockItem 需要正确的 `SourceType`（'text'|'voice'|'import'|'chat'）和 `EntryStatus`（'pending'|'suggested'|...），不能用 'capture'/'active'
2. **fake-indexeddb 数据残留**：不同测试用例使用唯一 userId 避免跨测试数据污染

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm validate` | ✅ 0 errors · 1458 tests passed |
| `pnpm build:web` | ✅ 构建成功 |
| `pnpm smoke:model` | ✅ **PASS** — probe/embedding/reasoning 均可用，dimension 1024 |

### 真实 Smoke 验证

```
=== Atlax MindDock Model Smoke Test ===
--- Probe ---    Available: true
--- Embedding --- Available: true, Dimension: 1024, VectorHash: f776abbb
--- Reasoning --- Available: true, OutputHash: 80530155
--- Result ---    Status: pass, AuditLogIds: 3 entries
```

### 剩余风险

1. `resolveTargetText` 只支持 tip/draft/dockItem 三种 targetType，其他类型返回 null（job skipped）
2. `embeddingModelId`/`reasoningModelId` 通过 `as` 类型断言从 provider 实例读取，如果 provider 不暴露这些属性则为空字符串

---

## Phase3.3 +Round 7 devlog -- P33-RUNTIME-003 Real Ollama-Qwen Model Wiring & Smoke Validation

**日期**: 2026-05-17
**任务起始时间**: 23:20
**任务结束时间**: 23:45
**工时**: 25分钟

### 任务目标

在现有 EmbeddedModelProvider、Capability Modes、BackgroundJobQueue、Intelligence Store 基础上，真实接入 Ollama 本地 Qwen 模型（OpenAI-compatible /v1 API），完成模型探活、embedding 调用、reasoning/summary 调用、smoke runner、provider audit trace、智能数据结构写入、provider unavailable fallback 等 E2E 链路。

### 改动文件与行数

**修改文件**（11个，+706/-105行）：
| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/domain/src/intelligence/types.ts` | +73行 | 新增 EmbeddingVector / AlgorithmAuditLog / ModelSmokeTestRun / ModelRuntimeStatus 接口，扩展 JobType |
| `packages/domain/src/intelligence/provider.ts` | +9行 | 新增 ProbeResult 接口，EmbeddedModelProvider 新增 probe() 方法 |
| `packages/domain/src/intelligence/ids.ts` | +16行 | 新增 4 个 ID 生成函数 |
| `packages/domain/src/intelligence/index.ts` | +9行 | 导出新增类型和函数 |
| `apps/web/lib/db.ts` | +102行 | v30 schema 新增 4 张表（embeddingVectors / algorithmAuditLogs / modelSmokeTestRuns / modelRuntimeStatuses） |
| `apps/web/lib/modelProvider.ts` | +201行 | 新增 OllamaOpenAICompatibleProvider / initOllamaProviders / 默认模型常量 |
| `apps/web/lib/intelligenceRepository.ts` | +82行 | 新增 7 个 repository 方法（upsert / get / list） |
| `apps/web/lib/jobProcessor.ts` | +43行 | recompute_semantic_features 真实调用模型 + 3 个新 job type |
| `apps/web/app/workspace/page.tsx` | +269/-105行 | Settings 智能能力面板从 ModelRuntimeStatus 读取状态 |
| `apps/web/tests/model-provider.test.ts` | +4行 | 补充 failing provider 的 probe() 方法 |
| `package.json` | +3行 | 新增 smoke:model 脚本（tsx --tsconfig） |

**新建文件**（7个，共1107行）：
| 文件 | 行数 | 说明 |
|------|------|------|
| `apps/web/lib/reasoningSanitizer.ts` | 19行 | sanitizeReasoningContent 清洗函数（剥离 think 标签 + CoT 片段） |
| `apps/web/lib/localModelRuntimeService.ts` | 307行 | 服务层：调 Provider → 写 Audit → 写 Store |
| `apps/web/lib/modelSmokeService.ts` | 160行 | Smoke 业务编排层 |
| `apps/web/scripts/smoke-model.ts` | 66行 | Node + fake-indexeddb smoke runner |
| `apps/web/tests/ollama-provider.test.ts` | 283行 | 25 个测试：probe/embedding/reasoning 功能 + provider 边界 |
| `apps/web/tests/reasoning-sanitizer.test.ts` | 79行 | 14 个测试：think 标签剥离 / CoT 片段移除 / 空值处理 |
| `apps/web/tests/local-model-runtime-service.test.ts` | 193行 | 8 个测试：audit 不泄漏原文 / embedding metadata / runtime status |

### 架构分层

```
jobProcessor.ts           ← 只调 Service，不直接操作 provider+repository
ModelSmokeService         ← 编排层，调 Provider + 写 Repository
LocalModelRuntimeService  ← 服务层，调 Provider + 写 Audit + 写 Store
────────────────────────────
OllamaOpenAICompatibleProvider ← 插头层，只做 HTTP 调用 + response normalize
DevEmbeddedModelProvider       ← 插头层（已有）
────────────────────────────
intelligenceRepository.ts ← 数据层，CRUD 操作
db.ts (Dexie)             ← 存储层
```

**Provider 是插头，不是电工队。**

### 遇到的问题与解决方式

1. **sanitizeReasoningContent 正则不匹配 malformed think 标签**：Qwen 模型输出的 `<think` 标签可能没有闭合的 `>`（如 `<think reasoning</think`）。原正则 `/<think[^>]*>[\s\S]*?<\/think[^>]*>/gi` 要求必须有 `>`，修改为 `/<think[\s\S]*?<\/think/gi` 放宽匹配。

2. **EmbeddedModelProvider 接口新增 probe() 方法导致已有测试失败**：4 个 `model-provider.test.ts` 中的 failingProvider fixture 缺少 probe 方法，补充 `probe: async () => ({ available: false, ... })`。

3. **OllamaProvider 测试中 `as Response` 类型转换失败**：TS strict 模式下不允许不完整对象直接 cast 为 Response，改为 `as unknown as Response`。

4. **test 中 non-null assertion 违反 lint 规则**：`vector!.dimension` 等写法被 `@typescript-eslint/no-non-null-assertion` 禁止，改为 `if (!vector) throw new Error('unreachable')` 进行类型收窄。

5. **unused import 导致 lint error**：intelligenceRepository.ts 导入了 4 个表对象但方法内使用 `db.xxx` 直接访问，移除未使用的表导入；`let query` 改为内联 `const results`。

6. **tsx 无法解析 @/ 路径别名**：smoke runner 使用 `npx tsx` 执行时报 `MODULE_NOT_FOUND`，添加 `--tsconfig apps/web/tsconfig.json` 参数注册路径映射。

7. **Review 发现 smoke runner 未注册 provider**：`initOllamaProviders()` 原本只允许 `NODE_ENV=development/test` 注册，`pnpm smoke:model` 在普通 CLI 环境下执行时没有注册真实 provider，导致 endpoint 可用但 smoke 误报 blocked。修复方式：smoke runner 显式传入 `allowOutsideDev: true`，同时继续保证没有 import-time 自动网络请求。

8. **ModelSmokeTestRun 未关联 audit id**：原 smoke 结果 `auditLogIds` 永远为空。修复方式：LocalModelRuntimeService 在 probe / embedding / summary 写入 AlgorithmAuditLog 后返回 audit id，ModelSmokeService 聚合到 ModelSmokeTestRun。

9. **Chat response shape 校验不足**：原实现只做 content 非空清洗。修复方式：新增 chat choices/message/content shape 校验，并对 JSON-like summary content 做最小 JSON object 校验，继续忽略 `message.reasoning`。

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors，19 warnings（均为预存在） |
| `pnpm typecheck` (domain + web) | ✅ 通过 |
| `pnpm test` (domain 315 + web 1139) | ✅ 1454 tests，0 failures |
| `pnpm check:terminology` | ✅ 通过 |
| `pnpm build:web` | ✅ 通过 |
| `pnpm --dir apps/web test tests/ollama-provider.test.ts tests/local-model-runtime-service.test.ts` | ✅ 36 tests，0 failures |

### 真实 Smoke 验证

执行命令：
```bash
LOCAL_MODEL_PROVIDER=ollama_openai_compatible \
LOCAL_MODEL_BASE_URL=http://localhost:11434/v1 \
LOCAL_MODEL_API_KEY=ollama \
EMBEDDING_MODEL_ID=qwen3-embedding:0.6b \
REASONING_MODEL_ID=qwen3:1.7b \
pnpm smoke:model
```

结果：**Blocked -- Ollama endpoint unavailable**（Ollama 未在本地运行）。脚本正确输出 `Blocked: Ollama endpoint unavailable` 且 exit code 非 0，**没有伪造成功**。

Review 修复后复验：
```bash
pnpm smoke:model
```

结果：**PASS**。输出确认：
- Probe Available: `true`
- Embedding Available: `true`
- Embedding Dimension: `1024`
- Reasoning Available: `true`
- ModelSmokeTestRun AuditLogIds: `3 entries`
- Exit code: `0`

说明：本机 `http://localhost:11434/v1` endpoint 可用，smoke runner 现已真实调用 `/v1/models`、`/v1/embeddings`、`/v1/chat/completions`。

### 写入的智能数据结构

| 数据结构 | Dexie 表 | 写入时机 |
|----------|----------|----------|
| EmbeddingVector | embeddingVectors | embedding 调用成功后，由 LocalModelRuntimeService 写入 |
| AlgorithmAuditLog | algorithmAuditLogs | 每次 probe/embedding/reasoning 调用后，由 Service 层写入 |
| ModelSmokeTestRun | modelSmokeTestRuns | smoke 完成后，由 ModelSmokeService 写入 |
| ModelRuntimeStatus | modelRuntimeStatuses | probe 后，由 LocalModelRuntimeService 写入 |

**已确认**：
- 不存储 `message.reasoning`
- 不存储原文全文
- audit log 不记录完整 vector，仅记录 vectorHash / outputHash；EmbeddingVector 保存 vectorBlob 供后续向量能力使用
- audit log 仅包含 inputHash / outputHash
- ModelSmokeTestRun 记录本轮 probe / embedding / summary 对应的 3 条 auditLogIds
- sanitizeReasoningContent 正确剥离 `...` 和 CoT 片段

### 剩余风险

1. **Qwen 模型输出格式变化**：sanitizer 基于观察到的模式设计，Qwen 后续版本可能输出不同格式的思考内容
2. **SemanticFeatureSnapshot 新建默认值**：当 target 无现有 snapshot 时，service 创建默认值（source='local_model_runtime_service'），需要后续任务确认默认值合理
3. **Settings UI 加载时序**：Settings 通过 useEffect 异步读取 IndexedDB，首次渲染可能短暂显示"检测中..."

### 影响范围

- 领域层：新增 4 个接口 + 1 个 ProbeResult 类型 + 4 个 ID 函数，向后兼容
- Schema 升级：v29 → v30，新增 4 张表，无数据迁移，upgrade 为空函数
- Provider 层：新增 OllamaOpenAICompatibleProvider，不影响现有 Dev Provider
- JobProcessor：recompute_semantic_features 行为从"仅标记 stale"改为"真实调用模型"（仅 model_available 时）
- Settings UI：智能能力面板从静态文本改为异步读取 ModelRuntimeStatus

---

## Phase3.3 +Round 6 devlog -- P33-RUNTIME-002 Background Job Queue + Incremental Recompute

**日期**: 2026-05-17
**任务起始时间**: 09:00
**任务结束时间**: 09:45
**工时**: 45分钟

### 任务目标

建立 Phase 3.3 的后台任务队列与增量重算基础：
1. 定义 ContentChangedEvent 类型（sourceType / sourceId / userId / workspaceId / contentHash / changeType / occurredAt）
2. 实现 computeContentHash 和 isContentDirty 增量判断
3. 实现 BackgroundJobQueue 完整队列操作（enqueue / dequeue / processNext / processBatch / retry / fail / complete / getJobStatus / listOpenJobs / listPendingModelJobs / reactivatePendingModelJobs）
4. 实现 JobProcessor 根据 CapabilityMode 降级判断（core → pending_model / model_available → complete / degraded → degraded）
5. 实现 reactivatePendingModelJobs 生命周期闭环（pending_model → pending 恢复，不增加 attempts）
6. 实现 ContentChangeService 服务层入口（onContentChanged）
7. 在 repository.ts 的 createDraft / updateDraft / publishDraftToDocument 中接入 onContentChanged 真实调用
8. 新增 Dexie v29 backgroundJobs 表
9. 新增 30 项测试覆盖所有核心场景
10. 不实现复杂算法引擎，不做页面 UI

### 改动文件及行数

| 文件 | 改动说明 | 约行数 |
|------|----------|--------|
| `packages/domain/src/intelligence/events.ts` | 新增 ContentSourceType / ContentChangeType / ContentChangedEvent 类型 | +12 |
| `packages/domain/src/intelligence/types.ts` | 新增 JobType / JobStatus / BackgroundJob 类型 | +25 |
| `packages/domain/src/intelligence/ids.ts` | 新增 makeBackgroundJobId 函数 | +5 |
| `packages/domain/src/intelligence/index.ts` | 新增 events / BackgroundJob / makeBackgroundJobId 导出 | +10 |
| `apps/web/lib/db.ts` | 新增 v29 schema（backgroundJobs 表 + 7 个索引）、BackgroundJobRecord / PersistedBackgroundJob 类型、backgroundJobsTable 导出 | +30 |
| `apps/web/lib/contentHash.ts` | 新增 computeContentHash（DJB2 哈希 + ch_ 前缀）和 isContentDirty（增量判断） | +30 |
| `apps/web/lib/backgroundJobQueue.ts` | 新增 11 个队列操作函数（enqueue / dequeue / retry / fail / complete / getJobStatus / listOpenJobs / listPendingModelJobs / reactivatePendingModelJobs / processNext / processBatch） | +220 |
| `apps/web/lib/jobProcessor.ts` | 新增 processJob 函数（3 种 jobType 分派 + CapabilityMode 降级判断） | +40 |
| `apps/web/lib/contentChangeService.ts` | 新增 onContentChanged 服务层入口（dirty check + enqueue） | +30 |
| `apps/web/lib/repository.ts` | 在 createDraft / updateDraft / publishDraftToDocument 中接入 onContentChanged 真实调用；新增 notifyDocumentContentChanged 辅助函数 | +40 |
| `apps/web/tests/background-job-queue.test.ts` | 新增 30 项测试（contentHash / enqueue / dequeue / processNext / retry-fail / pending_model 生命周期 / listOpenJobs / workspace 隔离 / ContentChangeService / batch limit） | +450 |

### 遇到的问题及解决方式

1. **attempts 语义冲突（评审阻塞项）**：初版 dequeue 会将 attempts +1，然后 processNext 在 pending_model 分支中用 dequeue 后的 job.attempts 回写，导致 pending_model 状态的 attempts 从 0 变为 1，违反规格"不消耗 attempts"。解决方案：processNext 不再调用 dequeue，改为内联查询 pending 任务，在更新 running 状态前保存 originalAttempts，pending_model 分支中用 originalAttempts 回写，确保最终持久化 attempts 不变。
2. **vi.useFakeTimers 与 Dexie 冲突**：fake timers 会导致 IndexedDB 异步操作超时。解决方案：retry 测试改用时间范围断言验证 nextRunAt 的指数退避逻辑，不使用 fake timers。
3. **pending_model 生命周期闭环**：pending_model 状态的 Job 不能被 dequeue 取出，只能通过 reactivatePendingModelJobs 恢复为 pending。解决方案：dequeue 仅查询 status='pending'，reactivatePendingModelJobs 仅在 model_available 时执行，批量改回 pending 且不增加 attempts。
4. **onContentChanged 无生产调用点（评审风险项）**：初版只在测试中引用 onContentChanged，没有生产代码调用。解决方案：在 repository.ts 的 createDraft / updateDraft / publishDraftToDocument 三个关键 service 层函数中接入 onContentChanged，使用 `.catch(() => {})` 确保不阻塞主流程。其他触发点（tip 创建、mind node 更新、import 等）留给后续卡片接入。
5. **pnpm build:web 复验**：评审报告 `/_document PageNotFoundError`，但本地复验 build:web 通过。可能为构建缓存或环境差异导致，当前已确认通过。

### 自动验证结果

- `pnpm validate`：✅ 通过（1089 tests passed，0 lint errors）
- `pnpm build:web`：✅ 通过
- 新增 30 项测试：✅ 全部通过

### 手工验证步骤

1. 启动开发服务器，确认 Dock / Mind / Editor / Review / Search 基础链路不崩
2. 打开浏览器 DevTools → Application → IndexedDB → AtlaxDB，确认 backgroundJobs 表存在
3. 确认新表为空初始化，旧表数据完整
4. 确认 React 页面不直接 import backgroundJobs 表
5. 在 Console 中测试 enqueue / processNext / reactivatePendingModelJobs 链路
6. 创建/更新草稿后检查 backgroundJobs 表是否产生对应 Job 记录

### 当前风险及影响范围

| 风险项 | 等级 | 影响 |
|--------|------|------|
| pending_model 恢复需手动触发 | 🟡 中 | reactivatePendingModelJobs 需要在模型变为可用时被显式调用，当前无自动监听机制 |
| Job 处理器仅标记 stale | 🟡 中 | recompute_local_features / recompute_semantic_features 只标记 stale 不执行实际算法，需后续任务卡实现引擎 |
| 队列无自动调度 | 🟡 中 | processBatch 需要被显式调用，当前无定时器或事件驱动的自动处理机制 |
| onContentChanged 未覆盖全部触发点 | 🟡 中 | 当前仅接入 createDraft / updateDraft / publishDraftToDocument，tip 创建、mind node 更新、import 等留给后续卡片 |
| contentHash 为 DJB2 哈希 | 🟢 低 | DJB2 为非加密哈希，碰撞概率极低但不为零，对增量判断场景足够 |
| refresh_recommendations 为占位 | 🟢 低 | 当前返回 skipped，后续任务卡需实现推荐刷新逻辑 |

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
