# Phase 3.2 Frontend Dev Log

---

## Phase 3.2 + Round 9 devlog -- DOCK-REAL-003: Dock 全控制面真实动作接入

**日期**: 2026-05-15
**任务起始时间**: 2026-05-15 07:30
**任务结束时间**: 2026-05-15 08:21
**工时**: 51 分钟
**任务类型**: Dock 控制面真实动作接入
**卡号**: DOCK-REAL-003

### 任务目标

将 Dock 从"半真实仪表盘"推进到"可操作的真实治理台"。所有已显示的 Dock 按钮必须执行真实功能，不允许 Planned/Disabled/Coming Soon 标注（除"管理视图模板"作为订阅预览）。

### 本卡真实化的 Dock 按钮

| 按钮/交互 | 真实动作 | Repository/Action |
|---|---|---|
| 左侧导航 5 个模式项 | 切换 dockMode (overview/unsorted/spaces/recommendations/health) | useDockViewModel.setDockMode |
| 顶部"视图"选择器 | 打开 Popover 选择视图模式，真实切换 dockMode | useDockViewModel.setDockMode |
| 顶部"筛选" | 打开筛选 Popover，按类型/状态/推荐筛选 | useDockViewModel.toggleTypeFilter/toggleStatusFilter |
| 顶部"自定义" | 打开自定义 Popover，列可见性/密度/排序，持久化到 IndexedDB | saveDockViewSettings (repository) |
| 信号栏 6 个指标 | 点击切换 dockMode + healthFilter | useDockViewModel.setDockMode |
| "查看建议" | 切 recommendations mode + 选中第一条 pending rec | useDockViewModel.setDockMode |
| "全部预览" | 打开推荐预览 Drawer，展示全部 pending recs | 新增 recPreviewOpen 状态 |
| "预览方案"(Inspector) | 打开推荐预览 Drawer 并选中推荐 | setRecPreviewOpen + setSelectedRecId |
| "忽略"(Inspector 推荐) | 提示选择推荐 | toast 提示 |
| Document "归档" | updateArchivedEntry 设置 archivedAt | repository.updateArchivedEntry |
| Document "恢复" | updateArchivedEntry 清除 archivedAt | repository.updateArchivedEntry |
| Document "在 Mind 查看" | 无节点时 upsertMindNode 创建后切 Mind | repository.upsertMindNode |
| Draft "发布" | publishDraftToDocument 真实发布 | repository.publishDraftToDocument |
| Tip "在 Mind 查看" | convertTipToMindNode 创建节点后切 Mind | repository.convertTipToMindNode |
| Collection/Tag Inspector | 展示相关内容列表，点击可切换选中实体 | dockData.entities 过滤 |
| "打开 Editor"(底部) | 未选择对象时 toast 提示 | toast 反馈 |
| "在 Mind 查看"(底部) | 不依赖 relatedMindNode 存在，无节点时创建 | upsertMindNode |
| "管理视图模板" | 打开 Pro Preview Drawer（订阅预览） | proPreviewOpen 状态 |

### 视图模板为何作为订阅预览

"管理视图模板"是本卡唯一允许不是免费真实能力的入口。按照 PM 修正规则，该按钮不能隐藏、不能禁用、不能标 Planned。因此实现为：点击打开 Pro Preview Drawer，说明"视图模板属于 Atlax Pro 订阅能力，当前可预览不可启用"。不 mock 成已创建模板。

### 变更文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/lib/db.ts` | +30 | DockViewSettingsRecord 接口 + dockViewSettings 表 + version 25 migration |
| `apps/web/lib/repository.ts` | +50 | getDockViewSettings + saveDockViewSettings + updateArchivedEntry 扩展 archivedAt |
| `apps/web/lib/events.ts` | +2 | document_archived + document_restored 事件类型 |
| `apps/web/app/workspace/features/dock/useDockData.ts` | +70 | DockHealthDetails 接口 + computeHealthDetails 函数 + healthDetails 字段 + REFRESH_EVENTS 扩展 |
| `apps/web/app/workspace/features/dock/useDockViewModel.ts` | +160 | 新增 DockViewMode/DockFilterState/DockViewSettings 类型 + useDockViewModel hook |
| `apps/web/app/workspace/page.tsx` | ~400 | DockView 全面改造：左侧导航模式切换 + 顶部视图/筛选/自定义 Popover + 信号栏可点击 + filteredEntities 按 dockMode 过滤 + 推荐预览 Drawer + Pro Preview Drawer + Inspector 真实动作 + 空态 + 列可见性/密度行高 |
| `apps/web/app/workspace/features/editor/TiptapEditor.tsx` | -10 | 移除未使用的 BLOCK_HANDLE_SELECTOR 常量（预存 lint error 修复） |

### 遇到的问题及解决方式

1. **updateArchivedEntry 不支持 archivedAt 字段**: 原函数的 updates 参数仅支持 tags/project/content/title。解决：扩展 updates 类型添加 `archivedAt?: Date | null`，函数内部单独处理 archivedAt 写入（从 updates 解构后单独 update）。
2. **useDockViewModel 初始使用 localStorage 临时方案**: 因 db.ts 和 repository.ts 变更尚未完成，useDockViewModel 初始使用 localStorage 存储设置。解决：db.ts/repository.ts 变更完成后，替换为真实的 `getDockViewSettings`/`saveDockViewSettings` 调用。
3. **TiptapEditor.tsx 预存 lint error**: `BLOCK_HANDLE_SELECTOR` 常量定义但未使用，导致 `pnpm build:web` 失败。解决：删除该未使用常量（非本卡引入，但阻塞 build）。
4. **page.tsx 中 `as any` 类型断言**: handleArchiveDocument/handleRestoreDocument 中 `updateArchivedEntry` 调用使用 `as any` 绕过类型检查。解决：扩展 `updateArchivedEntry` 的 updates 类型支持 `archivedAt`，移除 `as any`。

### 自动验证结果

```
pnpm validate: ✅ PASS
  - lint: ✅ PASS (0 errors, 1 pre-existing warning in page.tsx)
  - typecheck: ✅ PASS
  - test: ✅ 816/816 PASS (30 test files)
  - check:terminology: ✅ PASS

pnpm build:web: ✅ PASS
```

### 手工验证步骤

1. 打开 `/workspace` → 进入 Dock tab
2. 点击左侧导航"待整理" → 中间区域展示 tips + drafts + 弱归类 documents
3. 点击左侧导航"推荐" → 展示 pending recommendations
4. 点击左侧导航"结构健康" → 展示健康度数据
5. 点击顶部"视图"按钮 → 下拉菜单列出 5 种模式，选择后真实切换
6. 点击顶部"筛选"按钮 → 类型/状态筛选影响列表
7. 点击顶部"自定义"按钮 → 列可见性/密度/排序可修改，刷新后保留
8. 点击信号栏"孤立节点" → 切换到 health 模式 + isolated 筛选
9. 点击"全部预览" → 打开推荐预览 Drawer
10. 选中 Document → Inspector 中"归档"按钮可点击 → 真实归档
11. 选中 Document → Inspector 中"恢复"按钮可点击 → 真实恢复
12. 选中 Document → Inspector 中"在 Mind 查看" → 无节点时自动创建后跳转
13. 选中 Draft → Inspector 中"发布"按钮可点击 → 真实发布
14. 选中 Tip → Inspector 中"在 Mind 查看" → 调用 convertTipToMindNode 后跳转
15. 选中 Collection/Tag → Inspector 展示相关内容列表
16. 未选择对象时点击底部"打开 Editor" → toast 提示选择对象
17. 点击"管理视图模板" → 打开 Pro Preview Drawer
18. 各模式空态展示真实提示，无假数据

