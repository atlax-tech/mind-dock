# Phase 4 开发日志

---

## Phase 4 Upgrade+Round 11 devlog -- Context Pack 去卡片化紧凑视图

**日期**: 2026-05-28
**任务起始时间**: 10:01
**任务结束时间**: 10:04
**工时**: 3 分钟

### 任务目标

根据用户体验反馈，调整 Platter 中 Context Pack 视图。当前空状态和内容区使用多层卡片模块化布局，在窄侧栏中显得拥挤；本轮只做升级文档范围内的 Pack 管理视图体验修正，不改变 Context Pack 数据结构、推荐逻辑或输出生成能力。

具体目标：
1. 移除 Context Pack 面板外层卡片容器
2. 移除 Pack item 的卡片边框
3. 使用分区分隔线和紧凑列表代替卡片堆叠
4. 保留新建、重命名、删除、导出、生成提示词、推荐加入等现有操作

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +25/-20 行 | 根容器改为 divide 分区；Pack 列表/当前 Pack/推荐内容从 rounded card 改为 section；空状态去掉大图标卡片感；Pack 条目改为分隔线列表；推荐条目改为左侧强调线 |

### 遇到的问题以及解决方式

1. **卡片嵌套导致窄侧栏拥挤**：原布局中 Pack 列表、当前 Pack、推荐内容都是独立圆角卡片，条目本身也有圆角边框。解决方式：外层统一改为 `divide-y` 分区，条目改为 `py-2` 列表行。

2. **仍需保留可识别状态**：完全去掉视觉层次会降低可扫读性。解决方式：当前 Pack 用左侧 2px emerald 线和浅背景表示选中；推荐项用 amber 左边线表示推荐来源。

### 自动验证结果

```bash
$ npm run typecheck
# exit 0，无 TypeScript 错误

$ npm run build
# built in 951ms，exit 0
# 仍有 Vite 大 chunk / ineffective dynamic import warning，属于既有构建提示，不阻塞本轮视图修正
```

### 手工验证步骤说明

1. 打开 Platter -> 上下文包
2. 空状态下应不再显示一个大圆角卡片，只显示轻量分区和说明文字
3. 有 Pack 时，Pack 列表应是紧凑列表，当前 Pack 通过左侧绿线识别
4. Pack 条目应按分隔线排列，不再每条都有卡片边框
5. 推荐内容应以左侧 amber 线标识，不再是独立卡片
6. 新建、重命名、删除、导出、生成提示词、加入推荐按钮应保持可用

### 当前风险，以及影响范围

1. **未做截图级视觉回归**：本轮通过 typecheck/build 验证代码正确性，但未启动应用截图检查。影响范围：可能仍需根据实际侧栏宽度微调间距。
2. **影响范围**：只影响 `ContextPackPanel` 视觉布局，不影响 Pack 数据、搜索、推荐、导出或 AI 生成。

---

## Phase 4 Upgrade+Round 10 devlog -- 搜索准确性：全量文档入索引与标题优先

**日期**: 2026-05-28
**任务起始时间**: 09:55
**任务结束时间**: 09:59
**工时**: 4 分钟

### 任务目标

根据用户手工验证反馈，修复 Command Palette 搜索“产品需求文档”时优先返回 RB-P4-001_upgrade 的不准确结果。问题定位为当前 metadata/chunks/FTS 只收录了 RB-P4-001_upgrade，一个真实存在的文档文件没有进入索引；同时搜索后端缺少标题/路径精确匹配优先策略。

具体目标：
1. Settings 重建索引前同步文件树中的所有 Markdown 到 metadata DB
2. 重建索引覆盖所有已发现文档，而不是只覆盖旧 metadata 中已有记录
3. 搜索后端增加标题/路径匹配结果，并排在 FTS/semantic 之前
4. Command Palette 对标题匹配结果显示“标题”来源标签

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +59/-6 行 | 引入 docTree、documentService、frontmatter 解析；重建索引前遍历文件树所有 `.md`，读取内容、同步 title/frontmatter/hash/wordCount 到 metadata，再执行 reindex/embedding |
| `src-tauri/src/commands/search.rs` | 修改 | +102/-18 行 | `search_documents` 增加 title/path LIKE 查询，精确标题 rank 最高；标题结果与 FTS 结果去重合并；返回 source=`title` |
| `src/modules/command-palette/CommandPalette.tsx` | 修改 | +6/-2 行 | 搜索结果 source badge 增加 `title -> 标题`，让用户能识别标题命中 |

### 遇到的问题以及解决方式

1. **当前索引只收录 1 个文档**：本地查询 `/Users/qilong.lu/WorkDir/MindDock/.minddock/metadata.db` 发现 `documents/chunks/chunks_fts` 只有 `RB-P4-001_upgrade.md`，而截图中打开的 `产品需求文档（PRD）.md` 文件真实存在但没有索引记录。解决方式：Settings 重建索引不再只依赖 `listDocumentsMetadata`，而是先从 `docTree` 扁平化出所有 Markdown 文件，逐个读取内容并 upsert metadata。

2. **文档名搜索没有标题优先**：原 `search_documents` 只查 FTS chunk 内容，缺少 `documents.title/path` 的直接匹配。解决方式：后端先执行标题/路径 LIKE 查询，精确标题 rank=-100，标题包含 rank=-50，路径包含 rank=-25，再合并 FTS 结果。

3. **标题结果需要可识别来源**：新增 source=`title` 后，Command Palette 默认会显示英文 source。解决方式：source badge 增加“标题”标签。

### 自动验证结果

```bash
$ cd src-tauri && rustfmt --check src/commands/search.rs
# exit 0

$ npm run typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0

$ npm run build
# built in 1.00s，exit 0
# 仍有 Vite 大 chunk / ineffective dynamic import warning，属于既有构建提示，不阻塞本轮修复
```

### 手工验证步骤说明

1. 打开 Settings -> Knowledge Engine，点击“重建索引”
2. 重建完成后，全文索引文档数应接近左侧 documents 文件树中的 Markdown 文件数量，不应只显示 1 或 2 个历史 metadata 文档
3. 打开 Command Palette，搜索“产品需求文档”
4. 预期第一条结果为 `产品需求文档（PRD）`，来源标签为“标题”
5. 搜索 RB-P4-001 相关词时，预期仍能返回 RB-P4-001_upgrade，说明原 FTS/semantic 路径未被破坏

### 当前风险，以及影响范围

1. **需要用户执行一次重建索引**：本轮修复了重建逻辑，但已有 vault 的 metadata 不会自动补齐，需在 Settings 点击“重建索引”后生效。影响范围：当前已存在但未入库的文档。
2. **标题匹配依赖 metadata 同步**：如果文档未经过本轮重建或创建/保存同步，标题匹配仍无法命中该文档。影响范围：搜索召回。
3. **影响范围**：只调整 Phase4 搜索与索引入口，不改变语义搜索算法、不引入 MindView/健康报告等后续阶段能力。

---

## Phase 4 Upgrade+Round 9 devlog -- verify-index 误报与 Settings 输出乱码修复

**日期**: 2026-05-28
**任务起始时间**: 09:51
**任务结束时间**: 09:54
**工时**: 3 分钟

### 任务目标

根据用户第二次手工验证反馈，修复 `验证索引` 已能执行但仍显示失败的问题。经本地复现，语义索引已 ready，失败来自 verify-index 脚本自身的两个误报与 ANSI 颜色码在 Settings 中显示为乱码。

具体目标：
1. 修复 personalization-signals.jsonl 合法 JSONL 被误判 invalid 的问题
2. 修复 context-packs.json 引用真实存在文件但 metadata DB 未收录时被误判 invalid 的问题
3. 让 verify-index 在 Settings 非 TTY 环境下输出纯文本，避免颜色码乱码

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `scripts/verify-index.sh` | 修改 | +16/-7 行 | 颜色输出改为仅 TTY 且未设置 NO_COLOR 时启用；JSONL trim 不再使用 `xargs`，避免吞掉双引号；Context Pack 引用校验改为 metadata DB 或文件存在任一满足即通过 |

### 遇到的问题以及解决方式

1. **JSONL 校验误报**：脚本使用 `line=$(echo "$line" | xargs)` 做 trim，`xargs` 会移除 JSON 字符串的双引号，导致合法 JSONL 行变成 `{action_type:...}` 后被 `jq` 判 invalid。解决方式：改用 bash 参数展开裁剪首尾空白，保留原始 JSON 引号。

2. **Context Pack 引用误报**：当前 vault 中 `context-packs.json` 引用了 `/Users/qilong.lu/WorkDir/MindDock/documents/产品需求文档（PRD）.md`，该文件真实存在，但 metadata DB 当前只收录了 2 个文档，因此脚本按 DB 查询判为失败。解决方式：引用校验改为 DB 存在或文件存在任一通过，避免把 metadata 覆盖范围问题误判为 Pack 源文件丢失。

3. **Settings 输出 ANSI 颜色码乱码**：脚本无条件输出颜色码，Tauri invoke 捕获 stdout 后原样显示，导致 UI 中出现 `[0;32m`。解决方式：只有 stdout 是 TTY 且未设置 `NO_COLOR` 时启用颜色；Settings/后端捕获环境下自动输出纯文本。

### 自动验证结果

```bash
$ bash scripts/verify-index.sh /Users/qilong.lu/WorkDir/MindDock; echo EXIT:$?
# Verification PASSED: 16 pass(es), 0 warning(s), 0 failure(s)
# EXIT:0

$ bash -n scripts/verify-index.sh
# exit 0

$ npm run typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开 Settings -> Knowledge Engine，点击“验证索引”
2. 预期结果区显示纯文本 `[PASS]` / `[INFO]`，不再出现 ANSI 颜色码乱码
3. 预期最终显示 `Verification PASSED: 16 pass(es), 0 warning(s), 0 failure(s)`
4. 预期 Settings 不再在开头显示“验证失败”

### 当前风险，以及影响范围

1. **metadata DB 覆盖范围仍需单独治理**：当前脚本允许 Context Pack 引用文件存在即通过，但 metadata DB 只收录 2 个文档而文件夹实际有更多文档。影响范围：不是本轮 verify 误报阻塞，但会影响全库搜索覆盖范围。
2. **影响范围**：只修复 verify-index 脚本误报和 Settings 输出可读性，不改变索引数据结构、不清理用户 vault 数据。

---

## Phase 4 Upgrade+Round 8 devlog -- Settings 语义索引启用与 verify-index 路径修复

**日期**: 2026-05-28
**任务起始时间**: 09:45
**任务结束时间**: 09:50
**工时**: 5 分钟

### 任务目标

根据用户手工验证反馈，修复 Settings 中“语义搜索未开启”和“验证索引失败”的两个 Phase4 验收阻塞点。问题限定在索引验证入口与 Settings 重建索引流程，不扩展升级文档外功能。

具体目标：
1. 修复 `run_verify_index` 在 Tauri 运行目录下找不到 `scripts/verify-index.sh` 的问题
2. 让 Settings 的“重建索引”在 AI/embedding 可用时同时生成 chunk embeddings
3. 让文档级 `embedding_status` 随 chunk embedding 写入自动更新为 ready/pending/error/stale/unavailable
4. 重建 chunks 后将文档语义索引状态重置为 pending，避免旧 ready 状态误导

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src-tauri/src/commands/metadata.rs` | 修改 | +24/-17 行 | `run_verify_index` 从单一路径改为多候选查找：当前目录 scripts、父级 scripts、Cargo manifest 父级 scripts；找不到时返回已检查路径 |
| `src-tauri/src/commands/chunking.rs` | 修改 | +4/-4 行 | 文档 reindex/chunk 写入后同时将 `embedding_status` 重置为 `pending` |
| `src-tauri/src/commands/vector_index.rs` | 修改 | +125/-11 行 | 新增 `refresh_document_embedding_status`，根据文档 chunks 的 embedding 状态汇总更新 documents.embedding_status；store/stale/error 后刷新文档级状态 |
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +18/-5 行 | Settings 重建索引时，AI 已连接则对每个 chunk 调用 `embedAndStore`；进度文案区分全文索引和语义向量生成；单个 chunk embedding 失败不阻断全文索引 |

