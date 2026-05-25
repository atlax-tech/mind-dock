# Phase 3 开发日志

---

## Phase 3+Round 3 devlog -- 【用户体验升级】Platter 文档上下文、时间线与版本对比体验升级

**日期**: 2026-05-25
**任务起始时间**: 09:45
**任务结束时间**: 10:55
**工时**: 70 分钟

### 任务目标

本轮为用户单独授权的【用户体验升级】，不作为 Phase 3 原任务边界外的阻塞点。目标是提升右侧 Platter 文档上下文与版本时间线体验：
1. 将 Context 视图调整为服务当前文档的文档目录，而不是文件路径目录
2. 文档目录支持 Markdown 标题和编号式内部小节（如 `1.1`、`2.2`、`一、`）
3. 文档目录以树形层级展示，增强父子层级视觉，加入大纲连接线
4. 文档目录项支持按源码行号定位，内部子层级也可跳转
5. 统一 Platter Context 中 `文档目录 / 时间线 / 文档信息` 的同级折叠层级结构
6. 将“版本历史”文案统一为“时间线”
7. 关闭文档标签时触发一次版本快照，但仅在本次打开期间发生过编辑时创建版本
8. 点击时间线版本后，在中间 Editor 大屏显示左右分屏 diff，而不是在右侧窄栏内展示
9. diff 结果用红色标记删除内容、绿色标记新增内容

### 改动的文件名以及改动的行数

| 文件 | 改动行数 | 说明 |
|---|---:|---|
| `src/components/MentorDock.tsx` | +809/-93 行 | Context 视图改为文档目录树；支持编号式小节解析；新增目录树连接线和层级缩进；时间线改为版本选择入口；移除右侧内联 diff；统一 `文档目录 / 时间线 / 文档信息` 同级折叠结构 |
| `src/app/AppShell.tsx` | +120/-5 行 | 新增 `diff` 工作区视图；点击时间线版本后拉取 diff 并切换到中间大屏展示；关闭标签时先保存再按条件创建版本快照；新增 `hasEdited` 标记避免重复版本 |
| `src/components/DiffViewer.tsx` | +88 行（新建） | 新增通用左右分屏 diff 组件；解析 unified diff patch；旧版本/新版本左右展示；删除红色、新增绿色 |
| `src/components/WorkspaceHeader.tsx` | +8/-2 行 | WorkspaceView 新增 `diff`；顶部视图标题支持“版本对比” |
| `src-tauri/src/commands/git.rs` | +312 行（新建） | 新增 `git_log`、`git_diff`、`git_snapshot_document`；支持关闭标签时按文档路径创建快照；支持点击 commit 查看该版本自身 diff |
| `src-tauri/src/lib.rs` | +16/-1 行 | 注册 git 相关 Tauri 命令 |
| `src/services/filesystem/git.ts` | +35 行（新建） | 封装 `git_log`、`git_diff`、`git_snapshot_document` 前端服务 |

### 遇到的问题以及解决方式

1. **文档目录被误解为文件路径目录**：最初将右侧 Context 接入了 vault 文件树。修正为仅解析当前文档内容，目录来源包括 Markdown 标题和编号式小节。
2. **内部小节无法成为父子结构**：`## 一、需求背景` 和 `1.1 项目背景` 原本被归为同级。修正为先归一化 Markdown 标题层级，再将编号小节按 `1.1 / 1.2` 等编号深度挂载到对应父级。
3. **内部子层级无法稳定定位**：原定位逻辑只按标题文本匹配 `#` 标题，无法稳定定位 `1.1` 这类普通文本小节。修正为目录项保存源码行号，点击后直接调用 `scrollToLine`。
4. **右侧窄栏 diff 可视化差**：原本在 Platter 内部展开 diff，空间不足。修正为右侧时间线只负责选择版本，中间 Editor 工作区新增 `版本对比` 视图展示大屏左右 diff。
5. **版本可能重复记录**：关闭标签时即使用户没有编辑也会尝试快照。新增 `hasEdited` 标记，只有本次打开期间发生过编辑才调用 `snapshotDocument`；后端仍保留 git diff/status 检查作为第二道保护。
6. **git log 命令参数不稳定**：`git log` 早期实现可能传入空字符串参数，且缺少 `--` 路径分隔符。修正为动态构造命令参数，并补充 `--`。
7. **点击历史版本的 diff 语义不准确**：原逻辑偏向“某 commit 到 HEAD”的区间比较。修正为指定 commit 时使用 `commit^!`，展示该版本自身引入的变更。