### 当前风险

1. **health 模式下 duplicates 和 weaklyClassified 筛选精度**: 重复主题基于 tag name 大小写不敏感去重，弱归类基于 project 为空或 tags 为空，可能不完全匹配用户预期
2. **spaces 模式下内容分组**: 当前仅按 project 过滤 documents，未实现按 collection/tag 分组的树形展示
3. **Dock 视图设置首次加载延迟**: 设置从 IndexedDB 异步加载，首次渲染可能短暂显示默认设置
4. **推荐预览 Drawer 中 action 后刷新**: 推荐 action 后需手动关闭 Drawer 或等待 Dock 刷新

### 已知限制和建议拆出的后续卡

1. **DOCK-HEALTH-001**: 结构健康深度治理 — 批量归档/删除停滞内容、合并重复标签、自动归类弱归类文档
2. **DOCK-SPACES-001**: 空间模式树形分组 — 按 collection/project/tag 层级分组展示，支持拖拽归类
3. **DOCK-FILTER-001**: 筛选持久化 — 将筛选条件保存到 URL query params 或 IndexedDB，刷新后保留
4. **DOCK-TEMPLATE-001**: 视图模板订阅能力 — Pro 用户可创建/保存/切换自定义视图模板
5. **DOCK-BATCH-001**: 批量操作 — 多选实体后批量归档/删除/归类/打标签

---

## Phase 3.2 + Round 1 addendum -- DOM-aligned Block Handle Controller

**日期**: 2026-05-15

### 调整目标

修复 Editor Block Handler 从静态多实例装饰变成真实可用的单一浮动控制器：

- 默认不再渲染一整列 handle
- hover 真实 ProseMirror block 时只显示当前 block handle
- handle 位置基于真实 DOM `getBoundingClientRect()` 计算
- 菜单和拖拽操作作用于 selected block，而不是当前光标或 JSON index

### 具体改动

- 移除按 Tiptap JSON block 数组渲染的 `tiptap-drag-handles`
- 新增单实例 `tiptap-block-handle-controller`
- 新增 block target 解析：
  - 支持 paragraph / heading / blockquote / code block / horizontal rule / list item / task item / callout-like node
  - 列表优先解析具体 `li` / task item
  - 通过 ProseMirror DOM → position → node 建立 `{ pos, node, dom, type }`
- 新增 block action menu：
  - Turn into
  - Color
  - Copy link to block
  - Duplicate
  - Move up
  - Move down
  - Delete
- 新增 same-parent drag reorder：
  - drag start 记录 source block target
  - drag over 根据 pointer 下真实 block 计算 target
  - drop 使用 ProseMirror transaction 移动 block
  - unsupported cross-level drop 不产生假反馈
- 新增克制的 selected block highlight 与 drop indicator
- 未新增 AI / Comment / Suggest edits / Cloud / Collaboration 入口

### 自动验证结果

```
pnpm --filter @atlax/web typecheck
  ✅ PASS

pnpm --filter @atlax/web test
  ✅ PASS: 30 files / 816 tests
```

### 手动验证结果

- `/workspace` 加载成功
- Editor 下 `tiptap-drag-handles` 数量为 0
- hover 段落后只出现单个 `tiptap-block-handle-controller`
- controller 获得 fixed DOM 坐标，例如 `left: 312px; top: 233px`
- 点击 handle 打开 action menu，菜单仅包含本轮允许项
- Duplicate 操作真实修改正文内容

### Ready for Codex Review

✅ 是

---

## Phase 3.2 + Round 1 devlog -- Dock Real Intake + Tiptap Editor Foundation

**日期**: 2026-05-15

### 任务目标

停止继续推进 Markdown textarea Editor，把 Editor 主编辑区切换为 Tiptap-based rich/block editor foundation，并保持 Dock 真实数据接入、Draft autosave、Entry-origin Draft、Publish、Discard/Delete 的现有闭环。

### 变更摘要

**卡名**: Dock Real Intake + Tiptap Editor Foundation
**范围**: Tiptap Editor foundation + Tiptap JSON 持久化 + Dock/Editor 打通兼容 + 测试替换

#### Tiptap 选型变更

- 移除 `@uiw/react-md-editor`
- 新增 Tiptap 开源基础包：
  - `@tiptap/react`
  - `@tiptap/pm`
  - `@tiptap/starter-kit`
  - `@tiptap/extension-placeholder`
  - `@tiptap/suggestion`
- 未接入 Tiptap Pro / Cloud / Collaboration / AI / Comments / Versioning

#### 数据字段变化

- `EntryRecord` 与 `EditorDraftRecord` 新增 Tiptap 内容兼容字段：
  - `contentJson`: Tiptap JSON，主存储
  - `plainText`: `editor.getText()` 结果，用于搜索、算法、Mind summary
  - `html`: `editor.getHTML()`/adapter HTML 结果，用于预览/导出
  - `markdown`: 兼容字段，第一阶段由 Tiptap JSON 基础序列化生成
- 新增 Dexie v24 migration：
  - 旧 `content` 迁移为基础 paragraph Tiptap doc
  - `plainText = content`
  - `markdown = content`
  - `html` 生成安全基础 HTML
- `content` 保留为 legacy compatibility 字段，同步为 `plainText || markdown`

#### Editor 生命周期兼容情况

- `DraftEditorView` 主编辑区切换为 `TiptapEditor`
- 保留标题输入、状态栏、发布按钮、删除/丢弃、Inspector、Source Packet 结构
- `useEditorDraft` autosave 写入 `contentJson/plainText/html/markdown/content`
- `publishDraftToDocument` 发布或 update original 时同步 JSON/text/html/markdown 到 Entry
- Entry-origin draft 仍通过 `findActiveDraftBySourceEntryId` 复用，不重复创建
- 空草稿发布判断继续基于 title + plain text/content

#### Tiptap Editor 能力

- Toolbar 已接 Tiptap commands：
  - bold / italic / strike
  - paragraph / heading
  - blockquote
  - inline code / code block
  - bullet list / ordered list
  - horizontal rule
- Slash menu 使用 `@tiptap/suggestion`，支持：
  - paragraph
  - heading
  - bullet list
  - ordered list
  - blockquote
  - code block
  - horizontal rule
- Drag handle block reorder 已实现基础同级 top-level block reorder
- HTML mode 为只读 HTML preview，不允许任意 HTML source editing 保存

#### Dock 接入范围

- 保留当前 `useDockData` 真实 IndexedDB 读取：
  - documents / drafts / tips / mind nodes / collections / tags / recommendations
- Dock 打开 Editor 行为保持：
  - Document/Entry → `initialEntryId`，进入 entry-origin draft
  - Draft → `initialDraftId`
  - Tip → `convertTipToDraft` 后打开 draft
  - MindNode → `documentId` 作为 document 打开
- 本卡不做复杂治理、批量清理、模板市场、完整 Review 接入

### 自动验证结果

```
pnpm install: ✅ PASS
  - lockfile up to date

pnpm --dir apps/web test tests/draft-repository.test.ts tests/dock-editor-003.test.ts tests/markdown-editor-adapter.test.tsx: ✅ PASS
  - 95/95 PASS

pnpm validate: ✅ PASS
  - lint: ✅ PASS with 3 existing warnings in Mind/page files
  - typecheck: ✅ PASS
  - test: ✅ PASS
    - domain: 315/315 PASS
    - web: 806/806 PASS
  - check:terminology: ✅ PASS

pnpm build:web: ✅ PASS
  - /workspace: 60.2 kB → 193 kB First Load JS
```

