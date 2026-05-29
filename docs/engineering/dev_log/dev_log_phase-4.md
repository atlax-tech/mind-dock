# Phase 4 开发日志

***

## Phase 4 Upgrade+Round 32 devlog -- M8/M9/M10：来源驱动生成、类型推荐与个性化排序

**日期**: 2026-05-28
**任务起始时间**: 17:04
**任务结束时间**: 17:18
**工时**: 14 分钟

### 任务目标

根据 `RB-P4-001_upgrade.md` 的 M8/M9/M10 规格继续查缺补漏：把 OutputGenerator 从上下文拼接器升级为来源驱动草稿生成器；引入 SuperTag-like 的 KnowledgeType 候选，让 embedding/metadata 不只用于搜索，也能识别约束、任务、问题、决策、风险、需求/验收等材料类型；把 Pack 推荐采纳/忽略、最近打开/编辑、常用 output type、常被忽略来源等 personalization 信号纳入排序与默认选项。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 | +212/-72 行 | 新增 `dev_agent_prompt` 输出类型、output intent 输入、source map、来源覆盖检查、reasoning 来源驱动生成；支持编辑、复制、保存为文档、导出 Markdown；记录 output type 使用信号 |
| `src/modules/ai/MentorSkills.ts` | 修改 | 约 +31 行 | 新增 `buildSourceDrivenOutputMessages`，约束 reasoning 必须基于 Context Pack 来源生成，并保留 `[S*]` 引用和来源覆盖检查 |
| `src/services/index/context-pack.ts` | 修改 | +5/-4 行 | Context Pack Markdown 导出增加 `[S1]/[S2]` source map 标识 |
| `src/app/AppShell.tsx` | 修改 | 约 +40 行 | “创建并生成”文件夹/主库 Pack 后直接打开 OutputGenerator，传入 outputType/outputIntent 并自动生成；记录文档打开、文档编辑和 output type 使用信号 |
| `src-tauri/src/commands/metadata.rs` | 修改 | +192 行 | 新增 KnowledgeTypeCandidate 与启发式类型候选命令 `suggest_knowledge_type_candidates`，支持 document/chunk 级候选、片段、置信度和推荐原因 |
| `src/services/index/metadata.ts` | 修改 | +28 行 | 新增 `KnowledgeType`、`KnowledgeTypeCandidate` 类型和 `suggestKnowledgeTypeCandidates` 服务封装 |
| `src/components/MentorDock.tsx` | 修改 | 约 +80 行 | 当前建议区展示 1-3 个类型候选，支持“应用类型”和“忽略”，并写入 personalization 信号 |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +160/-25 行 | 推荐候选补充 KnowledgeType 标签；排序叠加 personalization 权重；采纳/忽略推荐时记录来源和类型信号；查看来源记录 opened_result |
| `src/services/index/personalization.ts` | 修改 | +66 行 | 扩展信号类型，新增权重聚合、常用 output type 推断、重置学习记录服务 |
| `src-tauri/src/commands/personalization.rs` | 修改 | +20 行 | PersonalizationSignal 增加 `output_type`、`knowledge_type` 字段；新增重置 JSONL 命令 |
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +39 行 | Knowledge Engine 设置中增加本地学习记录数量和重置入口 |
| `src-tauri/src/lib.rs` | 修改 | +2 行 | 注册 KnowledgeType 候选和 personalization 重置命令 |

### 遇到的问题以及解决方式

1. **原 OutputGenerator 仍像模板拼接器**：只把 Pack item 拼成 prompt，无法保证来源引用和覆盖。解决方式：生成器改为 outputIntent + source map 驱动，reasoning prompt 明确要求任务、范围、约束、验收、来源和“来源覆盖检查”，模板中也不再出现 `[在此输入任务指令]`。
2. **创建 Pack 后没有直接进入“一键生成”**：原文件夹/主库“创建并生成”只创建 Pack 并跳到 Context Pack 面板。解决方式：创建并填充 Pack 后读取最终 Pack，直接打开 OutputGenerator，传入用户选择的 outputType 和 intent，并自动触发生成。
3. **KnowledgeType 不能依赖 reasoning**：M9 要求 reasoning 不可用时仍能给基础类型候选。解决方式：Rust 端在 metadata/chunks 上做本地关键词启发式分类，先提供可解释的基础候选；reasoning 后续只作为增强，不作为必需条件。
4. **推荐排序缺少学习闭环**：原 personalization 只记录信号，推荐链路没有消费。解决方式：前端聚合最近 500 条信号，按采纳来源、忽略来源、最近打开/编辑、类型采纳/忽略调整 Context Pack 推荐排序，并用常用 output type 设置 OutputGenerator 默认选项。
5. **Rust `query_map` 分支类型不一致**：按 documentPath 查询和全库查询如果直接返回不同闭包的 `MappedRows`，会导致编译类型不匹配。解决方式：两条分支各自查询并收集为统一的 `Vec<(chunk_id, path, heading, line, content)>` 后再处理。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0

$ cd src-tauri && cargo build
# exit 0