### 自动验证结果

```bash
$ npm run typecheck
# exit 0，无 TypeScript 错误

$ cd src-tauri && cargo check
# Finished dev profile，exit 0
```

### 手工验证步骤说明

1. 打开一个已有 Markdown 文档，切换右侧 Platter 到 Context
2. 展开“文档目录”，确认 `## 一、...`、`1.1 ...`、`1.2 ...` 等显示为树形父子结构，而不是平铺列表
3. 点击一级标题和 `1.1 / 2.2` 等内部子层级，确认编辑器跳转到对应源码行
4. 折叠所有 Context 层级，确认 `文档目录 / 时间线 / 文档信息` 作为同级 section 列表展示
5. 展开“时间线”，确认内部仅显示版本列表，不再显示“版本历史”标题
6. 打开文档后不做任何修改，关闭标签，重新打开时间线，确认不会新增版本
7. 修改文档内容，等待自动保存完成后关闭标签，重新打开文档并查看时间线，确认新增一条 `minddock: snapshot ...` 版本
8. 点击时间线中的版本，确认中间工作区切换到“版本对比”视图
9. 在“版本对比”视图中确认旧版本/新版本左右分屏展示，删除内容为红色，新增内容为绿色
10. 点击版本对比右上角关闭按钮，确认返回编辑器

### 当前风险以及影响范围

1. **编号式目录解析仍为规则解析**：当前支持常见 `1.1`、`2.2`、`一、` 结构，若用户使用非标准编号格式，可能无法进入目录。影响范围：仅右侧文档目录显示与定位。
2. **diff 解析为轻量 unified diff 解析**：当前基于 git patch 行前缀解析新增/删除/上下文，不是完整 AST diff。影响范围：复杂重命名或大块移动时，可视化可能不如专业 diff 工具精细。
3. **自动快照依赖本地 git**：若系统 git 不可用或 vault git 初始化失败，时间线版本能力不可用，但普通文档编辑和自动保存不受影响。
4. **关闭标签时快照是异步流程**：关闭标签前会先尝试写盘和创建快照，异常会显示保存错误；若 git commit 失败，标签仍会关闭。影响范围：时间线可能缺少该次版本。
5. **本轮为【用户体验升级】**：本轮内容为用户明确授权的体验升级，不作为 Phase 3 原任务边界外阻塞点；风险仅记录后续优化方向。

### 明确说明

- 本轮未 commit
- 本轮未 push
- 本轮未 merge
- 本轮为【用户体验升级】，属于用户单独授权升级内容

---

## Phase 3+Round 2 devlog -- PM 手测修复：AI Mentor 工作流闭环

**日期**: 2026-05-25
**任务起始时间**: 17:00
**任务结束时间**: 19:30
**工时**: 150 分钟

### 任务目标

从"接入 AI"变成"可用的 AI Mentor 基础工作流"，修复 PM 手测发现的 8 个问题：
- P0-1: Guided Capture 有限轮次追问（默认 3 轮，每轮 1 问，明确完成阶段，可提前结束）
- P0-2: Guided Capture 生成结构化 capture（title/summary/tags/structured_body/next_action，保留 original_input 和 qa_trace）
- P0-3: 新增 Mentor Skill（CaptureClarifierSkill + CaptureSynthesizerSkill），约束问题范围
- P0-4: Clarity Interview 接受建议后 strip fence，解析为结构化结果，有推荐标题
- P1-5: AI 调用支持阶段性状态提示 + 取消按钮
- P1-6: Onboarding 升级为最小知识库搭建流程
- P1-7: Embedding 状态可见
- P2-8: AI Runtime 日志补充 request_type 字段

### 改动的文件名以及改动的行数

#### 新增文件（1 个）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/modules/ai/MentorSkills.ts` | +160 行（新建） | Mentor Skill 定义：CaptureClarifierSkill（有限轮次追问约束）、CaptureSynthesizerSkill（结构化输出约束）、ClarityInterviewSkill（文档建议约束）；结构化输出解析函数（parseStructuredCapture、parseClarityInterviewResult）；自动 strip fenced code block |