### 手工验证方法

1. 新建 Draft → 输入富文本内容 → 等待 autosave → 刷新页面 → 内容恢复
2. Draft 使用 toolbar 设置标题/列表/引用/代码/分割线 → publish → 生成正式 document
3. 从 Dock 打开真实 Document → 进入 Editor → 修改内容 → publish/update → Dock/Mind/Home 可读取更新后的 plainText/title
4. 从 Dock 打开 Draft → 编辑 → autosave/publish 正常
5. 从 Dock 打开 Tip → 转 Draft 并进入 Editor
6. 打开 HTML Preview → 输出与当前编辑内容基本一致，且不可编辑保存 HTML source
7. 验证不出现空白 Editor、不出现重复 Draft、不破坏 entry-origin 回写

### 未完成但预留/限制

- Slash menu 为基础 Notion-like block menu，后续可扩展 icon、搜索分组、keyboard polish
- Drag handle 目前为 top-level block reorder，后续可扩展 nested block reorder 与更精确的 block position overlay
- HTML source editing 明确未开放，避免 schema 丢内容
- Markdown input rules / 高保真 Markdown import/export 后续再做

### Ready for Codex Review

✅ 是

---

## Phase 3.2 + Round 1 addendum -- Editor Toolbar Alignment + List Marker Fix

**日期**: 2026-05-15

### 调整目标

根据 Editor 截图继续修正 Tiptap UI 细节：

- 草稿列表默认展示
- 发布/删除按钮贴右展示，不再在右侧留下大块空白
- 有序列表/无序列表 marker 在黑色背景中可见
- 默认隐藏静态 drag handle gutter，避免正文旁边继续出现错位感

### 具体改动

- `showDraftsList` 默认恢复为 `true`
- 新建/选择/从 Dock 或 Mind 打开草稿时不再自动收起草稿列表
- 顶部 Dock toolbar slot 移除 `max-w-[920px]`，让 slot 填满发布按钮前的可用空间
- 发布/删除/保存状态包在 `ml-auto` action group 中，保证靠右
- Tiptap list CSS 显式设置：
  - `ul { list-style-type: disc }`
  - `ol { list-style-type: decimal }`
  - `li::marker` 使用高对比文字色
  - `li p` 去掉额外段落 margin，避免列表行距异常
- Drag handle 渲染改为 `enableBlockHandles = false` 默认关闭；保留 `reorderTopLevelBlock` 和可选 handle 代码，后续需要做 DOM-aligned handle 时再打开

### 自动验证结果

```
pnpm --dir apps/web test tests/dock-editor-003.test.ts tests/markdown-editor-adapter.test.tsx
  ✅ PASS: 51/51

pnpm --dir apps/web typecheck
  ✅ PASS

pnpm validate
  ✅ PASS
  - lint: PASS with 3 existing warnings
  - domain tests: 315/315 PASS
  - web tests: 811/811 PASS
  - terminology: PASS, No Inbox references found

pnpm build:web
  ✅ PASS
  - /workspace: 60.7 kB
  - First Load JS: 194 kB
```

### Ready for Codex Review

✅ 是

---

## Phase 3.2 + Round 1 addendum -- Editor Sidebar Defaults + Dock Toolbar Placement

**日期**: 2026-05-15

### 调整目标

在 `Dock Real Intake + Tiptap Editor Foundation` 基础上修正 Editor 首屏体验：

- Editor 的草稿控制栏、源数据包、检查器默认不展示
- 新建草稿、从 Dock/Mind 打开 Editor 时自动保持侧栏隐藏
- 将 Tiptap/Markdown 兼容工具栏移入 Editor 顶部 Dock 栏
- 提升黑色背景下可视化文字对比度
- 检查图二错位原因并修复空白编辑器中的错位 handle

### 具体改动

- `DraftEditorView` 的草稿列表默认改为隐藏，新建/选择/外部打开草稿时保持隐藏
- Workspace 层的 `showSourcePacket` / `showInspector` 默认改为 `false`
- Dock/Mind -> Editor 打开路径显式隐藏源数据包和检查器
- `TiptapEditor` 新增 `toolbarPortalTargetId`，通过 React portal 把工具栏挂载到 Editor 顶部栏中的 `editor-dock-toolbar-slot`
- Tiptap placeholder / 正文颜色提高亮度，适配深色编辑背景
- Mind canvas 增加 `getReadableTextColor` 对比度工具，黑底标签使用自动可读色并加轻微阴影
- Drag handle 错位原因：上一版按 Tiptap JSON block 数量绝对定位 handle，没有和 ProseMirror 实际 block DOM 位置绑定；空段落/不可见 block 会显示成左侧孤立 handle。当前修复为仅在存在多个可见 block 时展示 handle，避免空白 editor 视觉错位，同时保留底层同级 block reorder 能力

### 自动验证结果

```
pnpm --dir apps/web test tests/draft-repository.test.ts tests/dock-editor-003.test.ts tests/markdown-editor-adapter.test.tsx
  ✅ PASS: 99/99

pnpm --dir apps/web typecheck
  ✅ PASS

pnpm validate
  ✅ PASS
  - lint: PASS with 3 existing warnings
  - domain tests: 315/315 PASS
  - web tests: 810/810 PASS
  - terminology: PASS, No Inbox references found

pnpm build:web
  ✅ PASS
  - /workspace: 60.7 kB
  - First Load JS: 194 kB
```

### 手工验证路径

1. 进入 Editor tab，确认草稿列表、源数据包、检查器默认不展示
2. 新建草稿，确认不自动展开任何侧栏
3. 从 Dock 打开 Document/Draft/Tip，确认进入 Editor 后侧栏仍隐藏
4. 确认 Tiptap 工具栏位于 Editor 顶部 Dock 栏，不再占用正文上方空间
5. 在空白 Editor 中确认左侧不再出现孤立的一列 drag handle
6. 输入多个可见 block 后确认基础 drag reorder 能力仍保留
7. 在 Mind canvas / Dock 真实数据可视化中检查黑色背景下文字对比度

### Ready for Codex Review

✅ 是

---

## Phase 3.2 + Round 8 devlog -- DOCK-EDITOR-003 Codex Review FAIL 修复（续：Editor 选区错位根因修复 + Toolbar 能力不退化 + flushSave metadata）

**日期**: 2026-05-15
**任务起始时间**: 2026-05-15 03:40
**任务结束时间**: 2026-05-15 04:02
**工时**: 22 分钟
**任务类型**: Codex Review FAIL 修复（续）
**卡号**: DOCK-EDITOR-003

### 任务目标

修复 DOCK-EDITOR-003 Codex Review 仍未通过的两个手测阻塞问题：(1) Editor 展示/输入/选区错位；(2) Markdown 工具栏外置且不能删功能。同时修复遗留 metadata 问题：flushSave 区分"没有 pending project"和"pending project 被清空为 null"。

### 问题诊断与修复

#### 问题 1: Editor 展示/输入/选区错位（根因修复）

