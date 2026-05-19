# Phase3.3 前端开发日志

> 阶段基线文件，Phase3.3 前端开发日志记录于此。

---

## Phase3.3 +Round 15 devlog -- P33-DOCK-001 Dock 展示方式整改

**日期**: 2026-05-20
**任务起始时间**: 09:40
**任务结束时间**: 12:05
**工时**: 2h25m

### 任务目标

只整改 Dock 展示方式，不改 Editor、全局 App shell 和非 Dock 模块：
- Dock 默认入口切换为 `全库总览 / 数据库`
- 左侧导航改为 Dock 内部视图导航，不再以“任务控制”为默认入口
- 引入统一 `dockItems` 前端语义层，保证导航数字、主表和 Inspector 来自同一批过滤结果
- 项目看板和指标条只在“项目作战室”出现
- 归档证据默认不污染全库总览
- Dock 内新增“打开项目或散点文档”弹窗

### 分支确认

按任务要求执行：

```bash
git fetch origin
git checkout feature/local-core-phase-1
git status
git log --oneline -8
```

确认结果：
- 当前开发分支：`feature/local-core-phase-1`
- 工作区在开工前为干净状态
- 未直接在 `feature/phase-3-3` 上开发
- 未新建额外分支
- 未 commit / push

### 修改文件

| 文件 | 说明 |
|------|------|
| `apps/web/app/workspace/features/dock/DockView.tsx` | 新 Dock 独立组件：左侧导航、全库总览数据库、项目作战室、Inspector、打开项目或散点文档弹窗 |
| `apps/web/app/workspace/features/dock/dockPresentation.ts` | 统一 Dock 语义适配层：`dockItems` 派生、导航 bucket、归档语义、风险语义、war room stage、共享筛选和计数 |
| `apps/web/app/workspace/features/dock/useDockViewModel.ts` | 重构 Dock view model：导航模式、全库/作战室 view tabs、共享筛选、视图设置，并保留旧接口兼容 |
| `apps/web/app/workspace/page.tsx` | Dock runtime 挂载改到新 `features/dock/DockView`，保留现有跨模块 Editor / Mind 跳转回调 |
| `apps/web/tests/dock-presentation.test.ts` | 覆盖语义映射、归档排除、计数一致性、war room stage / risk 派生 |
| `apps/web/tests/dock-view.test.tsx` | 覆盖默认全库总览数据库、归档证据视图切换、Inspector 跟随选中切换 |
| `docs/engineering/dev_log/Phase3/phase3.3-devlog/phase3.3-devlog-frontend.md` | 记录本轮 P33-DOCK-001 工程日志 |

### Dock 布局变更摘要

- Dock 主实现已迁移到 `features/dock/DockView.tsx`，`workspace/page.tsx` 运行时只挂载新组件。
- 左侧导航改为：
  - 全库总览
  - 项目作战室
  - 知识流
  - 待整理
  - 推荐队列
  - 健康风险
  - 归档证据
  - 自定义视图
- 全库总览默认标题为 `Dock / 全库总览`，默认 tab 为 `数据库`；`总览地图 / 看板 / 图表 / 自定义` 保留真实切换入口与轻量占位。
- 主区域数据库表格使用紧凑行式布局，固定列为：
  - 名称
  - 类型
  - 所属域 / 项目
  - 状态
  - 标签
  - 最近更新
  - 推荐动作
- 项目作战室新增 scope tabs、指标条和 `Backlog / In Progress / Review / Done` 看板；指标与看板均由现有知识对象前端派生，不伪装成独立任务系统。

### 左侧导航与计数逻辑

- 新增 `dockPresentation.ts`，统一把现有真实数据派生为 `dockItems`：
  - `Project`
  - `Topic`
  - `Document`
  - `Signal`
  - `Draft`
  - `Mind Node`
  - `Recommendation`
  - `Archive Evidence`
- `Signal` 由现有 `tip` 派生；`Archive Evidence` 由 collection/document/tag/mind 语义前端判定派生，不把 `listDocuments` / `listArchivedEntries` 直接暴露成产品文案。
- 左侧 badge 计算顺序固定为：
  1. 原始 `dockItems`
  2. 应用共享搜索/筛选
  3. 按导航 predicate 分 bucket
  4. bucket 数量直接作为导航数字
  5. 主区域消费同一 bucket