#### 修改文件（8 个）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/modules/capture/QuickCapturePanel.tsx` | +350/-200 行 | 完全重写引导模式：有限轮次状态机（input→interview→synthesizing→preview→error）；MAX_ROUNDS=3；每轮 1 问；明确"完成整理/保存到 Inbox"阶段；用户可提前结束；使用 CaptureClarifierSkill/CaptureSynthesizerSkill；AI 不可用时保留原始输入 + "保存为极速捕获"按钮；显示 aiPhase 阶段性状态 + 取消按钮 |
| `src/modules/ai/ClarityInterviewPanel.tsx` | +200/-180 行 | 完全重写：使用 ClarityInterviewSkill 约束输出；parseClarityInterviewResult 自动 strip fence；解析为 title/filename/markdown_body 结构化结果；显示推荐标题和文件名预览；AI 不可用时显示错误 + "继续创建空文档"按钮需用户确认；显示 aiPhase 阶段性状态 + 取消按钮 |
| `src/modules/ai/AIRuntimeProvider.tsx` | +60/-20 行 | 新增 aiPhase 状态（idle/connecting/loading_model/thinking/generating/saving/done/error）；新增 cancelCurrentOperation 方法（cancelledRef 标志 + 清理计时器）；阶段自动推进计时器（connecting→loading_model→thinking→generating）；embed 使用 embedding_model 配置 |
| `src/modules/ai/OnboardingPanel.tsx` | +350/-180 行 | 完全重写为 6 步知识库搭建流程：welcome→purpose→goal→structure→configure→done；4 种知识库用途选择；规则生成推荐结构（不依赖 AI）；AI 可用时增强推荐结构；实际创建文件夹和初始文档；完成时展示"你完成了什么、下一步做什么" |
| `src/components/MentorDock.tsx` | +20/-5 行 | Chat Model 和 Embedding Model 分开显示；Embedding Model 说明使用 /api/embed 端点 + Phase 4 接入索引；日志显示 request_type |
| `src/services/ai/runtime.ts` | +2/-1 行 | AIConfig 新增 embedding_model 字段 |
| `src/services/ai/logs.ts` | +5/-3 行 | AIRuntimeLog 新增 request_type 字段；appendLog 新增 requestType 参数 |
| `src-tauri/src/commands/ai_runtime.rs` | +3/-2 行 | AIConfig 新增 embedding_model 字段；默认值 None |
| `src-tauri/src/commands/ai_logs.rs` | +5/-2 行 | AIRuntimeLog 新增 request_type 字段；append_ai_log 新增 request_type 参数 |
| `src/app/AppShell.tsx` | +25/-15 行 | doCreateDocument 使用 ClarityInterviewResult 结构化结果；AI 推荐标题创建文档标题和文件名；缺标题时从意图生成 |

### 每个 P0/P1/P2 的处理结果

| 编号 | 优先级 | 处理结果 |
|---|---|---|
| P0-1 | P0 | ✅ 已实现。MAX_ROUNDS=3，每轮只问 1 个问题，达到上限自动进入综合阶段，用户可随时点"完成整理"提前结束 |
| P0-2 | P0 | ✅ 已实现。CaptureSynthesizerSkill 生成 title/summary/tags/structured_body/next_action，保存时包含 original_input 和 qa_trace metadata（HTML 注释形式） |
| P0-3 | P0 | ✅ 已实现。新增 MentorSkills.ts，定义 CaptureClarifierSkill（追问约束：每轮1问、不发散、不评价）、CaptureSynthesizerSkill（结构化输出约束）、ClarityInterviewSkill（文档建议约束） |
| P0-4 | P0 | ✅ 已实现。parseClarityInterviewResult 自动 strip fenced code block（```markdown...```）；解析为 title/filename/markdown_body；AppShell 使用 AI 推荐标题创建文档标题和文件名；缺标题时从意图生成 |
| P1-5 | P1 | ✅ 已实现。AIRuntimeProvider 新增 aiPhase 状态（7 个阶段）+ cancelCurrentOperation；QuickCapturePanel 和 ClarityInterviewPanel 显示阶段性状态文本 + 取消按钮；未实现完整 token streaming（成本过高），但阶段性状态提示已满足需求 |
| P1-6 | P1 | ✅ 已实现。Onboarding 升级为 6 步流程：welcome→purpose→goal→structure→configure→done；规则生成推荐结构（4 种用途模板）；AI 可用时增强推荐；实际创建文件夹和 README 文档；完成时展示"你完成了什么、下一步做什么" |
| P1-7 | P1 | ✅ 已实现。MentorDock 分开显示 Chat Model 和 Embedding Model 状态；Embedding Model 说明使用 /api/embed 端点 + Phase 4 接入索引；embed 调用优先使用 embedding_model 配置 |
| P2-8 | P2 | ✅ 已实现。Rust 端和前端日志结构新增 request_type 字段；request_type 值包括 guided_capture_question/guided_capture_synthesis/clarity_interview/embedding_test；UI 显示 request_type |