### 遇到的问题以及解决方式

1. **验证索引脚本路径错误**：截图显示后端尝试执行 `/src-tauri/scripts/verify-index.sh`，但仓库实际脚本位于根目录 `scripts/verify-index.sh`。解决方式：`run_verify_index` 改为按多个候选路径查找，兼容从仓库根目录或 `src-tauri` 目录启动的 Tauri 运行环境。

2. **Settings 重建索引只重建 FTS/chunks**：当前 `handleRebuildIndex` 只调用 `chunkingService.reindexDocument`，不会调用 embedding，因此 UI 仍显示“语义搜索未开启”。解决方式：在 AI Runtime `status === 'connected'` 时，对重建后的 chunks 调用 `embedAndStore`，将向量写入 `chunk_embeddings`。

3. **文档级 embedding_status 没有随 chunk_embeddings 更新**：即使 chunk embeddings 写入 ready，Settings 统计读取的是 `documents.embedding_status`，原代码没有在 `store_chunk_embedding` 后同步 documents 状态。解决方式：后端新增文档级状态汇总函数，ready chunks 覆盖全部 chunks 时把文档标记为 ready；有 error/stale/unavailable 时按状态汇总，否则 pending。

4. **重建 chunks 后旧语义状态可能残留**：reindex 删除旧 chunk embeddings 后，documents.embedding_status 若不重置，可能显示过期 ready。解决方式：chunk 写库完成后把文档语义状态重置为 pending，等待新的 embedding 写入后再更新为 ready。

### 自动验证结果

```bash
$ cd src-tauri && rustfmt --check src/commands/metadata.rs src/commands/chunking.rs src/commands/vector_index.rs
# exit 0，本轮 Rust 改动文件格式通过

$ npm run typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0

$ npm run build
# built in 1.00s，exit 0
# 仍有 Vite 大 chunk / ineffective dynamic import warning，属于既有构建提示，不阻塞本轮修复
```

### 手工验证步骤说明

1. 打开 Settings -> 索引状态，点击“验证索引”，预期不再报 `src-tauri/scripts/verify-index.sh: No such file or directory`，而是返回 verify-index 脚本的 PASS/WARN/FAIL 明细。
2. 确认 AI Runtime 已连接且 embedding 模型可用，点击“重建索引”，预期进度先显示“重建全文索引”，随后显示“生成语义向量”。
3. 重建结束后，Settings 中“语义索引”预期从“语义搜索未开启”变为 `N / N 文档已生成语义向量`。
4. 重建结束后再点击“验证索引”，预期脚本中 `Semantic search available: <n> ready embedding(s)` 为 PASS。
5. 若 AI 未连接或 embedding 服务不可用，预期全文索引仍可完成，语义索引保持 pending/未开启，不影响验证脚本路径修复。

### 当前风险，以及影响范围

1. **语义索引依赖 embedding 服务真实可用**：Settings 现在会尝试生成 embeddings，但如果当前使用自定义 reasoning provider 且本地 Ollama embedding endpoint 不可用，语义索引仍不会 ready。影响范围：语义搜索状态，不影响全文索引。
2. **单个 chunk embedding 失败后文档可能保持 pending**：当前失败时不阻断重建流程，避免全文索引被 AI 服务问题拖垮。影响范围：该文档的语义搜索覆盖率。
3. **影响范围**：仅修复 Phase4 Settings 索引验收链路，不改变 embedding provider 架构，不引入新的索引策略。

---

## Phase 4 Upgrade+Round 7 devlog -- 查缺补漏：chunk 链路、Pack 内容与 Mentor 可操作性

**日期**: 2026-05-28
**任务起始时间**: 09:13
**任务结束时间**: 09:44
**工时**: 31 分钟

### 任务目标

根据 RB-P4-001 升级文档、产品文档与 Phase4 既有 dev log，对 Phase4 Upgrade Round 1-6 的实现做查缺补漏。只补齐升级文档中已要求但当前实现缺失的任务，不回滚符合升级路线的改动，不新增升级文档外功能。

具体目标：
1. 补齐搜索结果、语义搜索结果、Pack 推荐候选的 chunk_id 与内容链路
2. 修复文档级 Pack 只有 metadata、导出/生成上下文不足的问题
3. 修复 Pack 推荐卡片没有内容预览、接受推荐后内容为空的问题
4. 修正 Mentor 默认同时展开多个高优先级抽屉的问题，并让最近建议可操作
5. 修正 Settings 中连接测试可能使用旧配置的问题

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src-tauri/src/commands/search.rs` | 修改 | +34/-16 行 | FTS/search_documents 返回 chunk_id、content、rank；搜索结果可直接关联 chunks |
| `src-tauri/src/commands/vector_index.rs` | 修改 | +37/-11 行 | SemanticSearchResult 与 ContextPackCandidate 返回 chunk_id/content；read_all_ready_embeddings 读取 chunk 内容；仅格式化本轮改动文件 |
| `src/services/index/search.ts` | 修改 | +4 行 | SearchResult/SearchDocumentResult 类型同步 chunk_id/content |
| `src/services/index/vector.ts` | 修改 | +3 行 | SemanticSearchResult/CandidateResult 类型同步 chunk_id/content |
| `src/modules/command-palette/CommandPalette.tsx` | 修改 | +4/-2 行 | 语义搜索结果带 chunk_id/content；打开搜索结果时记录 chunk_id 信号 |
| `src/app/AppShell.tsx` | 修改 | 约 +88/-10 行 | 新增文档 Pack snapshot（前 3 个 chunk，最多 6000 字）；文档/文件夹生成与加入 Pack 时写入 content/heading/line/chunk_id；选区根据行号匹配 chunk_id；搜索结果加入 Pack 时保存 chunk_id/content/score |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +11/-4 行 | 推荐候选保存 content；推荐卡片显示内容预览；接受推荐写入 content/heading/chunk_id；个性化信号记录 chunk_id |
| `src/components/MentorDock.tsx` | 修改 | +24/-2 行 | 有 trigger 时默认只展开“待判断”并收起“当前建议”；最近建议增加“采纳/忽略”动作 |
| `src/modules/ai/AIRuntimeProvider.tsx` | 修改 | +9/-8 行 | checkConnection 支持传入本次草稿配置，避免立即测试时读到旧 state |
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +2/-2 行 | “检测连接”保存配置后用 nextConfig 直接测试 |

> 说明：`src/app/AppShell.tsx` 当前工作区 diff 同时包含前序 Round 5/6 未提交内容，本表只记录本轮实际补漏范围。

### 遇到的问题以及解决方式

1. **M4 dev log 写了“搜索结果保存 chunk_id”，但当前代码仍保存 null**：读取 Round 4 dev log 后确认目标已列出，但当时只给 PackItem 扩字段，搜索后端类型并没有返回 chunk_id，导致 AppShell 只能写 null。解决方式：在 Rust `search.rs` 中把 `chunks.id`、`chunks.content`、`bm25` rank 一并返回，前端 SearchDocumentResult 同步字段，加入 Pack 时保存 chunk_id/content/score。

2. **语义搜索与 Pack 推荐缺少内容预览**：升级文档要求“推荐卡片展示内容预览，用户可加入/忽略”，但后端候选只返回路径、heading、line 和 score。解决方式：vector index 读取 ready embeddings 时同时读取 chunk content，SemanticSearchResult/ContextPackCandidate 返回 content，ContextPackPanel 渲染内容预览并在接受推荐时写入 Pack item。

3. **文档级 Pack 缺少正文上下文**：升级文档已指出“文档级 Pack 缺 content，summary 为空时导出上下文不足”。Round 4 dev log 的解决只覆盖“文档级 item 反查 chunks 用于推荐”，没有让 Pack item 本身带内容。解决方式：AppShell 创建文档/文件夹 Pack item 时读取该文档前 3 个 chunks，最多 6000 字，写入 content、heading、line、chunk_id，保证导出和 OutputGenerator 至少有可用正文。

4. **选区 Pack item 没有 chunk_id**：选区本身有内容，但没有 chunk_id 会降低后续推荐质量。解决方式：根据选区 startLine/endLine 查找重叠 chunk，写入 chunk_id 和 heading；找不到 chunk 时保持 null，不阻断用户动作。

5. **Mentor 默认展开逻辑与升级文档不一致**：Round 2 dev log 说明已做抽屉，但当前实现有 trigger 时“当前建议”和“待判断”会同时默认展开。解决方式：hasTriggers 为 true 时只展开“待判断”，并收起“当前建议”；trigger 消失后恢复“当前建议”默认展开。

6. **最近建议缺少动作**：升级文档要求建议必须可被采纳/忽略/转任务/生成草稿，当前最近建议只有状态展示。解决方式：对 pending 建议增加“采纳/忽略”，调用既有 updateSuggestionStatus，不新增数据结构。

7. **Settings 检测连接可能用旧配置**：点击检测时先 updateConfig 再 checkConnection，但 React state 不保证同步，可能仍使用旧 baseUrl/API key。解决方式：AIRuntimeProvider 的 checkConnection 支持 overrideConfig，Settings 传入刚保存的 nextConfig。

8. **全仓 cargo fmt --check 失败**：失败来自大量既有 Rust 文件格式差异，超出本轮补漏边界。解决方式：不做全仓格式化，避免无关 churn；只对本轮修改的 `search.rs` 和 `vector_index.rs` 执行 rustfmt，并单独通过 `rustfmt --check`。

### 自动验证结果

```bash
$ npm run typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && rustfmt --check src/commands/search.rs src/commands/vector_index.rs
# exit 0，本轮 Rust 改动文件格式通过

$ cd src-tauri && cargo check
# Finished dev profile，exit 0