- 这样保证导航数字与主表内容一致，避免出现“左侧显示 10，主区域只有 3”的问题。
- `归档证据` 默认不进入 `全库总览` bucket，只有进入 `归档证据` 入口或显式开启包含归档时才显示。

### Inspector 改动

- Inspector 保持当前产品右侧暗色细边框风格，不改全局 UI 样式。
- 未选中对象时默认收起为窄态；选中对象后自动展开。
- 选中对象后固定分区：
  - 标题
  - 类型 / 状态 / 所属域或项目 / 更新时间
  - Page 概览
  - 文档信息
  - 模型 / 算法推荐
  - 快速操作
- 快速操作最少保留：
  - `在 Editor 中打开`
  - `在 Mind 中查看`
- recommendation 不再独占 Inspector 主体，改为对象关联推荐区，跟随当前对象切换。

### 打开弹窗改动

- Dock 新增独立“打开项目或散点文档”弹窗，复用 Editor 弹窗风格但不改 Editor 行为。
- 弹窗结构包含：
  - 标题与副标题
  - 顶部大搜索框
  - `Title only / Created by / In / Filter / More Reset / Sort by 最近打开`
  - 左侧高密度结果列表
  - 右侧实时预览
  - 底部打开按钮
- 结果来源：
  - 项目 / topic / domain：统一 scope candidates
  - 散点对象：`project=null` 的 document / draft
- 打开项目会进入 `项目作战室` 并锁定 scope；打开散点对象会回到 `全库总览 / 数据库` 并高亮该对象。

### 验证命令和结果

| 命令 | 结果 |
|------|------|
| `pnpm -C apps/web typecheck` | ✅ pass |
| `pnpm -C apps/web lint` | ✅ pass，17 warnings，0 errors |
| `pnpm -C apps/web test` | ✅ 47 files / 1286 tests passed |
| `pnpm -C apps/web build` | ✅ pass，Next build 完成；保留既有 lint warnings |

### 风险与未完成项

- `Signal`、`Archive Evidence`、项目作战室指标条 / 看板均为前端派生语义，没有新增 repository / domain 存储模型；真实数据更丰富时可继续替换派生规则。
- `workspace/page.tsx` 运行时已切到新的 Dock 组件，但历史内嵌 Dock 代码块仍保留为不可达遗留实现，后续可以单独清理，降低页面文件体积。
- `dock-view.test.tsx` 在 jsdom 环境下会输出 React `act(...)` warning，但测试本身通过，不影响生产构建。

---

## Phase3.3 +Round 14 devlog -- P33-EDITOR-001 Editor 展示与导航整改

**日期**: 2026-05-19
**任务起始时间**: 09:10
**任务结束时间**: 11:35
**工时**: 2h25m

### 任务目标

只整改 Editor 展示、导航和信息呈现方式，不改 Dock 和全局 App shell：
- Editor 从 draft-only 页面改为项目 / Domain / 文档工作台
- 顶部支持项目 / 文档 tab 与 Editor 内部面包屑
- 左侧 Draft 列表改为当前项目 / Domain 层级树
- 正式文档可直接打开和保存，不再自动转 Draft
- Draft 发布后仍留在 Editor 工作台可访问
- Tiptap 主编辑器保留，并补充最小 view block 能力
- 右侧 Inspector 根据文档 / 当前视图块切换语义
- `+` 打开 Notion 风格项目或散点文档选择弹窗

### 分支同步方式

按任务要求复用旧目标分支名，以 `origin/feature/phase-3-3` 为干净基线重建本地 `feature/local-core-phase-1`：

```bash
git fetch origin
git checkout feature/local-core-phase-1
git reset --hard origin/feature/phase-3-3
```

同步结果：
- 当前开发分支：`feature/local-core-phase-1`
- 同步后 HEAD：`2a68b60a5a94905ac585697a9c5905a81add9a63`
- `origin/feature/phase-3-3`：`2a68b60a5a94905ac585697a9c5905a81add9a63`
- 未在 `feature/phase-3-3` 上开发
- 未新建额外分支
- 未 push / force push

### 修改文件