### 是否实现 stream

未实现完整 token streaming。原因：Tauri v2 的 reqwest blocking 模式不支持流式传输，完整 streaming 需要改为 async + SSE/事件通道，成本过高。当前实现为**阶段性状态提示**（connecting→loading_model→thinking→generating），配合取消按钮，满足"不让用户误以为 App 卡死"的需求。

### Guided Capture 状态机说明

```
input → interview (AI 追问第 1 轮)
interview → interview (继续追问，直到 MAX_ROUNDS=3 或用户点"完成整理")
interview → synthesizing (用户点"完成整理"或达到 MAX_ROUNDS)
synthesizing → preview (AI 生成结构化 capture 成功)
synthesizing → error (AI 生成失败)
preview → 保存到 Inbox (用户确认保存)
任何步骤 AI 失败 → error (保留原始输入，可保存为极速捕获)
error → interview (重试，有对话历史时)
error → input (重试，无对话历史时)
```

### 新增 Mentor Skill 列表

| Skill | 目标 | 约束 |
|---|---|---|
| CaptureClarifierSkill | 通过有限轮次追问帮助用户理清模糊想法 | 每轮只问 1 个问题；问题类型限定在补充细节/明确目标/发现遗漏/确认边界；不发散不评价 |
| CaptureSynthesizerSkill | 将对话内容综合为结构化知识捕获 | 必须输出 title/summary/tags/next_action/structured_body；标题不得使用"未命名"；标签 2-5 个 |
| ClarityInterviewSkill | 根据文档意图生成结构化文档建议 | 必须输出 title/filename/markdown_body；正文不包裹在代码块中；标题从意图提炼 |

### Clarity Interview 输出结构说明

```typescript
interface ClarityInterviewResult {
  title: string;       // AI 推荐文档标题
  filename: string;    // AI 推荐文件名（不含 .md 后缀）
  markdown_body: string; // 正常 Markdown 正文（已 strip fence）
}
```

解析流程：
1. AI 原始输出 → 检测并 strip fenced code block（```markdown...```）
2. 解析 YAML frontmatter（title/filename）
3. 提取 markdown_body
4. 如果 title 为空，从正文第一个 `# ` 标题提取
5. AppShell 使用 title 创建文档标题，使用 filename 创建文件名

### Onboarding 新流程说明

6 步流程：
1. **Welcome**：介绍 Mind Dock AI 能力，"开始搭建知识库"或"跳过"
2. **Purpose**：选择知识库用途（个人知识库/项目文档库/研究资料库/创意灵感库）
3. **Goal**：输入当前目标（可选）
4. **Structure**：展示推荐知识库结构（规则生成，AI 可用时增强），用户可接受/跳过
5. **Configure**：配置 AI Runtime（endpoint + 模型选择 + 连接检测），可选
6. **Done**：展示"你完成了什么、下一步做什么"

### Embedding provider 当前状态

- 使用 Ollama `/api/embed` 端点（优先），`/api/embeddings` 仅作兼容 fallback
- MentorDock 显示 Embedding Model 状态（跟随 Chat Model 或独立配置）
- 明确说明：索引驱动将在 Phase 4 接入
- embed 调用优先使用 `embedding_model` 配置，其次 `default_model`

### 自动验证结果

```bash
$ pnpm typecheck   # exit 0, 无错误
$ cd src-tauri && cargo check   # Finished dev profile, 0 warnings
```

### 手动验证结果