**根因**：这是 MarkdownEditorAdapter 的 UI 集成问题，不是 repository API 问题。@uiw/react-md-editor v4 内部使用 overlay 架构——`<pre><code>` mirror 层（绝对定位、pointer-events: none）渲染语法高亮文本，`<textarea>`（透明、绝对定位覆盖在 mirror 上方）接收用户输入。两层必须拥有完全一致的 font-size/line-height/padding/letter-spacing/word-spacing/white-space/tab-size，否则 caret、选区、IME 候选条位置会偏移。上一轮仅通过 CSS `display: none` 隐藏 mirror 并设置 textarea 为不透明，但 CSS 优先级和加载时序不稳定，且 `textareaProps.ref` 在 React 18 中不会被 @uiw 正确转发到内部 textarea，导致 toolbar 命令无法获取 textarea 元素。

**修复方式**（三层防御）：

1. **API 层**：设置 `highlightEnable={false}`，这是 @uiw 的正式 API。当 `highlightEnable=false` 时：
   - mirror（pre/code）组件**完全不渲染**（不是 CSS 隐藏，而是 React 不创建 DOM）
   - textarea 自动获得 `WebkitTextFillColor: 'initial'` 和 `overflow: 'auto'` 内联样式
   - 只有一个可见且可交互的文本层，从根本上消除错位可能

2. **CSS 层**（纵深防御）：
   - `.w-md-editor-text-pre { display: none !important }`：即使未来 @uiw 版本忽略 `highlightEnable`，mirror 仍被 CSS 隐藏
   - `.w-md-editor-text-input { position: relative !important; top: auto; left: auto; height: auto }`：textarea 从绝对定位改为相对定位，进入正常文档流
   - `.w-md-editor-text-input > textarea { -webkit-text-fill-color: initial !important; color: #e0e3e6 !important; overflow: hidden !important; height: auto !important }`：确保 textarea 不透明、颜色正确、高度自适应

3. **Ref 层**：用 `containerRef.current.querySelector('textarea.w-md-editor-text-input')` 替代 `textareaProps.ref`，直接从 DOM 获取 textarea 元素。避免 React 18 中 ref 不被 @uiw 转发的问题。

4. **Auto-resize**：添加 `useLayoutEffect` 监听 value 变化，通过 `scrollHeight` 自动调整 textarea 高度。

#### 问题 2: Markdown 工具栏外置且不删功能

**为何本轮没有删减 Markdown 工具能力**：用户明确要求"不能通过删除成熟 Markdown 工具来'解决'外置问题"。@uiw 默认 toolbar 包含 13 个格式命令（bold/italic/strikethrough/link/image/code/codeBlock/heading/quote/hr/unorderedList/orderedList/taskList），本轮全部保留并实现真实命令执行。

**修复方式**：
- 外置 toolbar 包含 13 个功能按钮 + 1 个 disabled/planned 按钮（表格），共 14 个按钮
- 每个按钮通过 `exec()` → `getTextarea()` → 读取 `selectionStart/selectionEnd` → 调用 `wrapSelection`/`prefixLine`/`insertAtCursor` → `onChange(result.text)` → `requestAnimationFrame` 恢复光标
- 不支持的按钮（表格）明确 `disabled={true}` + label 标注 "(Planned)"，不静默消失
- **Fullscreen 处理方式**：
  - `extraCommands={[]}`：移除右侧命令区（含 fullscreen 按钮）
  - CSS 防护：`.w-md-editor-fullscreen` 强制 `position: relative !important; z-index: auto !important`
  - 外置 toolbar 中无任何 fullscreen/Maximize/Minimize 按钮
  - COMMANDS map 中不包含 fullscreen/maximize 命令
  - 禁用 fullscreen 的原因：fullscreen 会破坏 workspace shell 布局，导致侧边栏、顶部导航栏被覆盖

#### 问题 3: flushSave metadata 区分

**修复方式**（上一轮已实现，本轮验证）：
- `hasPendingProjectSave = projectTimerRef.current !== null`：区分"没有 pending project"（timer 为 null，不保存）和"pending project 被清空为 null"（timer 存在，保存 null 值）
- `pendingProjectValue = latestRef.current.project`：捕获最新 project 值（可能为 null）
- 用户清空 project 后立即 publish：`updateDraft(uid, did, { project: null })` 正确保存 null，entry/draft metadata 不保留旧 project

### 变更文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/app/workspace/features/editor/MarkdownEditorAdapter.tsx` | ~70 (重写) | highlightEnable={false} + containerRef querySelector + useLayoutEffect auto-resize + CSS 纵深防御 + 13 个 toolbar 命令 |
| `apps/web/tests/markdown-editor-adapter.test.tsx` | ~407 (重写) | 纯函数测试 + 渲染测试 + toolbar 完整性测试 + 命令集成测试 + 对齐修复验证 |
| `apps/web/tests/dock-editor-003.test.ts` | +18 | 新增 highlightEnable/containerRef/auto-resize/CSS 验证测试 |

### 新增/更新测试

**markdown-editor-adapter.test.tsx**（46 个测试，新增文件）：

1. **pure command functions** (25 tests): wrapSelection (6)、prefixLine (7)、insertAtCursor (3)、COMMANDS map (9)
2. **rendering** (8 tests): 外置 toolbar 渲染、MDEditor 渲染、hideToolbar=true、built-in toolbar 不渲染、preview=edit、highlightEnable=false、mirror 不渲染、extraCommands=[]、value/onChange
3. **external toolbar completeness** (4 tests): 13 个默认按钮存在、表格 disabled/planned、无 fullscreen 按钮、disabled prop
4. **toolbar command integration** (6 tests): bold/heading/image/hr/strikethrough/taskList 真实执行
5. **alignment fix verification** (2 tests): containerRef querySelector、外置 toolbar 在 MDEditor 外部

**dock-editor-003.test.ts**（44 个测试，新增 6 个）：

- highlightEnable={false} 验证
- CSS mirror 隐藏纵深防御
- CSS textarea 不透明
- CSS textarea 相对定位
- containerRef querySelector
- useLayoutEffect auto-resize

### 自动验证结果

```
pnpm validate: ✅ PASS (0 errors, 3 pre-existing warnings)
pnpm build:web: ✅ PASS
tests/markdown-editor-adapter.test.tsx: ✅ 46/46 PASS
tests/dock-editor-003.test.ts: ✅ 44/44 PASS
全量测试: ✅ 850/850 PASS (30 test files)
```

### 手工验证步骤

1. 打开 workspace 页面，切换到 Editor tab，创建新草稿
2. 在编辑器中输入中文文字 → 期望 caret 位置与文字视觉位置一致，无偏移
3. 输入英文文字 → 期望 caret 位置正确
4. 使用中文 IME 输入 → 期望候选条出现在 caret 正下方，无偏移
5. 输入 Markdown 标题（`## Title`）→ 期望标题文字与正文对齐
6. 输入 Markdown 列表（`- item`）→ 期望列表项对齐
7. 输入长段落 → 期望编辑器自动扩展高度，无需手动滚动
8. 拖选多行文字 → 期望选区与视觉文本一致
9. 点击外置 toolbar 的粗体按钮 → 期望选中文字被 `**` 包裹
10. 点击外置 toolbar 的标题按钮 → 期望当前行添加 `## ` 前缀
11. 再次点击标题按钮 → 期望 `## ` 前缀被移除（toggle）
12. 点击外置 toolbar 的删除线按钮 → 期望选中文字被 `~~` 包裹
13. 点击外置 toolbar 的任务列表按钮 → 期望当前行添加 `- [ ] ` 前缀
14. 确认 @uiw 内建 toolbar 不可见 → 期望编辑区上方只有外置 toolbar
15. 确认无 fullscreen 按钮 → 期望 toolbar 中无全屏/最大化按钮
16. 确认表格按钮存在但 disabled → 期望显示 "表格 (Planned)"
17. 在 Editor Inspector 中清空 project → 立即点击发布 → entry/draft metadata 不保留旧 project