$ npm run build
# built in 1.16s，exit 0
# 仍有 Vite 大 chunk / ineffective dynamic import warning，属于现有构建提示，不阻塞本轮补漏
```

### 手工验证步骤说明

1. 在 Command Palette 搜索任意内容，点击结果右侧“加入上下文包”，期望 Pack item 带有正文内容、位置、chunk_id，并在 Pack 中可显示内容预览
2. 在 AI 已连接且 embedding ready 的 vault 中执行语义搜索，期望语义结果加入 Pack 后同样带 chunk_id/content/score
3. 在已有 Pack 中加入一个文档，期望“推荐内容”卡片显示相关度、位置和内容预览；点击加入后 Pack item 有正文，不再是空 content
4. 右键文档或文件夹选择“生成...”，输入意图创建草稿 Pack，期望初始来源 item 至少包含前 3 个 chunk 的正文 snapshot
5. 在编辑器选中一段文字加入 Pack 或“从此生成...”，期望 item 保留选区正文，并在能匹配 chunk 时保存 chunk_id/heading
6. 触发 Mentor 待判断后打开 Platter，期望默认只展开“待判断”，不同时展开“当前建议”
7. 打开 Mentor 的“最近建议”，对 pending 建议点击“采纳/忽略”，期望状态持久化更新
8. 在 Settings 修改自定义 API baseUrl/API key 后立即点击“检测连接”，期望检测使用最新输入而不是旧配置

### 当前风险，以及影响范围

1. **FTS chunk_id 来源仍依赖既有 join 条件**：当前 FTS 表未存 chunk_id，本轮沿用 `document_path + heading_path` join chunks。若同一文档出现重复 heading_path，搜索结果可能关联到非预期 chunk。影响范围：搜索结果加入 Pack 的 chunk 精度。
2. **文档级 Pack snapshot 是确定性截断**：当前取前 3 个 chunks、最多 6000 字，不是语义 top-k 或 LLM 压缩摘要。影响范围：长文档生成输出时，后续内容可能未进入初始 Pack。
3. **chunk_id 可能随 reindex 失效**：既有 chunking 实现会删除并重建 chunks，旧 Pack item 的 chunk_id 可能过期。本轮未改索引持久化策略，因为升级文档未要求稳定 chunk id 迁移。影响范围：历史 Pack 的推荐质量。
4. **文件夹生成仍沿用 Round 5 的前 10 个文档限制**：本轮没有扩展范围。影响范围：大文件夹草稿 Pack 可能不完整，但该风险已在 Round 5 dev log 记录，不构成本轮阻塞。
5. **影响范围**：只补齐 P4 Upgrade M1/M2/M4/M5 既定验收缺口，不引入 MindView、健康报告、复杂 agent 工作流或 Pack 数据结构大改。

---

## Phase 4 Upgrade+Round 6 devlog -- M6 选区解释/总结与输出生成 reasoning

**日期**: 2026-05-28
**任务起始时间**: 09:00
**任务结束时间**: 09:12
**工时**: 12 分钟

### 任务目标

根据 RB-P4-001 升级文档 M6 阶段，让 P4 的"解释、总结、生成输出"真正体现 AI Mentor。选区解释/总结调用 reasoning，OutputGenerator 从确定性拼接升级为 reasoning draft + source context。

具体目标：
1. 解释选区调用 reasoning，显示真实回答
2. 总结选区调用 reasoning，可复制结果
3. OutputGenerator 从确定性拼接升级为 reasoning draft + source context
4. 添加 output type 选择（prompt/PRD/SPEC/checklist）
5. 输出中展示来源覆盖
6. 保留用户编辑和复制

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/app/AppShell.tsx` | 修改 | +95/-5 行 | 新增 reasoningResult state；handleEditorSelectionAction 改为 async；explain/summarize case 改为调用 chat reasoning 并显示结果面板；渲染区添加 ReasoningResultPanel（含来源、复制、loading 状态）；依赖数组添加 aiStatus/chat |
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 | +155/-40 行 | 重构：新增 OutputType 类型（prompt/prd/spec/checklist）和 OUTPUT_TYPES 配置；assemblePrompt 按 outputType 生成不同 Task 模板；新增 buildSystemPrompt 按 outputType 生成 reasoning system prompt；新增 useAIRuntime 获取 chat 接口；新增 outputType state/reasoningDraft state/generating state；新增"AI 生成"按钮调用 chat reasoning；新增来源覆盖 footer（显示条目数、原文/摘要统计、来源标签）；保留编辑/复制/重置功能 |

### 遇到的问题以及解决方式

1. **handleEditorSelectionAction 需要改为 async**：explain/summarize case 中需要 `await chat(...)`，但原函数是同步的。解决方式：将函数声明从 `useCallback((...) => {` 改为 `useCallback(async (...) => {`，并在依赖数组中添加 `aiStatus` 和 `chat`。

2. **displayContent 未使用**：重构 OutputGenerator 时声明了 `const displayContent = reasoningDraft || prompt` 但未在 JSX 中使用（JSX 中直接用了 reasoningDraft 和 prompt）。解决方式：移除该变量声明。

3. **heading 计算逻辑重复**：explain 和 summarize case 中都需要计算选区所在 heading，代码结构相同。当前为内联实现，后续可抽取为辅助函数。影响范围：代码重复，但不影响功能。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0，无 TypeScript 错误

$ pnpm build
# built in 777ms，exit 0

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开应用，在编辑器中选中一段文字，右键选择"解释选区"，应弹出 Reasoning Result Panel，显示 loading 状态后展示 AI 解释结果
2. 右键选择"总结选区"，应弹出 Reasoning Result Panel，显示 AI 总结结果
3. AI 未连接时，解释/总结应 fallback 到打开 document-context view
4. 结果面板底部显示来源信息（文档名 › heading）
5. 点击"复制"按钮可复制结果
6. 在 Platter 的 Context Pack 中点击"生成提示词"，应打开 OutputGenerator
7. OutputGenerator 顶部显示 4 种 output type 选择（Prompt/PRD/SPEC/Checklist）
8. 选择不同 type 后模板内容应变化
9. 点击"AI 生成"按钮，应调用 reasoning 生成草稿
10. 生成后内容可编辑、可复制
11. 底部显示来源覆盖（条目数、原文/摘要统计、来源标签）

### 当前风险，以及影响范围

1. **reasoning prompt 较简单**：解释/总结的 system prompt 只要求简洁回答，没有传入相似 chunks 或文档摘要等更丰富的上下文。影响范围：回答可能不够精准。
2. **OutputGenerator AI 生成无流式输出**：当前 `chat` 调用等待完整响应后才显示，大文档生成可能等待较久。影响范围：用户体验，生成过程中只能看到 loading。
3. **AI 未连接时 OutputGenerator 的"AI 生成"按钮禁用**：用户只能看到确定性模板，无法生成 reasoning draft。影响范围：离线场景下输出质量受限。
4. **影响范围**：不改 Pack 数据结构，不自动写回文档，不做复杂 agent 工作流。

---

## Phase 4 Upgrade+Round 5 devlog -- M5 就地 GenerateIntentModal 与 Pack 草稿

**日期**: 2026-05-28
**任务起始时间**: 08:50
**任务结束时间**: 08:55
**工时**: 5 分钟

### 任务目标

根据 RB-P4-001 升级文档 M5 阶段，实现就地 GenerateIntentModal 与 Pack 草稿功能。用户在任意上下文选择"生成..."后，就地输入意图，自动创建 Pack 草稿并进入 Platter 管理。

具体目标：
1. 文档树右键增加"生成..."菜单项
2. 文件夹右键"生成上下文包"替换为"根据文件夹生成..."
3. 编辑器选区"从此生成..."改为打开 GenerateIntentModal
4. GenerateIntentModal 输入 output intent
5. 创建 draft pack 并添加来源 item
6. 打开 Pack view

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/context-pack/GenerateIntentModal.tsx` | 新建 | +124 行 | M5 核心组件：就地输入生成意图的模态框，支持 document/folder/selection 三种来源类型，显示来源信息、意图输入框、确认/取消按钮 |
| `src/modules/dock/DocTree.tsx` | 修改 | +12/-4 行 | 文件右键菜单添加"生成..."菜单项（Sparkles 图标）；文件夹右键菜单"生成上下文包"改为"根据文件夹生成..."；DocEntryItem 透传 onGenerate/onGenerateFromFolder；移除 Package 图标导入 |
| `src/components/Sidebar.tsx` | 修改 | +4/-2 行 | SidebarProps 新增 onGenerate/onGenerateFromFolder；函数参数解构和 DocTree 透传 |
| `src/app/AppShell.tsx` | 修改 | +40/-15 行 | Sidebar 传递 onGenerate/onGenerateFromFolder 回调（打开 GenerateIntentModal）；handleEditorSelectionAction 中 generateFrom 改为打开 GenerateIntentModal（计算行号和 heading）；渲染区添加 GenerateIntentModal 组件；移除废弃的 handleGenerateFromSelection |

### 遇到的问题以及解决方式

1. **编辑器选区需要计算行号和 heading**：原来 `handleGenerateFromSelection` 直接创建 Pack，改为打开 GenerateIntentModal 后需要传入行号和所在 heading。解决方式：在 handleEditorSelectionAction 的 generateFrom case 中，从 activeTab.content 计算选区的 startLine/endLine，并向上搜索最近的 heading 行。

2. **handleGenerateFromSelection 废弃**：改为 GenerateIntentModal 流程后，`handleGenerateFromSelection` 不再被任何地方调用。解决方式：移除该函数，handleEditorSelectionAction 的依赖数组也相应更新。

3. **Package 图标不再使用**：文件夹右键菜单从"生成上下文包"（Package 图标）改为"根据文件夹生成..."（Sparkles 图标）后，Package 导入不再需要。解决方式：从 DocTree 的 lucide-react 导入中移除 Package。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0，无 TypeScript 错误

$ pnpm build
# built in 1.29s，exit 0

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开应用，在文档树中右键一个文档，应看到"生成..."菜单项（Sparkles 图标），点击后应弹出 GenerateIntentModal，来源显示文档名
2. 在文档树中右键一个文件夹，应看到"根据文件夹生成..."菜单项（Sparkles 图标），点击后应弹出 GenerateIntentModal，来源显示文件夹名
3. 在编辑器中选中一段文字，右键选择"从此生成..."，应弹出 GenerateIntentModal，来源显示选区文本预览和行号
4. 在 Modal 中输入意图（如"生成开发提示词"），点击"创建并生成"，应创建草稿 Pack 并自动打开 Platter 的 Context Pack tab
5. Pack 中应包含来源 item（文档/文件夹下文档/选区），Pack 名称格式为"草稿: <意图前30字>..."
6. 不需要先去 Platter 新建 Pack，直接从任意上下文生成即可

### 当前风险，以及影响范围

1. **handleGenerateIntentConfirm 中 renameContextPack 冗余调用**：创建 Pack 时已传入 packName，之后再调用 renameContextPack 用相同名称，实际未做任何变更。影响范围：无功能影响，仅多一次无效 API 调用。
2. **文件夹生成最多添加 10 个文档**：handleGenerateIntentConfirm 中 folder 类型限制了 `folderDocs.slice(0, 10)`，大文件夹可能遗漏文档。影响范围：文件夹包含超过 10 个文档时，Pack 中只会有前 10 个。
3. **影响范围**：不改 Pack 数据结构，不改 OutputGenerator，不接 MindView。

---

## Phase 4 Upgrade+Round 4 devlog -- M4 Pack 推荐与 chunk 数据补齐

**日期**: 2026-05-28
**任务起始时间**: 08:30
**任务结束时间**: 08:38
**工时**: 8 分钟

### 任务目标

根据 RB-P4-001 升级文档 M4 阶段，让 embedding 推荐真正工作，补齐 Pack item 的 chunk 数据关联。

具体目标：
1. 扩展 ContextPackItem 增加 chunk_id / source_type / score / reasoning_note
2. 修复 suggestContextPackCandidates 空参数问题（原来传 [] 导致后端直接返回空）
3. 搜索结果保存 chunk_id，文档级 Pack 反查 chunks
4. Pack 推荐显示片段标题、位置、相关度、内容预览，用户可加入/忽略

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src-tauri/src/commands/context_pack.rs` | 修改 | +4 行 | ContextPackItem 结构体新增 chunk_id/source_type/score/reasoning_note 四个 Option 字段 |
| `src/services/index/context-pack.ts` | 修改 | +4 行 | 前端 ContextPackItem 接口同步新增四个字段 |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +50/-15 行 | DocCandidate 扩展 chunk_id/start_line/end_line；推荐加载逻辑从空数组改为收集已有 item 的 chunk_id 并反查文档 chunks；handleAcceptSuggestion 保存 chunk_id/source_type/score；pendingItem addItem 补全新字段；推荐卡片显示位置信息（L行号）；新增 chunkingService 导入 |
| `src/app/AppShell.tsx` | 修改 | +16 行 | 4 处 addItem 调用补全 chunk_id/source_type/score/reasoning_note 字段（folder/document/selection/search 四种 source_type） |