待 PM 手动验证以下路径：
1. Guided Capture 输入一个模糊想法，AI 最多追问 3 轮
2. 用户回答后，系统生成有标题、有摘要、有标签、有正文的 capture
3. Inbox 不再出现无意义的"未命名捕获"
4. Guided Capture 保存结果包含 original_input 和 qa_trace
5. Clarity Interview 接受建议后创建文档，有推荐标题，正文不是代码块
6. AI 不可用时不 silent fallback，不丢用户输入
7. Ollama 慢响应时，UI 有明确 running 状态或流式输出
8. Onboarding 不只是配置模型，能完成一次最小知识库搭建动作
9. Phase 1/2 的 vault、文档编辑、quick capture 极速模式、sticky notes、Platter 不回归

### 当前风险以及影响范围

1. **AI 输出格式不稳定**：模型可能不严格遵循 Skill 定义的结构化输出格式。解析函数有 fallback 逻辑，但极端情况下可能丢失字段。影响范围：标题可能为空，需要用户手动补充。
2. **Onboarding 创建文件夹**：通过创建 `.keep` 文件确保文件夹存在，但文件管理器中可能显示 `.keep` 文件。影响范围：视觉上不美观，但不影响功能。
3. **阶段状态推进**：aiPhase 使用计时器模拟阶段推进，不是真实模型状态反馈。影响范围：阶段显示可能不准确（如模型已开始生成但显示 thinking），但不会卡死 UI。
4. **取消操作**：cancelCurrentOperation 设置 cancelledRef 标志，但 reqwest blocking 请求无法真正中断。影响范围：取消后仍需等待当前 HTTP 请求完成，但 UI 会立即响应。

### 明确说明

- 未 commit
- 未 push
- 未 merge

---

## Phase 3+Round 1 devlog -- AI Runtime + AI Mentor Onboarding 全功能实现

**日期**: 2026-05-25
**任务起始时间**: 14:00
**任务结束时间**: 16:30
**工时**: 150 分钟

### 任务目标

让 AI Mentor 从概念变成真实产品内能力，包括：
1. 修复 Phase 2 遗留风险（Sticky 转 Capture ID 返回不可靠 + 无文档打开时创建便签不可见）
2. 实现 AI Runtime Provider Interface（Ollama 连通性检测、chat/generate 调用、embedding 生成）
3. 实现 AI Runtime Logs（持久化 JSONL 日志，只记录 metadata 不记录完整 prompt/response）
4. 实现 MentorEvent Bus（7 种基础事件类型）
5. 实现 First Open Onboarding（可配置 endpoint/模型，可跳过，状态持久化）
6. 实现 Document Clarity Interview（新建文档前 AI 基于意图提出建议，用户可接受/修改/拒绝）
7. 升级 Guided Capture 从占位为真实 AI flow（2-4 轮追问 + 结构化 capture）
8. 实现 AI Suggestion 数据模型（pending/accepted/rejected/edited 状态追踪）
9. 替换 MentorDock Mentor 视图占位为真实 AI Mentor 状态
10. 扩展 Command Palette AI 相关命令

### 改动的文件名以及改动的行数

#### Rust 后端（4 个新建 + 4 个修改）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src-tauri/src/commands/ai_runtime.rs` | +490 行（新建） | Ollama 连通性检测/chat/embed 命令 + AI 配置读写 + Onboarding 状态读写；endpoint URL 格式校验；is_remote 标记；/api/embed 优先 + /api/embeddings 兼容 fallback |
| `src-tauri/src/commands/ai_logs.rs` | +110 行（新建） | AI Runtime Log 追加/读取命令；只记录 metadata 不记录完整 prompt/response |
| `src-tauri/src/commands/ai_suggestions.rs` | +170 行（新建） | AI Suggestion 追加/读取/状态更新命令；安全写入（tmp + rename） |
| `src-tauri/src/commands/capture.rs` | +2/-2 行 | `append_capture` 返回 `Result<CaptureEntry, String>` 而非 `Result<(), String>` |
| `src-tauri/src/commands/mod.rs` | +3 行 | 新增 ai_runtime / ai_logs / ai_suggestions 模块导出 |
| `src-tauri/src/lib.rs` | +14/-1 行 | 注册 12 个新 AI 命令到 Tauri builder |
| `src-tauri/Cargo.toml` | +1 行 | 新增 reqwest 依赖（json + blocking features） |
| `src-tauri/Cargo.lock` | +427 行 | 依赖锁文件自动更新 |