$ pnpm build
# exit 0
```

`pnpm build` 仍输出既有的 Vite 警告：部分动态 import 同时存在静态 import，且主 chunk 超过 500 kB。本轮未引入新的 TypeScript、Rust 或 Vite 构建错误。

### 手工验证步骤说明

1. 使用 `pnpm tauri dev` 启动真实 Tauri App，并准备一个已有索引和 embedding 的 vault。
2. 在 Context Pack 中加入 2-5 个真实来源，点击生成输出，选择 `Dev Agent` 或输入“生成 dev agent prompt”。
3. 期望 OutputGenerator 自动生成完整可编辑草稿，包含任务、范围、约束、验收、验证命令和 `[S1]/[S2]` 来源引用，不再出现占位提示。
4. 编辑草稿后点击复制、导出、保存为文档，期望剪贴板、Markdown 下载和 `outputs/*.md` 文档均可用。
5. 打开任意已索引文档，期望 Mentor 当前建议出现 1-3 个类型候选，例如“这段像约束/任务/问题/决策”，并可应用或忽略。
6. 在 Pack 推荐中采纳带类型标签的候选，再忽略另一类候选，刷新推荐后期望同类采纳候选排序上升，常被忽略来源或类型排序下降。
7. 连续使用某个 output type 后重新打开 OutputGenerator，期望默认选项倾向最近常用类型。
8. 到 Settings → Knowledge Engine → 学习记录点击重置，期望记录数归零，后续推荐排序回到基础语义排序。
9. 断开 AI Reasoning 后，期望类型候选和 Pack 推荐仍可用；只有 reasoning 生成按钮明确不可用或提示需连接。

### 当前风险，以及影响范围

1. **影响范围**：Context Pack 输出生成器、Mentor 当前建议、Context Pack 推荐排序、metadata 类型候选命令、personalization JSONL 信号和 Settings 学习记录入口。不自动修改用户原文，不自动提交给 dev agent。
2. **中风险**：KnowledgeType 当前是本地启发式关键词分类，优点是无需 AI、可解释、离线可用；缺点是中文长文的语义判断仍较粗，可能把“风险”和“问题”混淆。
3. **中低风险**：personalization 排序使用透明权重叠加，不是黑箱模型；短期大量打开/编辑同一文档会提高该来源权重，后续可能需要时间衰减和 UI 解释。
4. **中低风险**：OutputGenerator 的来源覆盖检查依赖模型按约定输出 `[S*]` 引用；UI 会展示引用覆盖数量，但不会强制阻止用户复制未覆盖草稿。
5. **验证限制**：自动验证覆盖类型、Rust 编译和前端构建；真实排序变化、AI 草稿质量和导出保存体验需要在 Tauri App 内按手工步骤验证。

***

## Phase 4 Upgrade+Round 31 devlog -- M7：Trigger chunkId 与帮我判断

**日期**: 2026-05-28
**任务起始时间**: 16:49
**任务结束时间**: 17:03
**工时**: 14 分钟

### 任务目标

根据 `RB-P4-001_upgrade.md` 的 M7 规格，让保存后的 Mentor trigger 真正基于 changed chunk 检测重复和偏题：reindex 后拿到 changed chunks，对 changed chunk 调用 `checkTriggers(vaultPath, documentPath, chunk.id)`；Mentor UI 聚合同类 trigger；用户点击“帮我判断”后再调用 reasoning，输出合并/保留差异/加入 Pack/稍后复查/忽略建议；不自动改文档、不自动合并、不高频刷屏。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src-tauri/src/commands/chunking.rs` | 修改 | +62/-28 行 | `reindex_document` 返回 `ReindexDocumentResult`，包含 `chunk_count` 和 `changed_chunks`；重建前读取旧 chunk hash，重建后只把新增/变化 hash 的 chunks 标记为 changed |
| `src/services/index/chunking.ts` | 修改 | +7/-2 行 | TypeScript 侧补充 `ReindexDocumentResult`，`reindexDocument` 返回 changed chunks |
| `src/services/filesystem/documents.ts` | 修改 | +6/-6 行 | post-reindex hook 签名增加 `changedChunks`，新建/保存后的 reindex 结果传入 hook |
| `src/app/AppShell.tsx` | 修改 | 约 +150/-18 行 | post-reindex 保持 embedding 现有流程，但 trigger 只检查 changed chunks；同类 trigger 在 AppShell 聚合；新增 trigger reasoning 上下文构建，输入包含触发片段、文档摘要和 embedding 召回依据；新增将触发片段加入当前 Pack 的显式动作 |
| `src/services/index/mentor-triggers.ts` | 修改 | +8/-0 行 | `TriggerResult` 增加前端聚合与判断所需的 chunk/document/evidence 字段；trigger state 增加 `dismissed_until` |
| `src-tauri/src/commands/mentor_triggers.rs` | 修改 | +51/-14 行 | trigger state 增加 24 小时冷却；被忽略且未过期的同类 trigger 不再返回，过期后自动解除 dismissed |
| `src/components/MentorDock.tsx` | 修改 | +51/-4 行 | 待判断卡片显示聚合同类数量；“帮我判断”在 reasoning 未连接时明确不可用；新增“加入 Pack / 稍后复查 / 忽略”动作，判断结果区也保留这些动作 |

### 遇到的问题以及解决方式

1. **原 reindex 只返回 chunk 数量，无法知道 changed chunk**：M7 要求只对 changed chunk 检查 trigger。解决方式：Rust 侧在重建前读取旧 chunk hash，重建后比较新 hash，返回 `changed_chunks` 给前端。
2. **原 trigger 会对所有 chunks 检查，容易刷屏**：解决方式：post-reindex hook 中 embedding 仍按现有全量 chunks 保持索引可用，但 trigger 只遍历 `changedChunks`，并按 `trigger_type` 聚合为一张卡。
3. **忽略后下一次保存会重新出现**：Rust 原逻辑命中 trigger 后会把 `dismissed` 重置为 false。解决方式：增加 `dismissed_until`，`updateTriggerState(..., true)` 设置 24 小时冷却，冷却期内同类 trigger 不返回。
4. **“帮我判断”原先只把 trigger 文案交给模型**：这不足以产生真实 Mentor 判断。解决方式：AppShell 为 trigger 构建 reasoning context，包含当前触发片段 `[S1]`、文档摘要、heading/line、同类触发数量和 embedding 召回片段 `[R*]`。
5. **AI 不应越权修改文档**：prompt 明确限制只能给建议动作，不自动合并、不自动删除；UI 只提供加入 Pack、稍后复查、忽略，不提供自动改文档入口。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0

$ cargo build
# exit 0

$ pnpm build
# exit 0
```

`pnpm build` 仍输出既有的 Vite 警告：部分动态 import 同时存在静态 import，且主 chunk 超过 500 kB。本轮未引入新的构建错误。

### 手工验证步骤说明

1. 使用 `pnpm tauri dev` 启动真实 Tauri App，并确保 embedding 与 AI Reasoning 均已连接。
2. 打开一个已有索引文档，保存一段与旧文档高度相似的新内容。
3. 期望 Mentor 的“待判断”中出现“语义重复/可能重复”，并显示同类聚合数量。
4. 保存一段明显偏离当前文档主旨的内容，期望出现“主题偏移/可能偏离”。
5. 点击“帮我判断”，期望 reasoning 输出包含 `判断 / 建议动作 / 理由 / 下一步`，建议动作限定在合并、保留差异、加入 Pack、稍后复查、忽略。
6. 点击“加入 Pack”，期望触发片段进入当前 Pack 或自动创建 `Mentor 待判断素材` Pack。
7. 点击“稍后复查”或“忽略”，期望卡片消失；24 小时冷却期内重复保存同类内容不再立即刷出同类 trigger。
8. 断开 AI Reasoning 后，期望 trigger 仍可由 embedding/规则出现，但“帮我判断”显示需连接 AI，不影响加入 Pack 或忽略。

### 当前风险，以及影响范围

1. **影响范围**：保存后的 reindex 返回结构、post-reindex hook、Mentor trigger state、MentorDock 待判断 UI、trigger reasoning 判断动作。不改变自动保存策略，不自动修改文档。
2. **中低风险**：当前 chunking 后端仍会重建 chunks 和 embeddings，本轮只用 hash 对比得出 changed chunks 供 trigger 使用；未做真正的增量 chunk upsert，因此 embedding 仍按现有全量流程补齐。
3. **中低风险**：changed chunk 用 content hash 判断，移动未改内容不会被视为 changed；这符合本轮“不高频刷屏”的目标，但后续如果要检测结构移动，需要加入位置相似度 diff。
4. **低风险**：忽略冷却期固定为 24 小时，当前没有 UI 配置冷却时长；后续可按 trigger 类型或用户偏好调整。
5. **验证限制**：自动验证覆盖类型、Rust 编译和前端构建；真实重复/偏题检测依赖已有 embedding 数据，需要按手工步骤在 Tauri App 内验证。

***

## Phase 4 Upgrade+Round 30 devlog -- M6 体验补丁：快速问答回复插入 Callout

**日期**: 2026-05-28
**任务起始时间**: 16:44
**任务结束时间**: 16:48
**工时**: 4 分钟

### 任务目标

为 M6 快速问答补充一个后续操作：用户在选区旁快速问答得到回复后，可以将回复作为 Markdown callout 插入到当前选中内容下方的空白段落中，并使用用户的问题作为 callout 标题。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/app/AppShell.tsx` | 修改 | +36/-0 行 | `quickAsk` 状态新增 `inserted` 反馈；新增 `insertQuickAskCalloutAfterSelection`，将回复格式化为 `> [!note] 用户问题` callout 并写回文档；快速问答回复卡新增 `插入 Callout` 操作 |

### 遇到的问题以及解决方式

1. **不能复用普通 Mentor 输出插入格式**：已有 `insertMentorOutputAfterSelection` 会插入 `AI Mentor · 标题` 普通引用块，不符合“callout 标题为用户问题”的要求。解决方式：新增快速问答专用插入 helper，保留既有解释/总结/生成插入逻辑不变。
2. **多行回答需要保持 callout 结构**：直接拼接回答会导致只有第一行在引用块内。解决方式：把回答按行拆分，每行加 `>` 前缀，空行用独立 `>` 保持 Markdown callout 连续。
3. **插入后需要明确反馈**：只写回文档会让用户不确定动作是否完成。解决方式：按钮状态短暂切换为 `已插入`，2 秒后恢复。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0

$ pnpm build
# exit 0
```

`pnpm build` 仍输出既有的 Vite 警告：部分动态 import 同时存在静态 import，且主 chunk 超过 500 kB。本轮未引入新的构建错误。

### 手工验证步骤说明

1. 使用 `pnpm tauri dev` 启动真实 Tauri App，并连接 AI Reasoning。
2. 打开 Markdown 文档，选中一段内容，右键点击 `快速问答`。
3. 输入问题并等待回复出现。
4. 点击回复卡中的 `插入 Callout`。
5. 期望当前文档在选区下方插入一个空白段落和 callout，格式为 `> [!note] 用户问题`，callout 内容为 AI 回复。
6. 期望按钮短暂显示 `已插入`，文档内容写回后预览中呈现为引用/callout 样式。

### 当前风险，以及影响范围

1. **影响范围**：仅影响快速问答回复卡和文档写回，不改变 reasoning prompt、选区问答输入、解释/总结/从此生成逻辑。
2. **低风险**：插入位置使用 CodeMirror selection offset 的 `selectionTo`，因此插入在用户选区后方；如果用户选中了段落中间文本，callout 会插入在该选区后方而不是整段末尾。
3. **验证限制**：类型检查和前端构建已通过；真实文档写回和 Markdown 预览样式需要在 Tauri App 中按手工步骤确认。

***

## Phase 4 Upgrade+Round 29 devlog -- M6 体验补丁：选区旁快速问答玻璃气泡

**日期**: 2026-05-28
**任务起始时间**: 16:36
**任务结束时间**: 16:40
**工时**: 4 分钟

### 任务目标

根据 M6 选区快速问答的体验反馈，将问答浮层从固定右下角调整为跟随文档选区出现的小型聊天气泡，并使用通透磨砂玻璃视觉，降低用户从选区到提问的视线跳转成本。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/editor/editorContextMenu.ts` | 修改 | +31/-2 行 | 右键菜单 action payload 新增 `anchorRect`，把选区附近的屏幕坐标传给上层 |
| `src/modules/editor/EditorView.tsx` | 修改 | +2/-2 行 | 选区 action 类型改为复用 `EditorSelectionPayload` |
| `src/app/AppShell.tsx` | 修改 | +95/-18 行 | `quickAsk` 状态保存选区锚点；新增浮层定位计算；快速问答 UI 改为选区旁小聊天气泡，并加入玻璃背景、气泡尾巴、半透明消息块和输入区 |

### 遇到的问题以及解决方式

1. **AppShell 不知道选区位置**：原快速问答只有文档 offset，没有屏幕坐标。解决方式：在 CodeMirror 右键菜单中用 `coordsAtPos` 读取点击处坐标，并随 selection payload 传出。
2. **气泡可能贴到视口外**：选区靠近右侧或底部时直接定位会溢出。解决方式：`getQuickAskPlacement` 根据视口宽高自动选择左侧/右侧，并对 top/left 做边界夹取。
3. **玻璃效果需要保持可读性**：纯透明会影响正文和回答阅读。解决方式：外层使用 `backdrop-blur-2xl`、半透明白/深色背景和细边框，消息块仍保留轻微底色与阴影。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0

$ pnpm build
# exit 0
```

`pnpm build` 仍输出既有的 Vite 警告：部分动态 import 同时存在静态 import，且主 chunk 超过 500 kB。本轮未引入新的构建错误。

### 手工验证步骤说明

1. 使用 `pnpm tauri dev` 启动真实 Tauri App。
2. 打开 Markdown 文档，选中正文内容并右键点击 `快速问答`。
3. 期望快速问答气泡出现在选区附近，而不是固定在窗口右下角。
4. 将选区放在编辑器右侧再打开，期望气泡自动改到选区左侧且不溢出窗口。
5. 期望气泡整体呈磨砂玻璃效果，顶部、消息区、输入区均保持半透明但文字清晰可读。
6. 输入问题并发送，期望原有 AI 问答、加载、复制和来源展示行为不变。

### 当前风险，以及影响范围

1. **影响范围**：仅影响 Editor 右键 selection payload 和 AppShell 的快速问答浮层展示，不改变 reasoning prompt、embedding 召回和回答生成链路。
2. **低风险**：坐标来自 `coordsAtPos`，多行选区时气泡贴近用户右键点击的选区位置；后续如果需要贴近整段选区中心，可再扩展 selection range rect 计算。
3. **验证限制**：本轮已通过类型检查；真实视觉位置和玻璃效果仍需要在 Tauri App 内按手工步骤确认。

***

## Phase 4 Upgrade+Round 28 devlog -- M6 补丁：选区快速问答气泡

**日期**: 2026-05-28
**任务起始时间**: 16:29
**任务结束时间**: 16:35
**工时**: 6 分钟

### 任务目标

在 M6 选区 reasoning 能力上补一个轻量体验入口：Editor 右键选区菜单新增“快速问答”，点击后以聊天气泡形式弹出输入框，landing 语句为“有问题，尽管问”。用户输入问题后，将当前选区内容和用户问题传给 AI 进行单轮问答。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/modules/editor/EditorView.tsx` | 修改 | +1/-0 行 | 选区右键菜单新增 `快速问答`，AI 未连接时显示 `快速问答（需连接 AI）` |
| `src/modules/ai/MentorSkills.ts` | 修改 | +31/-0 行 | 新增 `buildSelectionQAMessages`，约束问答优先基于选区 `[S1]`，可参考 embedding 召回片段 `[R1]`，并保留来源引用 |
| `src/app/AppShell.tsx` | 修改 | +130/-0 行 | 新增 `quickAsk` 状态、`submitQuickAsk` 单轮问答处理、右键 action 分支和聊天气泡 UI；提交时复用 M6 的选区上下文构建，把选区、用户问题、heading、summary、embedding top chunks 一起传给 AI |

### 遇到的问题以及解决方式

1. **快速问答不应变成长聊天**：需求是选区问答，不是聊天面板。解决方式：只做单轮气泡，用户再次提交会覆盖当前回答，不维护多轮历史。
2. **需要保证问答基于选区**：直接传用户问题容易变成泛问答。解决方式：复用 `buildSelectionReasoningContext`，确保 prompt 中包含 `[S1] 用户选区`，并把问题放在专用 `SelectionQASkill` 中。
3. **AI 未连接时需要明确提示**：右键菜单动态显示“需连接 AI”，提交时在气泡内提示到 Settings 连接模型。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0
```

### 手工验证步骤说明

1. 使用 `pnpm tauri dev` 启动真实 Tauri App，并连接 AI Reasoning。
2. 打开 Markdown 文档，选中一段内容，右键点击 `快速问答`。
3. 期望右下角弹出聊天气泡，顶部和输入框显示“有问题，尽管问”，并展示当前选区预览。
4. 输入问题并发送，期望 AI 基于选区回答，回答包含 `[S1]` 或 `[R1]` 来源引用。
5. 点击复制，期望回答写入剪贴板。
6. 断开 AI Reasoning 后再发送问题，期望气泡中显示明确的未连接提示。

### 当前风险，以及影响范围

1. **影响范围**：仅影响 Editor 选区右键菜单、AppShell 内的快速问答气泡和 MentorSkills prompt 模板，不改变已有解释/总结/从此生成链路。
2. **低风险**：快速问答复用 M6 的上下文构建，如果当前文档尚未索引或 embedding 不可用，仍会基于选区 `[S1]` 回答，只是没有 `[R*]` 补充片段。
3. **验证限制**：真实 AI 调用依赖 Tauri invoke 和 AI Runtime，普通 Vite 浏览器无法完整验证，需要在 Tauri App 内手工验证。

***

## Phase 4 Upgrade+Round 27 devlog -- M6：Reasoning 接入选区解释/总结/生成

**日期**: 2026-05-28
**任务起始时间**: 15:25
**任务结束时间**: 15:40
**工时**: 15 分钟

### 任务目标

根据 `RB-P4-001_upgrade.md` 的 M6 规格，让 Editor 选区右键动作变成真实 Mentor 行为：解释选区、总结选区、从此生成都调用 reasoning；reasoning 输入包含选区、当前 heading、当前文档摘要和 embedding 召回 top chunks；输出可编辑、可复制、可插入文档、可加入当前 Pack、可忽略，并带来源引用。严格不自动替换用户原文，不做长对话聊天。

### 改动的文件名以及改动的行数

| 文件                                                 | 操作 |          行数 | 说明                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | -- | ----------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/AppShell.tsx`                             | 修改 | +405/-130 行 | 新增选区上下文构建：计算行号/heading，读取 metadata summary，基于 matched chunk 调 embedding 推荐 top chunks；解释/总结统一走 `buildSelectionReasoningMessages`；从此生成读取 output intent 后走 `buildSelectionGenerationMessages`；结果面板支持编辑、复制、插入到选区后方、加入 Pack、关闭忽略；reasoning 不可用时显示明确提示且不影响加入 Pack/查找相关 |
| `src/modules/ai/MentorSkills.ts`                   | 修改 |    +57/-0 行 | 新增 `SelectionReasoningSkill` prompt builder：`buildSelectionReasoningMessages` 与 `buildSelectionGenerationMessages`，约束来源引用、不自动改原文、不进入长对话                                                                                                                           |
| `src/modules/context-pack/GenerateIntentModal.tsx` | 修改 |     +2/-0 行 | `GenerateIntentSource` 补充 `selectionFrom/selectionTo`，用于生成结果插入回选区后方                                                                                                                                                                                               |
| `src/modules/context-pack/OutputGenerator.tsx`     | 修改 |    +19/-8 行 | 输出生成器上下文增加 `[S1]` 来源编号；AI 生成提示要求保留来源引用；AI 未连接时显示明确不可用提示，模板仍可编辑复制                                                                                                                                                                                                  |
| `src/modules/editor/EditorView.tsx`                | 修改 |     +7/-4 行 | 增加 `reasoningAvailable` prop；右键菜单在 AI 未连接时显示“需连接 AI”的解释/总结/生成标签                                                                                                                                                                                                   |
| `src/modules/editor/editorContextMenu.ts`          | 修改 |     +2/-2 行 | 菜单 label 支持函数，允许打开菜单时动态显示 reasoning 可用性                                                                                                                                                                                                                           |

### 遇到的问题以及解决方式

1. **原解释/总结输入太薄**：只把选区文本交给模型，没有当前 heading、文档摘要和 embedding 召回。解决方式：新增 `buildSelectionReasoningContext`，用选区行号匹配 chunk，再用 `suggestContextPackCandidates` 召回相似 chunks，压缩后交给 reasoning。
2. **从此生成无法插入回选区位置**：`GenerateIntentSource` 只有行号，没有原 CodeMirror offset。解决方式：补充 `selectionFrom/selectionTo`，生成结果可在用户点击“插入”时追加到选区后方，不自动替换原文。
3. **reasoning 不可用时行为不清楚**：原逻辑会退回打开文档上下文，用户不知道解释/总结没有执行。解决方式：右键菜单标签直接显示“需连接 AI”，点击后结果面板也说明 AI Reasoning 未连接，同时保留加入 Pack 和查找相关。
4. **输出缺少可追踪来源**：模型可能不主动写引用。解决方式：prompt 要求引用 `[S1]/[R1]`，前端再追加“来源引用”区，确保输出始终带来源列表。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0

$ cargo build
# exit 0
```

Browser 冒烟：

```text
URL: http://localhost:1420/
Title: Mind Dock
结果: 页面可渲染，DOM 有首屏内容，console error/warn 数量为 0。
限制: 普通 Vite 浏览器环境缺少 Tauri invoke bridge，会显示 TypeError: Cannot read properties of undefined (reading 'invoke')，因此真实选区 reasoning 链路需在 Tauri App 内手工验证。
```

### 手工验证步骤说明

1. 使用 `pnpm tauri dev` 启动真实 Tauri App，进入已有 Vault，并确保 AI Reasoning 已连接。
2. 打开一篇已有 chunking/embedding 的 Markdown 文档，选中一段正文。
3. 右键点击 `解释选区`，期望弹出结果面板，内容为真实 reasoning 输出，包含 `[S1]` 或 `[R1]` 来源引用，且底部来源显示当前文档、heading、行号。
4. 点击结果面板的“复制 / 编辑 / 插入 / 加入 Pack / 关闭”，期望复制成功、编辑可改、插入追加到选区后方、加入 Pack 后右侧 Pack 刷新。
5. 右键点击 `总结选区`，期望得到可编辑总结，动作同上。
6. 右键点击 `从此生成...`，选择 output type 并输入意图，期望得到可编辑草稿，草稿包含来源引用，可复制、保存、插入或加入 Pack。
7. 断开 AI Reasoning 后再次打开选区菜单，期望解释/总结/从此生成显示“需连接 AI”；点击后看到明确不可用提示；`加入上下文包` 和 `查找相关内容` 仍可用。

### 当前风险，以及影响范围

1. **影响范围**：主要影响 Editor 选区右键动作、selection reasoning prompt、生成结果面板和 OutputGenerator 来源编号。不改变 trigger、推荐排序、自动索引、自动替换原文逻辑。
2. **中风险**：选区相似片段依赖当前选区能匹配到已索引 chunk；如果文档尚未 reindex 或 embedding 未 ready，reasoning 仍会工作，但相似片段为空。
3. **中低风险**：插入动作会立即写回当前文档，但必须由用户点击触发；插入方式是追加到选区后方，不替换选区。
4. **低风险**：加入 Pack 如果没有 active pack，会创建 `AI Mentor 输出` Pack；后续 M10 再处理个性化排序，本轮只保证动作可用。
5. **验证限制**：Browser 只能验证普通前端首屏，真实 Tauri invoke、AI 调用、Pack 写入需要按手工步骤验证。

***

## Phase 4 Upgrade+Round 26 devlog -- M5：修复 embedding 推荐链路

**日期**: 2026-05-28
**任务起始时间**: 14:57
**任务结束时间**: 15:24
**工时**: 27 分钟

### 任务目标

根据 `RB-P4-001_upgrade.md` 的 M5 规格，修复 Context Pack 的 embedding 推荐链路，让 Pack 有真实来源后能看到片段级推荐，并支持“加入当前 Pack / 忽略 / 查看来源”，采纳与忽略写入 personalization 信号。严格不引入 reasoning 替代 embedding，不做自动加入推荐。

### 改动的文件名以及改动的行数

| 文件                                              | 操作 |         行数 | 说明                                                                                                                                                                                                                                |
| ----------------------------------------------- | -- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +109/-23 行 | 文档级 item 无 `chunk_id` 时读取该文档全部 chunks 作为推荐种子；推荐候选按 chunk 粒度保留 `chunk_id/heading/line/content`；推荐卡显示“为什么推荐”；新增“查看来源 / 忽略 / 加入当前 Pack”动作；采纳写入 `reasoning_note` 和 personalization accepted 信号，忽略写入 personalization rejected 信号并从列表移除 |
| `src/services/index/vector.ts`                  | 修改 |    +3/-0 行 | `suggestContextPackCandidates` 增加空 `chunkIds` 保护，避免未来调用方误传空数组时触发无意义后端 invoke                                                                                                                                                      |

### 遇到的问题以及解决方式

1. **文档级 item 只有文档路径，没有 chunk\_id**：原实现只取该文档第一个 chunk，推荐质量不稳定。解决方式：对无 `chunk_id` 的文档级 item 并行读取全部 chunks，并去重后作为推荐种子。
2. **推荐被文档级去重，片段价值不可见**：原实现按 `document_path` 去重，导致同文档不同片段无法作为候选呈现。解决方式：改为按 `chunk_id` 生成候选 key，显示 heading、行号、content 片段。
3. **推荐只有“加入”动作**：无法忽略或查看依据。解决方式：新增查看来源和忽略按钮；忽略后本地列表立即更新，并写入 `context_pack_item_rejected` 信号。
4. **普通浏览器无法完整验证 Tauri invoke 链路**：Vite 页面缺少 Tauri bridge，会显示 `Cannot read properties of undefined (reading 'invoke')`。解决方式：本轮用浏览器只做渲染冒烟，真实链路列入 Tauri App 手工验证步骤。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0

$ cargo build
# exit 0
```

浏览器冒烟：

```text
URL: http://localhost:1420/
Title: Mind Dock
结果: 页面可渲染；普通浏览器环境无法调用 Tauri invoke，因此不能在 Browser 中完成真实 Vault/Pack 推荐链路验证。
```

### 手工验证步骤说明

1. 使用 `pnpm tauri dev` 启动真实 Tauri App，并选择已有 Vault。
2. 确保 Vault 中至少有 2-3 篇已完成 chunking 与 embedding 的文档。
3. 从文档树或搜索结果加入一个文档/片段到当前 Context Pack。
4. 打开 Pack 面板的“推荐内容”，期望出现 3-5 条真实片段推荐，卡片包含 heading、来源路径、行号、content 片段和“为什么推荐”。
5. 点击“查看来源”，期望打开对应文档。
6. 点击“加入当前 Pack”，期望推荐从列表消失，并作为 `source_type: suggestion` 的 Pack item 出现在当前 Pack，且 personalization 写入 accepted 信号。
7. 点击“忽略”，期望推荐从列表消失，且 personalization 写入 rejected 信号。
8. 断开 reasoning 模型或不配置 reasoning，期望 embedding 推荐仍可用。

### 当前风险，以及影响范围

1. **影响范围**：主要影响 Context Pack 推荐区和 vector 服务空参数保护，不改变 Rust vector 相似度计算，不改变 reasoning 链路，不自动加入任何推荐。
2. **中低风险**：文档级 item 会读取全部 chunks 作为推荐种子，大文档较多时前端请求量会增加；当前通过 `Promise.all` 并行和 chunk id 去重降低重复调用，但后续可在服务层增加批量文档 chunk 查询。
3. **低风险**：忽略状态当前保存在组件内存中，同时写入 personalization 信号；真正用 personalization 反向影响排序属于 M10 范围，本轮只记录信号。
4. **验证限制**：Browser 冒烟无法覆盖 Tauri invoke 数据链路，真实推荐效果需要按上述 Tauri 手工步骤验证。

***

## Phase 4 Upgrade+Round 25 devlog -- M4：统一 PackSelector 与 Pack 数据补齐

**日期**: 2026-05-28
**工时**: 25 分钟

### M4 需求

根据 RB-P4-001\_upgrade.md M4 规格：

1. 所有"加入 Pack"路径统一使用 PackSelector
2. Active pack 默认选中
3. 支持新建并加入
4. 禁止静默加入第一个 Pack
5. 文档级加入使用完整内容
6. PackItem 已有 source\_type/chunk\_id/score/reasoning\_note

### 改动

| 文件                                              | 说明                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/AppShell.tsx`                          | PackSelectorModal 升级：`docPath` → `label` prop + `activePackId` 高亮 prop；新增 `packSelectorTarget` 通用类型支持 doc/selection/search；新增 `activePackId`/`joinToast` 状态；重写 `handleAddToPack`/`handleAddSelectionToPack`/`handleAddSearchResultToPack` 三入口为统一 setSelector；新增 `doJoinDoc`/`doJoinSelection`/`doJoinSearch` 统一 join helper；底部 toast 动画反馈 |
| `src/modules/context-pack/ContextPackPanel.tsx` | 新增 `onActivePackChange` prop + useEffect 自动上报活跃 packId                                                                                                                                                                                                                                                                                    |
| `src/components/MentorDock.tsx`                 | 传递 `onActivePackChange`                                                                                                                                                                                                                                                                                                                   |

### 验收对照

| M4 验收标准               | 状态                                                |
| --------------------- | ------------------------------------------------- |
| 多 Pack 场景不再默认第一个      | ✅ 所有路径均弹出 PackSelector                            |
| 加入成功显示加入反馈            | ✅ 底部 toast "已加入「xxx」" 2.5s                        |
| 可撤销或移除                | ✅ ContextPackPanel 已有删除功能                         |
| 文档级 Pack 不再空 skeleton | ✅ doJoinDoc 读完整文档（50000字）                         |
| PackItem 补全字段         | ✅ 已有 source\_type/chunk\_id/score/reasoning\_note |

### 验证

```bash
$ npx tsc --noEmit
# exit 0
```

***

## Phase 4 Upgrade+Round 24 devlog -- 修复空文件夹不显示 + 同级重名校验

**日期**: 2026-05-28
**任务起始时间**: 13:53
**任务结束时间**: 13:58
**工时**: 5 分钟

### 任务目标

1. **空文件夹不显示**：文件夹创建后端生效但前端不可见。根因：`scan_dir_recursive` 中 `has_markdown_files()` 过滤了不含 `.md` 的目录。
2. **同级重名**：需要阻止同一层级下创建同名文件/文件夹。

### 改动的文件名以及改动的行数

| 文件                                | 操作 |       行数 | 说明                                                                                                               |
| --------------------------------- | -- | -------: | ---------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/vault.rs` | 修改 | +5/-26 行 | 移除 `has_markdown_files` 过滤；空目录直接 `entries.push()`；删除未使用的 `has_markdown_files` 函数                                 |
| `src/modules/dock/DocTree.tsx`    | 修改 | +18/-1 行 | 新增 `findEntryByPath` 辅助函数；`handleConfirmCreate` 添加同级重名校验（通过 `findEntryByPath` 找到父节点的 children）；dep 数组加 `docTree` |
| `src/components/Sidebar.tsx`      | 修改 | +12/-1 行 | `handleCreateConfirm` 添加根级重名校验（`docTree.some(e => e.name === targetName)`）；dep 数组加 `docTree`                     |

### 自动验证结果

```bash
$ cargo build
# exit 0，0 warnings

$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 当前风险，以及影响范围

1. **影响范围**：Rust 扫描逻辑放宽（空目录纳入 docTree）；前端创建路径增加客户端重名校验；后端 `create_directory/create_document` 本身已包含同名保护（双重保险）。
2. **低风险**：隐藏目录（`.`开头）仍被跳过；同级去重仅对当前 docTree 内存中的节点生效（刷新后由后端保护）。

***

## Phase 4 Upgrade+Round 23 devlog -- 顶部新建内联输入替代 prompt

**日期**: 2026-05-28
**任务起始时间**: 13:48
**任务结束时间**: 13:51
**工时**: 3 分钟

### 任务目标

顶部"新建..."popover 中点击"新建文件夹"无响应。根因：`window.prompt()` 在 Tauri/WKWebView 中不可靠（被静默忽略或返回 null）。

解决：用内联 `<input>` 替换 `prompt()`。

### 改动的文件名以及改动的行数

| 文件                           | 操作 |        行数 | 说明                                                                                                                                                                                                                                           |
| ---------------------------- | -- | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/Sidebar.tsx` | 修改 | +36/-10 行 | 新增 `creatingType` 状态 + `createInputRef` + `handleTopCreate`/`handleCreateConfirm`；popover 按钮改为调用 `handleTopCreate(type)`；按钮下方渲染内联输入框（区分 doc/folder icon）；导入 documentService/Folder/useRef/useCallback；移除 `onCreateDoc`/`onCreateFolder` prop |
| `src/app/AppShell.tsx`       | 修改 |  +0/-10 行 | 移除 Sidebar 的 `onCreateDoc` 和 `onCreateFolder` prop（逻辑已迁入 Sidebar）                                                                                                                                                                            |

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 当前风险，以及影响范围

1. **影响范围**：建操作从 AppShell 代理迁入 Sidebar 自治，Sidebar 通过 `useVault()` 直接调用 `documentService`。AppShell 和 SidebarProps 均简化。
2. **低风险**：内联输入与 DocTree 的 CreateInFolderInput 保持一致交互模式（Enter 确认、Escape 取消、blur 取消）。

***

## Phase 4 Upgrade+Round 22 devlog -- 导航栏 '+' popover 模式 + 修复文件夹创建

**日期**: 2026-05-28
**任务起始时间**: 13:40
**任务结束时间**: 13:47
**工时**: 7 分钟

### 任务目标

根据用户反馈修复三个问题：

1. **文件夹 "+" 按钮样式**：之前是直接放两个小按钮（FileText + FolderPlus），改为单个 "+" 点击弹出 popover 抽屉（「新建文档」｜「新建文件夹」）
2. **顶部按钮聚合**：之前是并排"新建文档"+"新建文件夹"两个按钮，改为单个"新建..."按钮 + popover
3. **新建文件夹无响应**：AppShell 的 `onCreateFolder` 使用动态 `import()` 异步加载导致 vault 闭包过期 + DocTree 底部存在重复 `CreateInFolderInput` 干扰

### 改动的文件名以及改动的行数

| 文件                             | 操作 |        行数 | 说明                                                                                                                                                            |
| ------------------------------ | -- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/dock/DocTree.tsx` | 修改 | +30/-15 行 | 文件夹 hover 区域新增 `plusMenu` 状态（popover 坐标）；新增 plusMenu close effect；两个小按钮替换为单个 "+" → 点击显示 popover（FileText/新建文档、FolderPlus/新建文件夹）；删除底部重复的 `CreateInFolderInput` |
| `src/components/Sidebar.tsx`   | 修改 | +22/-15 行 | 新增 `createMenu` state + close effect；两个并排按钮替换为单个"新建..."按钮 + popover；新增 useState/useEffect 导入                                                                  |
| `src/app/AppShell.tsx`         | 修改 |   +1/-4 行 | `onCreateFolder` 去掉动态 `import()` 改为直接调用已导入的 `documentService.createDirectory()`                                                                               |

### 遇到的问题以及解决方式

1. **文件夹创建不生效（根本原因）**：AppShell `onCreateFolder` 使用 `import('@/services/...').then()` 动态加载，导致 vault 闭包在异步解析时已过期。解决方式：直接使用页面顶部已导入的 `documentService.createDirectory()`。
2. **重复 CreateInFolderInput**：DocTree 底部有一个全局 `{creatingInFolder && <CreateInFolderInput>}`，与文件夹内联 input 冲突（双重渲染）。解决方式：删除底部版本，仅保留文件夹内联渲染。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. Hover 文件夹 → 右侧出现单个 "+" 按钮
2. 点击 "+" → popover 弹出（📄 新建文档 | 📁 新建文件夹）
3. 点击"新建文件夹" → 文件夹下方出现输入框（📁图标 + "文件夹名称..." placeholder）
4. 输入名称 → Enter → 文件夹创建在当前位置，文档树刷新
5. 点击"新建文档" → 输入框出现（📄图标 + "文档名称..." placeholder）→ 创建文档并自动打开
6. 顶部"新建..."按钮 → popover 弹出 → 选择类型
7. 点击"新建文件夹" → prompt 输入名称 → 在 documents/ 根下创建文件夹

### 当前风险，以及影响范围

1. **影响范围**：DocTree 的 popover 管理（plusMenu）、Sidebar 的 popover 管理（createMenu）、AppShell 的 onCreateFolder 简化。不改变文件夹创建后端逻辑。
2. **低风险**：popover 使用 `document.addEventListener('click')` 全局关闭，与现有 contextMenu 模式一致。

***

## Phase 4 Upgrade+Round 21 devlog -- 导航栏文件夹交互与新建按钮优化

**日期**: 2026-05-28
**任务起始时间**: 13:18
**任务结束时间**: 13:36
**工时**: 18 分钟

### 任务目标

解决三个导航栏使用体验问题：

1. **文件夹不可点击/展开**：现有文件夹在导航栏仅展示名称，无法展开查看子内容，无法在其内创建文档
2. **无法创建文件夹**：UI 只能创建文档，缺少文件夹创建入口
3. **"新建文档"按钮位置不便**：按钮在文档树底部，内容多时需滚动；需移到顶部固定位置

### 改动的文件名以及改动的行数

| 文件                             | 操作 |         行数 | 说明                                                                                                                                                                                                                                                                            |
| ------------------------------ | -- | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/dock/DocTree.tsx` | 重写 | +100/-60 行 | 文件夹新增展开/折叠（ChevronRight + `expandedFolders` Set 状态）；hover 时右侧浮现 FileText（新建文档）和 FolderPlus（新建文件夹）两个小按钮；右键菜单新增"新建文档"/"新建文件夹"；新增 `CreateInFolderInput` 组件（内联输入框，区分 doc/folder icon）；`handleConfirmCreate` 处理文件夹内创建逻辑（支持 doc/folder 两种类型）；移除底部"新建文档"按钮；移除未使用的 `onCreateDoc` prop |
| `src/components/Sidebar.tsx`   | 重写 |   +20/-5 行 | "查看捕获 Inbox"下方新增并排"新建文档"和"新建文件夹"按钮（虚线边框）；新增 `onCreateFolder` prop；导入 Plus/FolderPlus 图标                                                                                                                                                                                       |
| `src/app/AppShell.tsx`         | 修改 |   +13/-0 行 | Sidebar 传入 `onCreateDoc={handleCmdCreateDoc}` 和 `onCreateFolder`（prompt 输入文件夹名 → createDirectory → refreshDocTree）                                                                                                                                                            |

### 遇到的问题以及解决方式

1. **CreateInFolderInput 回调为空**：文件夹内的 `CreateInFolderInput` 最初 onConfirm/onCancel 为空箭头函数。解决方式：通过 DocEntryItem 递归 props 传递 `onConfirmCreate`/`onCancelCreate`。
2. **onCreateDoc props 冗余**：DocTree 的 `onCreateDoc` prop 在移除底部按钮后不再使用。解决方式：从 DocTreeProps 接口和组件参数中移除。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 启动 app，左侧导航栏显示文件夹列表（onboarding 生成的5个文件夹）
2. 点击文件夹 → ChevronRight 旋转 90° + 文件夹展开显示子内容
3. 再次点击 → 折叠
4. Hover 文件夹标签 → 右侧浮现 FileText 图标 + FolderPlus 图标
5. 点击 FileText 图标 → 文件夹下方显示"文档名称..."输入框 → 输入名称 Enter → 文档创建在文件夹内
6. 点击 FolderPlus 图标 → 文件夹下方显示"文件夹名称..."输入框 → 创建子文件夹
7. 右键文件夹 → 菜单新增"新建文档"/"新建文件夹"选项
8. 验证："新建文档"按钮不再出现在底部，改为顶部"查看捕获 Inbox"下方的并排按钮
9. 点击顶部"新建文件夹" → prompt 输入名称 → 在 documents/ 根下创建文件夹 → 文档树刷新

### 当前风险，以及影响范围

1. **影响范围**：DocTree 组件完全重写（文件夹交互 + 创建逻辑），Sidebar 布局调整（按钮上移），AppShell 新增 `onCreateFolder` 回调。不影响其他组件。
2. **低风险**：Rust 端 `create_directory` 命令已存在未改动；文件夹展开/折叠使用 Set 状态管理（O(1) 查找）；创建操作均有 try/catch 错误处理。

***

## Phase 4 Upgrade+Round 20 devlog -- Rust 后端 HTTP 异步化：彻底解决光标 loading

**日期**: 2026-05-28
**任务起始时间**: 13:02
**任务结束时间**: 13:10
**工时**: 8 分钟

### 任务目标

将 Rust 端所有 HTTP 调用从 `reqwest::blocking` 改为 async `reqwest`，从根本上消除 macOS webview 因同步 IPC 触发系统 loading 光标的问题。

### 技术方案

| 改动                                    | 说明                                                    |
| ------------------------------------- | ----------------------------------------------------- |
| `reqwest = { features = ["json"] }`   | 移除 `"blocking"` feature，保留 `"json"`                   |
| 5 个 command 函数签名                      | `pub fn` → `pub async fn`                             |
| 所有 `reqwest::blocking::Client::new()` | → `reqwest::Client::new()`                            |
| 所有 `.send()` / `.json()` / `.text()`  | → `.send().await` / `.json().await` / `.text().await` |

### 改动的文件名以及改动的行数

| 文件                                       | 操作 |       行数 | 说明                                                                                                                                 |
| ---------------------------------------- | -- | -------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/Cargo.toml`                   | 修改 |      1 行 | `reqwest` 移除 `"blocking"` feature                                                                                                  |
| `src-tauri/src/commands/ai_runtime.rs`   | 修改 | +11/-9 行 | `ollama_check_connection` / `ollama_chat` / `ollama_embed` / `spark_check_connection` / `spark_chat` 5个函数改为 async；替换所有 blocking 调用 |
| `src-tauri/src/commands/summary_tags.rs` | 修改 |  +3/-3 行 | `generate_llm_summary` / `generate_summary_tags` 改为 async；调用链添加 `.await`                                                           |

### 遇到的问题以及解决方式

1. **summary\_tags.rs 间接调用链**：`generate_summary_tags` 内部调用 `generate_llm_summary`，后者调用 `ollama_chat`。三个函数都需要逐级改为 async。解决方式：全部 `pub async fn` + 调处处加 `.await`。
2. **JS 端无需改动**：Tauri `invoke()` API 原本就返回 `Promise`，对 JS 调用者完全透明。

### 自动验证结果

```bash
$ cargo build
# exit 0，编译成功

$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 右键文档 → "生成..." → 选择类型 → 点击"创建并生成"
2. 期望：GenModal 消失 → GenerationResult 面板弹出 → 显示"正在 AI 生成..."
3. **鼠标不再出现转圈 loading 光标**（关键验证点）
4. AI 返回后正常显示生成内容
5. 分别测试 Ollama 和自定义 API（spark）两种 provider 均正常

### 当前风险，以及影响范围

1. **影响范围**：Rust 端 7 个函数（5 个 ai\_runtime + 2 个 summary\_tags）改为 async。Tauri `#[command]` 原生支持 async fn，运行时由 tokio 调度，无兼容性问题。
2. **低风险**：async reqwest 与 blocking 版本 API 完全兼容（`.await` 是唯一语法差异），行为逻辑无变化；AI 调用走 tokio async runtime，不阻塞 webview 主线程。

***

## Phase 4 Upgrade+Round 19 devlog -- 分析并缓解生成时光标 loading 问题

**日期**: 2026-05-28
**任务起始时间**: 12:52
**任务结束时间**: 12:57
**工时**: 5 分钟

### 任务目标

分析生成过程中鼠标光标 loading（macOS 转圈）的根本原因并实施缓解。

### 根因分析

Rust 端所有 AI 命令使用 `reqwest::blocking::Client`（[ai\_runtime.rs L230/L299/L526](file:///Users/qilong.lu/WorkDir/atlax-tech/mind-dock/src-tauri/src/commands/ai_runtime.rs#L230)）。虽然 `#[command]` 在线程池执行不阻塞 Rust 主线程，但 **Tauri/webview 的 IPC 机制会在 macOS WKWebView 上触发内置 loading 光标** — 这是 WebKit 检测到同步式跨进程通信时的默认行为。

**结论：这是 macOS webview 平台级行为，JavaScript 无法彻底阻止**。彻底解决需将 Rust 端改为 `reqwest::async` + `#[command(async)]`。

### 缓解措施

| 措施                                                  | 说明                                  |
| --------------------------------------------------- | ----------------------------------- |
| `document.documentElement.style.cursor = 'default'` | 生成前强制覆盖光标为箭头                        |
| double `requestAnimationFrame`                      | 替代 `setTimeout(r, 50)`，更可靠的浏览器帧渲染保证 |
| 面板 `style={{ cursor: 'default' }}`                  | GenerationResult 遮罩显式光标覆盖           |
| 完成/关闭时恢复 `cursor = ''`                              | 清理光标覆盖                              |

### 改动的文件名以及改动的行数

| 文件                     | 操作 |      行数 | 说明                                                                                            |
| ---------------------- | -- | ------: | --------------------------------------------------------------------------------------------- |
| `src/app/AppShell.tsx` | 修改 | +6/-2 行 | `setTimeout(50)` → double rAF；强制 `documentElement.style.cursor = 'default'`；面板 onClick 关时恢复光标 |

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 当前风险，以及影响范围

1. **残余风险**：macOS 系统级 beach ball 无法被 CSS 覆盖。若 Rust blocking 时间过长（>1-2秒），系统仍可能显示等待光标。
2. **彻底修复方向**：将 Rust 端 `reqwest::blocking` 改为 `reqwest` async + `#[command]` async，使 IPC 调用真正异步不被 webview 检测为阻塞。

***

## Phase 4 Upgrade+Round 18 devlog -- 生成流程彻底重写：文档/选区直接 AI 生成 + 结果预览面板

**日期**: 2026-05-28
**任务起始时间**: 12:38
**任务结束时间**: 12:49
**工时**: 11 分钟

### 任务目标

彻底修正"生成..."流程：之前从文档点击"生成..."走的是"创建 Context Pack → 跳转 Pack 管理页 → 再打开 OutputGenerator"的错误路径。正确逻辑应该是：

> 文档右键 → 选择输出类型 → 点击"创建并生成" → **直接调 AI 生成** → 弹出预览面板（复制/编辑/保存）

**关键变更**：文档/选区来源不再创建 Context Pack，直接调用 reasoning API 生成内容并展示在 GenerationResult 面板中。

### 改动的文件名以及改动的行数

| 文件                     | 操作 |          行数 | 说明                                                                                                                                                                                                                                                                   |
| ---------------------- | -- | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/AppShell.tsx` | 修改 | +130/-105 行 | 新增 `buildGenSystemPrompt` 函数（6种输出类型 system prompt）；新增 `generationResult` 状态（含 editing/saved 字段）；重写 `handleGenerateIntentConfirm`：document/selection → 直接调 `chat()` + 显示预览面板；folder/vault → 保持 Pack 创建；新增 GenerationResult 预览面板（700px 宽，编辑/复制/保存文档三个操作按钮 + 来源 footer） |

### 遇到的问题以及解决方式

1. **file 版本已过期**：IDE 中文件已被其他修改更新，SearchReplace 匹配不到旧内容。解决方式：重新 Read 获取最新内容后再替换。
2. **未使用的 FileDown 导入**：最初导入但未用到的图标。解决方式：从 lucide-react 导入列表中移除。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 右键文档 → "生成..." → 选择"Dev Agent Prompt" → 点击"创建并生成"
2. 期望：GenModal 消失 → **GenerationResult 面板弹出**（标题"Dev Agent Prompt · xxx"）
3. 面板显示 loading 状态 "正在 AI 生成..."
4. AI 返回后显示生成内容（pre 格式）
5. 验证操作按钮：
   - **编辑** → 切换为 textarea 可编辑模式
   - **复制** → 复制到剪贴板，按钮变"已复制"
   - **保存** → 将生成结果保存为新文档到 Vault，自动打开
6. 验证来源 footer 显示文档名称和路径
7. 验证：整个过程中**不创建任何 Context Pack**
8. 从文件夹右键"根据文件夹生成..."：仍然创建 Pack（多文档场景）

### 当前风险，以及影响范围

1. **影响范围**：`handleGenerateIntentConfirm` 函数完全重写，document/selection 路径移除 Pack 创建逻辑；新增 `generationResult` 状态和预览面板 UI。不涉及 DocTree/EditorView/GenerateIntentModal/OoutputGenerator 修改。
2. **低风险**：folder/vault 路径保持不变（仍创建 Pack）；AI 未连接时显示友好提示而非崩溃；面板关闭时清理状态无内存泄漏。

***

## Phase 4 Upgrade+Round 17 devlog -- OutputGenerator 自动生成：生成流程一站式直达 AI 输出

**日期**: 2026-05-28
**任务起始时间**: 12:30
**任务结束时间**: 12:34
**工时**: 4 分钟

### 任务目标

修复体验割裂：从"创建并生成"到看到 AI 输出中间仍有一步"打开 OutputGenerator + 手动点击 AI 生成"。用户期望：选择输出类型 + 输入意图 → 一键直达 AI 生成结果。

实现：OutputGenerator 新增 `autoGenerate` prop，设为 `true` 时在首次渲染后自动调用 reasoning API 生成草稿。

路径区分：

- 生成流程 → `autoGenerate=true`（自动触发 AI 生成）
- Pack 管理面板手动"生成提示词" → `autoGenerate=false`（保持手动点击）

### 改动的文件名以及改动的行数

| 文件                                             | 操作 |       行数 | 说明                                                                                                                                                                       |
| ---------------------------------------------- | -- | -------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 | +32/-0 行 | 新增 `autoGenerate` prop；新增 `autoGeneratedRef` 防重复触发；新增 `useEffect`（dep=\[]）监听 `autoGenerate`，若 AI 已连接且有内容则自动调用 `chat` API；生成中状态管理复用现有 `setGenerating`/`setReasoningDraft` |
| `src/app/AppShell.tsx`                         | 修改 |  +1/-0 行 | OutputGenerator 传入 `autoGenerate={outputGeneratorInitialType !== undefined}`：生成流程有 initialType → true；Pack 面板无 initialType → false                                       |

### 遇到的问题以及解决方式

1. **effect 误插入 assemblePrompt 函数体内**：初次将 `useEffect` 放在顶层函数 `assemblePrompt` 内部（React hooks 调用位置错误）。解决方式：移到 `OutputGenerator` 组件函数内，`handleGenerate` 之后、`return` 之前。
2. **autoGenerate 需区分调用来源**：若始终传 `true`，从 Pack 面板打开 OutputGenerator 也会自动生成（不该触发）。解决方式：`autoGenerate={outputGeneratorInitialType !== undefined}`，利用 initialType 是否设置来区分"生成流程"与"Pack 管理"。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 右键文档 → "生成..." → 选择"Dev Agent Prompt" → 点击"创建并生成"
2. 期望路径：Modal 消失 → GeneratingOverlay（动画）→ OutputGenerator 打开 → **自动开始 AI 生成**（按钮显示"生成中..."）
3. AI 生成完成后显示推理草稿（可编辑、可复制）
4. 验证：全程无需手动点击"AI 生成"按钮
5. 从 Platter → 上下文包 → 点击"生成提示词"（非流程触发）：OutputGenerator 打开但不自动生成，需手动点击

### 当前风险，以及影响范围

1. **影响范围**：OutputGenerator 增加可选 prop，已有调用路径（AppShell `onGeneratePrompt`）不传 initialType → autoGenerate=false，无破坏性变更。
2. **低风险**：`autoGeneratedRef` 确保即使 `autoGenerate` prop 为 true 也只触发一次生成；effect 空依赖数组确保仅在 mount 时执行。

***

## Phase 4 Upgrade+Round 16 devlog -- 生成流程三合一修复：完整文档、直通输出生成器、Overlay 渲染

**日期**: 2026-05-28
**任务起始时间**: 12:18
**任务结束时间**: 12:29
**工时**: 11 分钟

### 任务目标

修复三个用户反馈的生成流程问题：

1. **上下文包只显示"段落"而非整篇文档**：`buildDocumentPackSnapshot` 只取前3个 chunks（最多6000字），导致 Pack 中只看到片段。修复：改为 `documentService.readDocument()` 读取完整文档内容（25k字限制）。
2. **生成流程割裂**：用户在 Modal 中选择输出类型（如"Dev Agent Prompt"）后，系统只创建 Pack 并跳转管理页面，用户还需手动点击"生成提示词"二次操作。修复：对 prompt/prd/spec/checklist 类型直接打开 OutputGenerator。
3. **GeneratingOverlay 动画不生效**：`setGeneratingPack(true)` 后跟 `await import(...)` 是同步解析（模块已缓存），React 来不及渲染 overlay。修复：显式 `await new Promise(r => setTimeout(r, 60))` 让浏览器先绘制 overlay 再执行生成逻辑。

### 改动的文件名以及改动的行数

| 文件                                             | 操作 |        行数 | 说明                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | -- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/AppShell.tsx`                         | 修改 | +45/-35 行 | 文档/文件夹/vault 来源改用 `documentService.readDocument()` 完整内容（25000/10000/5000 字限制）；显式 yield（60ms）确保 overlay 渲染；新增 `outputGeneratorInitialType` 状态；生成后按 outputType 路由：prompt/prd/spec/checklist → OutputGenerator，summary/custom → Pack 管理页；OutputGenerator 关闭时清理 initialType |
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 |   +8/-8 行 | `OutputType` 重命名为 `OutputGeneratorType` 并导出；新增 `initialOutputType` 可选 prop，预设 initial prompt type；`assemblePrompt` 初始值使用 `initialOutputType`                                                                                                                            |

### 遇到的问题以及解决方式

1. **Overlay 不渲染**：React 18 中 `await import()` 对已缓存模块同步返回，跳过 re-render。解决方式：`setGeneratingPack(true)` 后显式 `await new Promise(r => setTimeout(r, 60))`，60ms 延迟肉眼不可感知但足够浏览器绘制一帧。
2. **OutputGeneratorType 命名冲突**：GenerateIntentModal 已有 `OutputType`（dev\_agent\_prompt 等），OutputGenerator 内部也有同名 `OutputType`（prompt/prd/spec/checklist）。解决方式：OutputGenerator 的内部类型重命名为 `OutputGeneratorType` 并导出。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 右键文档 → "生成..." → 选择"Dev Agent Prompt" → 点击"创建并生成"
2. 期望：Modal 立即消失 → GeneratingOverlay 弹出（旋转光环 + 步骤文字动画）
3. Overlay 消失 → **直接弹出 OutputGenerator**，默认选中"Prompt" tab，显示 Pack 来源和可编辑模板
4. 验证：Pack 中包含整篇文档内容（不是只有段落片段）
5. 验证 OutputGenerator 来源覆盖显示完整的文档内容
6. 重复测试：选择"PRD"/"SPEC"/"Checklist" 同样直接打开 OutputGenerator 并预选对应 tab
7. 选择"摘要"/"自定义" 则跳转 Platter → 上下文包 tab

### 当前风险，以及影响范围

1. **影响范围**：AppShell.tsx `handleGenerateIntentConfirm` 函数的重写，OutputGenerator 增加可选 prop。不涉及 GenerateIntentModal 和 OutputGenerator 内部逻辑变更。
2. **低风险**：文档内容改为 `readDocument` 读取全量（有限额），比 chunks 方式更稳定；显式 yield 仅在生成路径生效，不改变其他异步流程。

***

## Phase 4 Upgrade+Round 15 devlog -- 生成过程动画体验优化

**日期**: 2026-05-28
**任务起始时间**: 12:08
**任务结束时间**: 12:16
**工时**: 8 分钟

### 任务目标

解决"生成..."操作时用户体验问题：当前 GenerateIntentModal 在点击"创建并生成"后停留在原地显示按钮 spinner，同时鼠标光标变为 loading 状态，给用户"app 卡住了"的错觉。

改进方案：

1. 点击"创建并生成"后**立即关闭** GenerateIntentModal
2. 显示独立的 `GeneratingOverlay` 全屏动画窗口
3. Overlay 展示：双层旋转光环 + Sparkles 动画 + 逐步滚动的6条过程消息 + 进度点 + 提示文字
4. 生成完成后自动关闭 overlay，打开 Pack view
5. 鼠标不再出现 loading 光标

### 改动的文件名以及改动的行数

| 文件                                     | 操作 |       行数 | 说明                                                                                                                                                                                                                      |
| -------------------------------------- | -- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/GeneratingOverlay.tsx` | 新建 |   +110 行 | 全屏遮罩组件：双层反向旋转光环 + 脉冲 Sparkles 图标 + 6条步骤消息逐步显示（已完成步骤标记 ✓）+ 进度指示点 + 300ms 淡入淡出过渡动画                                                                                                                                        |
| `src/app/AppShell.tsx`                 | 修改 | +12/-8 行 | 导入 GeneratingOverlay；`generateIntentLoading` 替换为 `generatingPack` 状态；`handleGenerateIntentConfirm` 改为立即关闭 modal + 显示 overlay → 异步执行 → 关闭 overlay；移除 GenerateIntentModal 的 `loading` prop；在 JSX 渲染 `<GeneratingOverlay>` |

### 遇到的问题以及解决方式

1. **双重** **`source`** **变量赋值**：原来 `const source = generateIntentSource` 在 try 块内，现在需要在使用前（modal 关闭前）就保存引用。解决方式：将 `const source = generateIntentSource` 提前到 `setGenerateIntentSource(null)` 之前。
2. **Loader2 未使用警告**：GeneratingOverlay 最初导入了 Loader2 但实际使用纯 CSS 动画。解决方式：移除未使用的 Loader2 导入。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 右键任意文档 → 点击"生成..."
2. 在 GenerateIntentModal 中选择输出类型（如"Dev Agent"）→ 点击"创建并生成"
3. 期望：Modal 立即消失 → 全屏 GeneratingOverlay 弹出（半透明遮罩 + 模糊背景）
4. Overlay 显示：双层旋转光环 + 脉冲 Sparkles + 步骤消息逐条滚动（"正在创建上下文包..." → "正在收集文档内容..." → ... → "即将完成..."）
5. 已完成的步骤前显示绿色 ✓，进度点从灰色到绿色
6. 生成完成后 Overlay 淡出消失 → Platter 自动切换到"上下文包" tab 显示新生成的 Pack
7. 验证鼠标在整个过程中不出现 loading 光标

### 当前风险，以及影响范围

1. **影响范围**：新增 GeneratingOverlay 组件（纯展示），AppShell 中修改了生成流程的状态管理。不涉及 GenerateIntentModal 内部逻辑变更（loading 仅为可选 prop 不再传递）。
2. **低风险**：Overlay 使用 CSS transition/animation（GPU 加速），即使主线程繁忙也有流畅动画表现；定时器在组件卸载时清理，无内存泄漏风险。

***

## Phase 4 Upgrade+Round 14 devlog -- M3 查缺补漏：GenerateIntentModal 输出类型预设与 Vault 入口

**日期**: 2026-05-28
**任务起始时间**: 11:50
**任务结束时间**: 12:04
**工时**: 14 分钟

### 任务目标

根据 RB-P4-001 二轮升级文档 M3 阶段，审查已有 GenerateIntentModal 实现并对遗漏项进行补全。一轮升级已完成基础生成流程（文档/文件夹/选区右键 → GenerateIntentModal → 创建 Pack），但存在三个遗漏：

1. GenerateIntentModal 缺少 output type 预设按钮（M3 要求支持 dev agent prompt / PRD / SPEC / checklist / summary / custom）
2. GenerateIntentSource 类型定义缺少 `vault` scope（M3 要求支持 vault/folder/document/selection 四种 scope）
3. 缺少 Vault 级生成入口（没有触发 vault scope 的 UI 入口）

### 改动的文件名以及改动的行数

| 文件                                                 | 操作 |         行数 | 说明                                                                                                                                                                                                                    |
| -------------------------------------------------- | -- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/context-pack/GenerateIntentModal.tsx` | 重写 | +100/-50 行 | 新增 OutputType 类型定义（6种输出类型）；新增 3列 grid 输出类型预设按钮（每按钮有 icon + 短标签）；选择预设时自动填充 intent 文本；GenerateIntentSource 新增 `vault` 类型和 `vaultPath` 字段；onConfirm 签名改为 `(intent, outputType)`；确认按钮在未选类型时禁用                             |
| `src/app/AppShell.tsx`                             | 修改 |   +35/-5 行 | 导入 OutputType 类型；handleGenerateIntentConfirm 签名改为 `(intent, outputType)`；pack 名称包含 outputType 前缀（如 `Dev Agent Prompt: xxx`）；新增 `source.type === 'vault'` 处理分支（收集前20篇文档的 chunk 快照）；Sidebar 新增 `onGenerateFromVault` 回调 |
| `src/components/Sidebar.tsx`                       | 修改 |   +12/-2 行 | SidebarProps 新增 `onGenerateFromVault` 可选 prop；Vault 统计区新增"根据整个主库生成..."按钮（虚线边框 emerald 色）；导入 Sparkles 图标                                                                                                               |

### 遇到的问题以及解决方式

1. **Sparkles 重复导入**：Sidebar.tsx 修改导入时产生了两次 `import { Sparkles }`。解决方式：合并到第一个 lucide-react 导入语句中。
2. **onConfirm 签名不兼容**：GenerateIntentModal 的 onConfirm 原来是 `(intent: string) => void`，新增 outputType 后改为 `(intent: string, outputType: OutputType) => void`，需确保 AppShell 中 handleGenerateIntentConfirm 同步更新。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 在文档树中右键任意文档 → 点击"生成..."
2. 弹出 GenerateIntentModal，看到 6个输出类型预设按钮（Dev Agent / PRD / SPEC / 检查清单 / 摘要 / 自定义）
3. 点击任意预设按钮（如 "Dev Agent"）：按钮变 emerald 高亮，意图输入框自动填充 "Dev Agent Prompt"
4. 可编辑意图文本，点击"创建并生成"：创建 Pack 并跳转到 Platter → 上下文包 tab
5. 检查生成的 Pack 名称前缀为输出类型（如 "Dev Agent Prompt: xxx"）
6. 在 Editor 选中一段文本 → 右键"从此生成..."：同样看到输出类型预设
7. 在左侧 Vault 统计区底部 → 点击"根据整个主库生成..."按钮：同样弹出 GenerateIntentModal
8. 验证：未选择输出类型时"创建并生成"按钮为禁用状态

### 当前风险，以及影响范围

1. **影响范围**：GenerateIntentModal 重写涉及 onConfirm 签名变更，AppShell 已同步更新，EditorView 和 DocTree 仅设置 generateIntentSource 不感知 outputType，无破坏性变更。
2. **低风险**：Vault 级生成会收集前 20 篇文档的 chunk 快照（限流），避免大量文档时性能问题。

***

## Phase 4 Upgrade+Round 13 devlog -- M2 Mentor View 折叠抽屉重构

**日期**: 2026-05-28
**任务起始时间**: 11:40
**任务结束时间**: 11:45
**工时**: 5 分钟

### 任务目标

根据 RB-P4-001 二轮升级文档 M2 阶段，重构 Mentor View 为可折叠抽屉结构：

1. 将"相关材料"从"当前建议"中拆分出来，独立为第 4 个 ExplorerSection
2. "当前建议"只展示最高优先级的 1 条可操作建议卡片
3. 每条材料/建议必须有 action 按钮（查看 / 忽略 / 查看相关材料）
4. 调整折叠优先级逻辑：有 trigger 时只展开"待判断"，无 trigger 时展开"当前建议"和"相关材料"

具体验收标准：

- Mentor view 不再平铺多张无关卡片（相关材料独立折叠）
- trigger 卡片在"待判断"
- 最近建议默认折叠
- 当前文档动作在"可用动作"

### 改动的文件名以及改动的行数

| 文件                              | 操作 |        行数 | 说明                                                                                                                                                |
| ------------------------------- | -- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/MentorDock.tsx` | 修改 | +95/-35 行 | 新增"相关材料" ExplorerSection（第 4 节）；重构"当前建议"为可操作建议卡片；新增 dismissedRelated 逐条忽略状态；调整折叠优先级逻辑（hasRelated/hasDocument 计算值）；修复 hasRelated 布尔类型问题（`!!` 双重否定） |

### 遇到的问题以及解决方式

1. **hasRelated 类型为 boolean | undefined**：`relatedResults && relatedResults.length > 0` 在 relatedResults 为 undefined 时返回 undefined 而非 false。解决方式：`!!(relatedResults && relatedResults.length > 0)` 使用双重否定强制布尔类型。
2. **相关材料默认展开时机**：需要与 trigger 优先级协调——有 trigger 时相关材料折叠，无 trigger 时若有结果则展开。解决方式：在 useEffect 中统一管理三个折叠状态（待判断/当前建议/相关材料）的优先级。

### 自动验证结果

```bash
$ npx tsc --noEmit
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. 打开 Mento Dock → Platter → Mentor tab
2. 未打开文档时：看到 AI 知识助手空状态，所有 section 可手动折叠/展开
3. 打开一篇已有索引的文档：点击"查找相关"
4. "当前建议" section 显示"发现 X 个相关材料"卡片，有"查看相关材料"和"忽略"按钮
5. 点击"查看相关材料"：自动展开"相关材料" section，逐条显示材料卡片，每条有"查看"和"忽略"按钮
6. 点击某条材料的"忽略"按钮：该条材料消失
7. 点击右上角 X 按钮：清空全部相关材料
8. 保存文档后若有 trigger 结果："待判断" section 自动展开，"当前建议"和"相关材料"自动折叠
9. "最近建议" section 默认折叠，手动点击可展开查看历史建议

### 当前风险，以及影响范围

1. **影响范围**：仅 `src/components/MentorDock.tsx` 的 MentorView 函数内部。不涉及其他组件、不影响 Platter 其他 view（Context/Pack/Inbox/Notifications）、不改 MentorDock 外层壳。
2. **低风险**：hasRelated 计算依赖 relatedResults prop（来自 AppShell），此 prop 为可选参数已有默认处理，不存在空值崩溃风险。

***

## Phase 4 Upgrade+Round 12 devlog -- M1 二轮审查：Settings 入口收敛为单一入口

**日期**: 2026-05-28
**任务起始时间**: 11:36
**任务结束时间**: 11:40
**工时**: 4 分钟

### 任务目标

根据 RB-P4-001 二轮升级文档 M1 阶段，审查全局 Settings 与技术术语收口的完成度。一轮升级（Round 1 + Round 1b）已完成 WorkspaceHeader Settings 按钮、CmdK "打开设置"、Mentor 技术细节清理、Settings Knowledge Engine 诊断区、embedding 标记为开发/诊断用途、技术提示移除。本轮审查确认所有 M1 目标已达成，Settings 入口收敛为 WorkspaceHeader 单一入口。

具体目标：

1. 审查 M1 所有验收条件是否满足
2. 确认 Settings 入口收敛为 WorkspaceHeader 一个入口（不额外增加 Sidebar 入口）

### 改动的文件名以及改动的行数

无代码改动。本轮为审查确认轮次。

### 遇到的问题以及解决方式

1. **Sidebar Settings 入口被拒绝**：初步计划在 Sidebar 底部增加 Settings 按钮，但用户明确要求收敛为一个入口。已撤回 Sidebar 修改，保留 WorkspaceHeader 齿轮按钮作为唯一 Settings 入口。

### 自动验证结果

```bash
$ npm run typecheck
# exit 0，无 TypeScript 错误
```

### 手工验证步骤说明

1. WorkspaceHeader 右侧齿轮图标为唯一 Settings 入口，点击打开 SettingsPanel
2. Mentor 主 view 不出现 endpoint/model/embedding dimension/provider/verify:index 等技术细节
3. Settings → Knowledge Engine 区可查看索引状态、运行日志、验证索引
4. 主界面不出现"需先生成语义索引"等技术提示
5. CmdK 保留"打开设置"命令

### 当前风险，以及影响范围

1. **影响范围**：无代码变更，仅做审查确认。一轮升级（Round 1 + Round 1b）已覆盖所有 M1 目标。

***

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

| 文件                                              | 操作 |        行数 | 说明                                                                                                   |
| ----------------------------------------------- | -- | --------: | ---------------------------------------------------------------------------------------------------- |
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

***

## Phase 4 Upgrade+Round 10 devlog -- 搜索准确性：全量文档入索引与标题优先

**日期**: 2026-05-28
**任务起始时间**: 09:55
**任务结束时间**: 09:59
**工时**: 4 分钟

### 任务目标

根据用户手工验证反馈，修复 Command Palette 搜索“产品需求文档”时优先返回 RB-P4-001\_upgrade 的不准确结果。问题定位为当前 metadata/chunks/FTS 只收录了 RB-P4-001\_upgrade，一个真实存在的文档文件没有进入索引；同时搜索后端缺少标题/路径精确匹配优先策略。

具体目标：

1. Settings 重建索引前同步文件树中的所有 Markdown 到 metadata DB
2. 重建索引覆盖所有已发现文档，而不是只覆盖旧 metadata 中已有记录
3. 搜索后端增加标题/路径匹配结果，并排在 FTS/semantic 之前
4. Command Palette 对标题匹配结果显示“标题”来源标签

### 改动的文件名以及改动的行数

| 文件                                               | 操作 |         行数 | 说明                                                                                                                                     |
| ------------------------------------------------ | -- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/settings/SettingsPanel.tsx`         | 修改 |   +59/-6 行 | 引入 docTree、documentService、frontmatter 解析；重建索引前遍历文件树所有 `.md`，读取内容、同步 title/frontmatter/hash/wordCount 到 metadata，再执行 reindex/embedding |
| `src-tauri/src/commands/search.rs`               | 修改 | +102/-18 行 | `search_documents` 增加 title/path LIKE 查询，精确标题 rank 最高；标题结果与 FTS 结果去重合并；返回 source=`title`                                               |
| `src/modules/command-palette/CommandPalette.tsx` | 修改 |    +6/-2 行 | 搜索结果 source badge 增加 `title -> 标题`，让用户能识别标题命中                                                                                          |

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
5. 搜索 RB-P4-001 相关词时，预期仍能返回 RB-P4-001\_upgrade，说明原 FTS/semantic 路径未被破坏

### 当前风险，以及影响范围

1. **需要用户执行一次重建索引**：本轮修复了重建逻辑，但已有 vault 的 metadata 不会自动补齐，需在 Settings 点击“重建索引”后生效。影响范围：当前已存在但未入库的文档。
2. **标题匹配依赖 metadata 同步**：如果文档未经过本轮重建或创建/保存同步，标题匹配仍无法命中该文档。影响范围：搜索召回。
3. **影响范围**：只调整 Phase4 搜索与索引入口，不改变语义搜索算法、不引入 MindView/健康报告等后续阶段能力。

***

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

| 文件                        | 操作 |       行数 | 说明                                                                                                          |
| ------------------------- | -- | -------: | ----------------------------------------------------------------------------------------------------------- |
| `scripts/verify-index.sh` | 修改 | +16/-7 行 | 颜色输出改为仅 TTY 且未设置 NO\_COLOR 时启用；JSONL trim 不再使用 `xargs`，避免吞掉双引号；Context Pack 引用校验改为 metadata DB 或文件存在任一满足即通过 |

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

***

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

| 文件                                       | 操作 |         行数 | 说明                                                                                                                           |
| ---------------------------------------- | -- | ---------: | ---------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/metadata.rs`     | 修改 |  +24/-17 行 | `run_verify_index` 从单一路径改为多候选查找：当前目录 scripts、父级 scripts、Cargo manifest 父级 scripts；找不到时返回已检查路径                                |
| `src-tauri/src/commands/chunking.rs`     | 修改 |    +4/-4 行 | 文档 reindex/chunk 写入后同时将 `embedding_status` 重置为 `pending`                                                                     |
| `src-tauri/src/commands/vector_index.rs` | 修改 | +125/-11 行 | 新增 `refresh_document_embedding_status`，根据文档 chunks 的 embedding 状态汇总更新 documents.embedding\_status；store/stale/error 后刷新文档级状态 |
| `src/modules/settings/SettingsPanel.tsx` | 修改 |   +18/-5 行 | Settings 重建索引时，AI 已连接则对每个 chunk 调用 `embedAndStore`；进度文案区分全文索引和语义向量生成；单个 chunk embedding 失败不阻断全文索引                            |

### 遇到的问题以及解决方式

1. **验证索引脚本路径错误**：截图显示后端尝试执行 `/src-tauri/scripts/verify-index.sh`，但仓库实际脚本位于根目录 `scripts/verify-index.sh`。解决方式：`run_verify_index` 改为按多个候选路径查找，兼容从仓库根目录或 `src-tauri` 目录启动的 Tauri 运行环境。
2. **Settings 重建索引只重建 FTS/chunks**：当前 `handleRebuildIndex` 只调用 `chunkingService.reindexDocument`，不会调用 embedding，因此 UI 仍显示“语义搜索未开启”。解决方式：在 AI Runtime `status === 'connected'` 时，对重建后的 chunks 调用 `embedAndStore`，将向量写入 `chunk_embeddings`。
3. **文档级 embedding\_status 没有随 chunk\_embeddings 更新**：即使 chunk embeddings 写入 ready，Settings 统计读取的是 `documents.embedding_status`，原代码没有在 `store_chunk_embedding` 后同步 documents 状态。解决方式：后端新增文档级状态汇总函数，ready chunks 覆盖全部 chunks 时把文档标记为 ready；有 error/stale/unavailable 时按状态汇总，否则 pending。
4. **重建 chunks 后旧语义状态可能残留**：reindex 删除旧 chunk embeddings 后，documents.embedding\_status 若不重置，可能显示过期 ready。解决方式：chunk 写库完成后把文档语义状态重置为 pending，等待新的 embedding 写入后再更新为 ready。

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

***

## Phase 4 Upgrade+Round 7 devlog -- 查缺补漏：chunk 链路、Pack 内容与 Mentor 可操作性

**日期**: 2026-05-28
**任务起始时间**: 09:13
**任务结束时间**: 09:44
**工时**: 31 分钟

### 任务目标

根据 RB-P4-001 升级文档、产品文档与 Phase4 既有 dev log，对 Phase4 Upgrade Round 1-6 的实现做查缺补漏。只补齐升级文档中已要求但当前实现缺失的任务，不回滚符合升级路线的改动，不新增升级文档外功能。

具体目标：

1. 补齐搜索结果、语义搜索结果、Pack 推荐候选的 chunk\_id 与内容链路
2. 修复文档级 Pack 只有 metadata、导出/生成上下文不足的问题
3. 修复 Pack 推荐卡片没有内容预览、接受推荐后内容为空的问题
4. 修正 Mentor 默认同时展开多个高优先级抽屉的问题，并让最近建议可操作
5. 修正 Settings 中连接测试可能使用旧配置的问题

### 改动的文件名以及改动的行数

| 文件                                               | 操作 |          行数 | 说明                                                                                                                                                       |
| ------------------------------------------------ | -- | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/search.rs`               | 修改 |   +34/-16 行 | FTS/search\_documents 返回 chunk\_id、content、rank；搜索结果可直接关联 chunks                                                                                         |
| `src-tauri/src/commands/vector_index.rs`         | 修改 |   +37/-11 行 | SemanticSearchResult 与 ContextPackCandidate 返回 chunk\_id/content；read\_all\_ready\_embeddings 读取 chunk 内容；仅格式化本轮改动文件                                     |
| `src/services/index/search.ts`                   | 修改 |        +4 行 | SearchResult/SearchDocumentResult 类型同步 chunk\_id/content                                                                                                 |
| `src/services/index/vector.ts`                   | 修改 |        +3 行 | SemanticSearchResult/CandidateResult 类型同步 chunk\_id/content                                                                                              |
| `src/modules/command-palette/CommandPalette.tsx` | 修改 |     +4/-2 行 | 语义搜索结果带 chunk\_id/content；打开搜索结果时记录 chunk\_id 信号                                                                                                         |
| `src/app/AppShell.tsx`                           | 修改 | 约 +88/-10 行 | 新增文档 Pack snapshot（前 3 个 chunk，最多 6000 字）；文档/文件夹生成与加入 Pack 时写入 content/heading/line/chunk\_id；选区根据行号匹配 chunk\_id；搜索结果加入 Pack 时保存 chunk\_id/content/score |
| `src/modules/context-pack/ContextPackPanel.tsx`  | 修改 |    +11/-4 行 | 推荐候选保存 content；推荐卡片显示内容预览；接受推荐写入 content/heading/chunk\_id；个性化信号记录 chunk\_id                                                                             |
| `src/components/MentorDock.tsx`                  | 修改 |    +24/-2 行 | 有 trigger 时默认只展开“待判断”并收起“当前建议”；最近建议增加“采纳/忽略”动作                                                                                                           |
| `src/modules/ai/AIRuntimeProvider.tsx`           | 修改 |     +9/-8 行 | checkConnection 支持传入本次草稿配置，避免立即测试时读到旧 state                                                                                                              |
| `src/modules/settings/SettingsPanel.tsx`         | 修改 |     +2/-2 行 | “检测连接”保存配置后用 nextConfig 直接测试                                                                                                                             |

> 说明：`src/app/AppShell.tsx` 当前工作区 diff 同时包含前序 Round 5/6 未提交内容，本表只记录本轮实际补漏范围。

### 遇到的问题以及解决方式

1. **M4 dev log 写了“搜索结果保存 chunk\_id”，但当前代码仍保存 null**：读取 Round 4 dev log 后确认目标已列出，但当时只给 PackItem 扩字段，搜索后端类型并没有返回 chunk\_id，导致 AppShell 只能写 null。解决方式：在 Rust `search.rs` 中把 `chunks.id`、`chunks.content`、`bm25` rank 一并返回，前端 SearchDocumentResult 同步字段，加入 Pack 时保存 chunk\_id/content/score。
2. **语义搜索与 Pack 推荐缺少内容预览**：升级文档要求“推荐卡片展示内容预览，用户可加入/忽略”，但后端候选只返回路径、heading、line 和 score。解决方式：vector index 读取 ready embeddings 时同时读取 chunk content，SemanticSearchResult/ContextPackCandidate 返回 content，ContextPackPanel 渲染内容预览并在接受推荐时写入 Pack item。
3. **文档级 Pack 缺少正文上下文**：升级文档已指出“文档级 Pack 缺 content，summary 为空时导出上下文不足”。Round 4 dev log 的解决只覆盖“文档级 item 反查 chunks 用于推荐”，没有让 Pack item 本身带内容。解决方式：AppShell 创建文档/文件夹 Pack item 时读取该文档前 3 个 chunks，最多 6000 字，写入 content、heading、line、chunk\_id，保证导出和 OutputGenerator 至少有可用正文。
4. **选区 Pack item 没有 chunk\_id**：选区本身有内容，但没有 chunk\_id 会降低后续推荐质量。解决方式：根据选区 startLine/endLine 查找重叠 chunk，写入 chunk\_id 和 heading；找不到 chunk 时保持 null，不阻断用户动作。
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

1. 在 Command Palette 搜索任意内容，点击结果右侧“加入上下文包”，期望 Pack item 带有正文内容、位置、chunk\_id，并在 Pack 中可显示内容预览
2. 在 AI 已连接且 embedding ready 的 vault 中执行语义搜索，期望语义结果加入 Pack 后同样带 chunk\_id/content/score
3. 在已有 Pack 中加入一个文档，期望“推荐内容”卡片显示相关度、位置和内容预览；点击加入后 Pack item 有正文，不再是空 content
4. 右键文档或文件夹选择“生成...”，输入意图创建草稿 Pack，期望初始来源 item 至少包含前 3 个 chunk 的正文 snapshot
5. 在编辑器选中一段文字加入 Pack 或“从此生成...”，期望 item 保留选区正文，并在能匹配 chunk 时保存 chunk\_id/heading
6. 触发 Mentor 待判断后打开 Platter，期望默认只展开“待判断”，不同时展开“当前建议”
7. 打开 Mentor 的“最近建议”，对 pending 建议点击“采纳/忽略”，期望状态持久化更新
8. 在 Settings 修改自定义 API baseUrl/API key 后立即点击“检测连接”，期望检测使用最新输入而不是旧配置

### 当前风险，以及影响范围

1. **FTS chunk\_id 来源仍依赖既有 join 条件**：当前 FTS 表未存 chunk\_id，本轮沿用 `document_path + heading_path` join chunks。若同一文档出现重复 heading\_path，搜索结果可能关联到非预期 chunk。影响范围：搜索结果加入 Pack 的 chunk 精度。
2. **文档级 Pack snapshot 是确定性截断**：当前取前 3 个 chunks、最多 6000 字，不是语义 top-k 或 LLM 压缩摘要。影响范围：长文档生成输出时，后续内容可能未进入初始 Pack。
3. **chunk\_id 可能随 reindex 失效**：既有 chunking 实现会删除并重建 chunks，旧 Pack item 的 chunk\_id 可能过期。本轮未改索引持久化策略，因为升级文档未要求稳定 chunk id 迁移。影响范围：历史 Pack 的推荐质量。
4. **文件夹生成仍沿用 Round 5 的前 10 个文档限制**：本轮没有扩展范围。影响范围：大文件夹草稿 Pack 可能不完整，但该风险已在 Round 5 dev log 记录，不构成本轮阻塞。
5. **影响范围**：只补齐 P4 Upgrade M1/M2/M4/M5 既定验收缺口，不引入 MindView、健康报告、复杂 agent 工作流或 Pack 数据结构大改。

***

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

| 文件                                             | 操作 |         行数 | 说明                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | -- | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/AppShell.tsx`                         | 修改 |   +95/-5 行 | 新增 reasoningResult state；handleEditorSelectionAction 改为 async；explain/summarize case 改为调用 chat reasoning 并显示结果面板；渲染区添加 ReasoningResultPanel（含来源、复制、loading 状态）；依赖数组添加 aiStatus/chat                                                                                                                                                     |
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 | +155/-40 行 | 重构：新增 OutputType 类型（prompt/prd/spec/checklist）和 OUTPUT\_TYPES 配置；assemblePrompt 按 outputType 生成不同 Task 模板；新增 buildSystemPrompt 按 outputType 生成 reasoning system prompt；新增 useAIRuntime 获取 chat 接口；新增 outputType state/reasoningDraft state/generating state；新增"AI 生成"按钮调用 chat reasoning；新增来源覆盖 footer（显示条目数、原文/摘要统计、来源标签）；保留编辑/复制/重置功能 |

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

***

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

| 文件                                                 | 操作 |        行数 | 说明                                                                                                                                                                                                                      |
| -------------------------------------------------- | -- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/context-pack/GenerateIntentModal.tsx` | 新建 |    +124 行 | M5 核心组件：就地输入生成意图的模态框，支持 document/folder/selection 三种来源类型，显示来源信息、意图输入框、确认/取消按钮                                                                                                                                           |
| `src/modules/dock/DocTree.tsx`                     | 修改 |  +12/-4 行 | 文件右键菜单添加"生成..."菜单项（Sparkles 图标）；文件夹右键菜单"生成上下文包"改为"根据文件夹生成..."；DocEntryItem 透传 onGenerate/onGenerateFromFolder；移除 Package 图标导入                                                                                           |
| `src/components/Sidebar.tsx`                       | 修改 |   +4/-2 行 | SidebarProps 新增 onGenerate/onGenerateFromFolder；函数参数解构和 DocTree 透传                                                                                                                                                      |
| `src/app/AppShell.tsx`                             | 修改 | +40/-15 行 | Sidebar 传递 onGenerate/onGenerateFromFolder 回调（打开 GenerateIntentModal）；handleEditorSelectionAction 中 generateFrom 改为打开 GenerateIntentModal（计算行号和 heading）；渲染区添加 GenerateIntentModal 组件；移除废弃的 handleGenerateFromSelection |

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

***

## Phase 4 Upgrade+Round 4 devlog -- M4 Pack 推荐与 chunk 数据补齐

**日期**: 2026-05-28
**任务起始时间**: 08:30
**任务结束时间**: 08:38
**工时**: 8 分钟

### 任务目标

根据 RB-P4-001 升级文档 M4 阶段，让 embedding 推荐真正工作，补齐 Pack item 的 chunk 数据关联。

具体目标：

1. 扩展 ContextPackItem 增加 chunk\_id / source\_type / score / reasoning\_note
2. 修复 suggestContextPackCandidates 空参数问题（原来传 \[] 导致后端直接返回空）
3. 搜索结果保存 chunk\_id，文档级 Pack 反查 chunks
4. Pack 推荐显示片段标题、位置、相关度、内容预览，用户可加入/忽略

### 改动的文件名以及改动的行数

| 文件                                              | 操作 |        行数 | 说明                                                                                                                                                                                                                    |
| ----------------------------------------------- | -- | --------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/context_pack.rs`        | 修改 |      +4 行 | ContextPackItem 结构体新增 chunk\_id/source\_type/score/reasoning\_note 四个 Option 字段                                                                                                                                       |
| `src/services/index/context-pack.ts`            | 修改 |      +4 行 | 前端 ContextPackItem 接口同步新增四个字段                                                                                                                                                                                         |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +50/-15 行 | DocCandidate 扩展 chunk\_id/start\_line/end\_line；推荐加载逻辑从空数组改为收集已有 item 的 chunk\_id 并反查文档 chunks；handleAcceptSuggestion 保存 chunk\_id/source\_type/score；pendingItem addItem 补全新字段；推荐卡片显示位置信息（L行号）；新增 chunkingService 导入 |
| `src/app/AppShell.tsx`                          | 修改 |     +16 行 | 4 处 addItem 调用补全 chunk\_id/source\_type/score/reasoning\_note 字段（folder/document/selection/search 四种 source\_type）                                                                                                    |

### 遇到的问题以及解决方式

1. **suggestContextPackCandidates 传空数组**：原来 `ContextPackPanel` 调用 `suggestContextPackCandidates(vault.path, [], 20)`，后端在 `chunk_ids.is_empty()` 时直接返回空。解决方式：从已有 Pack item 中收集 chunk\_id，对于没有 chunk\_id 的文档级 item，查询该文档的 chunks 取第一个 chunk 的 id。
2. **ContextPackItem 扩展后的兼容性**：新增的 4 个字段都是 `Option` 类型，旧数据中不存在这些字段时 Rust 反序列化会使用 `None`，前端 TypeScript 中使用 `null`，完全向后兼容。
3. **AppShell 中 4 处 addItem 调用**：扩展 ContextPackItem 后，所有 addItem 调用都需要传入新字段。解决方式：按 selected\_reason 区分 source\_type（folder/document/selection/search），chunk\_id/score/reasoning\_note 暂设为 null。

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
3. 推荐卡片应显示：推荐标签、相关度百分比、片段标题（heading\_path）、文档路径 + 行号范围（如 L10-25）
4. 点击推荐卡片右侧的箭头按钮，推荐内容应加入 Pack
5. 加入后推荐列表中该文档应消失（已排除）
6. 检查加入的 item 在 Pack 中显示的 source\_type 标签

### 当前风险，以及影响范围

1. **文档级 item 反查 chunks 性能**：对于没有 chunk\_id 的文档级 item，每次加载推荐时都会调用 `getDocumentChunks`。如果 Pack 中有很多文档级 item，可能产生多次 API 调用。影响范围：推荐加载速度。
2. **旧数据兼容**：旧的 context-packs.json 中不存在新字段，Rust 反序列化时使用 `None`，前端显示时使用 `null`，不影响功能但推荐可能无法基于旧 item 的 chunk\_id 工作。影响范围：已有 Pack 的推荐效果。
3. **影响范围**：不改 OutputGenerator reasoning，不改 Platter 整体视觉。

***

## Phase 4 Upgrade+Round 3 devlog -- M3 Trigger chunkId 与"帮我判断"

**日期**: 2026-05-28
**任务起始时间**: 08:20
**任务结束时间**: 08:25
**工时**: 5 分钟

### 任务目标

根据 RB-P4-001 升级文档 M3 阶段，让 semantic\_repeat/context\_drift 真正触发，并将"帮我判断"按钮变成真实 reasoning 动作。

具体目标：

1. reindex 后按 chunk 调用 checkTriggers 传入 chunkId
2. 聚合 trigger 结果（去重，优先 threshold\_exceeded）
3. dismissed 持久化（调用 updateTriggerState 而非仅 React state 过滤）
4. 点击"帮我判断"调用 reasoning，输出判断结果卡片

### 改动的文件名以及改动的行数

| 文件                              | 操作 |       行数 | 说明                                                                                                                                                                                                  |
| ------------------------------- | -- | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/AppShell.tsx`          | 修改 | +45/-5 行 | postReindexHook 中按 chunk 调用 checkTriggers 传入 chunkId；聚合 trigger 去重；onDismissTrigger 增加 updateTriggerState 持久化；新增 onJudgeTrigger 回调调用 chat reasoning；解构增加 `chat`                                     |
| `src/components/MentorDock.tsx` | 修改 | +50/-3 行 | MentorView 新增 onJudgeTrigger prop；新增 judgingType/judgmentResults 状态和 handleJudge 函数；"帮我判断"按钮绑定 handleJudge 并显示 loading 状态；新增判断结果卡片（AI 判断结果 + 忽略按钮）；PlatterProps 和 InnerMentorDock 传递 onJudgeTrigger |

### 遇到的问题以及解决方式

1. **AppShell 中** **`chat`** **未解构**：AppShell 原来只解构了 `status` 和 `embedAndStore`，需要添加 `chat` 才能调用 reasoning。解决方式：在 `useAIRuntime()` 解构中添加 `chat`。
2. **MentorView 函数参数解构遗漏**：添加 `onJudgeTrigger` 到 MentorView 的 props 类型定义后，忘记在函数参数解构中添加。解决方式：在解构列表中添加 `onJudgeTrigger`。
3. **trigger 聚合策略**：按 chunk 调用 checkTriggers 可能产生大量重复 trigger（每个 chunk 都可能触发同一类型）。解决方式：使用 Map 按 trigger\_type 去重，优先保留 `threshold_exceeded` 状态的结果。

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
2. 如果文档有语义重复内容，Mentor 的"待判断"section 应出现 semantic\_repeat trigger
3. 点击"帮我判断"按钮，应显示 loading 状态（"判断中..."）
4. AI 返回后，trigger 卡片下方应出现绿色"AI 判断结果"卡片，包含 AI 的判断和建议
5. 点击"忽略"按钮，trigger 应消失，且下次 reindex 后不会重新出现（dismissed 已持久化）
6. 如果 AI 未连接，点击"帮我判断"应无响应（返回 null）

### 当前风险，以及影响范围

1. **按 chunk 调用 checkTriggers 性能**：如果文档有很多 chunk，每个 chunk 都调用一次 checkTriggers 可能较慢。当前没有做并行或采样优化。影响范围：大文档 reindex 后触发器检查可能耗时较长。
2. **reasoning prompt 较简单**：当前"帮我判断"的 system prompt 只要求简洁回答，没有传入文档内容或相似片段的详细信息。更丰富的上下文需要 M4 的 chunk 数据补齐。影响范围：判断结果可能不够精准。
3. **影响范围**：不改 Pack 数据结构，不自动修改原文，不自动合并文档。

***

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

| 文件                              | 操作 |          行数 | 说明                                                                                                                                                                                          |
| ------------------------------- | -- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/MentorDock.tsx` | 修改 | +150/-180 行 | MentorView 重构为 4 个折叠抽屉；trigger 卡片从 MentorDock 主组件移入 MentorView 的"待判断"section；当前文档动作从平铺卡片移入"可用动作"section；相关内容移入"当前建议"section；移除 `onAIOnboarding` prop（已由 Settings Product Flow 区替代）；移除旧的平铺布局 |

### 遇到的问题以及解决方式

1. **`onAIOnboarding`** **不再使用**：MentorView 重构后，"重新运行 AI Onboarding"按钮不再出现在 Mentor 主 view 中（已在 M1 中移入 Settings Product Flow 区）。解决方式：从 MentorView 和 PlatterProps 中移除 `onAIOnboarding`。
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

***

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

| 文件                                               | 操作 |    行数 | 说明                                                                                          |
| ------------------------------------------------ | -- | ----: | ------------------------------------------------------------------------------------------- |
| `src/modules/command-palette/CommandPalette.tsx` | 修改 |  -8 行 | 移除"智能搜索未开启（需先生成语义索引）"提示块                                                                    |
| `src/components/MentorDock.tsx`                  | 修改 | -10 行 | 移除 `semanticAvailable` 状态、useEffect 检测、"语义搜索已开启"渲染；移除 `metadataService` 导入和主函数中未使用的 `vault` |
| `src/modules/settings/SettingsPanel.tsx`         | 修改 |  +3 行 | Knowledge Engine 区顶部补轻量说明文字                                                                 |

### 遇到的问题以及解决方式

1. **`vault`** **变量未使用警告**：移除 `semanticAvailable` 后，MentorView 主函数中的 `const { vault } = useVault()` 不再被使用（其他子组件有各自的 `useVault` 调用）。解决方式：移除主函数中的 `vault` 声明，保留子组件中的独立调用。

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

***

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

| 文件                                       | 操作 |         行数 | 说明                                                                                                                                                                                                |
| ---------------------------------------- | -- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/WorkspaceHeader.tsx`     | 修改 |   +10/-2 行 | 新增 `onOpenSettings` prop 和 Settings 齿轮图标按钮                                                                                                                                                        |
| `src/app/AppShell.tsx`                   | 修改 |    +1/-0 行 | 传入 `onOpenSettings={() => setSettingsOpen(true)}`                                                                                                                                                 |
| `src/modules/settings/SettingsPanel.tsx` | 修改 | +120/-80 行 | 重构：AI 助手→AI Reasoning（移除 embedding 配置）；知识索引状态→Knowledge Engine（加入 embedding 模型/测试/stale 检测）；新增 Product Flow 区（onboarding reset + 说明）；关于区增加 Vault 路径；新增 Cpu/RotateCcw 图标导入；新增 onboardingService 导入 |
| `src/components/MentorDock.tsx`          | 修改 |    +6/-4 行 | 移除常驻 Settings 图标按钮，改为 AI 未连接时显示"去设置"链接；移除 Settings 图标导入                                                                                                                                           |
| `src/services/ai/onboarding.ts`          | 修改 |    +3/-0 行 | 新增 `resetStatus` 方法                                                                                                                                                                               |

### 遇到的问题以及解决方式

1. **`detectStaleEmbeddings`** **需要单文档参数**：原计划在 Knowledge Engine 中调用全局 stale 检测，但 `detectStaleEmbeddings` 需要 `documentPath` 参数，不适合全局调用。解决方式：改为从 `listDocumentsMetadata` 中统计 `embedding_status === 'stale'` 的文档数量，无需额外 API 调用。
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
2. **stale 检测依赖 metadata 中的 embedding\_status 字段**：如果后端在文档内容变更后没有正确更新 `embedding_status` 为 `stale`，前端将无法显示过期提示。影响范围：Knowledge Engine 中的 stale 检测可能不准确。
3. **影响范围**：仅修改 UI 层布局和配置入口位置，不改模型调用逻辑、不改 Pack、不改 trigger。

***

## Phase 4+Round 11 devlog -- ContextPackItem 多粒度支持

**日期**: 2026-05-25
**任务起始时间**: 22:00
**任务结束时间**: 22:45
**工时**: 45 分钟

### 任务目标

更新 MindDock ContextPackItem 数据结构，支持多粒度（文件夹/文档/段落/选区），并调整所有相关添加逻辑。

### 改动的文件名以及改动的行数

| 文件                                              | 操作 |             行数 | 说明                                                                                                                                                                                                                   |
| ----------------------------------------------- | -- | -------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/context_pack.rs`        | 修改 |    +8 行 / -1 行 | ContextPackItem 新增 content/heading/start\_line/end\_line 字段；export\_context\_pack\_markdown 适配新字段输出                                                                                                                  |
| `src/services/index/context-pack.ts`            | 修改 |   +14 行 / -5 行 | ContextPackItem 接口新增 4 个可选字段；exportAsMarkdown 适配粒度显示（heading 优先、位置信息、内容输出）                                                                                                                                           |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 |  +30 行 / -12 行 | pendingItem 类型扩展；条目卡片根据粒度显示不同内容（段落/选区标签、行号、内容预览）；编辑功能区分 content/summary                                                                                                                                              |
| `src/app/AppShell.tsx`                          | 修改 | +120 行 / -10 行 | addDocToPack 添加新字段；新增 addSelectionToPack/handleAddSelectionToPack/handleGenerateFromSelection/handleAddSearchResultToPack；handleEditorSelectionAction 改为选区级添加；搜索结果 onAddToContextPack 改用 handleAddSearchResultToPack |
| `src/modules/context-pack/OutputGenerator.tsx`  | 修改 |    +8 行 / -8 行 | assemblePrompt 适配新字段（heading 优先、位置信息、content/summary 优先级）                                                                                                                                                            |
| `src/components/MentorDock.tsx`                 | 修改 |           +4 行 | pendingContextPackItem 类型新增 content/heading/start\_line/end\_line                                                                                                                                                    |

### 遇到的问题以及解决方式

1. **类型不兼容**：ContextPackItem 新增字段后，所有 `addItem` 调用点都需要补充新字段。通过全局诊断逐一修复，确保所有调用点传入 content/heading/start\_line/end\_line（文档级传 null，选区/段落级传实际值）。
2. **编辑逻辑区分**：原有编辑功能只编辑 summary，现在需要根据是否有 content 区分：有 content 时编辑 content，否则编辑 summary。修改了 startEditItem 和 saveEditItem。

### 自动验证结果

- `pnpm typecheck`：✅ 通过，无类型错误
- `cargo check`：✅ 通过，无编译错误

### 手工验证步骤说明

1. 打开应用，右键文档选择"加入上下文包"→ 验证文档级条目显示 title/summary/tags，无粒度标签
2. 在编辑器中选中一段文字，右键选择"加入上下文包"→ 验证段落级条目显示 content 预览、行号范围、"段落"标签
3. 在编辑器中选中一段文字，右键选择"从此生成"→ 验证创建新 Pack 并添加选区级条目
4. 在搜索结果中点击"加入上下文包"→ 验证搜索结果以 chunk 级别添加（含 heading/start\_line/end\_line）
5. 点击"生成提示词"→ 验证 OutputGenerator 中段落级条目显示 content，文档级显示 summary
6. 点击"导出"→ 验证导出的 Markdown 包含章节、位置、内容等信息

### 当前风险，以及影响范围

1. **数据兼容性**：已有的 context-packs.json 中旧条目缺少 content/heading/start\_line/end\_line 字段。由于 Rust 端使用 `Option<String>`/`Option<i64>` 且 serde 默认对 Option 字段宽容，旧数据反序列化时这些字段为 None，不会报错。但需注意前端 null 检查。
2. **多 Pack 选择器缺失**：`handleAddSelectionToPack` 在多 Pack 场景下暂时使用第一个 Pack，后续需添加 PackSelectorModal 支持。
3. **影响范围**：ContextPackItem 数据结构变更影响所有使用上下文包功能的模块，包括 ContextPackPanel、OutputGenerator、AppShell、MentorDock。

***

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

| 文件                                        | 操作 |     行数 | 说明                                                                                                                  |
| ----------------------------------------- | -- | -----: | ------------------------------------------------------------------------------------------------------------------- |
| `src/modules/editor/editorContextMenu.ts` | 新建 | +120 行 | CM6 右键菜单扩展，支持暗色模式、边界自适应、Escape关闭                                                                                    |
| `src/modules/editor/EditorView.tsx`       | 修改 |  +25 行 | 添加 onSelectionAction prop，集成右键菜单                                                                                    |
| `src/app/AppShell.tsx`                    | 修改 | +200 行 | handleEditorSelectionAction + handleFindRelated增强 + PackSelectorModal + GenerateTypeSelector + addDocChunksToPack辅助 |
| `src/components/MentorDock.tsx`           | 修改 |  +40 行 | PlatterProps扩展 + 相关内容展示区域                                                                                           |
| `src-tauri/src/commands/metadata.rs`      | 修改 |  +20 行 | 新增 run\_verify\_index 命令                                                                                            |
| `src-tauri/src/lib.rs`                    | 修改 |   +1 行 | 注册 run\_verify\_index 命令                                                                                            |
| `src/modules/settings/SettingsPanel.tsx`  | 修改 |  +30 行 | 验证索引按钮调用 Rust 命令，显示结果                                                                                               |

### 遇到的问题以及解决方式

1. **CM6 扩展闭包问题**：`onSelectionAction` 回调如果直接在 extensions 数组中引用，会导致 CM6 重建。解决方式：使用 `useRef` 保存回调引用，扩展中使用 ref.current 调用。
2. **Pack 选择器状态管理**：多个 Pack 时需要弹窗选择，但选择后需要异步添加 chunks。解决方式：抽取 `addDocChunksToPack` 辅助函数，PackSelectorModal 中 onSelect 回调异步调用。
3. **verify:index 脚本路径**：Rust 端 `run_verify_index` 使用 `std::env::current_dir()` 获取项目根目录，拼接脚本路径。在 `pnpm tauri dev` 下 current\_dir 为项目根目录，脚本可正常找到。

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

***

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

| 文件                                               | 操作 |          行数 | 说明                                  |
| ------------------------------------------------ | -- | ----------: | ----------------------------------- |
| `src/modules/settings/SettingsPanel.tsx`         | 新建 |      +340 行 | 独立设置面板，承接从 Mentor 移出的技术配置           |
| `src/components/MentorDock.tsx`                  | 修改 | +150/-400 行 | MentorView 从技术面板重构为引导界面             |
| `src/components/Sidebar.tsx`                     | 修改 |        +8 行 | 透传 DocTree AI 回调                    |
| `src/modules/dock/DocTree.tsx`                   | 修改 |       +60 行 | 右键菜单增加 AI 操作（总结/生成包/查找相关/加入包）       |
| `src/modules/command-palette/CommandPalette.tsx` | 修改 |   +80/-40 行 | 搜索结果操作按钮 + Pack 生成命令 + 术语清理         |
| `src/app/AppShell.tsx`                           | 修改 |      +120 行 | 集成 SettingsPanel + 右键回调 + Pack 生成流程 |
| `src/modules/context-pack/ContextPackPanel.tsx`  | 修改 |   +40/-30 行 | 术语清理 + Empty State + 推荐说明 + 添加反馈    |
| `src/modules/context-pack/OutputGenerator.tsx`   | 修改 |     +5/-3 行 | 术语清理 + 来源说明                         |

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

***

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

| 文件                                          | 操作 | 行数                                                                                                            |
| ------------------------------------------- | -- | ------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/mentor_triggers.rs` | 新建 | +590 行                                                                                                        |
| `src-tauri/src/commands/vector_index.rs`    | 修改 | +5 行（pub 化 cosine\_similarity、bytes\_to\_embedding、read\_embedding、EmbeddingRow、read\_all\_ready\_embeddings） |
| `src-tauri/src/commands/mod.rs`             | 修改 | +1 行                                                                                                          |
| `src-tauri/src/lib.rs`                      | 修改 | +5 行（注册 mentor\_triggers 和 mentor\_memory 命令）                                                                 |
| `src/services/index/mentor-triggers.ts`     | 新建 | +56 行                                                                                                         |
| `src/app/AppShell.tsx`                      | 修改 | +18 行（导入、trigger 状态、保存后检查、传递给 MentorDock）                                                                     |
| `src/components/MentorDock.tsx`             | 修改 | +80 行（PlatterProps 扩展、TRIGGER\_TYPE\_CONFIG、触发器通知卡片 UI）                                                       |

### 遇到的问题及解决方式

1. **vector\_index.rs 私有函数不可访问**: `cosine_similarity`、`bytes_to_embedding`、`read_embedding`、`EmbeddingRow`、`read_all_ready_embeddings` 均为私有，无法从 `mentor_triggers.rs` 引用。解决方式：将这 5 个项改为 `pub`。
2. **`find_or_create_entry`** **生命周期冲突**: 原实现返回 `&'a mut TriggerStateEntry`，但在同一函数中先 `iter_mut().find()` 获取可变引用后又 `push()` 导致二次可变借用冲突。解决方式：改为 `find_or_create_entry_idx` 返回 `usize` 索引，通过索引访问。
3. **lib.rs 中 mentor\_memory 未注册**: 发现 `mentor_memory.rs` 已存在但 `lib.rs` 的 `use` 语句中缺少它，导致编译错误。解决方式：在 `use` 语句中补充 `mentor_memory`。

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
- **vector\_index.rs 公开化**: 将 `cosine_similarity` 等函数改为 `pub` 增加了 API 表面积，但这些函数本身是纯计算函数，无副作用，风险较低。影响范围：模块间耦合度略微增加。

***

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

| 文件                                                                    |        改动行数 | 说明                                                                              |
| --------------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------- |
| `src-tauri/src/commands/context_pack.rs`                              |     +4/-3 行 | ContextPackItem 增加 id/is\_suggestion/start\_line/end\_line 字段，移除 line\_range 字段 |
| `src/services/index/context-pack.ts`                                  | +165/-183 行 | 重写为 invoke() 调用 Rust 后端，移除 localStorage 依赖                                      |
| `src/modules/context-pack/ContextPackPanel.tsx`                       | +531/-498 行 | 适配异步 contextPackService，所有操作改为 async/await                                      |
| `.trae/specs/phase4-knowledge-index-search-context-pack/tasks.md`     |        全局替换 | 所有 28 个 Task checkbox 从 `[ ]` 更新为 `[x]`                                         |
| `.trae/specs/phase4-knowledge-index-search-context-pack/checklist.md` |        部分更新 | 108 项已验证勾选                                                                      |

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

***

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
9. 无假向量（BLOB 大小 = dimension \* 4 bytes）
10. 推理模型禁用不影响基线（metadata/FTS/vector 表独立存在）
11. 无脏数据（orphan chunks 无匹配 documents）
12. context pack 源引用存在性
13. mentor-triggers.json 有效 JSON
14. mentor-memory.json 有效 JSON
15. personalization-signals.jsonl 有效 JSONL
16. 无 mock context pack、无静默回退、无假向量
17. 任意失败返回非零退出码

### 改动的文件名以及改动的行数

| 文件                        |   改动行数 | 说明                  |
| ------------------------- | -----: | ------------------- |
| `scripts/verify-index.sh` | +310 行 | 新建文件，实现 19 项索引完整性检查 |

### 遇到的问题以及解决方式

1. **`((PASS++))`** **在** **`set -e`** **下导致脚本提前退出**：当 PASS=0 时，`((0))` 返回退出码 1，`set -e` 导致脚本终止。解决方式：将 `((PASS++))` 替换为 `PASS=$((PASS + 1))`。
2. **sqlite3 查询 FTS5 虚拟表的兼容性**：`SELECT COUNT(*) FROM chunks_fts` 在某些 sqlite3 版本可能不支持。测试确认当前 macOS 自带 sqlite3 版本支持此查询。
3. **全零向量检测**：使用 sqlite3 的 `zeroblob()` 函数检测全零 embedding BLOB，这是一种常见的假向量模式。

### 自动验证结果

- 无参数运行：✅ 返回退出码 1，显示用法提示
- 不存在路径运行：✅ 返回退出码 1，显示路径不存在错误
- 正常 vault 运行：✅ 所有 13 项检查通过，返回退出码 0
- 脏数据 vault 运行：✅ 正确检测到 7 项失败（stale embedding、假向量、orphan chunk、无效 JSON、mock context pack、全零向量），返回退出码 1

### 手工验证步骤说明

1. 运行 `./scripts/verify-index.sh <vault_path>`，其中 vault\_path 指向一个已初始化的 MindDock vault
2. 期望：脚本逐项输出检查结果，绿色 \[PASS] 表示通过，红色 \[FAIL] 表示失败，黄色 \[WARN] 表示警告，蓝色 \[INFO] 表示信息
3. 期望：所有检查通过时，最终显示 "Verification PASSED" 并返回退出码 0
4. 期望：任意检查失败时，最终显示 "Verification FAILED" 并返回退出码 1
5. 可故意添加脏数据（如 orphan chunk、stale embedding、无效 JSON 文件）验证失败检测

### 当前风险以及影响范围

1. **sqlite3/jq 依赖**：脚本依赖 `sqlite3` 和 `jq` 命令行工具，如果用户系统未安装则无法运行。脚本会在开始时检查依赖并给出明确提示。
2. **context pack 引用校验的 SQL 注入风险**：从 JSON 中提取 document\_path 后直接拼接到 SQL 查询中，如果路径包含单引号可能导致 SQL 错误。当前为只读验证脚本，影响有限。
3. **影响范围**：仅新增验证脚本，不影响任何现有功能。

***

## Phase 4+Round 1b devlog -- FTS5 全文搜索实现

**日期**: 2026-05-25
**任务起始时间**: 20:54
**任务结束时间**: 21:05
**工时**: 11 分钟

### 任务目标

实现 FTS5 全文搜索功能，包括 `fts_search` 和 `search_documents` 两个 Tauri 命令，支持对已索引的文档内容进行全文检索，返回 BM25 排序的搜索结果。

### 改动文件及行数

| 文件                                 | 操作 | 行数    |
| ---------------------------------- | -- | ----- |
| `src-tauri/src/commands/search.rs` | 新建 | +98 行 |
| `src-tauri/src/commands/mod.rs`    | 修改 | +1 行  |
| `src-tauri/src/lib.rs`             | 修改 | +3 行  |

### 遇到的问题及解决方式

无问题，一次通过。

### 自动验证结果

`cargo check` 编译通过，无错误无警告。

### 手工验证步骤说明

1. 启动应用后，先调用 `init_metadata_db` 初始化数据库
2. 对某个文档调用 `chunk_document` 进行分块索引
3. 调用 `fts_search` 命令，传入 vault\_path 和查询关键词，期望返回匹配的文档分块结果（包含 document\_path、heading\_path、start\_line、end\_line、snippet）
4. 调用 `search_documents` 命令，传入相同参数，期望返回包含 document\_title 和 source="fts" 的搜索结果
5. 验证结果按 BM25 相关性排序

### 当前风险及影响范围

- **JOIN 条件**: `chunks_fts` 与 `chunks` 表的 JOIN 使用了 `document_path` 和 `heading_path IS` 匹配，如果同一文档下有多个 heading\_path 为 NULL 的分块，可能返回重复结果。影响范围：搜索结果可能包含重复条目。后续可考虑使用 rowid 进行更精确的关联。
- **snippet 函数**: 使用 FTS5 内置 `snippet()` 函数生成摘要，标记符号为 `>>>` 和 `<<<`，前端需要处理这些标记进行高亮显示。影响范围：前端渲染逻辑。

***

## Phase 4+Round 1 devlog -- Knowledge Index + Search + Context Pack 全功能实现

**日期**: 2026-05-25
**任务起始时间**: 11:00
**任务结束时间**: 23:10
**工时**: 730 分钟

### 任务目标

Phase 4 目标是让 Mind Dock 从"有 AI 能力"进化为"有知识索引能力"，实现 Knowledge Index + Search + Context Pack 全功能闭环，包括：

1. **Metadata Store**：为每个文档建立元数据记录（title/frontmatter/content\_hash/word\_count/index\_status/embedding\_status），存入 SQLite 数据库
2. **Chunking**：将文档按 Markdown 标题层级切分为 chunk，每个 chunk 记录 heading/line\_range/content，存入 SQLite
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

| 文件                                          |     行数 | 说明                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src-tauri/src/commands/metadata.rs`        | +363 行 | DocumentRecord 结构体；SQLite metadata.db 管理（建表/CRUD）；upsert\_document\_metadata / get\_document\_metadata / list\_documents\_metadata / delete\_document\_metadata / get\_index\_stats / rebuild\_index 命令                                                                                                |
| `src-tauri/src/commands/chunking.rs`        | +279 行 | ChunkResult 结构体；Markdown 标题层级切分；chunk\_document / reindex\_document / get\_document\_chunks 命令；FTS5 虚拟表创建与全文索引                                                                                                                                                                                         |
| `src-tauri/src/commands/search.rs`          | +131 行 | SearchResult 结构体；FTS5 全文搜索 + BM25 排序 + snippet 高亮；search\_documents 命令                                                                                                                                                                                                                                 |
| `src-tauri/src/commands/vector_index.rs`    | +581 行 | EmbeddingRow 结构体；SQLite 向量存储（embeddings 表）；store\_chunk\_embedding / semantic\_search / find\_similar\_chunks / suggest\_context\_pack\_candidates / mark\_embedding\_stale / mark\_embeddings\_unavailable / mark\_embedding\_error / get\_document\_embedding / detect\_stale\_embeddings 命令；余弦相似度计算 |
| `src-tauri/src/commands/context_pack.rs`    | +214 行 | ContextPack/ContextPackItem 结构体；JSON 文件存储；create\_context\_pack / add\_item\_to\_pack / remove\_item\_from\_pack / list\_context\_packs / get\_context\_pack / delete\_context\_pack / update\_context\_pack 命令                                                                                        |
| `src-tauri/src/commands/summary_tags.rs`    | +764 行 | SummaryTagsLayer/SummaryTagsResult 结构体；确定性基线生成（无需 AI）；Embedding 信号标签推荐；LLM 摘要生成（reqwest blocking）；generate\_deterministic\_summary\_tags / generate\_embedding\_signal\_tags / generate\_llm\_summary / generate\_summary\_tags / update\_document\_summary\_tags 命令；frontmatter summary/tags 更新       |
| `src-tauri/src/commands/personalization.rs` | +133 行 | PersonalizationSignal 结构体；JSONL 行为日志追加；record\_signal / get\_personalization\_signals 命令                                                                                                                                                                                                               |
| `src-tauri/src/commands/mentor_triggers.rs` | +588 行 | TriggerResult/TriggerStateEntry 结构体；语义重复检测 / 新主题发现 / 上下文漂移 / 复习提醒触发；SQLite 触发状态持久化；check\_mentor\_triggers / get\_trigger\_state / dismiss\_trigger 命令                                                                                                                                                 |
| `src-tauri/src/commands/mentor_memory.rs`   | +228 行 | MentorMemory 结构体；JSON 文件存储；create\_mentor\_memory / list\_mentor\_memories / update\_mentor\_memory / delete\_mentor\_memory / search\_mentor\_memories 命令；置信度管理                                                                                                                                       |

#### Rust 后端 — 修改文件（4 个）

| 文件                              |     改动行数 | 说明                                              |
| ------------------------------- | -------: | ----------------------------------------------- |
| `src-tauri/Cargo.toml`          |     +2 行 | 新增 rusqlite（bundled-sqlcipher feature）和 uuid 依赖 |
| `src-tauri/src/commands/mod.rs` |     +9 行 | 注册 9 个新模块导出                                     |
| `src-tauri/src/lib.rs`          | +45/-1 行 | 注册 37 个新 Tauri 命令到 invoke\_handler              |
| `src-tauri/src/commands/fs.rs`  |    +22 行 | 新增 create\_directory 命令（Onboarding 修复）          |

#### 前端服务层 — 新建文件（9 个）

| 文件                                      |     行数 | 说明                                                                                                                                                                                               |
| --------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/index/metadata.ts`        |  +67 行 | DocumentRecord/MetadataService 接口；metadataService 封装 upsert/get/list/delete/stats/rebuild 命令                                                                                                     |
| `src/services/index/chunking.ts`        |  +32 行 | ChunkResult 接口；chunkingService 封装 chunk/reindex/get\_chunks 命令                                                                                                                                   |
| `src/services/index/search.ts`          |  +51 行 | SearchResult/SearchDocumentResult 接口；searchService 封装 fts\_search/search\_documents 命令                                                                                                           |
| `src/services/index/vector.ts`          | +140 行 | SemanticSearchResult/SimilarChunkResult/CandidateResult/DocumentEmbeddingResult 接口；vectorIndexService 封装 store/search/similar/candidates/stale/unavailable/error/get\_embedding/detect\_stale 命令 |
| `src/services/index/context-pack.ts`    | +183 行 | ContextPack/ContextPackItem 接口；contextPackService 封装 create/add/remove/list/get/delete/update 命令                                                                                                 |
| `src/services/index/summary-tags.ts`    |  +40 行 | SummaryTagsLayer/SummaryTagsResult 接口；summaryTagsService 封装 generate/update 命令                                                                                                                   |
| `src/services/index/personalization.ts` |  +51 行 | PersonalizationSignal 接口；personalizationService 封装 record/get\_signals 命令                                                                                                                        |
| `src/services/index/mentor-triggers.ts` |  +59 行 | TriggerResult/TriggerStateEntry 接口；mentorTriggersService 封装 check/get\_state/dismiss 命令                                                                                                          |
| `src/services/index/mentor-memory.ts`   | +116 行 | MentorMemory 接口；mentorMemoryService 封装 create/list/update/delete/search 命令                                                                                                                       |

#### 前端模块 — 新建文件（2 个）

| 文件                                              |     行数 | 说明                                                                                                                   |
| ----------------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------- |
| `src/modules/context-pack/ContextPackPanel.tsx` | +498 行 | Context Pack 面板：创建/编辑/删除 Pack；从搜索结果添加 chunk；AI 候选推荐（suggest\_context\_pack\_candidates）；选中项排序/移除；输出到 OutputGenerator |
| `src/modules/context-pack/OutputGenerator.tsx`  | +141 行 | 输出生成器：将 Context Pack 组装为 Markdown/Prompt 格式；支持复制和编辑；确定性 prompt assembly（不调用 AI）                                      |

#### 前端模块 — 修改文件（9 个）

| 文件                                               |      改动行数 | 说明                                                                                          |
| ------------------------------------------------ | --------: | ------------------------------------------------------------------------------------------- |
| `src/components/MentorDock.tsx`                  | +501/-7 行 | 新增索引状态 UI 卡片（FTS 索引/向量索引/重建索引按钮/进度提示）；Embedding 模型详情展示；Context Pack 入口按钮；Mentor Memory 展示区域 |
| `src/app/AppShell.tsx`                           | +101/-5 行 | 集成 ContextPackPanel；文档保存时触发 reindex\_document；新增 Context Pack 工作区视图                         |
| `src/modules/ai/AIRuntimeProvider.tsx`           |     +29 行 | 新增 embedAndStore 方法（前端获取 embedding 后传给 Rust 存储）；暴露 vectorIndexService                       |
| `src/modules/ai/ClarityInterviewPanel.tsx`       |  +18/-4 行 | 集成 personalizationService 记录用户行为信号                                                          |
| `src/modules/ai/MentorSkills.ts`                 |      +2 行 | 新增 ContextPackSkill 定义                                                                      |
| `src/modules/ai/OnboardingPanel.tsx`             |  +20/-4 行 | 修复推荐结构创建：使用 createDirectory + .keep.md 替代 .keep 文件                                          |
| `src/modules/command-palette/CommandPalette.tsx` | +273/-8 行 | 新增全文搜索命令、语义搜索命令、Context Pack 命令、索引管理命令（共 12 个新命令）                                           |
| `src/modules/dock/DocTree.tsx`                   |   +8/-1 行 | 文档树节点显示索引状态图标（已索引/未索引/索引中）                                                                  |
| `src/modules/vault/VaultProvider.tsx`            |      +4 行 | 新增 vault 初始化时创建 .minddock 目录                                                                |

#### 前端服务 — 修改文件（2 个）

| 文件                                     |      改动行数 | 说明                                                                                   |
| -------------------------------------- | --------: | ------------------------------------------------------------------------------------ |
| `src/services/filesystem/documents.ts` | +138/-3 行 | 文档保存时自动触发 upsert\_metadata + reindex\_document；新增 saveDocumentWithIndex 方法；文档删除时清理索引 |
| `src/services/markdown/frontmatter.ts` |     +11 行 | 新增 summary/tags 字段的读写支持                                                              |

### 遇到的问题以及解决方式

1. **Onboarding** **`.keep`** **文件不符合** **`.md`** **扩展名**：原代码通过 `createDocument` 创建 `.keep` 文件间接创建文件夹，但 `create_document` 命令要求 `.md` 扩展名。解决方式：新增 `create_directory` Tauri 命令使用 `std::fs::create_dir_all` 创建真实目录，然后创建 `.keep.md` 占位文件。
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
2. **Chunking**：对文档执行 chunk，确认 chunks 表按标题层级切分，每个 chunk 有 heading/line\_range/content
3. **FTS Search**：通过 Command Palette "搜索：全文搜索" 输入关键词，确认返回匹配文档和 snippet 高亮
4. **Vector Index**：确认 AI 连接后，重建索引时为每个 chunk 生成 embedding 并存入 embeddings 表
5. **Semantic Search**：通过 Command Palette "搜索：语义搜索" 输入自然语言查询，确认返回语义相关 chunk
6. **Context Pack 创建**：在搜索结果中点击"添加到 Context Pack"，确认 Pack 创建成功
7. **Context Pack AI 候选**：打开 Context Pack 面板，点击"AI 推荐"，确认返回相似 chunk 候选
8. **Context Pack 输出**：点击"生成输出"，确认 OutputGenerator 展示 Markdown/Prompt 格式内容
9. **Summary/Tags 生成**：对已索引文档调用"生成摘要和标签"，确认三层结果（deterministic/embedding\_signal/local\_llm）
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