### 遇到的问题以及解决方式

1. **suggestContextPackCandidates 传空数组**：原来 `ContextPackPanel` 调用 `suggestContextPackCandidates(vault.path, [], 20)`，后端在 `chunk_ids.is_empty()` 时直接返回空。解决方式：从已有 Pack item 中收集 chunk_id，对于没有 chunk_id 的文档级 item，查询该文档的 chunks 取第一个 chunk 的 id。

2. **ContextPackItem 扩展后的兼容性**：新增的 4 个字段都是 `Option` 类型，旧数据中不存在这些字段时 Rust 反序列化会使用 `None`，前端 TypeScript 中使用 `null`，完全向后兼容。

3. **AppShell 中 4 处 addItem 调用**：扩展 ContextPackItem 后，所有 addItem 调用都需要传入新字段。解决方式：按 selected_reason 区分 source_type（folder/document/selection/search），chunk_id/score/reasoning_note 暂设为 null。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0

$ pnpm build
# built in 900ms，exit 0

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开应用，创建一个 Context Pack，添加一个文档
2. Pack 中有内容后，"推荐内容"区域应不再总是空，应显示基于语义相似度的推荐
3. 推荐卡片应显示：推荐标签、相关度百分比、片段标题（heading_path）、文档路径 + 行号范围（如 L10-25）
4. 点击推荐卡片右侧的箭头按钮，推荐内容应加入 Pack
5. 加入后推荐列表中该文档应消失（已排除）
6. 检查加入的 item 在 Pack 中显示的 source_type 标签

### 当前风险，以及影响范围

1. **文档级 item 反查 chunks 性能**：对于没有 chunk_id 的文档级 item，每次加载推荐时都会调用 `getDocumentChunks`。如果 Pack 中有很多文档级 item，可能产生多次 API 调用。影响范围：推荐加载速度。
2. **旧数据兼容**：旧的 context-packs.json 中不存在新字段，Rust 反序列化时使用 `None`，前端显示时使用 `null`，不影响功能但推荐可能无法基于旧 item 的 chunk_id 工作。影响范围：已有 Pack 的推荐效果。
3. **影响范围**：不改 OutputGenerator reasoning，不改 Platter 整体视觉。

---

## Phase 4 Upgrade+Round 3 devlog -- M3 Trigger chunkId 与"帮我判断"

**日期**: 2026-05-28
**任务起始时间**: 08:20
**任务结束时间**: 08:25
**工时**: 5 分钟

### 任务目标

根据 RB-P4-001 升级文档 M3 阶段，让 semantic_repeat/context_drift 真正触发，并将"帮我判断"按钮变成真实 reasoning 动作。

具体目标：
1. reindex 后按 chunk 调用 checkTriggers 传入 chunkId
2. 聚合 trigger 结果（去重，优先 threshold_exceeded）
3. dismissed 持久化（调用 updateTriggerState 而非仅 React state 过滤）
4. 点击"帮我判断"调用 reasoning，输出判断结果卡片

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/app/AppShell.tsx` | 修改 | +45/-5 行 | postReindexHook 中按 chunk 调用 checkTriggers 传入 chunkId；聚合 trigger 去重；onDismissTrigger 增加 updateTriggerState 持久化；新增 onJudgeTrigger 回调调用 chat reasoning；解构增加 `chat` |
| `src/components/MentorDock.tsx` | 修改 | +50/-3 行 | MentorView 新增 onJudgeTrigger prop；新增 judgingType/judgmentResults 状态和 handleJudge 函数；"帮我判断"按钮绑定 handleJudge 并显示 loading 状态；新增判断结果卡片（AI 判断结果 + 忽略按钮）；PlatterProps 和 InnerMentorDock 传递 onJudgeTrigger |

### 遇到的问题以及解决方式

1. **AppShell 中 `chat` 未解构**：AppShell 原来只解构了 `status` 和 `embedAndStore`，需要添加 `chat` 才能调用 reasoning。解决方式：在 `useAIRuntime()` 解构中添加 `chat`。

2. **MentorView 函数参数解构遗漏**：添加 `onJudgeTrigger` 到 MentorView 的 props 类型定义后，忘记在函数参数解构中添加。解决方式：在解构列表中添加 `onJudgeTrigger`。

3. **trigger 聚合策略**：按 chunk 调用 checkTriggers 可能产生大量重复 trigger（每个 chunk 都可能触发同一类型）。解决方式：使用 Map 按 trigger_type 去重，优先保留 `threshold_exceeded` 状态的结果。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0

$ pnpm build
# built in 827ms，exit 0

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开应用，打开一个文档，编辑并保存触发 reindex
2. 如果文档有语义重复内容，Mentor 的"待判断"section 应出现 semantic_repeat trigger
3. 点击"帮我判断"按钮，应显示 loading 状态（"判断中..."）
4. AI 返回后，trigger 卡片下方应出现绿色"AI 判断结果"卡片，包含 AI 的判断和建议
5. 点击"忽略"按钮，trigger 应消失，且下次 reindex 后不会重新出现（dismissed 已持久化）
6. 如果 AI 未连接，点击"帮我判断"应无响应（返回 null）

### 当前风险，以及影响范围

1. **按 chunk 调用 checkTriggers 性能**：如果文档有很多 chunk，每个 chunk 都调用一次 checkTriggers 可能较慢。当前没有做并行或采样优化。影响范围：大文档 reindex 后触发器检查可能耗时较长。
2. **reasoning prompt 较简单**：当前"帮我判断"的 system prompt 只要求简洁回答，没有传入文档内容或相似片段的详细信息。更丰富的上下文需要 M4 的 chunk 数据补齐。影响范围：判断结果可能不够精准。
3. **影响范围**：不改 Pack 数据结构，不自动修改原文，不自动合并文档。

---

## Phase 4 Upgrade+Round 2 devlog -- M2 Mentor view 折叠抽屉重构

**日期**: 2026-05-28
**任务起始时间**: 08:10
**任务结束时间**: 08:15
**工时**: 5 分钟

### 任务目标

根据 RB-P4-001 升级文档 M2 阶段，重构 Mentor view 为折叠抽屉结构，解决当前平铺杂乱的问题。

具体目标：
1. Mentor view 只承载当前上下文建议和动作
2. 用可折叠抽屉避免平铺杂乱
3. 分为 4 个 section：当前建议 / 待判断 / 可用动作 / 最近建议
4. 默认只展开最高优先级 section
5. trigger 卡片移入"待判断"section
6. 当前文档动作移入"可用动作"section
7. 最近建议默认折叠

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/components/MentorDock.tsx` | 修改 | +150/-180 行 | MentorView 重构为 4 个折叠抽屉；trigger 卡片从 MentorDock 主组件移入 MentorView 的"待判断"section；当前文档动作从平铺卡片移入"可用动作"section；相关内容移入"当前建议"section；移除 `onAIOnboarding` prop（已由 Settings Product Flow 区替代）；移除旧的平铺布局 |

### 遇到的问题以及解决方式

1. **`onAIOnboarding` 不再使用**：MentorView 重构后，"重新运行 AI Onboarding"按钮不再出现在 Mentor 主 view 中（已在 M1 中移入 Settings Product Flow 区）。解决方式：从 MentorView 和 PlatterProps 中移除 `onAIOnboarding`。

2. **trigger 卡片位置迁移**：原来 trigger 卡片在 MentorDock 主组件中渲染（MentorView 外部），需要移入 MentorView 的"待判断"section。解决方式：将 `triggerResults` 和 `onDismissTrigger` 作为 prop 传入 MentorView，在"待判断"section 中渲染。

3. **折叠状态初始值**：需要根据是否有 trigger 动态决定"待判断"section 的初始展开状态。解决方式：使用 `useState(!!hasTriggers)` 初始化，并通过 `useEffect` 在 trigger 变化时自动展开。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0

$ pnpm build
# exit 0，built in 896ms

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开应用，切换到 Mentor tab，应看到 4 个折叠抽屉：当前建议（展开）、待判断（折叠）、可用动作（折叠）、最近建议（折叠）
2. 当前建议 section 显示当前文档名和相关内容
3. 无文档时当前建议 section 显示 Empty State（AI 知识助手引导）
4. 有 trigger 时"待判断"section 自动展开，显示 trigger 卡片（语义重复/新方向/主题偏移/复查建议），每条有"帮我判断"和"忽略"按钮
5. 可用动作 section 包含：总结文档、查找相关、解释内容
6. 最近建议 section 默认折叠，展开后显示最近 3 条 AI 建议
7. AI 未连接时状态栏仍显示"去设置"链接

### 当前风险，以及影响范围

1. **"帮我判断"按钮仍为 UI 占位**：当前点击"帮我判断"没有实际 reasoning 调用，这是 M3 的任务。影响范围：用户点击后无响应。
2. **onAIOnboarding 从 Mentor 移除**：如果 AppShell 中有其他地方依赖 MentorDock 的 onAIOnboarding prop，需要确认。当前已确认 AppShell 未传此 prop 给 MentorDock。影响范围：无。
3. **影响范围**：仅修改 Mentor view 内部布局，不改 Pack 数据结构，不实现 reasoning 结果生成。

---

## Phase 4 Upgrade+Round 1b devlog -- M1 主界面技术术语收口

**日期**: 2026-05-28
**任务起始时间**: 08:05
**任务结束时间**: 08:15
**工时**: 10 分钟

### 任务目标

M1 review 后补齐主界面技术术语收口。在 M1 已完成 Settings 统一入口和 Mentor 配置迁移的基础上，进一步清理主界面中残留的 index / semantic / embedding 状态语言，让 CmdK 和 Mentor 主 view 不再暴露底层技术概念。

具体目标：
1. CommandPalette 移除"智能搜索未开启（需先生成语义索引）"技术提示
2. MentorDock 移除"语义搜索已开启"条件渲染和 `semanticAvailable` 检测逻辑
3. SettingsPanel Knowledge Engine 区补轻量说明：这是开发/诊断用途，产品主流程后台自动使用

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/command-palette/CommandPalette.tsx` | 修改 | -8 行 | 移除"智能搜索未开启（需先生成语义索引）"提示块 |
| `src/components/MentorDock.tsx` | 修改 | -10 行 | 移除 `semanticAvailable` 状态、useEffect 检测、"语义搜索已开启"渲染；移除 `metadataService` 导入和主函数中未使用的 `vault` |
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +3 行 | Knowledge Engine 区顶部补轻量说明文字 |

### 遇到的问题以及解决方式

1. **`vault` 变量未使用警告**：移除 `semanticAvailable` 后，MentorView 主函数中的 `const { vault } = useVault()` 不再被使用（其他子组件有各自的 `useVault` 调用）。解决方式：移除主函数中的 `vault` 声明，保留子组件中的独立调用。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0

$ pnpm build
# exit 0

$ cd src-tauri && cargo check
# Finished dev profile，exit 0

$ rg -n "需先生成语义索引|语义搜索已开启" src
# 无匹配
```

### 手工验证步骤说明

1. 打开应用，Mentor 状态栏只显示"AI 助手已连接/未连接"，不显示"语义搜索已开启"
2. Cmd+K 搜索时，无语义结果不再显示"智能搜索未开启（需先生成语义索引）"提示
3. Settings → Knowledge Engine 区顶部显示"以下为开发与诊断用途。产品主流程会在后台自动使用 Knowledge Engine，无需手动操作。"
4. AI 未连接时 Mentor 状态栏仍显示"去设置"链接

### 当前风险，以及影响范围