| 文件 | 说明 |
|------|------|
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | Editor workspace shell：顶部内部 tab、Domain 树、主编辑区、右侧 Inspector、打开项目或散点文档弹窗、Draft 发布后切正式文档 tab |
| `apps/web/app/workspace/features/editor/TiptapEditor.tsx` | 新增最小 `viewBlock` node extension、slash 插入项、视图块选中回调和紧凑数据视图渲染 |
| `apps/web/app/workspace/features/editor/useEditorDocument.ts` | 新增通用 Editor 文档 hook，统一加载 / 保存 draft 与正式 document |
| `apps/web/lib/repository.ts` | 新增 `updateEditorDocument`，正式文档保存直接更新 `entries`，不创建 Draft |
| `apps/web/tests/draft-repository.test.ts` | 覆盖正式文档打开保存不创建 active Draft、Draft 发布后仍可作为 document 访问 |
| `apps/web/tests/dock-editor-003.test.ts` | 更新 Editor 静态验收：tab 类型、Domain 树、打开弹窗、view block inspector wiring |
| `apps/web/tests/markdown-editor-adapter.test.tsx` | 更新 slash command 期望，加入五类 view block 插入项 |
| `docs/engineering/dev_log/Phase3/phase3.3-devlog/phase3.3-devlog-frontend.md` | 记录本轮 P33-EDITOR-001 工程日志 |

### Editor 布局变更摘要

- 顶部新增 Editor 内部 tab / breadcrumb bar，tab 支持 `project` / `domain` / `document` / `draft`，`+` 打开选择弹窗。
- 左侧从 Draft 列表改为当前激活项目 / Domain 的紧凑层级树，支持展开折叠、点击打开文档、隐藏左栏。
- 散点文档只进入顶部文档 tab；激活散点文档时左侧展示“散点文档只进入顶部 tab，不进入左侧目录”的空态，不污染 Domain 树。
- 主编辑区继续使用现有 `TiptapEditor`，保留 toolbar、block handles、autosave、标题编辑和保存体验。
- 右侧 Inspector 保留原暗色细边框视觉：未选视图块显示文档属性；选中视图块时显示当前视图块配置。
- 打开弹窗采用搜索 + 筛选栏 + 左侧紧凑列表 + 右侧实时预览结构，支持键盘上下选择和 Enter 打开。

### Draft 生命周期修正摘要

- `initialEntryId` 现在直接打开正式 document tab，加载 `entries` 内容，不创建关联 Draft。
- 正式 document autosave 调用 `updateEditorDocument`，只更新 `entries` 的标题、内容、JSON、HTML、Markdown、标签和项目字段。
- Draft autosave 仍调用 `updateDraft`，Draft 只代表新建未归档内容。
- 发布 Draft 后，调用现有 `publishDraftToDocument`，然后关闭 draft tab 并打开发布后的正式 document tab；发布后的文档仍可从项目树、顶部 tab、打开弹窗重新打开。
- Draft 列表不再作为 Editor 左侧唯一入口，只作为打开弹窗中的候选来源之一。

### View Block 支持情况

- 新增最小可回退的 Tiptap `viewBlock` node，attrs 包含 `viewId`、`name`、`viewType`、`dataSource`、`filters`、`sort`、`fields`、`pageSize`。
- Slash menu 已预留五类插入项：
  - 当前项目任务（Table / Tasks）
  - 相关文档（List / Documents）
  - 推荐处理（Queue / Recommendations）
  - 关系预览（Graph / Mind Links）
  - 局部数据库（Table / Local Database）
- 视图块以文档内紧凑表格 / 列表 / Queue / Graph preview 壳渲染，使用细边框、小工具栏和字段行，不做 Dock 模块或大卡片。
- 右侧 Inspector 可读取选中的 view block attrs 并展示 view type、data source、filters、sort、fields、page size。

### 验证命令和结果

| 命令 | 结果 |
|------|------|
| `git branch --show-current` | ✅ `feature/local-core-phase-1` |
| `git rev-parse HEAD && git rev-parse origin/feature/phase-3-3` | ✅ 两者均为 `2a68b60a5a94905ac585697a9c5905a81add9a63` |
| `pnpm --dir apps/web typecheck` | ✅ pass |
| `pnpm lint` | ✅ pass，43 warnings，0 errors |
| `pnpm build` | ✅ pass |
| `pnpm typecheck` | ✅ pass |
| `pnpm --dir apps/web test draft-repository.test.ts dock-editor-003.test.ts markdown-editor-adapter.test.tsx` | ✅ 3 files / 120 tests passed |
| `pnpm test` | ✅ domain 20 files / 315 tests passed；web 45 files / 1280 tests passed |
| `git diff --check` | ✅ pass |
| Browser smoke：`http://localhost:3000/workspace` | ✅ Editor 可打开正式 document；显示 `Document · Saved`；打开弹窗包含搜索框、筛选栏、结果列表、实时预览和打开按钮 |