#### 前端服务层（4 个新建）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/services/ai/runtime.ts` | +52 行（新建） | Ollama 连通性/chat/embed/AI 配置 Tauri invoke 封装 |
| `src/services/ai/logs.ts` | +32 行（新建） | AI Runtime Log Tauri invoke 封装 |
| `src/services/ai/suggestions.ts` | +40 行（新建） | AI Suggestion Tauri invoke 封装 |
| `src/services/ai/onboarding.ts` | +20 行（新建） | Onboarding 状态 Tauri invoke 封装 |

#### 前端模块（5 个新建 + 3 个修改）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/modules/ai/AIRuntimeProvider.tsx` | +140 行（新建） | AI Runtime React Context：connection status / config / available models / chat / embed / checkConnection / updateConfig |
| `src/modules/ai/MentorEventBus.ts` | +55 行（新建） | 事件总线：emit / on / off 方法，7 种事件类型 |
| `src/modules/ai/AISuggestionsProvider.tsx` | +85 行（新建） | AI Suggestion 状态管理 Context：createSuggestion / updateSuggestionStatus / loadSuggestions |
| `src/modules/ai/OnboardingPanel.tsx` | +180 行（新建） | First Open Onboarding 面板：endpoint 配置 + 模型选择 + 连接检测 + 跳过/完成 |
| `src/modules/ai/ClarityInterviewPanel.tsx` | +220 行（新建） | Document Clarity Interview 面板：意图输入 → AI 建议 → 接受/修改/拒绝；AI 不可用时显示错误 + "继续创建空文档"按钮 |
| `src/modules/capture/QuickCapturePanel.tsx` | +380/-20 行 | 引导模式从占位升级为真实 Guided Capture：AI 追问 2-4 轮 + 结构化 capture + AI 不可用时保留原始输入 + "保存为极速捕获"按钮 |
| `src/modules/capture/CaptureProvider.tsx` | +6/-10 行 | `addCapture` 直接使用返回的 CaptureEntry.id，不再反查 |
| `src/modules/sticky-notes/StickyNotesProvider.tsx` | +5/-2 行 | 无 active document 时默认创建 pinned/global sticky note |
| `src/modules/sticky-notes/StickyNotesLayer.tsx` | +5/-2 行 | 过滤逻辑增加无绑定文档便签在无 active document 时可见 |

#### 前端组件（2 个修改）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/components/MentorDock.tsx` | +280/-40 行 | Mentor 视图替换为真实 AI Mentor 状态：连接状态指示 + 配置内联编辑 + 最近 AI 建议列表 + Runtime Log 折叠面板 |
| `src/modules/command-palette/CommandPalette.tsx` | +40/-5 行 | 新增 4 个 AI 命令：配置 Runtime / 检测连接 / 查看 Runtime 日志 / 重新运行 Onboarding |

#### App 集成（2 个修改）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/App.tsx` | +6/-2 行 | 包裹 AIRuntimeProvider → AISuggestionsProvider |
| `src/app/AppShell.tsx` | +80/-10 行 | 集成 OnboardingPanel + ClarityInterviewPanel + AI 相关回调传递 |

### 遇到的问题以及解决方式

1. **Ollama embedding endpoint 版本问题**：Ollama 当前 API 中 `/api/embeddings` 已被标记为 deprecated，主 endpoint 为 `/api/embed`。实现时优先调用 `/api/embed`（参数 `model + input`），`/api/embeddings` 仅作为兼容 fallback，且在返回结果中标记 `used_deprecated_endpoint: true`。
2. **Clarity Interview AI 不可用降级**：原设计为"AI 不可用时直接创建空文档"，这容易变成 silent fallback。修改为：必须显示明确错误状态 + 提供"继续创建空文档"按钮由用户确认 + 不自动创建空文档。
3. **Guided Capture AI 不可用降级**：原设计为"自动切换到极速模式"，修改为：显示明确错误 + 保留原始输入 + 默认不自动提交 + 提供"保存为极速捕获"按钮由用户确认。
4. **Rust 安全检查范围**：AI 网络请求命令（ollama_chat 等）没有 vault path，不适合做 `assert_path_inside_vault` 校验。区分处理：文件读写命令做路径校验，网络请求命令做 endpoint URL 格式校验 + is_remote 标记。
5. **AI Runtime Logs 隐私约束**：确保日志结构体只包含 metadata 字段，不记录完整 prompt/用户输入/模型输出。