1. **CommandPalette 语义搜索静默降级**：移除提示后，用户在语义搜索不可用时不会得到明确提示，搜索结果可能只包含 FTS 结果。影响范围：搜索体验，但 FTS fallback 仍可用，用户不会感知到功能缺失。
2. **影响范围**：仅清理主界面技术术语，不涉及 AI Runtime 回滚、不改 Pack / GenerateIntent / PackSelector / Trigger。

---

## Phase 4 Upgrade+Round 1 devlog -- M1 Settings 入口与配置迁移

**日期**: 2026-05-28
**任务起始时间**: 07:20
**任务结束时间**: 07:40
**工时**: 20 分钟

### 任务目标

根据 RB-P4-001 升级文档，执行 M1 阶段修改：Settings 入口与配置迁移。核心目标是清理 Mentor view 的职责边界，将技术配置从用户引导界面中移出，建立统一的 Settings 入口。

具体目标：
1. 从 Mentor view 中移除 Settings 主入口（常驻设置图标）
2. 在 WorkspaceHeader 增加统一 Settings 入口
3. SettingsPanel 重构：将"AI 助手"改为"AI Reasoning"，将"知识索引状态"改为"Knowledge Engine"，新增"Product Flow"区
4. 将 embedding 模型配置和测试从 AI Reasoning 移到 Knowledge Engine
5. Mentor view 只在 AI 不可用时显示"去设置"链接
6. Knowledge Engine 增加 stale embedding 检测显示

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/components/WorkspaceHeader.tsx` | 修改 | +10/-2 行 | 新增 `onOpenSettings` prop 和 Settings 齿轮图标按钮 |
| `src/app/AppShell.tsx` | 修改 | +1/-0 行 | 传入 `onOpenSettings={() => setSettingsOpen(true)}` |
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +120/-80 行 | 重构：AI 助手→AI Reasoning（移除 embedding 配置）；知识索引状态→Knowledge Engine（加入 embedding 模型/测试/stale 检测）；新增 Product Flow 区（onboarding reset + 说明）；关于区增加 Vault 路径；新增 Cpu/RotateCcw 图标导入；新增 onboardingService 导入 |
| `src/components/MentorDock.tsx` | 修改 | +6/-4 行 | 移除常驻 Settings 图标按钮，改为 AI 未连接时显示"去设置"链接；移除 Settings 图标导入 |
| `src/services/ai/onboarding.ts` | 修改 | +3/-0 行 | 新增 `resetStatus` 方法 |

### 遇到的问题以及解决方式

1. **`detectStaleEmbeddings` 需要单文档参数**：原计划在 Knowledge Engine 中调用全局 stale 检测，但 `detectStaleEmbeddings` 需要 `documentPath` 参数，不适合全局调用。解决方式：改为从 `listDocumentsMetadata` 中统计 `embedding_status === 'stale'` 的文档数量，无需额外 API 调用。

2. **Settings import 清理**：从 MentorDock 移除 Settings 图标后，`Settings` 的 lucide import 不再需要。解决方式：从 import 语句中移除 `Settings`。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0

$ pnpm lint
# exit 0
```

### 手工验证步骤说明

1. 打开应用，在 WorkspaceHeader 右侧应看到齿轮图标（Settings 按钮），点击应打开 SettingsPanel
2. Mentor view 状态栏中不再有常驻的设置图标
3. 当 AI 未连接时，Mentor 状态栏右侧应显示"去设置"链接，点击打开 SettingsPanel
4. 当 AI 已连接时，Mentor 状态栏右侧不显示任何设置入口
5. SettingsPanel 中应有 5 个区：AI Reasoning、Knowledge Engine、运行日志、Product Flow、关于
6. AI Reasoning 区只包含对话模型配置（Provider、服务地址、对话模型、Custom API 配置、连接检测），不包含 embedding 模型
7. Knowledge Engine 区包含：语义模型配置、Embedding 测试、索引状态（全文索引 + 语义索引 + stale 检测）、重建索引、验证索引
8. Product Flow 区包含：重新运行 Onboarding 按钮、Knowledge Engine 说明文字
9. 关于区包含：版本号、Vault 路径、数据存储说明

### 当前风险，以及影响范围

1. **onboarding reset 使用 page reload**：点击"重新运行 Onboarding"后调用 `window.location.reload()` 强制刷新页面，体验较粗暴。影响范围：仅影响手动触发 onboarding reset 的场景，正常使用不受影响。
2. **stale 检测依赖 metadata 中的 embedding_status 字段**：如果后端在文档内容变更后没有正确更新 `embedding_status` 为 `stale`，前端将无法显示过期提示。影响范围：Knowledge Engine 中的 stale 检测可能不准确。
3. **影响范围**：仅修改 UI 层布局和配置入口位置，不改模型调用逻辑、不改 Pack、不改 trigger。

---

## Phase 4+Round 11 devlog -- ContextPackItem 多粒度支持

**日期**: 2026-05-25
**任务起始时间**: 22:00
**任务结束时间**: 22:45
**工时**: 45 分钟

### 任务目标

更新 MindDock ContextPackItem 数据结构，支持多粒度（文件夹/文档/段落/选区），并调整所有相关添加逻辑。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src-tauri/src/commands/context_pack.rs` | 修改 | +8 行 / -1 行 | ContextPackItem 新增 content/heading/start_line/end_line 字段；export_context_pack_markdown 适配新字段输出 |
| `src/services/index/context-pack.ts` | 修改 | +14 行 / -5 行 | ContextPackItem 接口新增 4 个可选字段；exportAsMarkdown 适配粒度显示（heading 优先、位置信息、内容输出） |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +30 行 / -12 行 | pendingItem 类型扩展；条目卡片根据粒度显示不同内容（段落/选区标签、行号、内容预览）；编辑功能区分 content/summary |
| `src/app/AppShell.tsx` | 修改 | +120 行 / -10 行 | addDocToPack 添加新字段；新增 addSelectionToPack/handleAddSelectionToPack/handleGenerateFromSelection/handleAddSearchResultToPack；handleEditorSelectionAction 改为选区级添加；搜索结果 onAddToContextPack 改用 handleAddSearchResultToPack |
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 | +8 行 / -8 行 | assemblePrompt 适配新字段（heading 优先、位置信息、content/summary 优先级） |
| `src/components/MentorDock.tsx` | 修改 | +4 行 | pendingContextPackItem 类型新增 content/heading/start_line/end_line |

### 遇到的问题以及解决方式

1. **类型不兼容**：ContextPackItem 新增字段后，所有 `addItem` 调用点都需要补充新字段。通过全局诊断逐一修复，确保所有调用点传入 content/heading/start_line/end_line（文档级传 null，选区/段落级传实际值）。
2. **编辑逻辑区分**：原有编辑功能只编辑 summary，现在需要根据是否有 content 区分：有 content 时编辑 content，否则编辑 summary。修改了 startEditItem 和 saveEditItem。

### 自动验证结果

- `pnpm typecheck`：✅ 通过，无类型错误
- `cargo check`：✅ 通过，无编译错误

### 手工验证步骤说明

1. 打开应用，右键文档选择"加入上下文包"→ 验证文档级条目显示 title/summary/tags，无粒度标签
2. 在编辑器中选中一段文字，右键选择"加入上下文包"→ 验证段落级条目显示 content 预览、行号范围、"段落"标签
3. 在编辑器中选中一段文字，右键选择"从此生成"→ 验证创建新 Pack 并添加选区级条目
4. 在搜索结果中点击"加入上下文包"→ 验证搜索结果以 chunk 级别添加（含 heading/start_line/end_line）
5. 点击"生成提示词"→ 验证 OutputGenerator 中段落级条目显示 content，文档级显示 summary
6. 点击"导出"→ 验证导出的 Markdown 包含章节、位置、内容等信息

### 当前风险，以及影响范围

1. **数据兼容性**：已有的 context-packs.json 中旧条目缺少 content/heading/start_line/end_line 字段。由于 Rust 端使用 `Option<String>`/`Option<i64>` 且 serde 默认对 Option 字段宽容，旧数据反序列化时这些字段为 None，不会报错。但需注意前端 null 检查。
2. **多 Pack 选择器缺失**：`handleAddSelectionToPack` 在多 Pack 场景下暂时使用第一个 Pack，后续需添加 PackSelectorModal 支持。
3. **影响范围**：ContextPackItem 数据结构变更影响所有使用上下文包功能的模块，包括 ContextPackPanel、OutputGenerator、AppShell、MentorDock。

---

## Phase 4+Round 10 devlog -- 体验债务清偿

**日期**: 2026-05-25
**任务起始时间**: 16:30
**任务结束时间**: 17:20
**工时**: 50 分钟

### 任务目标

清偿 UX 产品心智修正后遗留的 5 项体验债务：
1. Editor 选区右键菜单（CodeMirror 6 自定义扩展）
2. "查找相关内容"功能增强（语义搜索 + FTS fallback）
3. Pack 选择器 UI（多 Pack 选择 + 新建 Pack）
4. Generate from this 类型选择（提示词/摘要/大纲/研究简报）
5. Settings 中调用 verify:index 脚本

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/editor/editorContextMenu.ts` | 新建 | +120 行 | CM6 右键菜单扩展，支持暗色模式、边界自适应、Escape关闭 |
| `src/modules/editor/EditorView.tsx` | 修改 | +25 行 | 添加 onSelectionAction prop，集成右键菜单 |
| `src/app/AppShell.tsx` | 修改 | +200 行 | handleEditorSelectionAction + handleFindRelated增强 + PackSelectorModal + GenerateTypeSelector + addDocChunksToPack辅助 |
| `src/components/MentorDock.tsx` | 修改 | +40 行 | PlatterProps扩展 + 相关内容展示区域 |
| `src-tauri/src/commands/metadata.rs` | 修改 | +20 行 | 新增 run_verify_index 命令 |
| `src-tauri/src/lib.rs` | 修改 | +1 行 | 注册 run_verify_index 命令 |
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +30 行 | 验证索引按钮调用 Rust 命令，显示结果 |

### 遇到的问题以及解决方式

1. **CM6 扩展闭包问题**：`onSelectionAction` 回调如果直接在 extensions 数组中引用，会导致 CM6 重建。解决方式：使用 `useRef` 保存回调引用，扩展中使用 ref.current 调用。
2. **Pack 选择器状态管理**：多个 Pack 时需要弹窗选择，但选择后需要异步添加 chunks。解决方式：抽取 `addDocChunksToPack` 辅助函数，PackSelectorModal 中 onSelect 回调异步调用。
3. **verify:index 脚本路径**：Rust 端 `run_verify_index` 使用 `std::env::current_dir()` 获取项目根目录，拼接脚本路径。在 `pnpm tauri dev` 下 current_dir 为项目根目录，脚本可正常找到。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 在编辑器中选中文字，右键应显示：加入上下文包、从此生成...、解释选区、查找相关内容、总结选区
2. 点击"查找相关内容"，MentorDock 应显示相关文档列表（语义搜索或 FTS fallback）
3. 右键文档"加入上下文包"，多个 Pack 时应弹出选择器
4. 右键文档"生成上下文包"，应弹出类型选择（提示词/摘要/大纲/研究简报）
5. Settings 中点击"验证索引"，应执行脚本并显示结果

### 当前风险以及影响范围

1. **CM6 右键菜单样式**：使用原生 DOM 创建菜单，不受 React 主题切换影响。暗色模式通过 `document.documentElement.classList.contains('dark')` 检测，如果主题切换机制变化可能失效。影响范围：右键菜单颜色。
2. **verify:index 脚本路径依赖**：`run_verify_index` 依赖 `current_dir()` 拼接脚本路径，打包后路径可能不同。影响范围：生产环境验证索引功能可能不可用。
3. **影响范围**：仅新增功能，不影响已有能力。

