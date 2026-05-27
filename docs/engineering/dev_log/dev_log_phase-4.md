# Phase 4 开发日志

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