### 未完成项 / 风险

- Tasks / Local Database 目前仓库内没有完整真实任务或局部数据库实体，view block 先提供配置壳和明确空态，后续接真实数据源时不需要改 Tiptap 基础结构。
- Domain 树优先使用 Mind `parent_child` 边；当关系缺失时，代码按 `entries.project` 把项目文档挂入树，并已在实现中标注 fallback。
- `pnpm lint` 仍有 43 个 warning，未出现 error；部分 warning 来自既有代码，新增 Editor 代码也有少量 hooks/any warning，后续可单独收敛。
- 本轮未做视觉像素级还原，只按参考图调整布局和信息组织，并保持当前产品 UI 风格。

### 手工测试问题复修

**日期**: 2026-05-19

针对 PM 手工测试反馈补充 Editor 可操作性：
- View Block 不再只显示静态 mock 壳：`Documents`、`Recommendations`、`Mind Links` 读取当前 Editor 数据适配层并渲染实际行；`Tasks` / `Local Database` 在真实数据源未接入前保留明确空态。
- 空白文档不再必须先输入内容才能添加 block：光标进入空白段落时，段首直接显示 block handler，可插入视图块 / 文本 / 引用 / callout；移除文末“添加 block”按钮。
- View Block 自身也纳入段首 block handler 命中范围，可选中后进行 block 操作。
- Block handler 增加 hover 保持与延迟隐藏，避免鼠标移动到按钮过程中立即消失。
- 左侧 Domain 树新增“在当前结构中新建空白页面”按钮，创建带当前项目的 Page，并立即出现在当前树中；顶部 `+` 弹窗的新建散点 Page 不进入左侧目录。
- Draft 或正式文档修改项目 / Domain 后，Editor 本地 `drafts` / `documents` 状态同步更新，左侧树无需刷新页面即可显示。
- 顶部 tab 的 `+` 统一承载打开和新建：弹窗补充“新建当前项目 Page”和“新建散点 Page”，移除独立的“新建 Draft”按钮，UI 文案不再把新页面称为 Draft。
- 打开弹窗筛选项补齐可交互行为：`Title only`、`In`、`Filter`、`More Reset`、`Sort by` 会即时影响结果列表。
- Markdown 粘贴优先解析 `text/plain` 中的 Markdown，再处理剪贴板 HTML，避免从 IDE / Markdown 编辑器粘贴时被当作普通段落。
- HTML Preview 从文稿末尾改为右下侧边浮层预览框，不再撑到文档正文末尾。
- Inspector 打开时隐藏独立浮动 Outline rail，避免右侧目录 / 刻度与 Inspector 或视图块操作冲突。
- Inspector 恢复文稿操作区：Document 可保存 / 归档，Page 可发布为正式文档 / 移出工作台。

补充修改文件：

| 文件 | 说明 |
|------|------|
| `apps/web/app/workspace/features/editor/TiptapEditor.tsx` | View Block React NodeView、真实行渲染、段首 block handler 命中 / 保持、HTML 侧边预览 |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | Domain 树新增项目 Page、顶部 `+` 弹窗统一打开 / 新建、项目变更即时刷新、弹窗筛选状态、Inspector 文稿操作、view block 数据适配 |
| `apps/web/app/workspace/features/editor/PasteNormalizer.ts` | Markdown 粘贴优先解析 plain text |

补充验证：

| 命令 / 检查 | 结果 |
|------|------|
| `pnpm --dir apps/web typecheck` | ✅ pass |
| `pnpm --dir apps/web test dock-editor-003.test.ts markdown-editor-adapter.test.tsx draft-repository.test.ts` | ✅ 3 files / 120 tests passed |
| `pnpm lint` | ✅ pass，43 warnings，0 errors |
| `pnpm build` | ✅ pass |
| `git diff --check` | ✅ pass |
| Browser smoke：`http://localhost:3000/workspace` | ✅ Editor 打开正常；顶部独立“新建 Draft”已移除；`+` 弹窗包含“新建当前项目 Page”和“新建散点 Page”；Inspector 显示文稿操作；正式文档仍显示 `Document · Saved` |