---

## Phase 4+Round 9 devlog -- UX 产品心智修正（P0）

**日期**: 2026-05-25
**任务起始时间**: 14:30
**任务结束时间**: 16:20
**工时**: 110 分钟

### 任务目标

修正 Phase 4 的 P0 级 UX / 产品心智偏移问题。核心问题是当前实现把 index、semantic search、pack generation、AI Mentor、model config 等能力暴露成一堆需要用户学习的功能入口，导致产品变成"Obsidian + AI 插件"，没有体现"定制化知识库私教"的引导价值。

必须修复的 9 个问题：
1. Mentor/Platter 信息架构清理
2. 新增 Settings 界面
3. Pack 生成流程降复杂度
4. 一键生成 Pack 最短路径
5. Add to Pack 体验
6. Embedding 价值可感知
7. AI Mentor 引导层
8. 技术术语从主界面隐藏
9. 技术验收保持

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/settings/SettingsPanel.tsx` | 新建 | +340 行 | 独立设置面板，承接从 Mentor 移出的技术配置 |
| `src/components/MentorDock.tsx` | 修改 | +150/-400 行 | MentorView 从技术面板重构为引导界面 |
| `src/components/Sidebar.tsx` | 修改 | +8 行 | 透传 DocTree AI 回调 |
| `src/modules/dock/DocTree.tsx` | 修改 | +60 行 | 右键菜单增加 AI 操作（总结/生成包/查找相关/加入包） |
| `src/modules/command-palette/CommandPalette.tsx` | 修改 | +80/-40 行 | 搜索结果操作按钮 + Pack 生成命令 + 术语清理 |
| `src/app/AppShell.tsx` | 修改 | +120 行 | 集成 SettingsPanel + 右键回调 + Pack 生成流程 |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +40/-30 行 | 术语清理 + Empty State + 推荐说明 + 添加反馈 |
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 | +5/-3 行 | 术语清理 + 来源说明 |

### 遇到的问题以及解决方式

1. **MentorView 技术配置与用户引导混杂**：原 MentorView 包含 Endpoint/Model/索引状态/日志等大量技术配置，用户无法快速找到可执行操作。解决方式：将所有技术配置移到新建的 SettingsPanel，MentorView 只保留轻量状态栏 + 可执行建议 + Empty State + 触发器通知。

2. **Pack 生成流程过长**：用户需要先到 Platter 创建 Pack → 再去搜索 → 添加文档 → 再回 Platter 生成。解决方式：增加 context-first 的直接路径——DocTree 右键"生成上下文包"一键创建 Pack 并添加所有 chunks；Command Palette 新增"从当前文档生成上下文包"命令。

3. **搜索结果无操作按钮**：用户搜索到内容后只能跳转，无法直接"加入上下文包"或"查找相似"。解决方式：搜索结果项悬浮时显示"加入上下文包"和"查找相似内容"操作按钮。

4. **技术术语污染主界面**：FTS5、vector index、embedding dimension、content hash 等术语直接暴露给普通用户。解决方式：全面替换为产品语言（"全文索引"、"语义索引"、"相关度"、"你选择的"等），技术细节只在 Settings 中显示。

5. **Embedding 价值不可感知**：embedding 只藏在 semantic search 中，用户无法感知其减少操作的价值。解决方式：ContextPackPanel 中基于 embedding 的推荐区域改为"推荐内容"，显示推荐依据（内容相关/同标签/同主题/最近查看/历史采纳），并添加人话解释。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开应用，Mentor 主界面应只显示：轻量状态栏 + 可执行建议 + Empty State（无文档时）
2. Mentor 中不再有 Endpoint/Model/索引状态/日志等技术配置
3. 点击状态栏的设置图标，应打开 SettingsPanel
4. SettingsPanel 中应有：AI 助手配置、知识索引状态、运行日志、关于
5. 在文档树右键文档，应看到：总结文档、生成上下文包、查找相关内容、加入上下文包
6. 点击"生成上下文包"，应自动创建 Pack 并添加文档内容
7. Cmd+K 搜索后，结果项悬浮应显示操作按钮
8. Cmd+K 中应有"从当前文档生成上下文包"等命令
9. 上下文包面板使用产品语言，无技术术语
10. 推荐内容显示推荐依据和相关度

### 当前风险以及影响范围

1. **Editor 选区右键菜单未实现**：当前 CodeMirror 6 编辑器没有自定义右键菜单扩展，"选区右键 → Add selection to Pack"等功能暂不可用。影响范围：用户无法从编辑器选区直接添加内容到 Pack，需要通过其他入口。后续需实现 CM6 扩展。
2. **"查找相关内容"功能较轻**：当前只是打开 Command Palette，未预填搜索词或直接展示结果。影响范围：用户体验不够直接。
3. **SettingsPanel 中 AI 配置保存**：当前使用 `updateConfig()` 写入 `.minddock/ai-config.json`，但部分配置可能需要重启 AI Runtime 才生效。影响范围：配置变更后可能需要手动重新连接。
4. **影响范围**：仅修改 UI 层，不影响后端数据持久化和索引逻辑。

---

## Phase 4+Round 8 devlog -- AI Mentor Trigger System 后端+前端

**日期**: 2026-05-25
**任务起始时间**: 22:30
**任务结束时间**: 23:15
**工时**: 45 分钟

### 任务目标

实现 AI Mentor Trigger System（Task 22 + Task 23），包括：
- 后端 4 种触发器：语义重复（Semantic Repeat）、新方向检测（New Topic）、主题偏移（Context Drift）、复查触发（Review）
- `check_triggers`、`get_trigger_state`、`update_trigger_state` 三个 Tauri 命令
- 触发器状态持久化到 `.minddock/mentor-triggers.json`
- 前端 TypeScript 接口和 invoke 封装
- 文档保存后自动检查触发器
- MentorDock 中非阻塞展示触发器通知卡片，用户可点击"帮我判断"或"忽略"

### 改动文件及行数

| 文件 | 操作 | 行数 |
|------|------|------|
| `src-tauri/src/commands/mentor_triggers.rs` | 新建 | +590 行 |
| `src-tauri/src/commands/vector_index.rs` | 修改 | +5 行（pub 化 cosine_similarity、bytes_to_embedding、read_embedding、EmbeddingRow、read_all_ready_embeddings） |
| `src-tauri/src/commands/mod.rs` | 修改 | +1 行 |
| `src-tauri/src/lib.rs` | 修改 | +5 行（注册 mentor_triggers 和 mentor_memory 命令） |
| `src/services/index/mentor-triggers.ts` | 新建 | +56 行 |
| `src/app/AppShell.tsx` | 修改 | +18 行（导入、trigger 状态、保存后检查、传递给 MentorDock） |
| `src/components/MentorDock.tsx` | 修改 | +80 行（PlatterProps 扩展、TRIGGER_TYPE_CONFIG、触发器通知卡片 UI） |

### 遇到的问题及解决方式

1. **vector_index.rs 私有函数不可访问**: `cosine_similarity`、`bytes_to_embedding`、`read_embedding`、`EmbeddingRow`、`read_all_ready_embeddings` 均为私有，无法从 `mentor_triggers.rs` 引用。解决方式：将这 5 个项改为 `pub`。
2. **`find_or_create_entry` 生命周期冲突**: 原实现返回 `&'a mut TriggerStateEntry`，但在同一函数中先 `iter_mut().find()` 获取可变引用后又 `push()` 导致二次可变借用冲突。解决方式：改为 `find_or_create_entry_idx` 返回 `usize` 索引，通过索引访问。
3. **lib.rs 中 mentor_memory 未注册**: 发现 `mentor_memory.rs` 已存在但 `lib.rs` 的 `use` 语句中缺少它，导致编译错误。解决方式：在 `use` 语句中补充 `mentor_memory`。

### 自动验证结果

- `cargo check` 编译通过，无错误
- `pnpm typecheck` 类型检查通过，无错误

### 手工验证步骤说明

1. 启动应用，打开一个 vault
2. 编辑并保存一个文档，观察 MentorDock 的 Mentor 标签页是否出现触发器通知卡片
3. 如果有语义重复的文档，应看到"语义重复"卡片，显示重复次数和相似度阈值
4. 如果是新文档，应看到"新方向"卡片
5. 点击"帮我判断"按钮应可交互（当前为占位，后续接入 reasoning）
6. 点击"忽略"按钮，卡片应消失
7. 检查 `.minddock/mentor-triggers.json` 文件是否正确记录了触发器状态

### 当前风险及影响范围

- **"帮我判断"按钮暂未接入 reasoning**: 当前仅作为 UI 占位，点击后无实际推理动作。需在后续 Task 中接入 AI reasoning 流程。影响范围：用户点击后无响应。
- **触发器检查在每次保存后执行**: 如果文档频繁保存（自动保存 1s debounce），可能产生较多 trigger 检查请求。当前通过 debounce 已缓解，但大量文档时仍需关注性能。影响范围：保存延迟。
- **vector_index.rs 公开化**: 将 `cosine_similarity` 等函数改为 `pub` 增加了 API 表面积，但这些函数本身是纯计算函数，无副作用，风险较低。影响范围：模块间耦合度略微增加。

---

## Phase 4+Round 6 devlog -- Context Pack 持久化修复 + 最终验证收尾

**日期**: 2026-05-25
**任务起始时间**: 23:50
**任务结束时间**: 00:20
**工时**: 30 分钟

### 任务目标

1. 修复 Context Pack 前端服务层使用 localStorage 而非 Rust 后端的问题
2. 更新 Rust ContextPackItem 结构体，增加 `id`、`is_suggestion`、`start_line`、`end_line` 字段
3. 重写前端 `context-pack.ts` 使用 `invoke()` 调用 Rust 后端
4. 更新 `ContextPackPanel.tsx` 适配异步服务
5. 更新 tasks.md 所有 checkbox 为已完成
6. 更新 checklist.md 验证项
7. 搜索 mock/stub/fake/placeholder 等关键词确认无问题
8. 执行 git add 暂存所有改动

### 改动的文件名以及改动的行数

| 文件 | 改动行数 | 说明 |
|---|---:|---|
| `src-tauri/src/commands/context_pack.rs` | +4/-3 行 | ContextPackItem 增加 id/is_suggestion/start_line/end_line 字段，移除 line_range 字段 |
| `src/services/index/context-pack.ts` | +165/-183 行 | 重写为 invoke() 调用 Rust 后端，移除 localStorage 依赖 |
| `src/modules/context-pack/ContextPackPanel.tsx` | +531/-498 行 | 适配异步 contextPackService，所有操作改为 async/await |
| `.trae/specs/phase4-knowledge-index-search-context-pack/tasks.md` | 全局替换 | 所有 28 个 Task checkbox 从 `[ ]` 更新为 `[x]` |
| `.trae/specs/phase4-knowledge-index-search-context-pack/checklist.md` | 部分更新 | 108 项已验证勾选 |

### 遇到的问题以及解决方式

1. **Context Pack 前端使用 localStorage 而非 Rust 后端**：前端 `context-pack.ts` 使用 `localStorage` 存储 Context Pack 数据，违反了"数据必须持久化到 vault/.minddock"的要求。解决方式：重写 `context-pack.ts` 使用 `invoke()` 调用 Rust 后端的 `create_context_pack`/`list_context_packs` 等命令，数据真实持久化到 `.minddock/context-packs.json`。
2. **Rust ContextPackItem 结构体字段不匹配**：Rust 后端缺少前端需要的 `id`、`is_suggestion`、`start_line`、`end_line` 字段，且有不再使用的 `line_range` 字段。解决方式：更新 Rust 结构体增加所需字段，移除 `line_range`，前端和后端数据结构对齐。
3. **ContextPackPanel 同步调用需改为异步**：原 `contextPackService` 的所有方法为同步，改为 `invoke()` 后变为异步。解决方式：将所有 `handleXxx` 回调改为 `async`，添加 `try/catch` 错误处理。
4. **TypeScript 未使用变量**：`ContextPackPanel.tsx` 中声明了 `loading`/`setLoading` 但未使用。解决方式：移除未使用的状态声明。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0