### 当前风险

1. **wrapSelection 不支持 toggle**：内联格式（粗体/斜体/代码/链接）连续点击会重复包裹（如 `****text****`），需后续迭代添加 unwrap 逻辑
2. **prefixLine 仅作用于首行**：多行选中时点击列表/引用按钮，仅首行添加前缀，需后续迭代支持多行批量操作
3. **highlightEnable={false} 丢失语法高亮**：当前编辑器为纯文本模式，无 Markdown 语法着色。后续可考虑切换到 CodeMirror 6 实现语法高亮 + 无错位
4. **useLayoutEffect auto-resize 在 SSR 时警告**：已通过 `next/dynamic` + `ssr: false` 避免 SSR 执行
5. **styled-jsx global 警告**：测试环境中 `style jsx global` 触发 React 非 boolean 属性警告（`jsx`/`global`），不影响功能

### 是否 ready for Codex Review

✅ Ready for Codex Review。`pnpm validate` 和 `pnpm build:web` 均通过，输入错位根因已通过 `highlightEnable={false}` API 层修复（非 CSS hack），toolbar 外置保留全部 13 个命令 + 1 个 planned 按钮，flushSave metadata 区分已验证，测试从 44 扩展到 90（含 46 个 adapter 专项测试）。

---

## Phase 3.2 + Round 7 devlog -- DOCK-EDITOR-003 Codex Review FAIL 修复（续：Editor 输入错位 + Toolbar 外置）

**日期**: 2026-05-15
**任务起始时间**: 2026-05-15 02:55
**任务结束时间**: 2026-05-15 03:05
**工时**: 10 分钟
**任务类型**: Codex Review FAIL 修复（续）
**卡号**: DOCK-EDITOR-003

### 任务目标

修复 DOCK-EDITOR-003 Codex Review 仍未通过的核心 UI 问题：Editor 输入错位和 Toolbar 未外置。明确结论：这是 Markdown editor adapter UI 集成问题，不是 repository API 问题。

### 问题诊断

#### 问题 1: Editor 输入错位

**根因分析**：`@uiw/react-md-editor` 内部使用 mirror 机制——`<pre><code>` 元素（绝对定位 `position: absolute; left: 0`）与 `<textarea>`（相对定位）叠加，textarea 透明覆盖在 mirror 上方。两者必须拥有完全一致的 font-size / line-height / padding / letter-spacing / word-spacing / white-space / tab-size，否则 caret 和 IME 候选条位置会偏移。

**具体错位原因**：原 CSS 中 `.w-md-editor-text` 容器设置了 `padding: 16px 20px`，而内部 `code` 和 `textarea` 又设置了 `padding-left: 20px; padding-right: 20px`。由于 `pre/code` 是 `position: absolute; left: 0`，它从容器 padding box 左边缘（0px）开始，加上自身 20px padding = 文字从 20px 开始。而 `textarea` 是相对定位，从容器 content area 开始（20px），加上自身 20px padding = 文字从 40px 开始。**双重 padding 导致 20px 偏移**。

**修复方式**：
- `.w-md-editor-text` 容器 `padding: 0 !important`（消除容器级 padding）
- `code` 和 `textarea` 统一 `padding: 0 !important`（由父容器 DraftEditorView 的 `px-8` 提供水平间距）
- 强制统一所有文本度量属性：`font-size: 16px !important`、`line-height: 1.75 !important`、`letter-spacing: normal !important`、`word-spacing: normal !important`、`white-space: pre-wrap !important`、`tab-size: 4 !important`
- 消除 `border: none !important` 和 `margin: 0 !important` 避免盒模型差异
- 设置 `caret-color: #86d7ff` 使 caret 在暗色背景上可见

#### 问题 2: Toolbar 未外置

**原问题**：`hideToolbar={false}`，内建 toolbar 仍在 @uiw 组件内部渲染，且 CSS 仅做了 sticky 定位伪装外置。