---

## Phase3.3 +Round 13 devlog -- P33-ALG-002 Real Model Acceptance Gate：smoke:similarity 全链路验证

**日期**: 2026-05-18
**任务起始时间**: 08:20
**任务结束时间**: 08:50
**工时**: 30分钟

### 任务目标

补充 Real Model Acceptance Gate 验证闭环：
- 新增 `pnpm smoke:similarity` 命令，验证真实模型全链路
- 3 条真实 embedding 生成（source / related / unrelated）
- EmbeddingVector 落库验证
- SimilarityIndex.findSimilar({ mode: 'semantic' }) 消费真实向量
- Core vs Semantic 对比输出
- 不使用 mock / fake / hardcoded vector

### 补交说明

前一个 commit (`adb4212`) 的 commit message 声称已新增 `apps/web/scripts/smoke-similarity.ts`，但实际只提交了 dev_log 和 package.json，**遗漏了脚本文件本身**。本轮补交缺失的脚本文件，并重新运行全部验证命令确认结果。

### 改动文件

| 文件 | 说明 |
|------|------|
| `apps/web/scripts/smoke-similarity.ts` | 新增真实模型全链路 smoke 脚本（补交） |
| `package.json` | 新增 `smoke:similarity` 命令（已在前一个 commit 提交） |

### 验证链路

1. `localModelRuntimeService.generateEmbeddingForTarget()` → 生成 3 条真实 embedding
2. `EmbeddingVector` 落库到 IndexedDB → 验证 providerId / modelId / modelVersion / dimension
3. `SimilarityIndex.findSimilar({ mode: 'semantic' })` → 消费真实向量，输出 semantic_core topK
4. `SimilarityComparison.runComparison()` → Core vs Semantic 对比
5. `fallbackUsed=false` → Semantic Core 可用，不静默 fallback

### 真实模型验证结果（本次实际运行输出）

**EmbeddingVector 已由真实 qwen3-embedding:0.6b 生成：**

| 指标 | 值 |
|------|------|
| providerId | ollama-openai-compatible |
| modelId | qwen3-embedding:0.6b |
| modelVersion | qwen3-embedding:0.6b |
| dimension | 1024 |
| durationMs | 110 |
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

**auditLogId:** smoke-sim-user_aal_smoke-sim-workspace_embedding_1779065328878

### 验证命令

```bash
pnpm validate              # ✅ 0 errors, 1278 tests passed
pnpm smoke:model           # ✅ pass, dim=1024
pnpm smoke:similarity      # ✅ pass, 3 embeddings, 2 semantic_core topK, related>unrelated
```

---

## Phase3.3 +Round 12 devlog -- P33-ALG-002 Review 阻断修复：Core vs Semantic 强制分流 / modelVersion+dimension dirty check / stale vector 排除 / fallbackUsed 修正 / dev_log 修正

**日期**: 2026-05-18
**任务起始时间**: 07:45
**任务结束时间**: 08:15
**工时**: 30分钟

### 任务目标

修复 P33-ALG-002 review 阻断项，不扩大任务范围：

1. **Core vs Semantic 对比不是真实对比**：`similarityComparison.ts` 的 Core Mode 和 Semantic Core 都调用 `similarityIndex.findSimilar()`，但 findSimilar 在 source 有 embedding 时自动走 semantic 分支，导致 Core Mode 面板也返回 `generatedBy=semantic_core`
2. **dirty check 不完整**：`embeddingService.ts` 只比较 `contentHash` 和 `modelId`，未比较 `modelVersion` / `dimension`
3. **stale vector 被 SimilarityIndex 消费**：旧向量标记 `__stale__` 后，SimilarityIndex 仍读取并消费
4. **dev_log 与实现不一致**：声称面板有索引构建按钮和输入文本生成 embedding，但实际没有
5. **fallbackUsed 误报**：`semanticCoreResults.length === 0` 被判定为 `fallbackUsed=true`，但 source embedding 存在且 provider 可用只是无候选结果时不应算 fallback

### 改动文件