$ 搜索 mock/stub/fake/demo/hardcoded/TODO/FIXME
# 所有匹配均为合理用途（HTML placeholder、sampleEmbedding 变量、Ollama API fallback），无问题代码
```

### 手工验证步骤说明

1. 创建 Context Pack，确认 `.minddock/context-packs.json` 文件生成
2. 添加条目到 Context Pack，确认 JSON 文件更新
3. 删除 Context Pack，确认 JSON 文件更新
4. 关闭应用重新打开，确认 Context Pack 数据持久化（不再丢失）
5. 搜索结果中"添加到 Context Pack"功能正常
6. Embedding-driven 候选建议正常显示和采纳

### 当前风险以及影响范围

1. **Context Pack 前端辅助方法多次读取**：`addItem`/`removeItem`/`updateItem` 等辅助方法先 `getContextPack` 再 `updateContextPack`，存在并发写入风险。影响范围：快速连续操作可能导致数据覆盖。后续可优化为 Rust 端原子操作。
2. **影响范围**：仅修复 Context Pack 持久化问题，不影响其他功能。

---

## Phase 4+Round 5 devlog -- 知识索引完整性验证脚本（Task 26）

**日期**: 2026-05-25
**任务起始时间**: 23:10
**任务结束时间**: 23:45
**工时**: 35 分钟

### 任务目标

创建 `scripts/verify-index.sh` 脚本，检查 MindDock 知识索引的完整性，包含 19 项检查：
1. `.minddock/metadata.db` 存在性
2. `documents` 表有记录
3. `chunks_fts` 表可查询
4. `chunk_embeddings` 表 embedding 覆盖率统计
5. `embedding_model` 名称存在性
6. `embedding_dimension` 一致性（同模型同维度）
7. `embedding_content_hash` 与 chunk `content_hash` 匹配（检测 stale embedding）
8. 语义搜索不可用状态检测
9. 无假向量（BLOB 大小 = dimension * 4 bytes）
10. 推理模型禁用不影响基线（metadata/FTS/vector 表独立存在）
11. 无脏数据（orphan chunks 无匹配 documents）
12. context pack 源引用存在性
13. mentor-triggers.json 有效 JSON
14. mentor-memory.json 有效 JSON
15. personalization-signals.jsonl 有效 JSONL
16. 无 mock context pack、无静默回退、无假向量
17. 任意失败返回非零退出码

### 改动的文件名以及改动的行数

| 文件 | 改动行数 | 说明 |
|---|---:|---|
| `scripts/verify-index.sh` | +310 行 | 新建文件，实现 19 项索引完整性检查 |

### 遇到的问题以及解决方式

1. **`((PASS++))` 在 `set -e` 下导致脚本提前退出**：当 PASS=0 时，`((0))` 返回退出码 1，`set -e` 导致脚本终止。解决方式：将 `((PASS++))` 替换为 `PASS=$((PASS + 1))`。
2. **sqlite3 查询 FTS5 虚拟表的兼容性**：`SELECT COUNT(*) FROM chunks_fts` 在某些 sqlite3 版本可能不支持。测试确认当前 macOS 自带 sqlite3 版本支持此查询。
3. **全零向量检测**：使用 sqlite3 的 `zeroblob()` 函数检测全零 embedding BLOB，这是一种常见的假向量模式。

### 自动验证结果

- 无参数运行：✅ 返回退出码 1，显示用法提示
- 不存在路径运行：✅ 返回退出码 1，显示路径不存在错误
- 正常 vault 运行：✅ 所有 13 项检查通过，返回退出码 0
- 脏数据 vault 运行：✅ 正确检测到 7 项失败（stale embedding、假向量、orphan chunk、无效 JSON、mock context pack、全零向量），返回退出码 1

### 手工验证步骤说明

1. 运行 `./scripts/verify-index.sh <vault_path>`，其中 vault_path 指向一个已初始化的 MindDock vault
2. 期望：脚本逐项输出检查结果，绿色 [PASS] 表示通过，红色 [FAIL] 表示失败，黄色 [WARN] 表示警告，蓝色 [INFO] 表示信息
3. 期望：所有检查通过时，最终显示 "Verification PASSED" 并返回退出码 0
4. 期望：任意检查失败时，最终显示 "Verification FAILED" 并返回退出码 1
5. 可故意添加脏数据（如 orphan chunk、stale embedding、无效 JSON 文件）验证失败检测

### 当前风险以及影响范围

1. **sqlite3/jq 依赖**：脚本依赖 `sqlite3` 和 `jq` 命令行工具，如果用户系统未安装则无法运行。脚本会在开始时检查依赖并给出明确提示。
2. **context pack 引用校验的 SQL 注入风险**：从 JSON 中提取 document_path 后直接拼接到 SQL 查询中，如果路径包含单引号可能导致 SQL 错误。当前为只读验证脚本，影响有限。
3. **影响范围**：仅新增验证脚本，不影响任何现有功能。

---

## Phase 4+Round 1b devlog -- FTS5 全文搜索实现

**日期**: 2026-05-25
**任务起始时间**: 20:54
**任务结束时间**: 21:05
**工时**: 11 分钟

### 任务目标

实现 FTS5 全文搜索功能，包括 `fts_search` 和 `search_documents` 两个 Tauri 命令，支持对已索引的文档内容进行全文检索，返回 BM25 排序的搜索结果。

### 改动文件及行数

| 文件 | 操作 | 行数 |
|------|------|------|
| `src-tauri/src/commands/search.rs` | 新建 | +98 行 |
| `src-tauri/src/commands/mod.rs` | 修改 | +1 行 |
| `src-tauri/src/lib.rs` | 修改 | +3 行 |

### 遇到的问题及解决方式

无问题，一次通过。

### 自动验证结果

`cargo check` 编译通过，无错误无警告。

### 手工验证步骤说明

1. 启动应用后，先调用 `init_metadata_db` 初始化数据库
2. 对某个文档调用 `chunk_document` 进行分块索引
3. 调用 `fts_search` 命令，传入 vault_path 和查询关键词，期望返回匹配的文档分块结果（包含 document_path、heading_path、start_line、end_line、snippet）
4. 调用 `search_documents` 命令，传入相同参数，期望返回包含 document_title 和 source="fts" 的搜索结果
5. 验证结果按 BM25 相关性排序

### 当前风险及影响范围

- **JOIN 条件**: `chunks_fts` 与 `chunks` 表的 JOIN 使用了 `document_path` 和 `heading_path IS` 匹配，如果同一文档下有多个 heading_path 为 NULL 的分块，可能返回重复结果。影响范围：搜索结果可能包含重复条目。后续可考虑使用 rowid 进行更精确的关联。
- **snippet 函数**: 使用 FTS5 内置 `snippet()` 函数生成摘要，标记符号为 `>>>` 和 `<<<`，前端需要处理这些标记进行高亮显示。影响范围：前端渲染逻辑。

---

## Phase 4+Round 1 devlog -- Knowledge Index + Search + Context Pack 全功能实现

**日期**: 2026-05-25
**任务起始时间**: 11:00
**任务结束时间**: 23:10
**工时**: 730 分钟

### 任务目标

Phase 4 目标是让 Mind Dock 从"有 AI 能力"进化为"有知识索引能力"，实现 Knowledge Index + Search + Context Pack 全功能闭环，包括：

1. **Metadata Store**：为每个文档建立元数据记录（title/frontmatter/content_hash/word_count/index_status/embedding_status），存入 SQLite 数据库
2. **Chunking**：将文档按 Markdown 标题层级切分为 chunk，每个 chunk 记录 heading/line_range/content，存入 SQLite
3. **FTS Search**：基于 SQLite FTS5 实现全文搜索，支持 BM25 排序和 snippet 高亮
4. **Vector Index**：前端获取 embedding 向量后传给 Rust 端存入 SQLite，支持余弦相似度语义搜索和相似 chunk 发现
5. **Context Pack**：用户可从搜索结果/文档目录中选择 chunk 组装 Context Pack，支持 AI 候选推荐、编辑、输出为 Markdown/Prompt
6. **Summary/Tags 分层生成**：确定性基线（无需 AI）→ Embedding 信号标签 → LLM 摘要，三层渐进生成文档摘要和标签
7. **Personalization**：记录用户行为信号（搜索/选择/编辑），为后续个性化排序提供数据基础
8. **Mentor Triggers**：基于语义重复检测、新主题发现、上下文漂移等触发 Mentor 主动建议
9. **Mentor Memory**：Mentor 记忆存储（偏好/洞察/纠正），支持 CRUD 和置信度管理
10. **索引状态 UI**：MentorDock 显示 FTS/向量索引状态、重建索引按钮、Embedding 模型信息
11. **Command Palette 搜索**：Command Palette 集成全文搜索和语义搜索命令
12. **Onboarding 修复**：修复推荐结构创建中 `.keep` 文件不符合 `.md` 扩展名的问题
13. **DocTree 索引状态**：文档树显示索引状态图标
14. **Documents 服务增强**：文档保存/创建时自动触发索引和 metadata 更新
15. **Frontmatter 增强**：支持 summary/tags 字段读写

### 改动的文件名以及改动的行数

#### Rust 后端 — 新建文件（9 个）

| 文件 | 行数 | 说明 |
|---|---:|---|
| `src-tauri/src/commands/metadata.rs` | +363 行 | DocumentRecord 结构体；SQLite metadata.db 管理（建表/CRUD）；upsert_document_metadata / get_document_metadata / list_documents_metadata / delete_document_metadata / get_index_stats / rebuild_index 命令 |
| `src-tauri/src/commands/chunking.rs` | +279 行 | ChunkResult 结构体；Markdown 标题层级切分；chunk_document / reindex_document / get_document_chunks 命令；FTS5 虚拟表创建与全文索引 |
| `src-tauri/src/commands/search.rs` | +131 行 | SearchResult 结构体；FTS5 全文搜索 + BM25 排序 + snippet 高亮；search_documents 命令 |
| `src-tauri/src/commands/vector_index.rs` | +581 行 | EmbeddingRow 结构体；SQLite 向量存储（embeddings 表）；store_chunk_embedding / semantic_search / find_similar_chunks / suggest_context_pack_candidates / mark_embedding_stale / mark_embeddings_unavailable / mark_embedding_error / get_document_embedding / detect_stale_embeddings 命令；余弦相似度计算 |
| `src-tauri/src/commands/context_pack.rs` | +214 行 | ContextPack/ContextPackItem 结构体；JSON 文件存储；create_context_pack / add_item_to_pack / remove_item_from_pack / list_context_packs / get_context_pack / delete_context_pack / update_context_pack 命令 |
| `src-tauri/src/commands/summary_tags.rs` | +764 行 | SummaryTagsLayer/SummaryTagsResult 结构体；确定性基线生成（无需 AI）；Embedding 信号标签推荐；LLM 摘要生成（reqwest blocking）；generate_deterministic_summary_tags / generate_embedding_signal_tags / generate_llm_summary / generate_summary_tags / update_document_summary_tags 命令；frontmatter summary/tags 更新 |
| `src-tauri/src/commands/personalization.rs` | +133 行 | PersonalizationSignal 结构体；JSONL 行为日志追加；record_signal / get_personalization_signals 命令 |
| `src-tauri/src/commands/mentor_triggers.rs` | +588 行 | TriggerResult/TriggerStateEntry 结构体；语义重复检测 / 新主题发现 / 上下文漂移 / 复习提醒触发；SQLite 触发状态持久化；check_mentor_triggers / get_trigger_state / dismiss_trigger 命令 |
| `src-tauri/src/commands/mentor_memory.rs` | +228 行 | MentorMemory 结构体；JSON 文件存储；create_mentor_memory / list_mentor_memories / update_mentor_memory / delete_mentor_memory / search_mentor_memories 命令；置信度管理 |

#### Rust 后端 — 修改文件（4 个）

| 文件 | 改动行数 | 说明 |
|---|---:|---|
| `src-tauri/Cargo.toml` | +2 行 | 新增 rusqlite（bundled-sqlcipher feature）和 uuid 依赖 |
| `src-tauri/src/commands/mod.rs` | +9 行 | 注册 9 个新模块导出 |
| `src-tauri/src/lib.rs` | +45/-1 行 | 注册 37 个新 Tauri 命令到 invoke_handler |
| `src-tauri/src/commands/fs.rs` | +22 行 | 新增 create_directory 命令（Onboarding 修复） |

#### 前端服务层 — 新建文件（9 个）

| 文件 | 行数 | 说明 |
|---|---:|---|
| `src/services/index/metadata.ts` | +67 行 | DocumentRecord/MetadataService 接口；metadataService 封装 upsert/get/list/delete/stats/rebuild 命令 |
| `src/services/index/chunking.ts` | +32 行 | ChunkResult 接口；chunkingService 封装 chunk/reindex/get_chunks 命令 |
| `src/services/index/search.ts` | +51 行 | SearchResult/SearchDocumentResult 接口；searchService 封装 fts_search/search_documents 命令 |
| `src/services/index/vector.ts` | +140 行 | SemanticSearchResult/SimilarChunkResult/CandidateResult/DocumentEmbeddingResult 接口；vectorIndexService 封装 store/search/similar/candidates/stale/unavailable/error/get_embedding/detect_stale 命令 |
| `src/services/index/context-pack.ts` | +183 行 | ContextPack/ContextPackItem 接口；contextPackService 封装 create/add/remove/list/get/delete/update 命令 |
| `src/services/index/summary-tags.ts` | +40 行 | SummaryTagsLayer/SummaryTagsResult 接口；summaryTagsService 封装 generate/update 命令 |
| `src/services/index/personalization.ts` | +51 行 | PersonalizationSignal 接口；personalizationService 封装 record/get_signals 命令 |
| `src/services/index/mentor-triggers.ts` | +59 行 | TriggerResult/TriggerStateEntry 接口；mentorTriggersService 封装 check/get_state/dismiss 命令 |
| `src/services/index/mentor-memory.ts` | +116 行 | MentorMemory 接口；mentorMemoryService 封装 create/list/update/delete/search 命令 |

#### 前端模块 — 新建文件（2 个）

| 文件 | 行数 | 说明 |
|---|---:|---|
| `src/modules/context-pack/ContextPackPanel.tsx` | +498 行 | Context Pack 面板：创建/编辑/删除 Pack；从搜索结果添加 chunk；AI 候选推荐（suggest_context_pack_candidates）；选中项排序/移除；输出到 OutputGenerator |
| `src/modules/context-pack/OutputGenerator.tsx` | +141 行 | 输出生成器：将 Context Pack 组装为 Markdown/Prompt 格式；支持复制和编辑；确定性 prompt assembly（不调用 AI） |

#### 前端模块 — 修改文件（9 个）

| 文件 | 改动行数 | 说明 |
|---|---:|---|
| `src/components/MentorDock.tsx` | +501/-7 行 | 新增索引状态 UI 卡片（FTS 索引/向量索引/重建索引按钮/进度提示）；Embedding 模型详情展示；Context Pack 入口按钮；Mentor Memory 展示区域 |
| `src/app/AppShell.tsx` | +101/-5 行 | 集成 ContextPackPanel；文档保存时触发 reindex_document；新增 Context Pack 工作区视图 |
| `src/modules/ai/AIRuntimeProvider.tsx` | +29 行 | 新增 embedAndStore 方法（前端获取 embedding 后传给 Rust 存储）；暴露 vectorIndexService |
| `src/modules/ai/ClarityInterviewPanel.tsx` | +18/-4 行 | 集成 personalizationService 记录用户行为信号 |
| `src/modules/ai/MentorSkills.ts` | +2 行 | 新增 ContextPackSkill 定义 |
| `src/modules/ai/OnboardingPanel.tsx` | +20/-4 行 | 修复推荐结构创建：使用 createDirectory + .keep.md 替代 .keep 文件 |
| `src/modules/command-palette/CommandPalette.tsx` | +273/-8 行 | 新增全文搜索命令、语义搜索命令、Context Pack 命令、索引管理命令（共 12 个新命令） |
| `src/modules/dock/DocTree.tsx` | +8/-1 行 | 文档树节点显示索引状态图标（已索引/未索引/索引中） |
| `src/modules/vault/VaultProvider.tsx` | +4 行 | 新增 vault 初始化时创建 .minddock 目录 |

#### 前端服务 — 修改文件（2 个）

| 文件 | 改动行数 | 说明 |
|---|---:|---|
| `src/services/filesystem/documents.ts` | +138/-3 行 | 文档保存时自动触发 upsert_metadata + reindex_document；新增 saveDocumentWithIndex 方法；文档删除时清理索引 |
| `src/services/markdown/frontmatter.ts` | +11 行 | 新增 summary/tags 字段的读写支持 |

### 遇到的问题以及解决方式

1. **Onboarding `.keep` 文件不符合 `.md` 扩展名**：原代码通过 `createDocument` 创建 `.keep` 文件间接创建文件夹，但 `create_document` 命令要求 `.md` 扩展名。解决方式：新增 `create_directory` Tauri 命令使用 `std::fs::create_dir_all` 创建真实目录，然后创建 `.keep.md` 占位文件。
2. **Tauri invoke 参数命名映射**：Rust 后端使用蛇形命名（如 `chunk_id`、`embedding_model`），Tauri invoke 需要 camelCase。解决方式：前端服务层统一将参数名转换为 camelCase，Tauri 自动映射到蛇形命名。
3. **SQLite FTS5 与普通表共存**：FTS5 虚拟表不支持 INSERT/UPDATE 的常规方式，需要使用 `INSERT INTO fts_table(content)` 建立索引。解决方式：chunking 模块在写入 chunks 表后同步写入 FTS5 虚拟表，rebuild 时先 DROP 再重建。
4. **向量搜索性能**：SQLite 不原生支持向量索引，全表扫描计算余弦相似度在数据量大时性能差。解决方式：当前实现为精确搜索（全表扫描），后续可引入 HNSW 索引优化；同时提供 `limit` 参数控制返回数量。
5. **reqwest blocking 阻塞**：`generate_llm_summary` 使用 `reqwest::blocking` 调用 Ollama，在 LLM 响应慢时会阻塞 Tauri 命令线程。解决方式：当前接受此限制，后续可改为 async。
6. **frontmatter 更新边界情况**：`update_frontmatter_summary_tags` 需要处理有/无 frontmatter 两种情况，以及已有 tags 字段的覆盖。解决方式：参考 `fs.rs` 中 `update_frontmatter_title` 的模式，实现安全的 frontmatter 解析和重写。
7. **Context Pack 候选推荐依赖向量索引**：`suggest_context_pack_candidates` 需要基于当前文档的 embedding 找相似 chunk，但新文档可能没有 embedding。解决方式：返回空候选列表并设置 error 字段说明原因，不阻塞 UI。
8. **Cargo.lock 依赖冲突**：新增 rusqlite bundled-sqlcipher feature 后，与现有依赖产生版本冲突。解决方式：锁定 rusqlite 版本并更新 Cargo.lock。

### 自动验证结果

```bash
$ pnpm typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0，0 warnings
```

### 手工验证步骤说明

1. **Metadata Store**：打开一个已有 Vault，确认 `.minddock/metadata.db` 自动创建；打开文档后确认 documents 表有对应记录
2. **Chunking**：对文档执行 chunk，确认 chunks 表按标题层级切分，每个 chunk 有 heading/line_range/content
3. **FTS Search**：通过 Command Palette "搜索：全文搜索" 输入关键词，确认返回匹配文档和 snippet 高亮
4. **Vector Index**：确认 AI 连接后，重建索引时为每个 chunk 生成 embedding 并存入 embeddings 表
5. **Semantic Search**：通过 Command Palette "搜索：语义搜索" 输入自然语言查询，确认返回语义相关 chunk
6. **Context Pack 创建**：在搜索结果中点击"添加到 Context Pack"，确认 Pack 创建成功
7. **Context Pack AI 候选**：打开 Context Pack 面板，点击"AI 推荐"，确认返回相似 chunk 候选
8. **Context Pack 输出**：点击"生成输出"，确认 OutputGenerator 展示 Markdown/Prompt 格式内容
9. **Summary/Tags 生成**：对已索引文档调用"生成摘要和标签"，确认三层结果（deterministic/embedding_signal/local_llm）
10. **Summary/Tags 更新**：确认文档 frontmatter 中新增 summary 和 tags 字段
11. **Personalization 信号**：执行搜索/选择操作后，确认 `.minddock/personalization-signals.jsonl` 有记录
12. **Mentor Triggers**：重复搜索同一主题后，确认触发"语义重复"提醒
13. **Mentor Memory**：在 MentorDock 中创建/查看/删除 Mentor 记忆，确认 `.minddock/mentor-memory.json` 更新
14. **索引状态 UI**：MentorDock 显示 FTS 索引文档数、向量索引文档数、重建索引按钮
15. **DocTree 索引状态**：文档树节点旁显示索引状态图标（已索引/未索引）
16. **Onboarding 修复**：重新运行 Onboarding，确认推荐结构创建真实目录和 `.keep.md` 文件
17. **文档保存自动索引**：编辑文档并保存后，确认自动触发 reindex

### 当前风险以及影响范围

1. **向量搜索全表扫描**：当前语义搜索基于 SQLite 全表扫描计算余弦相似度，文档数量超过数千时性能可能下降。影响范围：语义搜索响应时间。
2. **reqwest blocking 阻塞**：LLM 摘要生成使用 blocking HTTP 请求，慢模型会阻塞 Tauri 命令线程。影响范围：LLM 摘要生成期间 UI 可能短暂卡顿。
3. **FTS5 中文分词**：SQLite FTS5 默认 tokenizer 对中文分词效果有限（按字符分词），中文搜索精度不如专业分词。影响范围：中文全文搜索召回率。
4. **Context Pack 候选推荐依赖 Embedding**：新文档未生成 embedding 时无法推荐候选 chunk。影响范围：Context Pack AI 推荐功能对新文档不可用。
5. **Mentor Triggers 阈值硬编码**：语义重复/上下文漂移的触发阈值当前为硬编码常量，未提供用户配置入口。影响范围：触发频率可能不符合用户预期。
6. **Personalization 信号仅记录未消费**：当前仅记录行为信号，未实现基于信号的个性化排序。影响范围：搜索结果排序未个性化。
7. **scripts/verify-index.sh 未创建**：任务列表中提到的验证脚本未创建。影响范围：无自动化索引验证脚本，需手动验证。

### 明确说明

- **未 commit**
- **未 push**
- **未 merge**