### 自动验证结果

```bash
$ git branch --show-current
dev-rebuild-phase

$ git status --short
 M src-tauri/Cargo.lock
 M src-tauri/Cargo.toml
 M src-tauri/src/commands/capture.rs
 M src-tauri/src/commands/mod.rs
 M src-tauri/src/lib.rs
 M src/App.tsx
 M src/app/AppShell.tsx
 M src/components/MentorDock.tsx
 M src/modules/capture/CaptureProvider.tsx
 M src/modules/capture/QuickCapturePanel.tsx
 M src/modules/command-palette/CommandPalette.tsx
 M src/modules/sticky-notes/StickyNotesLayer.tsx
 M src/modules/sticky-notes/StickyNotesProvider.tsx
 M src/services/filesystem/capture.ts
?? src-tauri/src/commands/ai_logs.rs
?? src-tauri/src/commands/ai_runtime.rs
?? src-tauri/src/commands/ai_suggestions.rs
?? src/modules/ai/
?? src/services/ai/

$ pnpm typecheck   # exit 0, 无错误
$ cd src-tauri && cargo check   # Finished dev profile, 0 warnings

# Mock/Fake/Placeholder 搜索：AI 核心路径中无 mock/stub/fake/hardcoded/TODO/FIXME
# fallback 仅出现在 ollama_embed 的 /api/embed → /api/embeddings 兼容逻辑（合法）
```

### 手工验证步骤说明

1. 启动 App 并选择已有 vault，确认首次进入时显示 Onboarding 面板
2. 在 Onboarding 中配置 Ollama endpoint（默认 localhost:11434），点击"检测连接"
3. Ollama 可用时确认显示绿色连接状态和可用模型列表
4. Ollama 不可用时确认显示红色错误状态
5. 跳过 Onboarding，确认状态持久化，重启后不再显示
6. 通过 Command Palette "AI: 重新运行 Onboarding" 重新触发
7. 新建文档时确认弹出 Clarity Interview 面板
8. 输入意图后确认 AI 生成结构/格式建议
9. 确认可接受/修改/拒绝 AI 建议
10. AI 不可用时确认显示错误 + "继续创建空文档"按钮（需用户确认）
11. 打开 Quick Capture，切换到引导模式
12. 输入初始想法后确认 AI 连续追问 2-4 个问题
13. 完成后确认生成结构化 capture 并写入 inbox
14. AI 不可用时确认显示错误 + 保留原始输入 + "保存为极速捕获"按钮
15. 查看 MentorDock Mentor 视图，确认显示真实 AI Runtime 状态
16. 确认可内联编辑 endpoint 和 model
17. 确认最近 AI 建议列表显示
18. 展开 Runtime Log 折叠面板，确认日志记录存在
19. Sticky 转 Capture 后确认能拿到稳定 capture id
20. 无文档打开时创建便签确认可见（默认 pinned）
21. 回归 Phase 1/2 核心流程：文档创建/编辑/保存、多标签、Command Palette、Quick Capture 极速模式、Sticky Notes

### 当前风险以及影响范围

1. **Ollama 依赖**：AI 功能完全依赖本地 Ollama 服务。Ollama 未安装或未启动时，所有 AI 功能不可用，但用户仍可正常使用非 AI 功能。影响范围：AI 功能全部降级。
2. **reqwest blocking**：Rust 端使用 `reqwest::blocking` 进行 HTTP 调用，在 Tauri 命令中会阻塞线程。当前 AI 调用频率低，风险可控。后续可改为 async。
3. **Guided Capture AI 追问质量**：追问质量取决于模型能力，小模型可能生成不理想的追问。影响范围：用户体验可能不一致。
4. **Onboarding 状态重置**：通过 Command Palette 可重置 onboarding status 为 pending，用户可能误操作。影响范围：重新显示 Onboarding 面板，但不影响数据。
5. **Clarity Interview 建议格式**：AI 生成的文档结构建议格式可能不一致，取决于模型输出。影响范围：用户可能需要手动调整建议内容。

---