| 文件 | 说明 |
|------|------|
| `apps/web/lib/similarityIndex.ts` | 新增 `mode: 'auto' \| 'core' \| 'semantic'` 参数；`findSimilar` 按 mode 强制分流；`getEmbeddingVector` 排除 stale vector；`findSimilarSemantic` 排除 stale candidate |
| `apps/web/lib/similarityComparison.ts` | Core Mode 调用 `findSimilar({ mode: 'core' })`；Semantic Core 调用 `findSimilar({ mode: 'semantic' })`；fallbackUsed 逻辑修正 |
| `apps/web/lib/embeddingService.ts` | dirty check 同时校验 contentHash + modelId + modelVersion + dimension；成功生成后更新 runtime status 的 modelVersion/dimension；fallback 不写 EmbeddingVector |
| `apps/web/lib/intelligenceRepository.ts` | `getEmbeddingVectorsByWorkspace` 过滤 stale vector |
| `packages/domain/src/intelligence/types.ts` | `ModelRuntimeStatus` 新增 `embeddingModelVersion` / `embeddingDimension` 字段 |
| `apps/web/lib/db.ts` | `ModelRuntimeStatusRecord` 新增 `embeddingModelVersion` / `embeddingDimension`；Dexie v33 schema 升级 |
| `apps/web/lib/localModelRuntimeService.ts` | `probeAndSyncStatus` 填充 `embeddingModelVersion` / `embeddingDimension` |
| `apps/web/tests/embedding-service.test.ts` | 新增 4 个测试：modelVersion dirty、dimension dirty、match skip、provider unavailable fallback 不写 fake vector |
| `apps/web/tests/similarity-index.test.ts` | 新增 8 个测试：mode=core 强制 keyword、mode=semantic 无 embedding 返回空、mode=semantic 有 embedding 返回 semantic_core、comparison 强制分流、stale source vector 排除、stale candidate vector 排除、fallbackUsed=false 当 source embedding 存在但无候选、fallbackUsed=true 当 source embedding 不存在 |
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
| `pnpm --dir apps/web test` | ✅ 1278 passed, 0 failed |
| embedding-service.test.ts | ✅ 19 passed |
| similarity-index.test.ts | ✅ 28 passed |
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

实现 P33-ALG-002 前端 SimilarityDiagnosticPanel 诊断面板：
- 新增 SimilarityDiagnosticPanel 组件，展示 Core Mode vs Semantic Core 对比结果
- 在 workspace page 中条件渲染 SimilarityDiagnosticPanel
- 面板支持：按已有 target ID 运行 similarity comparison、展示对比结果
- 面板遵循设计规范：GlassCard 材质、情报蓝强调色、微标签排版

### 改动文件

| 文件 | 说明 | 行数 |
|------|------|------|
| `apps/web/app/workspace/_components/SimilarityDiagnosticPanel.tsx` | 新增相似度诊断面板组件 | +380 |
| `apps/web/app/workspace/page.tsx` | 新增 import + 条件渲染 SimilarityDiagnosticPanel | +2 |

### 核心设计

**SimilarityDiagnosticPanel**：
- GlassCard 材质：bg-[#1c2023]/40 backdrop-blur-[16px] rounded-[16px] border border-white/5
- Core Mode vs Semantic Core 对比展示
- 输入 target ID → 运行 similarity comparison → 展示两组结果
- 诊断信息：模型 providerId、modelId、dimension、durationMs、fallbackUsed
- 不展示完整向量或用户原文，仅展示 vectorHash 和相似度分数

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

### 遇到的问题与解决方式

（本轮无阻断问题）

### 自动验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm build:web` | ✅ success |
| TypeScript 编译 | ✅ 0 errors |

### 当前风险

| 风险项 | 等级 | 影响 |
|--------|------|------|
| SimilarityDiagnosticPanel 仅在 Settings 页面渲染 | 🟢 低 | 后续可按需迁移到其他页面 |
| 面板无自动刷新 | 🟢 低 | comparison 后需手动触发查询 |
| 面板无索引构建按钮和输入文本 embedding | 🟢 低 | 当前仅按已有 target ID 运行 comparison |
| 模型分布边界：Web 依赖本地 Ollama | 🟡 中 | Web 开发期通过 DevLocalModelProvider 调用本机模型，不是最终用户默认依赖；Desktop 阶段应由 DesktopBundledEmbeddingProvider 承接 |

### 影响范围

- 新增 SimilarityDiagnosticPanel 组件
- workspace page 新增条件渲染逻辑
- 不影响其他页面和组件

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