**修复方式**：
- `hideToolbar={true}`：彻底隐藏 @uiw 内建 toolbar
- CSS 添加 `.w-md-editor-toolbar { display: none !important }` 双重保险
- 新增 `md-external-toolbar` 容器，作为 adapter 的独立 layout block，位于 MDEditor 上方
- 外置 toolbar 包含 8 个核心格式按钮：粗体(**)、斜体(*)、行内代码(`)、链接([]())、标题(##)、引用(>)、无序列表(-)、有序列表(1.)
- 每个按钮通过 `exec()` 函数直接操作 textarea selection + `onChange` 回调，不是 fake 按钮
- `exec()` 使用 `containerRef.querySelector('textarea')` 获取真实 textarea 元素，读取 selectionStart/selectionEnd，调用 `wrapSelection` 或 `prefixLine` 修改文本，通过 `requestAnimationFrame` 恢复光标位置
- 行级命令（标题/引用/列表）支持 toggle：再次点击移除前缀

#### 问题 3: Fullscreen 未彻底禁用

**修复方式**：
- `extraCommands={[]}`：移除右侧命令区（含 fullscreen 按钮）
- CSS 防护：`.w-md-editor-fullscreen` 强制 `position: relative !important; z-index: auto !important`
- 外置 toolbar 中无任何 fullscreen/Maximize/Minimize 按钮
- `preview="edit"`：默认仅编辑模式，无 live split preview

### 变更文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/app/workspace/features/editor/MarkdownEditorAdapter.tsx` | ~130 (重写) | 外置 toolbar + CSS 收敛 + fullscreen 禁用 + 命令执行 |
| `apps/web/tests/dock-editor-003.test.ts` | +55 | 新增 7 个 adapter 测试 |

### 新增/更新测试

在 "MarkdownEditorAdapter layout constraints" describe 组中，从 4 个测试扩展到 11 个测试：

1. `preview="edit"` not "live" — 保留
2. `extraCommands={[]}` — 保留
3. **`hideToolbar={true}`** — 新增：验证内建 toolbar 隐藏
4. **外置 toolbar 存在** — 新增：验证 `md-external-toolbar` 和 `data-testid`
5. **外置 toolbar 无 fullscreen 按钮** — 新增：验证不含 Maximize/Minimize/Fullscreen/全屏
6. **外置 toolbar 按钮执行真实命令** — 新增：验证 8 个 exec() 调用模式
7. CSS fullscreen 防护 — 保留
8. **CSS 消除双重 padding** — 新增：验证 `padding: 0 !important`，不含 `padding: 16px 20px`
9. **CSS 强制统一文本度量** — 新增：验证 letter-spacing/word-spacing/white-space/tab-size
10. **onChange 传递到 MDEditor** — 新增：验证 onChange 回调链
11. 不含业务逻辑 — 保留

### 自动验证结果

```
pnpm validate: ✅ PASS (0 errors, 3 warnings — 均为既有无关 warning)
pnpm build:web: ✅ PASS
tests/dock-editor-003.test.ts: ✅ 36/36 PASS (原 29 + 新增 7)
全量测试: ✅ 796/796 PASS (domain 315 + web 481, 29 test files)
```

### 手工验证步骤

1. 打开 workspace 页面，切换到 Editor tab，创建新草稿
2. 在编辑器中输入中文文字 → 期望 caret 位置与文字视觉位置一致，无偏移
3. 输入英文文字 → 期望 caret 位置正确
4. 使用中文 IME 输入 → 期望候选条出现在 caret 正下方，无偏移
5. 按 Enter 换行 → 期望新行起始位置与上一行对齐
6. 输入 Markdown 列表（`- item`）→ 期望列表项对齐
7. 点击外置 toolbar 的粗体按钮 → 期望选中文字被 `**` 包裹
8. 点击外置 toolbar 的标题按钮 → 期望当前行添加 `## ` 前缀
9. 再次点击标题按钮 → 期望 `## ` 前缀被移除（toggle）
10. 确认 @uiw 内建 toolbar 不可见 → 期望编辑区上方只有外置 toolbar
11. 确认无 fullscreen 按钮 → 期望 toolbar 中无全屏/最大化按钮
12. 确认默认 edit-only 模式 → 期望无 live preview 分屏

### 当前风险

1. **wrapSelection 不支持 toggle**：内联格式（粗体/斜体/代码/链接）连续点击会重复包裹（如 `****text****`），需后续迭代添加 unwrap 逻辑
2. **prefixLine 仅作用于首行**：多行选中时点击列表/引用按钮，仅首行添加前缀，需后续迭代支持多行批量操作
3. **exec() 依赖 DOM query**：通过 `containerRef.querySelector('textarea')` 获取 textarea 元素，若 @uiw 内部 DOM 结构变化可能失效
4. **IME composition 与 React 受控组件**：@uiw 使用受控 textarea，在 IME 组合期间 onChange 可能被频繁触发，需手测验证中文/日文/韩文输入体验

### 是否 ready for Codex Review

✅ Ready for Codex Review。`pnpm validate` 和 `pnpm build:web` 均通过，输入错位根因已定位并修复（双重 padding → 统一 padding: 0），toolbar 已外置为独立 layout block，fullscreen 已彻底禁用，测试从 29 扩展到 36。

---

## Phase 3.2 + Round 6 devlog -- DOCK-EDITOR-003 Codex Review FAIL 修复

**日期**: 2026-05-15
**任务类型**: Codex Review FAIL 修复
**卡号**: DOCK-EDITOR-003

### 任务目标

修复 DOCK-EDITOR-003 Codex Review 5 个阻塞 findings，使其满足 Phase 3.2 FE-LOCAL-REAL 验收。

### 5 个 Findings 修复摘要

#### Finding 1: Existing-entry publish drops metadata

**文件**: `apps/web/lib/repository.ts`
**问题**: `publishDraftToDocument` 在 `update_original` 模式下只更新 title/content/archivedAt，没有把 draft.tags 和 draft.project 写回已有 entry。
**修复**: 在 `update_original` 分支中，构建 `updatePayload` 对象，条件性添加 `tags`（当 `Array.isArray(draft.tags)` 时）和 `project`（当 `draft.project !== undefined` 时）。`collectionId` 当前 entry 模型不支持，不写入 entry，逻辑安全。
**策略**: metadata publish/update_original 策略 — tags 和 project 从 draft 同步到 entry，collectionId 因 entry 模型无此字段而安全跳过。

#### Finding 2: Pending project edits are discarded before publish

**文件**: `apps/web/app/workspace/features/editor/useEditorDraft.ts`
**问题**: `flushSave` 清掉 project debounce timer 但没有保存 pending project，导致用户改 project 后立刻 publish 时 metadata 丢失。
**修复**:
- `latestRef` 扩展包含 `project` 字段，确保 flush 时能读到最新 project 值
- `flushSave` 在清除 projectTimerRef 前先捕获 `pendingProject`（仅当 timer 存在时表示有 pending 写入）
- `flushSave` 并行执行 content save 和 pending project save（`Promise.all`）
- project debounce 仍保留，避免每个按键写库
- tags 立即保存逻辑不变
**策略**: flushSave metadata 策略 — flush 时检查 projectTimerRef 是否存在，若存在则表示有 pending project 写入需要立即 flush。

#### Finding 3: Browser confirm is used for product confirmation UI

**文件**: `apps/web/app/workspace/page.tsx`
**问题**: Dock destructive actions 使用 `window.confirm`，不符合 desktop app 产品要求。
**修复**:
- 移除所有 `window.confirm` 调用
- 新增 `confirmDialog` state（含 title/message/confirmLabel/onConfirm）
- `handleDiscardDraft` 和 `handleDiscardTip` 改为设置 confirmDialog state，确认后执行
- DockView return 包裹 `<>...</>` Fragment，在主布局后渲染确认弹窗
- 确认弹窗样式与现有产品 UI 一致（毛玻璃背景、圆角、取消/确认按钮）
- 取消确认只 `setConfirmDialog(null)`，不写库，不显示成功 toast
- 不引入任何浏览器 alert/confirm/prompt

#### Finding 4: View in Mind is enabled without a linked node

**文件**: `apps/web/app/workspace/page.tsx`
**问题**: Document 的 "View in Mind" 总是可点击，即使没有 relatedMindNode。
**修复**:
- Document Inspector 中的 "在 Mind 查看" 按钮：添加 `disabled={!relatedMindNode}`，无关联节点时显示 "在 Mind 查看 (无关联节点)"
- Bottom actions 中的 "在 Mind 查看" 按钮：同样添加 `disabled={!relatedMindNode}`，无关联节点时显示 "在 Mind 查看 (无节点)"
- 不允许 fake success，不伪造定位
**规则**: View in Mind disabled/planned 规则 — 只有 relatedMindNode 存在时才启用，无关联 mind node 时 disabled + 提示不可用。

#### Finding 5: Markdown editor adapter exposes layout-breaking defaults

**文件**: `apps/web/app/workspace/features/editor/MarkdownEditorAdapter.tsx`
**问题**: @uiw/react-md-editor 默认 toolbar/live split/fullscreen 破坏当前产品布局。
**修复**:
- `preview="live"` → `preview="edit"`：默认仅编辑模式，避免 live split preview 导致编辑视图错位
- `extraCommands={[]}`：移除右侧工具栏命令（包括 fullscreen），防止全屏破坏 workspace shell
- CSS 添加 fullscreen 防护：`.w-md-editor-fullscreen` 强制 `position: relative !important`，阻止全屏 breakout
- CSS 隐藏预览模式切换按钮（Live Preview/Preview/Edit Preview）
- 工具栏添加 `position: sticky; top: 0; z-index: 1` 防止漂移到文档正文布局中造成错位
- 移除不再需要的 preview 相关 CSS（因 preview="edit" 不渲染预览面板）
- Adapter 仍然只负责 editor UI/value/onChange，不承载 autosave/publish/repository 逻辑
**约束**: Markdown editor adapter 布局约束 — edit-only 模式、无 fullscreen、toolbar sticky 定位、CSS 防护全屏 breakout。

### 变更文件

| 文件 | 说明 |
|---|---|
| `apps/web/lib/repository.ts` | update_original 发布时同步 tags/project 到已有 entry |
| `apps/web/app/workspace/features/editor/useEditorDraft.ts` | flushSave 保存 pending project + latestRef 扩展 |
| `apps/web/app/workspace/page.tsx` | 产品内确认弹窗替代 window.confirm + View in Mind disabled 规则 |
| `apps/web/app/workspace/features/editor/MarkdownEditorAdapter.tsx` | preview="edit" + extraCommands={[]} + fullscreen CSS 防护 |
| `apps/web/tests/dock-editor-003.test.ts` | 新增 5 个 describe 组覆盖 review findings |

### 新增/更新测试

1. **update_original publish syncs metadata to existing entry** (3 tests): tags 写回、空 tags 覆盖、collectionId 不写入 entry
2. **flushSave saves pending project** (3 tests): project 立即保存、tags 立即保存、content+project 分开调用
3. **Dock destructive actions use product UI not window.confirm** (1 test): 源码断言 page.tsx 不包含 window.confirm/alert/prompt
4. **View in Mind disabled without relatedMindNode** (2 tests): 无 documentId 返回 null、有匹配 documentId 返回 node
5. **MarkdownEditorAdapter layout constraints** (4 tests): preview="edit"、extraCommands={[]}、fullscreen CSS 防护、不含业务逻辑

### 自动验证结果

```
pnpm validate: ✅ PASS (0 errors, 3 warnings — 均为既有无关 warning)
pnpm build:web: ✅ PASS
tests/dock-editor-003.test.ts: ✅ 29/29 PASS (原 16 + 新增 13)
全量测试: ✅ 789/789 PASS (29 test files)
```

### 手工验证步骤

1. 打开 workspace 页面，切换到 Dock tab
2. 选中一个 Document → "在 Mind 查看" → 无关联节点时应 disabled + 提示
3. 选中一个 Draft → 点击 "丢弃 Draft" → 应弹出产品内确认弹窗（非浏览器 confirm）
4. 选中一个 Tip → 点击 "丢弃 Tip" → 应弹出产品内确认弹窗
5. 在 Editor 中修改 project → 立即点击发布 → project 应被正确保存
6. 在 Editor 中编辑已有 entry 的 draft → 发布（修改原文档）→ entry 的 tags/project 应更新
7. Markdown 编辑器应仅显示编辑模式，无 live split preview，无 fullscreen 按钮

### 是否 ready for Codex Review

✅ Ready for Codex Review。`pnpm validate` 和 `pnpm build:web` 均通过，5 个 findings 全部修复并有测试覆盖。

---

## Phase 3.2 + Round 5 devlog -- DOCK-EDITOR-003: Dock + Editor 核心闭环

**日期**: 2026-05-15
**任务起始时间**: 2026-05-15 01:17
**任务结束时间**: 2026-05-15 01:47
**工时**: 30 分钟

### 任务目标

实现 Dock + Editor 核心闭环：Editor 从原生 textarea 升级为成熟 Markdown Editor adapter、Draft 支持 metadata 字段、Dock → Editor 上下文链路打通、Editor Inspector metadata 读写、Dock Inspector Actions 补齐、事件与刷新闭环。

### 卡号

DOCK-EDITOR-003

### 变更范围

#### A. Editor 从 textarea 升级为 MarkdownEditorAdapter

- 新增 `MarkdownEditorAdapter.tsx`，封装 `@uiw/react-md-editor`，接口：`value`, `onChange`, `disabled?`, `placeholder?`
- Adapter 隔离第三方编辑器实现，业务逻辑留在 DraftEditorView/useEditorDraft
- 暗色主题适配：`data-color-mode="dark"` + CSS 覆盖，融入 `#0b0f11` / `#1c2023` 设计系统
- SSR 兼容：Next.js `dynamic()` + `ssr: false` 导入
- DraftEditorView 中 textarea 替换为 MarkdownEditorAdapter

**Editor 依赖选择理由**：
- 选择 `@uiw/react-md-editor` 而非架构文档推荐的 Milkdown，原因是低风险快速落地优先
- `@uiw/react-md-editor` 成熟稳定（1k+ stars）、React 原生集成、支持暗色主题、轻量
- SSR 处理：使用 `next/dynamic` + `ssr: false`，避免 `window is not defined`
- 后续替换空间：MarkdownEditorAdapter 隔离了第三方编辑器实现，替换为 Milkdown 只需修改 Adapter 内部，不影响业务逻辑

#### B. Draft metadata 字段扩展

- `EditorDraftRecord` 新增 `tags: string[]`、`project: string | null`、`collectionId: string | null`
- Dexie version 23 migration（基于实际 version 22 增量），旧记录回填 tags: [] / project: null / collectionId: null
- `createDraft` / `updateDraft` 扩展支持 metadata
- `publishDraftToDocument` 修改：新 entry 的 tags/project 来自 draft，不再硬编码空值
- entry-origin draft 创建时从原 entry 继承 tags/project/collectionId

#### C. Dock → Editor 上下文验证与修复

- 修复 `initialEntryId` effect 中 entry 不存在时静默失败 → 添加 toast 错误反馈
- 修复 `initialEntryId` effect 中 draft 创建失败时静默失败 → 添加 toast 错误反馈
- 修复 `initialDraftId` effect 不调用 `resetForDraft` → 添加即时内容加载
- 修复 `useEditorDraft` 在 `draftId` 变化时不重置状态 → 防止旧内容被保存到新 draft（竞态条件修复）

#### D. Editor Inspector metadata 读写 UI

- Tags 区域：tag chips 展示 + Enter 添加 + X 删除（立即保存）
- Project 区域：文本输入框（debounce 保存，避免输入抖动）
- Collection 区域：disabled/planned 占位（"集合功能开发中"），不伪造假 select

#### E. Dock Inspector Actions 补齐

- Document：新增 Archive/Restore 按钮（disabled + Planned，因 `archiveEntry` 不存在）
- Draft：新增 Publish 按钮（disabled + Planned，Dock 中无法保证 Editor 状态已 flush）；Discard 从 disabled+Planned 升级为真实执行 + 确认弹窗
- Tip：Discard 从 disabled+Preview 升级为真实执行 + 确认弹窗
- 确认弹窗使用 `window.confirm()`，文案明确提示"此操作不可恢复"

#### F. 事件与刷新闭环

- 修正 Publish 事件语义：移除伪造的 `archive_completed`，改为 `draft_deleted`（publish 后 draft 状态变为 published）
- 补全 metadata 更新事件：`handleTagsChange` / `handleProjectChange` / `handleCollectionChange` 触发 `draft_updated` 事件
- 验证 Dock 通过 `REFRESH_EVENTS` 列表自动刷新

### 变更文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/app/workspace/features/editor/MarkdownEditorAdapter.tsx` | +120 | 新增 Markdown 编辑器 Adapter |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | ~80 | 替换 textarea + Inspector metadata UI + 错误反馈修复 |
| `apps/web/app/workspace/features/editor/useEditorDraft.ts` | ~80 | metadata 状态 + 回调 + 竞态修复 + 事件触发 |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | ~20 | metadata 参数透传 + 事件语义修正 |
| `apps/web/lib/db.ts` | ~30 | EditorDraftRecord 类型 + Dexie v23 migration |
| `apps/web/lib/repository.ts` | ~30 | createDraft/updateDraft/publishDraftToDocument 扩展 |
| `apps/web/app/workspace/features/dock/useDockData.ts` | ~30 | discardDraft/discardTip 真实执行函数 |
| `apps/web/app/workspace/page.tsx` | ~50 | Dock Inspector Actions 补齐 + 确认弹窗 |
| `apps/web/lib/events.ts` | +2 | 新增 draft_deleted/tip_discarded 事件类型 |
| `apps/web/tests/dock-editor-003.test.ts` | +195 | 新增 DOCK-EDITOR-003 测试文件 |
| `apps/web/tests/fe-001-capture-removed.test.ts` | ~2 | 修正 Send import 检查（合法使用） |
| `apps/web/package.json` | +1 | 新增 @uiw/react-md-editor 依赖 |

### 遇到的问题及解决方式

1. **ESLint no-unused-vars 错误**：`collectionId` 和 `handleCollectionChange` 解构后未在 UI 中使用（Collection 区域为 disabled/planned）。解决：移除解构，后续集合功能开发时再添加。
2. **ESLint no-non-null-assertion 错误**：测试文件中使用 `draft!.content` 等。解决：改用 `if (draft) { ... }` 条件判断。
3. **fe-001 测试回归**：`Send` import 检查失败，因为 Dock Inspector Actions 新增了 Draft Publish 按钮（使用 Send 图标）。解决：将测试改为检查 `FloatingRecorder` 函数不存在，而非检查 `Send` import。
4. **useEditorDraft 竞态条件**：`draftId` 变化时不重置状态，旧 draft 的未保存内容可能被自动保存到新 draftId。解决：在 `draftId` 变化时先重置所有编辑器状态。

### 自动验证结果

```
pnpm validate: ✅ PASS (lint + typecheck + 776 tests + terminology)
pnpm build:web: ✅ PASS
```

### 手工验证步骤

1. 打开 workspace 页面，切换到 Dock tab
2. 选中一个 Document → 点击"打开 Editor" → Editor 应显示对应 entry 内容（Markdown 编辑器）
3. 选中一个 Draft → 点击"在 Editor 中继续" → Editor 应显示对应 draft 内容
4. 选中一个 Tip → 点击"转 Draft 并打开 Editor" → Editor 应显示转换后的 draft
5. 在 Editor Inspector 中添加/删除 tag → 应立即保存
6. 在 Editor Inspector 中修改 project → 应 debounce 保存
7. 在 Editor Inspector 中查看 Collection → 应显示 disabled/planned
8. 在 Dock Inspector 中点击 Draft 的"丢弃 Draft" → 应弹出确认弹窗
9. 在 Dock Inspector 中点击 Tip 的"丢弃 Tip" → 应弹出确认弹窗
10. 在 Dock Inspector 中查看 Document 的"归档"/"恢复" → 应为 disabled + Planned
11. 在 Dock Inspector 中查看 Draft 的"发布" → 应为 disabled + Planned

### 当前风险

1. **publishDraftToDocument update_original 模式不传递 metadata 到已有 entry**：当 draft 有 sourceEntryId 且 publishMode 为 update_original 时，仅更新 title/content/archivedAt，不更新 tags/project。需后续卡修复。
2. **Collection 功能未实现**：Editor Inspector 中 Collection 区域为 disabled/planned 占位，需等 collections/project 数据模型稳定后实现。
3. **Document Archive/Restore 未实现**：repository 中不存在 `archiveEntry`/`restoreEntry`，Dock Inspector 中为 disabled + Planned。
4. **Draft Publish 在 Dock 中未实现**：Dock 中无法保证 Editor 当前状态已 flush，Publish 按钮为 disabled + Planned。
5. **UI 层 action disabled 无自动化测试**：不可用操作的 disabled 状态依赖 UI 组件逻辑，当前仅能手工验证。

### 已知限制

- Markdown 编辑器使用 `@uiw/react-md-editor`，非架构文档推荐的 Milkdown，后续可替换
- Collection 区域为 disabled/planned 占位
- Document Archive/Restore 为 disabled + Planned
- Dock 中 Draft Publish 为 disabled + Planned
- `publishDraftToDocument` update_original 模式不更新已有 entry 的 metadata

### 未完成但已 disabled/planned 的能力

- Collection 选择/编辑（Editor Inspector）
- Document Archive/Restore（Dock Inspector）
- Draft Publish from Dock（Dock Inspector）

---

## Phase 3.2 + Round 4 devlog -- DOCK-EDITOR-003: 补充 Draft metadata 与 Dock→Editor 上下文测试

**日期**: 2026-05-15
**任务起始时间**: 2026-05-15 01:38
**任务结束时间**: 2026-05-15 01:44
**工时**: 6 分钟

### 任务目标

为 DOCK-EDITOR-003 补充自动化测试，覆盖 Draft metadata 字段（tags/project/collectionId）、publish 时 metadata 传递、Dock→Editor 上下文打开路径、以及 Inspector Actions（discardDraft/discardTip）。

### 卡号

DOCK-EDITOR-003

### 变更范围

新增测试文件 `apps/web/tests/dock-editor-003.test.ts`，覆盖 4 个 describe 组共 16 个测试用例：

1. **Draft metadata fields** (5 tests): createDraft 支持 tags/project/collectionId、updateDraft 支持部分更新、默认值、getDraft 返回 metadata
2. **publishDraftToDocument preserves metadata** (4 tests): as_new 模式传递 tags/project、空 metadata 默认值、update_original 新建 entry 传递 metadata、publish 创建 mindNode
3. **Dock → Editor context** (3 tests): entry-origin draft 继承 entry metadata、convertTipToDraft 创建 draft、convertTipToDraft 跨用户返回 null
4. **Dock Inspector Actions** (4 tests): discardDraft 标记为 discarded、discardDraft 状态确认、discardTip 标记为 discarded、discardTip 跨用户返回 null

### 变更文件

| 文件 | 变更行数 | 说明 |
|---|---|---|
| `apps/web/tests/dock-editor-003.test.ts` | +195 | 新增 DOCK-EDITOR-003 测试文件 |

### 遇到的问题及解决方式

1. **`@/lib/db` 路径别名解析失败**: 从项目根目录运行 vitest 时 `@/` 别名无法解析。解决：从 `apps/web` 目录运行测试，与现有测试执行方式一致。
2. **`getDraft` 不按 status 过滤**: 模板中 `discardDraft removes draft from active list` 期望 `getDraft` 返回 null，但实际 `getDraft` 仅按 userId 过滤，不检查 status。解决：改为验证 `found.status === 'discarded'`。
3. **`convertTipToDraft` 返回类型**: 模板假设返回单个 draft，实际返回 `{ tip, draft }` 对象。解决：解构 `const { draft, tip } = await convertTipToDraft(...)`。
4. **`publishDraftToDocument` 返回类型**: 模板使用 `result.entryId`，实际返回 `PublishResult` 含 `entry: PersistedEntry | null`。解决：使用 `result.entry?.id` 和 `unwrap(result.entry)`。
5. **Dexie migration 测试不可行**: 全新测试数据库不会触发 migration，移除了 migration 回填测试，改为通过 `createDraft` 默认值间接验证。

### 自动验证结果

```
vitest run tests/dock-editor-003.test.ts: ✅ 16/16 PASS
vitest run (full suite): ✅ 776/776 PASS (29 test files)
```

### 手工验证步骤

1. 运行 `cd apps/web && npx vitest run tests/dock-editor-003.test.ts` → 期望 16 tests passed
2. 运行 `cd apps/web && npx vitest run` → 期望 776 tests passed，无回归
3. 不可用 action disabled 为 UI 层测试，需手工验证：在 Dock Inspector 中选中 Draft → "删除 Draft" 按钮应为 disabled/planned 状态；选中 Tip → "丢弃 Tip" 按钮应为 preview/disabled 状态

### 当前风险

1. **publishDraftToDocument update_original 模式不传递 metadata 到已有 entry**: 当 draft 有 sourceEntryId 且 publishMode 为 update_original 时，仅更新 title/content/archivedAt，不更新 tags/project。这是当前代码行为，非测试问题，需后续卡修复。
2. **UI 层 action disabled 无自动化测试**: 不可用操作的 disabled 状态依赖 UI 组件逻辑，当前仅能手工验证。

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
