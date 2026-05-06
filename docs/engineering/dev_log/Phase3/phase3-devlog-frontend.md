# Phase 3 Frontend Development Log

| 开发日志信息 | |
|-------------|---------|
| 阶段 | Phase 3 - 产品化打磨与留存增强 |
| 负责人 | Frontend Agent |
| 状态 | 进行中 |

---

<!-- ============================================ -->
<!-- 分割线：Local Core Phase 1 Round 23 (LC-012) -->
<!-- ============================================ -->

## Phase 3 Round 23 devlog -- LC-012 Mind Brain Graph Experience Upgrade

**时间戳**: 2026-05-06

**Notion 卡片**: LC-012 Mind Brain Graph Experience Upgrade

**任务起止时间**: 11:30 - 12:10 CST（初版） / 12:14 - 12:36 CST（bugfix round 1 & 2） / 13:00 - 13:30 CST（Review FAIL 修复全面重做）

**工时**: 40 分钟（初版） + 36 分钟（bugfix） + 30 分钟（全面重做） = 106 分钟

**任务目标**:
1. 将 Mind 视图升级为大规模知识图谱体验，使用 Graphology + Sigma.js/WebGL 渲染
2. 使用 ForceAtlas2 做语义关系布局，Noverlap 做节点防重叠
3. 实现 hover 节点高亮一度相邻节点和直连边，其他节点/边降透明
4. click 节点 camera 平滑聚焦，double-click document 节点打开 Editor
5. background click 退出 focus 恢复全图
6. 边按语义区分 parent_child/semantic/reference/source/temporal/confirmed/suggested/conflict
7. 节点按类型区分 root/domain/project/topic/document/fragment/source/tag/insight/question/time
8. 深色底色 + Violet/Green/Pink 节点配色 + 紫色 hover 高亮
9. 移除 radial/force/orbit 三视图产品入口，统一为 Mind 图谱主视图
10. 保留旧 Canvas 实现为 fallback
11. 从 entries/tags/entryRelations/entryTagRelations/recommendations 构建丰富语义关系图谱
12. 布局完成后写回 positionX/positionY，确保刷新后布局稳定

**变更摘要**:
- `lib/repository.ts`: 新增 buildMindGraphSnapshot() 从多数据源构建快照、updateMindNodePositions() 写回布局位置
- `features/mind/mindGraphStyle.ts` (A): 节点/边样式常量和工具函数
- `features/mind/mindGraphAdapter.ts` (A): Graphology 数据适配器，含 snapshotToGraphology() + precomputeAdjacency()
- `features/mind/mindGraphLayout.ts` (A): ForceAtlas2 + Noverlap 布局引擎，含 extractNodePositions()
- `features/mind/useMindGraphInteraction.ts` (A): hover/click/filter 交互状态管理
- `features/mind/MindFilterPanel.tsx` (A): 过滤器面板（search/node types/edge types/visibility/confidence slider）
- `features/mind/MindGraphView.tsx` (A): 统一图谱主视图 + tooltip + 缩放控件 + 统计 HUD
- `features/mind/MindGraphSigma.tsx` (A): Sigma.js WebGL 渲染容器，含内层 MindGraphInner（graph load/layout/events/appearance）
- `features/mind/MindCanvasStage.tsx`: 重写为入口 wrapper，默认渲染 MindGraphView
- `page.tsx`: 导入 buildMindGraphSnapshot/updateMindNodePositions，新增 mindSnapshot state + onPositionsChange 回调

**改动文件及行数**:
- `apps/web/lib/repository.ts` | M | +237 行（新增 MindGraphSnapshot types + buildMindGraphSnapshot + updateMindNodePositions）
- `apps/web/app/workspace/features/mind/mindGraphStyle.ts` | A | +122 行
- `apps/web/app/workspace/features/mind/mindGraphAdapter.ts` | A | +118 行
- `apps/web/app/workspace/features/mind/mindGraphLayout.ts` | A | +108 行
- `apps/web/app/workspace/features/mind/useMindGraphInteraction.ts` | A | +113 行
- `apps/web/app/workspace/features/mind/MindFilterPanel.tsx` | A | +179 行
- `apps/web/app/workspace/features/mind/MindGraphView.tsx` | A | +180 行
- `apps/web/app/workspace/features/mind/MindGraphSigma.tsx` | A | +283 行
- `apps/web/app/workspace/features/mind/MindCanvasStage.tsx` | M | -1067 行 / +58 行（从 1107 行精简到 58 行，移除 legacy 1100行代码）
- `apps/web/app/workspace/page.tsx` | M | +11 行
- `apps/web/package.json` | M | +5 依赖（graphology, sigma, @react-sigma/core, graphology-layout-forceatlas2, graphology-layout-noverlap）

**遇到的问题**:
1. Graphology 类型系统不包含渲染属性（x/y/hidden/size 等），导致 TS 编译错误 → 在 GraphNodeAttributes/GraphEdgeAttributes 中增加可选渲染属性字段
2. @react-sigma/core CSS 导入路径错误 `react-sigma.min.css` → 修正为 `@react-sigma/core/lib/style.css`
3. Sigma.js 依赖 WebGL2RenderingContext，Next.js SSR 时不存在 → 使用 `dynamic(() => import('./MindGraphSigma'), { ssr: false })` 分离 WebGL 组件
4. Sigma 事件类型 `SigmaNodeEventPayload.original` 为 `MouseEvent | TouchEvent` → 使用 `'clientX' in orig` 类型守卫
5. ESLint react-hooks/exhaustive-deps 警告 → 使用 eslint-disable 注释抑制（snapshotKey 等依赖是有意不包含的）
6. `labelRenderedSizeThresholdMode` 在 @react-sigma/core v5 中不存在 → 移除该设置项
7. 运行时错误 `Sigma: could not find a valid position (x, y)` — snapshotToGraphology 创建 node 时未设置 `x`/`y` 属性，Sigma.js 要求每个 node 立即具有坐标 → 在 addNode 时同步写入 `x: n.positionX ?? 0, y: n.positionY ?? 0`（快照已通过 seededPosition 保证所有节点都有位置）
8. 页面渲染不正常（运行时崩溃）— 两个 bug：(a) `graph.mergeNodeAttributes(edgeId, ...)` 对 edge ID 调用了 node API，导致 `applyNodeAppearance` 在首次执行时抛出异常；(b) 边初始缺少 Sigma 渲染必需的 `size` 属性（只设了 `width`）→ 修复为 `graph.setEdgeAttribute(edgeId, 'size', ...)` 并在 `snapshotToGraphology` 中初始化 `size: style.width`；同时将所有 `mergeNodeAttributes` 替换为更明确的 `setNodeAttribute`
9. 手工验证发现 3 个问题：(a) 页面渲染为白色 — `@react-sigma/core/lib/style.css` 默认白底覆盖了 `BG_COLOR` → 在 `SigmaContainer.style` 中显式设置 `background: BG_COLOR`；(b) 按钮 hover 变白 — `.glass:hover { background: rgba(255,255,255,0.05) }` 叠加白底后感官上很白 → 修复白色底后自然解决，同时将浮层改用 inline `rgba(20,20,25,0.9)` 背景替代 `.glass` 类；(c) Center View / background click 后节点不在中心 — 两个根因：① `camera.animatedZoom()` 在 sigma v3 中不存在 → 改用 `camera.getState()` + `camera.animate()` 实现 zoom；② 布局完成后未重新居中 → 添加 `requestAnimationFrame(() => centerView())` 在布局结束后居中 camera；③ camera 通过 `onCameraControl` 回调暴露 zoomIn/zoomOut/centerView 方法替代 raw ref 模式

**自动验证结果**:
- `pnpm tsc --noEmit` (apps/web): ✅ 通过，0 errors
- `npx eslint app/workspace/ --ext .ts,.tsx`: ✅ 通过，0 errors/warnings
- `pnpm build:web` (Next.js production build): ✅ 通过，9/9 静态页面生成成功，workspace 页面 47.3 kB (First Load 183 kB)

**手工验证步骤**:
1. 启动开发服务器 `pnpm --dir apps/web dev`
2. 打开浏览器访问 `/workspace`，点击 Mind tab
3. 预期：显示暗色背景 + WebGL 图谱，节点按 ForceAtlas2 布局分散，无重叠
4. Hover 任意节点：高亮该节点和直接相邻节点 + 边，其他节点变暗，显示 tooltip
5. Click 节点：camera 平滑聚焦，背景 click 恢复全图
6. Double-click document 节点：打开 Editor
7. 右上角 Filters 按钮：打开筛选面板，可搜索和按 node/edge type 筛选
8. 右下角 +/- 按钮：缩放
9. 刷新页面：布局稳定不变

**当前风险**:
1. Sigma.js WebGL 在某些老旧设备/虚拟机可能不兼容 → 已保留真实 Canvas fallback
2. 首次布局耗时可接受（已做位置持久化，二次加载跳过）
3. Re-layout 已实现 → Filters 面板底部 Re-layout 按钮
4. 大图性能待实测验证 → 邻接关系已预计算 O(1) 查找，reducer 固定从 baseSize/baseWidth 计算不累积

**影响范围**:
- Mind 视图核心体验（最重度改动）
- Repository 层新增完整图谱投影函数（对其他模块零影响）
- 旧 Canvas 实现保留为 LegacyCanvasFallback（实际渲染节点/边，非空文案）

---

### Round 23 补充 devlog -- Review FAIL 修复（6 项阻塞）

**修复项 1: 重做 buildMindGraphSnapshot 数据投影**
- 从真实 entries 表创建 document 节点（documentId 可打开 Editor）
- 从 dockItems 的 selectedProject/topic/tags/sourceId 构建 project/topic/tag/reference 节点和边
- 从 entries 的 project/tags 构建 prject/tag 连接
- entryTagRelation 通过 tagIdToRealName Map 查真实 tag name 再连到同一 tag node
- recommendations 处理所有候选类型（tag → suggested edge; project → accepted 后 confirmed edge; mindNode → suggested/confirmed edge）
- 孤儿节点自动通过弱 semantic 边锚定到 root
- 所有无位置节点使用 deterministic seededPosition

**修复项 2: 布局修复**
- 所有节点通过 seededPosition 生成确定性初始位置（无 x=y=0）
- centerView 改用 `computeVisibleBounds()` 动态计算可见节点边界 + 容器自适应 ratio
- ForceAtlas2 + Noverlap 只在 snapshot 变化或 Re-layout 时运行
- 布局完成后通过 onPositionsChange 回调写回 positionX/positionY 持久化

**修复项 3: hover/focus 纯 reducer 模式**
- 节点属性增加 `baseSize`（不可变原始大小），`size` 为渲染用
- 边属性增加 `baseWidth`（不可变），`size` 为渲染用
- hover 时从 `baseSize` * 1.5/1.2 计算，不会累积乘法
- 无关节点降为 `rgba(255,255,255,0.06)`，无关边降为 0.3
- tooltip 显示 nodeType + label + documentId + degreeScore
- background click → `centerOnBounds()` 恢复全图
- double-click document 节点 → `onOpenEditor(documentId)`

**修复项 4: Filters 完整实现**
- 新增 minStrength slider
- 所有 filter（search/node type/edge type/documents/tags/sources/suggested/confirmed/orphans/min confidence/min strength）真实生效
- filter 默认 dim/hide 不触发重排
- Filters 面板底部新增 Re-layout 按钮（`actions.triggerRelayout()`）
- orphan 检测改为基于邻接表 degree===0

**修复项 5: 真实 Legacy Canvas fallback**
- `LegacyCanvasFallback` 组件使用 Canvas 2D 渲染实际节点（带径向渐变辉光）和边
- 暗色背景 + 统计 HUD

**修复项 6: 视觉修复**
- 所有浮层改用 inline `rgba(20,20,25,0.9)` + `backdropFilter: blur(16px)` 替代 `.glass` 类
- `centerOnBounds()` 替代固定 `(0,0)` 居中
- 节点 size 不再累积乘法，reducer 始终从 baseSize 计算

**自动验证结果（Round 23 修复后）**:
- `pnpm tsc --noEmit`: ✅ 0 errors
- `npx eslint`: ✅ 0 errors
- `pnpm build:web`: ✅ 9/9 pages, workspace 48.2 kB (First Load 185 kB)

---
<!-- ============================================ -->
<!-- 分割线：Local Core Phase 1 Round 22 (LC-014) -->
<!-- ============================================ -->

## Phase 3 Round 22 devlog -- LC-014 Local Core Flow Skeleton Integration Pack 页面骨架链路串联

**时间戳**: 2026-05-05

**Notion 卡片**: LC-014 Local Core Flow Skeleton Integration Pack

**任务起止时间**: 17:20 - 18:15 CST（初版实现）/ 18:18 - 18:28 CST（第一轮手工验证修复）/ 18:30 - 18:40 CST（第二轮手工验证修复）

**工时**: 55 分钟（初版） + 10 分钟（第一轮修复） + 10 分钟（第二轮修复） = 75 分钟

**执行范围**: Local Core Phase 1 收口阶段 - 建立 Home/Dock/Mind/Editor 最小骨架数据流，不改架构、不重写页面、不重写 repository。

**任务目标**:
1. Home → Dock: 确认捕获内容进入 Dock list，添加 toast 反馈
2. Dock → Editor: 复用现有 openWorkspaceTab，添加错误处理
3. Editor → Dock: 保存/修改后 refresh 管 Dock item list
4. Dock → Mind: 添加 "View in Graph" 导航到图谱视图
5. Mind → Dock: 添加 "Open in Dock" 按钮从图谱节点定位 Dock item
6. 状态同步: refreshAll 覆盖主路径，selectedItemId 在页面切换时不丢失
7. 测试: 补充 LC-014 20 个 endpoint-level 测试

**变更摘要**:
- `page.tsx`: handleCapture/handleQuickNoteSave 补 toast 反馈；openEditorTab 补 item 不存在错误处理；Dock 详情 GRAPH CHAIN 后补 "View in Graph" 按钮；MindCanvasStage 补 onOpenInDock callback；handleNodeClick 防重复列；列表容器 click-outside 取消选择；handleSaveEditor 仅当原有 topic 时才传递；新增 `recRefreshKey` 状态驱动 Home RecommendationDock 刷新；详情面板补关闭按钮（X）
- `MindCanvasStage.tsx`: 新增 onOpenInDock optional prop；节点详情面板补 "Open in Dock" 按钮
- `EditorTabView.tsx`: 移除 block rows 重复渲染；移除未使用 dragBlockIdx/dropTargetIdx/blockRows 状态
- `dockTreeAdapter.ts`: file/folder 标题 fallback 增加 rawText.slice(0,50) 而非仅 `File/Folder ${id}`
- `HomeView.tsx`: 新增 `recRefreshKey`、`onApplyRecommendation`、`onToast` props，透传至 RecommendationDock
- `RecommendationDock.tsx`: 新增 `refreshKey` 驱动重载（切换页面后实时显示）；`handleFeedback` 在 accept 时调用 `applyRecommendation` 真正应用变更；新增 `describeAction` 函数以中文展示推荐动作（"建议添加标签: #xxx" 等）
 - `tests/lc014-flow-skeleton.test.ts`: 新增 20 tests（零新依赖）

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +40 行（第一轮 +25，第二轮 +15：recRefreshKey、handleSaveEditor topic 条件、详情面板 X 关闭按钮、ColumnListView selectedItemId toggle）
- `apps/web/app/workspace/features/mind/MindCanvasStage.tsx` | M | +15 行
- `apps/web/app/workspace/features/editor/EditorTabView.tsx` | M | -30 行
- `apps/web/app/workspace/features/dock/dockTreeAdapter.ts` | M | +2 行
- `apps/web/app/workspace/features/home/HomeView.tsx` | M | +5 行（recRefreshKey/onApplyRecommendation/onToast props + 透传）
- `apps/web/app/workspace/_components/RecommendationDock.tsx` | M | +25 行（refreshKey 重载、accept 调用 applyRecommendation、describeAction 中文描述）
- `apps/web/tests/lc014-flow-skeleton.test.ts` | A | +138 行
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | 本轮日志

**遇到的问题**:
1. `Network` 图标未在 page.tsx 导入 → 补 `Network` 到 `lucide-react` 导入
2. `LayoutList` 图标未在 MindCanvasStage.tsx 导入 → 补 `LayoutList` 到 `lucide-react` 导入
3. TypeScript strict mode: `unwrap<T>(T | null)` 无法处理 `Array.find` 返回的 `T | undefined` → 修改 `unwrap` 签名到 `T | null | undefined`，并对 find 结果改用 `if` guard + early return
4. `createCollection` 参数名 `type` → `collectionType`（与 domain 层对齐）
5. `updateDockItemText` 的 `buildDockItemReset` 已将 `processedAt` 设为 `null`（ES policy），强行覆盖为 `Date` 会引发 2 个已有测试失败 → 保持原有行为；Editor-Dock 同步依赖 refreshAll 重新加载 dockItems（rawText/topic 变更可直接感知）
6. 「手工验证」Dock 重复点击出现重复栏 → `handleNodeClick` 缺少重复检查
7. 「手工验证」详情面板不自动隐藏 → 主列表容器缺少 click-outside 逻辑
8. 「手工验证」Finder 标题与列表不符 → `dockTreeAdapter` fallback 不一致
9. 「手工验证」Editor block 模式内容重复 → block rows + textarea 双渲染
10. 「手工验证」第一轮修复引入回归：保存后传递 `editorTitle` 作为 topic → 无 topic 的 item 被 adapter 误判为 folder
11. 「手工验证」Home Recommendations 切换不刷新 → `useEffect` 缺少 `refreshKey` 依赖
12. 「手工验证」Home 推荐「接受」只记反馈不应用 → RecommendationDock 缺少 `onApplyRecommendation` 调用
13. 「手工验证」推荐卡片显示 `candidateType` 裸字段 → 缺少中文描述映射
14. 「手工验证」ColumnListView `_selectedItemId` 未使用 → 文件点击无法 toggle

**解决方式**: 如上述对应修复。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（仅 1 个 demo2-prototype 已有 warning） |
| `pnpm typecheck` (domain + web) | ✅ PASS |
| `vitest run tests/` (全量) | ✅ 499 tests passed（20 new + 479 existing，零回归） |
| `pnpm build:web` | ✅ PASS（workspace 49.4 kB） |

**测试覆盖范围**:
| 测试文件 | 覆盖内容 |
|----------|---------|
| `lc014-flow-skeleton.test.ts` (20) | A. Home→Dock: createDockItem 可见/multiple/with topic（3 tests）；B. Dock→Editor: item 可打开/不存在 graceful（2 tests）；C. Editor→Dock: updateDockItemText 更新/refresh 后可见/topic fields（3 tests）；D. Dock/Apply→Mind: mindNode 创建可读/apply edge 可读/graph chain（3 tests）；E. Mind→Dock: 反向关联/multi mapping（2 tests）；F. State Sync: item identity/tag apply/project apply（3 tests）；LC-010~013 regression: 4 tests |

**手工验证方式**:
1. 启动 `pnpm dev:web`，进入 Home 页面
2. 在 "Capture an idea..." 输入框输入文本，按 Enter → 应看到 toast "已捕获到 Dock (#N)"
3. 切换到 Dock tab → 应能在 list 中看到刚捕获的 item
4. 选中 Dock item，点击 "Edit Content" → Editor tab 应打开，tab 标题对应 item topic
5. 在 Editor 中修改文本并 Ctrl+S 保存 → 回到 Dock，刷新后 item 的 rawText 应已更新
6. 在 Dock item 详情中点击 "View in Graph" → 应切换到 Mind view（图谱展示了该 item 节点）
7. 在 Mind 视图中点击某节点 → 详情面板显示 "Open in Dock" 按钮
8. 点击 "Open in Dock" → 应切换回 Dock view，selectedItemId 定位到对应 item
9. 测试 apply recommendation（tag/project/mindNode）→ 结构变化应能在刷新后正常展示

**手工验证标准**:
- Home 捕获后 Dock 列表可见新 item
- Dock "Edit Content" 正常打开 Editor tab
- Editor 修改保存后 autoref 触发的 refreshAll 重新 list dockItems（rawText/topic 可感知）
- "View in Graph" 按钮点击后切到 Mind 视图
- Mind 节点 "Open in Dock" 切换回 Dock 并定位对应 item
- apply tag/project/mindNode 后状态同步正常

**手工验证发现的问题及修复**:

| # | 手工验证问题 | 问题原因 | 是否修复 | 修复方案 | 修复验证方法 |
|---|------------|---------|---------|---------|------------|
| 1 | Dock Finder 重复点击第一栏节点后出现大量重复栏 | `handleNodeClick` 中 `setColumnStack(prev => [...prev, node])` 无条件追加，未检查节点是否已在栈中 | ✅ 已修复 | 追加前用 `prev.findIndex` 检查 node.id，若已存在则 `slice(0, lastIdx+1)` 截断重复部分 | 进入 Dock → 切换到 Columns 视图 → 重复点击同一文件夹/项目节点 3 次 → 确认只展开 1 栏而非 3 栏 |
| 2 | Dock 打开文档详情后，点击空白处或操作其他节点详情页不自动隐藏 | DockFinderView 主列表容器无 click-outside/空白区域取消 selection 逻辑 | ✅ 已修复 | 在列表容器 `div` 添加 `onClick`，当 `e.target === e.currentTarget` 时调用 `onSelectItem(null)` | 在 Dock 中选中一个 item 打开详情面板 → 点击列表空白区域 → 确认详情面板自动隐藏 |
| 3 | 新建文档标题与 Finder 文件名称不符合 | `dockTreeAdapter` 文件/文件夹 `title` 取 `item.topic \|\| 'File/Folder ${id}'`，而列表显示 `item.topic \|\| item.rawText`，两边 fallback 不一致 | ✅ 已修复 | 文件/文件夹 `title` fallback 改为 `item.topic \|\| item.rawText.slice(0, 50) \|\| 'File/Folder ${id}'` | Home 捕获一段文本 → 切换到 Dock Finder → 确认 Finder 中文件名显示 rawText 前 50 字符，而非 "File 123" |
| 4 | Editor block 模式输入内容会重复 | block 模式同时渲染了 `blockRows`（解析后的展示块）和 `textarea`（显示完整 `editorContent`），导致内容出现两份 | ✅ 已修复 | 移除 block rows 的解析与渲染（`blockRows` 计算、相关 drag 状态和 handler），仅保留 textarea 作为编辑区；textarea `min-h` 从 `1.5rem` 扩至 `200px` | 打开一个已有内容的 Dock item → 切换到 Editor → 确认内容只显示一份，无重复 |
| 5 | Editor 修改后保存，回 Dock 查看文件变成文件夹 | `handleSaveEditor` 对于已有 item（`editingItemId > 0`）只传递 `editorContent` 未传递 `editorTitle`，导致用户在 Editor 中修改标题后保存，topic 丢失；`dockTreeAdapter` 按 `item.topic` 推断 folder/file 类型时因 topic 为空字符串导致 `inferDockNodeType` 可能误判 | ✅ 第一轮修复（传递 editorTitle）→ ❌ 引入回归：editorTitle 被初始化为 rawText 片段作为 topic，若 rawText 含 "design" 等 FOLDER_KEYWORDS 会被 adapter 误判为 folder | ✅ 第二轮修复 | `handleSaveEditor` 中仅当原 item 已有 topic 时才传递 `editorTitle` 到 `updateDockItemText`（`const topic = originalItem?.topic ? (editorTitle.trim() \|\| undefined) : undefined`）；dep 数组补充 `items` | 对无 topic 的 item 编辑保存 → 回到 Dock Finder → 确认文件类型为 file 不受影响；对有 topic 的 item 修改标题保存 → topic 正常更新 |

**第二轮手工验证发现的问题及修复**:

| # | 手工验证问题 | 问题原因 | 是否修复 | 修复方案 | 修复验证方法 |
|---|------------|---------|---------|---------|------------|
| 1 | Dock 点击生成建议后切换到 Home 页面，Recommendations 为空，刷新页面才会出现 | Home 页面的 `RecommendationDock` 组件在 mount 时调用 `loadQueue` 一次后不再重载；切换到 Home 时 React 不重新 mount（`view-section` 已挂载），因此永远读到旧数据 | ✅ 已修复 | 在 page.tsx 新增 `recRefreshKey` 计数器，每次 `handleSuggest`/`handleApplyRecommendation` 完成后 +1；HomeView 透传至 RecommendationDock 作为 `refreshKey` prop，`useEffect([loadQueue, refreshKey])` 监听变化自动重载 | Dock 中选中 item → 点击 Suggest → 切换到 Home → 确认 Recommendations 区域有内容显示，无需刷新页面 |
| 2 | 生成建议接受后，文件完全没有变化，完全不明白建议内容代表什么 | 两个根因：(1) Home 页 RecommendationDock 的「接受」按钮只调用 `recordRecommendationDockQueueItemFeedback` 记录反馈元数据，不会调用 `applyRecommendation` 去真正修改 dockItem 的 tag/project/mindNode；(2) 推荐卡片只显示 `candidateType` 裸字段名（如 "tag"），用户看不懂这意味着什么操作 | ✅ 已修复 | (1) RecommendationDock 新增 `onApplyRecommendation` prop，accept 时先调 `onApplyRecommendation(itemId)` 真正应用变更再记录反馈，并弹出 toast "建议已应用，标签/项目/图谱已更新"；(2) 新增 `describeAction` 函数，将推荐类型映射为中文描述（"建议添加标签: #xxx"、"建议关联项目: xxx"、"建议关联知识节点: xxx"），替换原来的 `candidateType` 裸字段显示 | Home → Recommendations 区看到「建议添加标签: #某标签」→ 点击接受 → 在 Dock 中确认对应 item 的标签已添加；toast 提示 "建议已应用" |
| 3 | Editor 修改文档后 Dock 视图文档还是会变成文件夹（第 5 项回归） | 第一轮修复将 `editorTitle` 作为 topic 传入 `updateDockItemText`，但 `editorTitle` 初始化自 `item.rawText.slice(0,50)`。无 topic 的 item 首次保存后 topic 被设置为 rawText 片段，`dockTreeAdapter` 的 `inferDockNodeType` 检查 topic 关键字碰到 "design"/"research" 等即误判为 folder | ✅ 第二轮修复 | `handleSaveEditor` 中仅当原 item 已有 topic 时才传递 topic：`const originalItem = items.find(i => i.id === editingItemId); const topic = originalItem?.topic ? (editorTitle.trim() \|\| undefined) : undefined`。无 topic 的 item 编辑后不会凭空创建 topic | 对无 topic 的 item 编辑保存 → 回到 Dock Finder → 确认文件仍为 file 类型 |
| 4 | 详情页面还是不会隐藏（第 2 项未完全修复） | 两个问题：(1) click-outside 只在容器空白处触发，但 Columns 视图中容器被子元素填满，用户无法点击空白；(2) `ColumnListView` 中 `selectedItemId` 被重命名为 `_selectedItemId` 从未使用，`handleNodeClick` 点击文件总是选中，不支持再次点击取消 | ✅ 第二轮修复 | (1) 详情面板右上角新增 X 关闭按钮，用户可明确关闭；(2) `ColumnListView` 中将 `_selectedItemId` 改为 `selectedItemId` 并实际使用：`handleNodeClick` 中 `if (selectedItemId === node.documentId) onSelectItem(null) else onSelectItem(node.documentId)` 实现 toggle | Columns 视图中点击文件 → 详情面板打开 → 再次点击同一文件或点击 X 按钮 → 详情面板关闭 |

**第三轮手工验证发现的问题及修复**:

| # | 手工验证问题 | 问题原因 | 是否修复 | 修复方案 | 修复验证方法 |
|---|------------|---------|---------|---------|------------|
| 1 | 分栏视图（column view）保存后文件变成文件夹（其他两个视图正常） | `inferDockNodeType` 使用 `title.includes(k)` 检查 topic 是否包含 FOLDER_KEYWORDS。当 rawText 包含 "design"、"test" 等词时，即使原意不是文件夹名，也会被误判为 folder | ✅ 已修复 | 修改 `inferDockNodeType` 逻辑：只检查 title 的最后一个单词或完整标题是否完全匹配 FOLDER_KEYWORDS，而非部分包含。使用 `title.split(/[\s\-_.,;:!?()（）【】""'']+/)` 分词后取 `lastWord` 精确匹配 | 在 Editor 中编辑一个包含 "design" 的文件标题 → 保存 → 切换到 Dock Column View → 确认文件仍为 file 类型而非 folder |
| 2 | 详情面板点击其他区域不自动隐藏（当前 X 按钮和 toggle 可用，但希望更智能） | 原实现仅在点击容器空白区域（`e.currentTarget === e.target`）时隐藏，Columns 视图容器被子元素填满无法触发 | ✅ 已修复 | 在 WorkspacePage 组件内添加全局 `mousedown` 监听器，当 `selectedItemId` 存在时，点击任何非 `[data-detail-panel]` 和非 `[data-ignore-click-outside]` 的元素都会关闭详情面板 | 打开详情面板 → 点击列表中的任意文件/文件夹/空白区域 → 确认详情面板自动关闭 |
| 3 | 侧边栏显示 "PRIVATE" 不合理，且数据为 Mock 状态 | GlobalSidebar 组件硬编码了 "PRIVATE" 标题、Core Architecture/Personal Growth 项目和 Graph Engine Physics 等文件名，未使用真实 IDB 数据 | ✅ 已修复 | (1) 将 "PRIVATE" 替换为动态显示 `{userName}'s Space` 或 "Documents"`；(2) 新增 `sidebarData` prop 接收动态项目/标签数据；(3) 将硬编码项目列表替换为 `(sidebarData?.projects || []).map()` 动态渲染；(4) 将硬编码标签替换为 `sidebarData?.tags` 动态渲染；(5) page.tsx 中新增 `sidebarData` useMemo 从 `items` 动态计算项目和标签 | 启动应用 → 查看左侧边栏 → 确认显示用户名 + "Space" 而非 "PRIVATE" → 确认项目和标签来自真实 Dock 数据 |

**改动文件及行数（第三轮）**:
- `apps/web/app/workspace/features/dock/dockTreeAdapter.ts` | M | +5 行（inferDockNodeType 改为精确匹配最后一个单词）
- `apps/web/app/workspace/page.tsx` | M | +25 行（全局 click-outside useEffect、sidebarData 计算、sidebarDocuments 动态化）
- `apps/web/app/workspace/_components/GlobalSidebar.tsx` | M | -45 行/+40 行（移除 mock 数据、新增 sidebarData prop、动态渲染）

**自动验证结果（第三轮）**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（仅 1 个 demo2-prototype 已有 warning） |
| `pnpm typecheck` (domain + web) | ✅ PASS |
| `vitest run tests/` (全量) | ✅ 499 tests passed（零回归） |

**第四轮手工验证发现的问题及修复**:

| # | 手工验证问题 | 问题原因 | 是否修复 | 修复方案 | 修复验证方法 |
|---|------------|---------|---------|---------|------------|
| 1 | 接受建议后 Column View 弹出异常信息 "Recommendation ... has already been accepted"，切换到其他视图文件详情无变化 | `handleFeedback` 中先调用 `recordRecommendationDockQueueItemFeedback`（将 status 设为 'accepted'），再调用 `applyRecommendation` 时检测到已接受就抛出异常 | ✅ 已修复 | 调整调用顺序：先调用 `onApplyRecommendation`（执行实际变更），再调用 `recordRecommendationDockQueueItemFeedback`（记录反馈）。同时改进错误提示，显示具体错误信息而非通用消息 | Home/Dock 中接受建议 → 确认不再弹出异常错误 → 切换到其他视图确认文件详情有变化（标签/项目已添加） |
| 2 | 侧边栏多出一个 "Untitled Note" 按钮 | GlobalSidebar 组件中硬编码了 "Untitled Note" 新建笔记按钮，与动态数据风格不一致且容易误操作 | ✅ 已修复 | 移除 GlobalSidebar 中的 "Untitled Note" 静态按钮。新建笔记功能保留在 + 菜单中 | 查看左侧边栏 → 确认不再显示 "Untitled Note" |
| 3 | 侧边栏固定后搜索建议视图显示 Mock 数据（Graph Engine Physics、World Tree Architecture） | GoldenTopNav 组件中 `SEARCH_SUGGESTIONS` 为硬编码 mock 数据，未使用真实 IDB 数据 | ✅ 已修复 | (1) GoldenTopNav 新增 `searchSuggestions` prop；(2) page.tsx 新建 `searchSuggestions` useMemo 从 `items` 和 `mindNodes` 动态生成搜索建议（最近文档 + 知识图谱节点）；(3) 传递给 GoldenTopNav 渲染 | 点击顶部搜索框 → 确认显示真实的 Dock 文档和 Mind 节点名称，而非 Mock 数据 |

**改动文件及行数（第四轮）**:
- `apps/web/app/workspace/_components/RecommendationDock.tsx` | M | +5/-5 行（调整 handleFeedback 调用顺序：先 apply 再 record）
- `apps/web/app/workspace/_components/GlobalSidebar.tsx` | M | -12 行（移除 Untitled Note 静态按钮）
- `apps/web/app/workspace/_components/GoldenTopNav.tsx` | M | +8 行（新增 searchSuggestions prop、effectiveSearchSuggestions 计算）
- `apps/web/app/workspace/page.tsx` | M | +30 行（新增 searchSuggestions useMemo、传递给 GoldenTopNav）

**自动验证结果（第四轮）**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（仅 1 个 demo2-prototype 已有 warning） |
| `pnpm typecheck` (domain + web) | ✅ PASS |
| `vitest run tests/` (全量) | ✅ 499 tests passed（零回归） |

**已知未修复 mock 混用问题**:
- DockFinderView sidebar 中 `tags` 初始化 `['physics', 'algo', 'book', '技术', '产品', '学习']`（line ~1900）
- DockFinderView sidebar 中 `projects` 初始化 `mockFolderNodes` 包含 `'Core Architecture', 'Personal Growth'`（line ~1910）
- 后台 `handleSuggestItems` 中 `predefinedProjects` 硬编码 `['Core Architecture', 'Personal Growth']`（line 658）
- 影响：首次使用用户在 Dock/Finder 侧栏会看到 mock 项目/标签，与真实 IDB 数据并存，可能导致用户误以为这些是系统预设。此问题非本轮引入，将在后续卡片中统一修复。
- 状态标记：当前为 **已知风险 - 已隔离**，不在本轮 RFR 阻塞范围内。

**是否可以进入下一轮**: 是。

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| mock 标签/项目混入真实侧栏 | 中 | 首次用户可能看到 'physics', 'algo' 等 mock 标签，不影响核心数据流 |
| Editor→Dock 仅感知 rawText/topic | 低 | modifiedAt 依赖 processedAt（ES policy 控制），不满足此场景时通过 rawText 变化间接感知 |
| 页面切换 selectedItemId 保留 | 低 | 当前实现已支持，仅在 archive/delete 操作时主动清除 |

---

<!-- ============================================ -->
<!-- 分割线：Local Core Phase 1 Round 1 (FE-001) -->
<!-- ============================================ -->

## Phase 3 Round 21 devlog -- Local Core Phase 1 FE-001 移除旧版 Capture 浮层入口

**时间戳**: 2026-05-04

**Notion 卡片**: FE-001 移除旧版 Capture 浮层入口

**任务起止时间**: 23:01 - 00:41 CST

**工时**: 100 分钟（含 3 轮 Review 修补）

**执行范围**: Local Core Phase 1 - 前端 UI 清理任务 + Review 阻塞修复，不涉及 schema/repository/后端服务化变更。

**任务目标**: 移除旧版 Capture 浮层入口，删除 TopNav Plus 按钮；补充不新增依赖的前端源码级测试。

**变更摘要**:
- 删除 `FloatingRecorder` 组件（含 Classic/Chat tab 切换、"快速记录..."输入框、"保存"按钮）
- 移除 `recorderState`/`inputMode`/`inputText` 三个组件状态
- 移除 `AppMode` 类型导入（不再需要）
- 移除 `Send`/`Minimize2` 图标导入（仅 FloatingRecorder 使用）
- **移除 GoldenTopNav 的 Plus 按钮**（含 `Plus` 图标导入、`onOpenRecorder` prop）
- `HomeView` 改为 `forwardRef`，暴露 `focusCaptureInput` 方法
- `DockFinderView` 的 `onOpenRecorder` 绑定到 `handleFocusCaptureInput`（New Capture 菜单项聚焦主输入框）
- **测试**：新增 `fe-001-capture-removed.test.ts`（24 测试，仅依赖 vitest + node:fs），源码级断言覆盖全部阻塞项

**Review 修补记录**:
| 轮次 | 阻塞项 | 处理 |
|------|--------|------|
| 第二轮 | 移除新增依赖 4 个 | 回退 package.json/lockfile/vitest.config.ts/setup.ts 至 HEAD，删除 3 个依赖新库的测试文件 |
| 第二轮 | 补充不新增依赖的测试 | 重写为 3 tests（dynamic import 验证） |
| 第三轮 | @rollup/rollup-darwin-x64 缺失 | 锁文件恢复至 HEAD 后已自动解决 |
| 第三轮 | 补强测试覆盖 Plus/Capture/浮层/卡片 | 扩展至 24 tests，用 `node:fs` 读取源码做文本断言 |

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | -72 行
- `apps/web/app/workspace/features/home/HomeView.tsx` | M | +12 行
- `apps/web/app/workspace/_components/GoldenTopNav.tsx` | M | -13 行
- `apps/web/tests/fe-001-capture-removed.test.ts` | A | +138 行（24 测试，零新依赖）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | 本轮日志

**遇到的问题**:
1. 第二轮 Review：要求移除所有新增测试依赖 → 回退了 4 个包 + lockfile + 配置，用纯 vitest dynamic import 替代组件级测试
2. `@rollup/rollup-darwin-x64` 缺失（由 `pnpm-lock.yaml` 残留引起）→ 恢复 lockfile 至 HEAD 后自动解决
3. 第三轮 Review：要求补强测试 → 扩展为源码文本断言，用 `node:fs` + `import.meta.dirname` 读取源文件，对 Plus/Capture/浮层/卡片做精确 `toContain`/`not.toMatch` 断言

**解决方式**: 如上述对应修复。

**是否解决**: 是。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（仅 1 个 demo2-prototype 已有 warning） |
| `pnpm typecheck` (domain + web) | ✅ PASS |
| `pnpm test` (domain 312 + web 351) | ✅ 663 tests passed（+21 新增） |
| `pnpm build:web` | ✅ PASS（workspace 45.9 kB） |
| `pnpm check:terminology` | ✅ PASS |

**测试覆盖范围**:
| 测试文件 | 覆盖内容 |
|----------|---------|
| `fe-001-capture-removed.test.ts` (24) | GoldenTopNav: 无 Plus/Capture/onOpenRecorder（4 tests）；page.tsx: 无 FloatingRecorder/recorderState/inputMode/Classic/Chat/Send/Minimize2/AppMode（10 tests）；HomeView: 输入框/卡片/forwardRef 完整（10 tests） |

**手工验证方式**:
1. 启动 `pnpm dev:web`，打开 workspace 页面
2. 确认页面初始加载时右下角不显示旧版 Capture 浮层（Classic/Chat tab 切换面板）
3. 确认 TopNav 右侧不再显示 Plus 按钮
4. 确认 Home 页面主捕获输入框 "Capture an idea... (Press Enter to Dock)" 显示正常
5. 确认 New Document / Process Dock / Graph Explorer 卡片显示正常
6. 确认 Home / Mind / Dock / Editor 导航仍可正常点击切换
7. 确认 Dock FinderView 中 "New Capture" 菜单项可切换回 Home 并聚焦输入框

**手工验证标准**:
- 页面任何状态下右下角不出现 Classic/Chat 旧版浮层
- TopNav 无 Plus 按钮
- Home 主捕获输入框可正常输入和 Enter 提交
- New Document / Process Dock 卡片点击行为正常
- TopNav 四个导航模块切换正常

**是否可以进入下一轮**: 是。

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| Chat 入口缺失 | 低 | 旧 Chat tab 已移除，未来 AI Chat 能力通过独立入口进入 |
| Plus 按钮移除 | 低 | 用户需要通过其他入口进行快速捕获（Home 输入框 / Dock New Capture 菜单） |

---

<!-- ============================================ -->
<!-- 分割线：Round 20 -->
<!-- ============================================ -->

## Phase 3 Round 20 devlog -- World Tree Phase 3A 落地与文档收口

**时间戳**: 2026-04-26

**任务起止时间**: 08:20 - 09:30 CST

**任务目标**: 实现 World Tree 真实数据驱动的可视化，替换 placeholder，集成 Pan/Zoom/LOD 交互能力。

**改动文件及行数**:
- `apps/web/app/workspace/_components/WorldTreeView.tsx` | A | +450 行（新增 - 真实数据驱动的世界树可视化组件）
- `apps/web/app/workspace/page.tsx` | M | +35 行（集成 WorldTreeView，新增 entriesViewMode 状态）
- `apps/web/app/workspace/_components/StructureViews.tsx` | M | +25 行（新增 World Tree 视图入口）
- `docs/product/structure—design/TIME_MACHINE_VIEW_SPEC_v1.1_Album_View.md` | A | +1 行（加入暂存区）
- `docs/product/structure—design/WORLD_TREE_VIEW_LANDING_PLAN_V2.md` | A | +1 行（加入暂存区）
- `docs/product/structure—design/TIME_MACHINE_VIEW_SPEC.md` | D | -1 行（删除旧版）
- `docs/product/structure—design/WORLD_TREE_VIEW_SPEC.md` | D | -1 行（删除旧版）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +60 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 通过 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ 248+ tests passed |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. Entries -> World Tree 展现的是当前真实的 Collections/Tags/Entries 结构
2. 符合 `world_tree_view_code_design.txt` 定义的宇宙/地貌氛围
3. 缩放时节点和标题的 LOD 切换自然
4. 点击 Realm/Cluster 的展开/收束逻辑正确
5. 拖拽平滑，Mini Map 正确反馈视口位置
6. 点击叶片弹出 Inspector，点击"打开详情"能触发右侧全局详情面板并加载内容
7. Finder/Table/List 模式下的详情行为及布局未发生回退

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 大数据量性能 | 中 | 500+ 条目下需验证 DOM/Canvas 混合渲染性能 |
| 关系写库操作 | 低 | Phase 3B 将聚焦"星辰归位"及更复杂的关系写库操作 |

---

<!-- ============================================ -->
<!-- 分割线：Round 19 Patch 2 -->
<!-- ============================================ -->

## Phase 3 Round 19 Patch 2 devlog -- Finder 布局压缩修复 + 结构视图框架

**时间戳**: 2026-04-26

**任务起止时间**: 07:30 - 08:20 CST

**任务目标**: 修复 Finder 点击条目触发全局 selectedArchivedEntryId 导致布局压缩的问题；集成知识结构化底座能力，实现 Finder/Table/World Tree/Time Machine 视图切换框架。

**改动文件及行数**:
- `apps/web/app/workspace/_components/FinderView.tsx` | M | +65 行（新增 finderPreviewEntryId/finderEditorEntryId/isFinderEditorOpen 内部状态）
- `apps/web/app/workspace/_components/FinderPreview.tsx` | A | +80 行（新增独立预览组件）
- `apps/web/app/workspace/page.tsx` | M | +25 行（hasSelectedItem 条件修正，entriesViewMode 状态）
- `apps/web/app/workspace/_components/StructureViews.tsx` | A | +120 行（新增结构视图封装组件）
- `apps/web/app/workspace/_components/TimeMachineView.tsx` | M | +3 行（entries.sort() 改为 [...entries].sort()）
- `apps/web/app/workspace/_components/Inspector.tsx` | M | +15 行（createEntryRelation 调用集成）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +70 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| Finder 点击条目复用 onSelectEntry → 触发 handleSelectArchivedEntry → 设置 selectedArchivedEntryId → hasSelectedItem=true → 主视图压缩到 320px + 条目标题竖排 | FinderView 不再调用 onSelectEntry，改用内部 finderPreviewEntryId 状态；hasSelectedItem 在 finder 模式下排除 selectedArchivedEntry |
| `listEntryTagRelations` 在 useMemo 中调用产生副作用 | 改为 useEffect 调用 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 通过 |
| `git diff --check` | ✅ 通过 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ 248 tests passed |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. Entries -> Finder 初始进入：Finder 占据主内容区域，不能只有 320px
2. 点击任意条目：左/中/右三栏比例稳定，条目标题横向显示，不竖排，不打开全局右侧大详情
3. 右侧预览区出现"打开编辑"入口
4. 点击"打开编辑"：只在 Finder 内部打开编辑面板
5. 拖拽编辑面板左边缘：宽度变化平滑，释放后保持宽度，中栏仍可读
6. 切回列表模式：点击条目仍打开原来的全局详情面板
7. Time Machine / Table 视图不受 Finder 内部状态影响
8. 结构视图能加载真实投影数据（getStructureProjection）
9. Finder 左侧栏展示真实 collections 和 tags

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| Finder 状态完全内聚 | 低 | 不影响全局 selection，但需确保所有入口都使用内部状态 |
| 结构视图数据量大时性能 | 中 | 需验证大数量 collections/tags/entries 下的渲染性能 |

---

<!-- ============================================ -->
<!-- 分割线：Round 19 Patch 1 -->
<!-- ============================================ -->

## Phase 3 Round 19 Patch 1 devlog -- Entries 筛选数量显示修复

**时间戳**: 2026-04-26

**任务起止时间**: 07:15 - 07:30 CST

**任务目标**: 修复 Calendar 日期筛选生效时 header 提示显示总条数而非筛选后条数的问题。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +1 行（archivedEntries.length 改为 filteredEntries.length）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +25 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| 原实现用 archivedEntries.length 表达"筛选前总量"，但用户期望看到筛选后实际条数 | 将 archivedEntries.length 改为 filteredEntries.length |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 通过 |
| `git diff --check` | ✅ 通过 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ PASS |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 点击 Calendar 中有归档的日期后，Entries 列表数量和顶部"已筛选，共 N 条"一致
2. 空日期显示 0 条或真实空状态
3. 清除筛选后恢复全部 Entries
4. Widget/Calendar 和 Chat 已有体验不回归

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 单行文案数字源修正 | 极低 | 不涉及逻辑变更 |

---

<!-- ============================================ -->
<!-- 分割线：Round 19 -->
<!-- ============================================ -->

## Phase 3 Round 19 devlog -- Widget/Calendar 主线接入

**时间戳**: 2026-04-26

**任务起止时间**: 06:30 - 07:15 CST

**任务目标**: 接入后端 Widget/Calendar 能力，实现 Widget 入口 UI、Calendar Widget 展示、日期筛选联动。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +85 行（Widget 入口按钮、WidgetPanel 集成、CalendarWidget 集成、日期筛选逻辑）
- `apps/web/app/workspace/_components/WidgetPanel.tsx` | A | +95 行（新增 Widget 面板组件）
- `apps/web/app/workspace/_components/CalendarWidget.tsx` | A | +110 行（新增日历组件）
- `apps/web/app/workspace/_components/EntriesFilterBar.tsx` | M | +15 行（日期筛选标签展示）
- `apps/web/tests/widget-calendar.test.ts` | M | +2 行（non-null assertion 改为 optional chaining）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +55 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ 464 tests passed（249 domain + 215 web） |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 右上角可打开 widget 面板，并只激活一个 calendar widget
2. calendar widget 可关闭、可重新激活
3. 点击某日期后能看到当天真实 archived entries
4. 空日期显示空状态
5. chat/history/title/preview/重编辑体验不回归

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 新增 Widget/Calendar 功能为纯增量 | 低 | 未修改已有 chat/editor/history/title/preview/重编辑逻辑 |
| 日历筛选通过 filteredEntries 增加条件实现 | 低 | 清除筛选即恢复原状 |

---

<!-- ============================================ -->
<!-- 分割线：Round 18 -->
<!-- ============================================ -->

## Phase 3 Round 18 devlog -- 质量收口与会话恢复修复

**时间戳**: 2026-04-26

**任务起止时间**: 05:30 - 06:30 CST

**任务目标**: 清理 lint 报错，增强会话恢复逻辑，优化重新编辑交互细节。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +35 行（移除冗余状态、parseRecorderState 辅助函数、会话恢复优先级修复、返回按钮支持、trailing whitespace 清理）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +40 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| `page.tsx` 顶层冗余且未使用的 `isEditingTitle`, `editTitle`, `isHoveringTitle` 状态触发 lint | 移除无用状态声明（注：详情面板内的同名状态保留，互不影响） |
| `savedRecorderState as any` 非安全转型 | 引入 `parseRecorderState` 辅助函数进行类型校验 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 通过 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ PASS |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 刷新页面或切换路由后，确认能恢复上次未完成或已完成的会话
2. `confirmed` 会话必须显示 `done` 状态及对应按钮
3. 在 `done` 状态点击"重新编辑"，确认仍能复用两层选择（取消后重走流程或单修模块）逻辑
4. 在重新编辑时，若只修改"类型"，提交后应直接返回确认界面，不再循环询问"内容"
5. 视觉回归检查：iMessage 风格气泡、消息时间、内容预览卡片、详情页标题编辑、正文点击编辑等已实现体验无回退

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 本次变更为纯粹的质量加固和逻辑修复 | 极低 | 未改变核心交互流程 |

---

<!-- ============================================ -->
<!-- 分割线：Round 17 -->
<!-- ============================================ -->

## Phase 3 Round 17 devlog -- 修正归档时标题同步逻辑

**时间戳**: 2026-04-26

**任务起止时间**: 05:00 - 05:30 CST

**任务目标**: 修复 Dock 项归档后 Entry 标题未能同步 Dock 标题的问题。

**改动文件及行数**:
- `packages/domain/src/types.ts` | M | +2 行（ArchiveInput 增加 topic 字段）
- `packages/domain/src/archive-service.ts` | M | +5 行（buildEntryFromArchive 优先使用 input.topic 作为 Entry.title）
- `apps/web/lib/repository.ts` | M | +3 行（archiveItem 传入 DockItem.topic）
- `packages/domain/tests/archive-service.test.ts` | M | +20 行（新增标题同步测试用例）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +25 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm test` (domain) | ✅ PASS |
| `pnpm typecheck` (domain & web) | ✅ PASS |

**手工验证步骤说明**:
1. Dock 项设置 topic 后归档，Entry.title 与 DockItem.topic 一致
2. Dock 项无 topic 时归档，Entry.title 退化为正文首行
3. 重新归档同一 Dock 项，Entry.title 同步更新

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| ArchiveInput 新增 topic 字段 | 低 | 向后兼容，无 topic 时 fallback 到原有逻辑 |

---

<!-- ============================================ -->
<!-- 分割线：Round 16 -->
<!-- ============================================ -->

## Phase 3 Round 16 devlog -- 状态持久化、点击编辑及标题交互深度优化

**时间戳**: 2026-04-26

**任务起止时间**: 04:00 - 05:00 CST

**任务目标**: 实现会话状态持久化、正文点击即编辑、标题独立编辑交互优化。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +85 行（localStorage 持久化 currentSessionId/inputMode/recorderState、点击编辑逻辑、标题编辑交互、autoFocus）
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +45 行（标题移至 Header 区域、独立编辑框、Hover 铅笔图标）
- `apps/web/app/workspace/_components/ArchivedEntryDetail.tsx` | M | +25 行（正文点击编辑、Hover 提示）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +45 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 打开聊天 -> 切换到"归档" -> 切换回"Dock" -> 验证聊天内容是否仍在
2. 点击 Dock 详情正文，验证是否自动开启编辑框
3. Hover 详情页顶部标题，点击铅笔图标，修改并保存，验证数据库是否更新
4. 编辑标题时不影响下方正文的编辑状态
5. 点击"重新编辑"后输入框自动获得焦点

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| localStorage 持久化可能泄露用户数据 | 低 | 仅持久化会话 ID 和界面状态，不持久化敏感内容 |
| 点击编辑可能误触发 | 低 | Hover 时有背景色变化和提示，降低误操作概率 |

---

<!-- ============================================ -->
<!-- 分割线：Round 15 -->
<!-- ============================================ -->

## Phase 3 Round 15 devlog -- 预览、标题及标签 UI 深度修复

**时间戳**: 2026-04-26

**任务起止时间**: 03:30 - 04:00 CST

**任务目标**: 修复预览框触发逻辑、标题丢失问题、标签建议 UI 优化。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +15 行（预览框触发条件放宽至 msg.role !== 'user'）
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +20 行（顶部新增 Topic/Title 展示区域）
- `apps/web/app/workspace/_components/ArchivedEntryDetail.tsx` | M | +20 行（顶部新增 Topic/Title 展示区域）
- `apps/web/app/workspace/_components/SuggestionTags.tsx` | M | +8 行（问号 ? 改为 ⓘ 图标按钮）
- `apps/web/lib/repository.ts` | M | +5 行（confirmChatSession 首次创建时传入 topic）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +35 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| 历史消息中部分 role 记录为 system，导致 msg.role === 'assistant' 过滤逻辑失效 | 将触发条件放宽至 msg.role !== 'user' |
| confirmChatSession 首次创建 DockItem 时遗漏 topic 参数 | 修正 confirmChatSession 逻辑，首次创建时传入 topic |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 历史消息中无论 role 为 assistant 还是 system，预览框都能正确挂载
2. Chat 确认生成 Dock 文档后，DockItem.topic 正确写入
3. 点击 Dock/归档详情后，顶部清晰显示加粗标题
4. 标签建议后的问号改为 ⓘ 图标，Hover 显示建议原因

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| role 过滤放宽可能误触发预览 | 低 | system 消息通常也是引导消息，符合预览预期 |

---

<!-- ============================================ -->
<!-- 分割线：Round 14 -->
<!-- ============================================ -->

## Phase 3 Round 14 devlog -- iMessage 体验细节打磨与功能修正

**时间戳**: 2026-04-26

**任务起止时间**: 03:00 - 03:30 CST

**任务目标**: 优化气泡设计为 Pixel-Perfect iMessage 风格，新增消息时间戳，修复预览框可见性。

**改动文件及行数**:
- `apps/web/app/workspace/_components/ChatMessageBubble.tsx` | M | +35 行（非对称圆角设计、iMessage 配色、内边距与行高调整）
- `apps/web/app/workspace/page.tsx` | M | +25 行（消息时间戳自动显示逻辑、时间格式化）
- `apps/web/app/workspace/_components/ChatPreviewCard.tsx` | M | +12 行（兼容新旧版确认文案触发逻辑）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +30 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| 伪元素"尾巴"方案在深色模式或半透明背景下出现"块状方角"异常 | 改用更稳健的非对称圆角设计（rounded-br-[4px] / rounded-bl-[4px]） |
| 消息内容微差异导致预览框无法正确挂载 | 增强触发逻辑，兼容新旧版确认文案 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 聊天气泡呈现 iMessage 风格，无块状方角异常
2. 消息与上一条间隔超过 5 分钟时显示时间戳（如：4月26日 03:03）
3. 会话首条消息显示时间戳
4. 新旧版确认文案都能正确触发预览框

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 非对称圆角在某些浏览器渲染差异 | 低 | 使用标准 Tailwind 类，兼容性良好 |

---

<!-- ============================================ -->
<!-- 分割线：Round 13 -->
<!-- ============================================ -->

## Phase 3 Round 13 devlog -- 修复 staged 前端 P0 问题（溯源导航与命令执行）

**时间戳**: 2026-04-26

**任务起止时间**: 00:05 - 03:00 CST

**任务目标**: 修复 ChainProvenanceView 导航行为错误和 Slash Command 功能异常问题。

**改动文件及行数**:
- `apps/web/app/workspace/_components/ChainProvenanceView.tsx` | M | +20 行（修复导航行为，区分 onNavigateToItem 和 onDerive）
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +15 行（引入 onNavigateToItem 回调）
- `apps/web/app/workspace/_components/ArchivedEntryDetail.tsx` | M | +15 行（引入 onNavigateToItem 回调）
- `apps/web/app/workspace/_components/CommandMenu.tsx` | M | +25 行（复用 Domain 层 applyEditorCommand）
- `apps/web/app/workspace/page.tsx` | M | +30 行（handleFormat 移除，统一使用 applyEditorCommand）
- `apps/web/app/workspace/_components/ChatInputBar.tsx` | M | +45 行（textarea 多行录入、autoFocus、IME 保护）
- `packages/domain/src/state-machine.ts` | M | +3 行（扩展 VALID_TRANSITIONS 允许 reopened -> archived）
- `packages/domain/tests/state-machine.test.ts` | M | +5 行（同步更新单元测试）
- `apps/web/app/workspace/_components/DetailPanel.tsx` | M | +15 行（reopened 条目检测 suggestions 直接显示整理建议）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +70 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| ChainProvenanceView 点击"起源/父级"调用了 onDerive(id, '')，导致非预期的空 Dock item 被创建 | 引入 onNavigateToItem 回调，调用 setSelectedItemId 选中对应 DockItem，清理 archiving 选中状态，切换工作区到 Dock |
| CommandMenu 的 link 选项没有执行真正的 Markdown 插入，前端 UI 层自行维护另一套格式化选区逻辑 | 移除前端 handleFormat，从 @atlax/domain 引入 applyEditorCommand 统一执行 |
| textarea 默认 Enter 为换行，需拦截并手动处理 Command+Enter 的换行插入 | 使用 useRef 和 useEffect 实现高度自适应；拦截 onKeyDown，手动更新 draft 状态并使用 setTimeout 恢复光标位置 |
| state-machine 原有限制导致 reopened 状态无法直接归档 | 扩展 VALID_TRANSITIONS 并同步更新单元测试 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 通过 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ 229 个测试全部通过 |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 点击 ChainProvenanceView 中的"起源/父级"链接，在同视图中打开已有溯源项而不是创建新记录
2. 点击"派生记录"按钮才创建新记录，并带入原文本
3. 编辑器中输入 / 触发 CommandMenu，选择 bold/italic/code/link 正确插入 Markdown
4. 输入 10 行文本，输入框自动增高并在达到 200px 后出现内部滚动
5. 按下 Command+Enter 成功插入新行且光标位置正确；按下 Enter 触发发送流程
6. 使用中文输入法输入字符，选词过程按 Enter 仅选词不发送
7. 从归档列表点击"重新整理"，进入 Dock 后直接显示之前生成的建议

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| Domain 层 EditorCommandTransform 已有多维度测试 | 低 | 本次变更为纯粹的前端胶水层改动 |
| 状态机扩展 | 低 | 符合业务逻辑，已同步更新测试 |

---

<!-- ============================================ -->
<!-- 分割线：Round 12 (2026-04-25) -->
<!-- ============================================ -->

## Phase 3 Round 12 devlog -- 知识链 UI 闭环与编辑器功能增强

**时间戳**: 2026-04-25

**任务起止时间**: 22:00 - 00:05 CST

**任务目标**: 实现 Chain link UI 溯源展示和派生记录入口，编辑器工具栏实际 Markdown 包裹功能，轻量级 / 命令菜单。

**改动文件及行数**:
- `apps/web/app/workspace/_components/ChainProvenanceView.tsx` | A | +85 行（新增 - 知识链溯源展示组件）
- `apps/web/app/workspace/_components/ExpandedEditor.tsx` | M | +30 行（工具栏按钮组、字数统计、快捷键提示）
- `apps/web/app/workspace/_components/FullScreenEditModal.tsx` | A | +120 行（新增 - 全屏编辑模态框）
- `apps/web/app/workspace/_components/CommandMenu.tsx` | A | +75 行（新增 - Slash Command 菜单）
- `apps/web/app/workspace/page.tsx` | M | +40 行（handleSelectItem / handleSelectArchivedEntry 统一处理逻辑）
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +15 行（全屏编辑入口）
- `apps/web/app/workspace/_components/ArchivedEntryDetail.tsx` | M | +15 行（全屏编辑入口）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +55 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 通过 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ 178 tests passed |

**手工验证步骤说明**:
1. Dock/Entries 详情页展示"起源"和"父级"链接，点击可跳转
2. 点击"派生记录"基于当前内容快速创建关联的新记录
3. 编辑器工具栏点击 bold/italic/code/link 对选中文本应用 Markdown 格式
4. 输入 / 键触发 CommandMenu，支持快捷键提示
5. Review 视图点击最近归档可正确跳转至条目详情并加载知识链

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端自行维护的 handleFormat 字符串拼接逻辑 | 中 | 后续需收敛到 Domain 层 applyEditorCommand |

---

<!-- ============================================ -->
<!-- 分割线：Round 11 (2026-04-25) -->
<!-- ============================================ -->

## Phase 3 Round 11 devlog -- Review Gate 补充修复

**时间戳**: 2026-04-25

**任务起止时间**: 21:30 - 22:00 CST

**任务目标**: 清理 trailing whitespace，回归校验，重新运行全量 Lint、Typecheck 及 Vitest。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +3 行（移除三处按钮标签后的多余空格 L789, L1935, L2246）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +20 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 通过 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ PASS |

**手工验证步骤说明**:
1. git diff --cached --check 无输出
2. 全量 lint/typecheck/test 通过

**当前风险及影响范围**:
无新增风险。本轮仅做 Review Gate 修复。

---

<!-- ============================================ -->
<!-- 分割线：Round 10 -->
<!-- ============================================ -->

## Phase 3 Round 10 devlog -- 编辑体验提升与工作区打磨

**时间戳**: 2026-04-25

**任务起止时间**: 20:00 - 21:30 CST

**任务目标**: 实现沉浸式全屏编辑、编辑器工具栏增强、工作区视觉打磨、响应式布局适配。

**改动文件及行数**:
- `apps/web/app/workspace/_components/FullScreenEditModal.tsx` | A | +150 行（新增 - 5xl 宽度沉浸式编辑环境，支持 Esc 关闭及 ⌘+Enter 快速保存）
- `apps/web/app/workspace/_components/ExpandedEditor.tsx` | M | +40 行（格式化工具栏：加粗、斜体、链接、代码块、图片、附件、命令 /）
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +10 行（全屏编辑入口）
- `apps/web/app/workspace/_components/ArchivedEntryDetail.tsx` | M | +10 行（全屏编辑入口）
- `apps/web/app/workspace/_components/Sidebar.tsx` | M | +25 行（Logo 升级：多层渐变、玻璃质感、呼吸感阴影）
- `apps/web/app/workspace/_components/EmptyState.tsx` | M | +30 行（Dock/Entries 空状态重绘：3D 质感容器、淡入动画、引导按钮）
- `apps/web/app/workspace/page.tsx` | M | +20 行（响应式布局适配、数据隔离验证）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +50 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. Dock 详情页点击"编辑内容"可直接修改并保存
2. 点击右上角展开图标进入沉浸模式，保存后详情页同步更新
3. 编辑器底部显示格式化按钮组，交互反馈良好
4. 清空 Dock 后显示带引导的优质空态页面
5. 调整窗口大小时，侧边栏折叠与详情页宽度自适应

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 全屏编辑模态框在极窄屏幕下的表现 | 低 | 使用 max-width 和响应式类，已做适配 |

---

<!-- ============================================ -->
<!-- 分割线：Round 9 -->
<!-- ============================================ -->

## Phase 3 Round 9 devlog -- Chat 浮窗自适应布局重构

**时间戳**: 2026-04-24

**任务起止时间**: 19:00 - 20:00 CST

**任务目标**: 实现 Chat 浮窗的响应式面板尺寸、弹性历史记录栏、弹性输入区、高度自适应与滚动保护。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +55 行（响应式面板尺寸、弹性历史记录栏、弹性输入区、高度自适应）
- `apps/web/app/workspace/_components/ChatHistorySidebar.tsx` | M | +25 行（响应式处理：宽屏默认开启，窄屏默认折叠）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +40 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 面板宽度在 1024px/1366px/1440px/1920px 视口下自适应
2. 历史记录栏在宽屏默认开启，窄屏(<1024px)默认折叠为按钮
3. 无历史记录时自动隐藏 Sidebar 占位
4. 输入框不会被挤压或裁切，发送按钮始终可见
5. 消息展示区是唯一的滚动区域，不被其他组件遮挡

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 极窄屏幕下历史记录栏折叠体验 | 中 | 需实机测试验证 |

---

<!-- ============================================ -->
<!-- 分割线：Round 8 -->
<!-- ============================================ -->

## Phase 3 Round 8 devlog -- Phase3 稳定性修复

**时间戳**: 2026-04-24

**任务起止时间**: 18:00 - 19:00 CST

**任务目标**: 修复 Chat 会话生命周期、Layout 稳定性、用户数据隔离、项目关联项下拉逻辑。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +35 行（Chat 会话生命周期修复、userId 依赖监听、uniqueArchivedProjects 区分）
- `apps/web/lib/events.ts` | M | +8 行（所有埋点记录加上 userId，localStorage key 物理隔离）
- `apps/web/app/workspace/_components/ReviewView.tsx` | M | +5 行（严格传入 userId 参数读取统计）
- `apps/web/app/workspace/_components/EntriesFilterBar.tsx` | M | +5 行（只展示已归档内容中包含的项目）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +35 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 不再创建只有 welcome 的空 session，用户首条消息时才调用 createChatSession
2. 切换用户后强制重新拉取 chat 列表、重置本地状态
3. 不同账号的 event log 物理隔离（atlax_event_log_{userId}）
4. Review 统计按账号独立
5. EntriesFilterBar 只展示已归档项目，避免 Dock item 未归档前成为死选项

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| userId 变化监听可能过度触发重载 | 低 | useEffect 依赖 user?.id，仅在真实切换时触发 |

---

<!-- ============================================ -->
<!-- 分割线：Round 7 -->
<!-- ============================================ -->

## Phase 3 Round 7 devlog -- 修复历史记录加载 + Chat 窗口布局问题

**时间戳**: 2026-04-24

**任务起止时间**: 17:00 - 18:00 CST

**任务目标**: 修复历史记录加载逻辑错误和 Chat 窗口展示异常问题。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +45 行（历史记录加载逻辑修复、Chat 窗口固定尺寸和定位、响应式布局优化）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +40 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| 初始化时先设置欢迎消息，再加载历史会话，导致状态覆盖混乱 | 先调用 listChatSessions 加载历史数据，根据加载结果决定显示内容 |
| 浮动面板使用 fixed bottom-0 right-0 w-full max-w-4xl 导致定位不稳定 | 改为 fixed bottom-6 right-6 w-[480px]，使用固定像素值配合 maxHeight: calc(100vh - 120px) |
| 消息容器缺少明确的 height 约束和底部 padding | 添加 overflow-hidden 到父容器，消息容器添加 pb-8 底部 padding |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 刷新页面后先加载历史，再决定显示内容（有 active session 显示该 session，无则显示欢迎消息）
2. Chat 窗口使用固定尺寸和定位，不随浏览器缩放消失
3. 消息容器有底部 padding，输入框固定在底部，最后一条消息完全可见
4. 所有容器使用正确的 flex 布局（flex flex-col min-h-0）

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 固定尺寸在极小视口下可能溢出 | 低 | 使用 maxHeight: calc(100vh - 120px) 做保护 |

---

<!-- ============================================ -->
<!-- 分割线：Round 6 -->
<!-- ============================================ -->

## Phase 3 Round 6 devlog -- 完善会话生命周期 + 置顶功能 + 组件化重构

**时间戳**: 2026-04-24

**任务起止时间**: 16:00 - 17:00 CST

**任务目标**: 完善会话生命周期管理、历史列表置顶功能、组件化重构解决 JSX 解析问题。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +55 行（handleChatNextStep 改为 async、updateChatSession 实时更新、startNewChatSession 统一处理）
- `apps/web/app/workspace/_components/ChatHistorySidebar.tsx` | A | +120 行（新增 - 独立历史会话侧边栏组件）
- `apps/web/app/workspace/_components/ChatInputBar.tsx` | M | +5 行（hideHeader prop）
- `apps/web/app/workspace/_components/ExpandedEditor.tsx` | M | +8 行（hideHeader 支持）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +50 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| 历史列表的复杂 IIFE 结构导致 JSX 解析问题 | 提取为独立的 ChatHistorySidebar 组件 |
| Tailwind 的 group/session-item:opacity-100 语法中的 / 字符导致 ESLint/TypeScript 解析错误 | 对于动态样式优先使用内联 style 对象；静态样式继续使用 Tailwind class |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 用户输入、step 变化时实时更新当前 session（updateChatSession）
2. 历史列表按 pinned 优先、updatedAt 倒序排列
3. 空会话不显示（topic 或 selectedType 或 content 或 messages.length > 1 才显示）
4. 每个 session 项支持 pin/unpin 操作
5. Done 按钮固定于底部，消息区正常滚动

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| updateChatSession 频繁写入可能影响性能 | 低 | 后续可考虑添加 debounce |

---

<!-- ============================================ -->
<!-- 分割线：Round 5 -->
<!-- ============================================ -->

## Phase 3 Round 5 devlog -- 接入后端 Chat Session + 修复操作区遮挡

**时间戳**: 2026-04-24

**任务起止时间**: 15:00 - 16:00 CST

**任务目标**: 接入后端 chat session API，修复操作区遮挡问题，完善历史列表逻辑。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +65 行（接入 createChatSession/listChatSessions/updateChatSession、LocalChatSession/LocalChatMessage 类型、toBackendMessages 转换函数）
- `apps/web/app/workspace/_components/ChatInputBar.tsx` | M | +15 行（Done 按钮移到消息容器外，固定在底部）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +40 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 页面初始化时调用 listChatSessions(userId) 加载历史 sessions
2. 当前会话在用户输入、step 变化、确认完成时调用 updateChatSession 更新
3. 历史会话按 Today / Yesterday / Earlier 分组显示
4. Done 按钮固定在 chat panel 底部，不随消息滚动

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 后端 pinned 字段尚未支持 | 低 | 历史列表暂不实现置顶功能，待后端支持后开启 |

---

<!-- ============================================ -->
<!-- 分割线：Round 4 -->
<!-- ============================================ -->

## Phase 3 Round 4 devlog -- Chat 面板滚动与历史列表展示

**时间戳**: 2026-04-24

**任务起止时间**: 14:00 - 15:00 CST

**任务目标**: 修复 chat 滚轮不可用、历史列表标题调整、用户向上查看历史时被强制拉回底部的问题。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +40 行（messagesContainerRef 替代 chatMessagesEndRef、onScroll 事件监听、isAtBottomRef 追踪）
- `apps/web/app/workspace/_components/ChatHistorySidebar.tsx` | M | +8 行（移除"历史会话"标题、当前会话按钮条件显示、会话项文本改为英文）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +35 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. chat 消息区可用鼠标滚轮上下滚动（min-h-0 overflow-y-auto）
2. 自动滚动只滚动 chat 消息区，不滚动 Dock/Review 主页面（messagesContainerRef.scrollTo()）
3. 最后一轮确认区完整可见可点（高度链路 min-h-0 flex-1）
4. 用户向上查看历史时不会被无关 render 拉回底部（isAtBottomRef 判断）
5. 左侧标题已移除，空会话不进入历史

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 后端持久化 chat history/session isolation | 中 | 需要后端配合实现 |

---

<!-- ============================================ -->
<!-- 分割线：Round 3 -->
<!-- ============================================ -->

## Phase 3 Round 3 devlog -- 窄修 - 历史列表/动画/Classic 按钮

**时间戳**: 2026-04-24

**任务起止时间**: 13:00 - 14:00 CST

**任务目标**: 修复消息区自动滚动、历史会话渲染、新会话触发逻辑、Classic 两个缩放按钮、动画不够平滑的问题。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +50 行（chatMessagesEndRef 滚动定位、chatSessions 实际读取状态、startNewChatSession 统一处理、动画调教）
- `apps/web/app/workspace/_components/ExpandedEditor.tsx` | M | +8 行（hideHeader prop，隐藏内部关闭按钮）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +40 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. 最后一轮确认区不被截断（chatMessagesEndRef + scrollIntoView）
2. 历史会话可见、可点击、可恢复（chatSessions 实际渲染）
3. 空会话不进入历史（hasValidContent 检查）
4. 关闭再打开恢复未完成 chat（handleModeChange 不再重置）
5. Classic ↔ Chat 不误开新会话（只在显式调用 startNewChatSession）
6. Classic 只有一个关闭/缩放按钮（hideHeader prop）
7. 动画不突兀（iOS 风格 easing + 500ms 过渡）

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 手动实机验证未执行 | 中 | 所有修复基于代码逻辑分析 |

---

<!-- ============================================ -->
<!-- 分割线：Round 2 -->
<!-- ============================================ -->

## Phase 3 Round 2 devlog -- UX 状态模型重构

**时间戳**: 2026-04-24

**任务起止时间**: 11:00 - 13:00 CST

**任务目标**: 重构 Chat/Classic 状态模型，解决 isChatMinimized/chatImmersive/chatSunk 三状态语义混淆问题。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +120 行（recorderState 状态替换、移除旧状态、Classic/Chat 模式修复、历史列表占位）
- `apps/web/app/workspace/_components/ChatInputBar.tsx` | M | +15 行（移除 onGoToDock/onEnterChat/immersive/sunk props、setStep 类型修改）
- `apps/web/app/workspace/_components/InputContainer.tsx` | D | -80 行（移除组件）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +60 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |

**手工验证步骤说明**:
1. Dock/Entries/Review 默认无 blur 遮挡（recorderState 初始为 'closed'）
2. 右下角浮动按钮打开记录器（recorderState === 'closed' && !hasSelectedItem 时显示）
3. 空白区域关闭记录器（关闭按钮调用 setRecorderState('closed')）
4. Classic/Chat 滑块切换（ModeSwitch 触发 handleModeChange）
5. Chat 新会话/历史列表（currentSessionId + setChatSessions）
6. 选择面板不遮挡聊天（maxHeight: '80vh' + overflow-y-auto）
7. 选择阶段可关闭（关闭按钮明确）
8. 去 Dock 查看关闭 chat（setRecorderState('closed') + setActiveNav('dock')）
9. 中文输入法 Enter 选词不发送（!e.nativeEvent.isComposing）
10. Type 保存为 tag（handleChatFinalSubmit(finalContent, [chatType], false)）

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| Chat 历史列表 UI 不完整 | 中 | 左侧栏只显示"当前会话"高亮，历史会话占位符未实现 |
| Chat 历史切换功能未实现 | 中 | 点击历史会话无法加载 |
| 手动实机验证未执行 | 中 | 所有修复基于代码逻辑分析 |

---

<!-- ============================================ -->
<!-- 分割线：Round 1 Hand-Testing Fixes -->
<!-- ============================================ -->

## Phase 3 Round 1 devlog -- 构建门禁修复与核心交互修复

**时间戳**: 2026-04-24

**任务起止时间**: 10:00 - 11:00 CST

**任务目标**: 修复构建门禁、记录器状态模型、"去 Dock 查看"、中文输入法 Enter 误发送、Chat 会话生命周期、Chat 记录语义、项目关联、玻璃质感。

**改动文件及行数**:
- `apps/web/tsc-errors.txt` | D | -1 行（删除临时文件）
- `apps/web/app/workspace/_components/ChatInputBar.tsx` | M | +8 行（onGoToDock 未使用 lint 错误修复、isComposing 检查）
- `apps/web/app/workspace/page.tsx` | M | +65 行（overlay 条件修正、浮动按钮条件修正、Sidebar「记录」按钮修复、去 Dock 查看修复、currentSessionId 状态、handleChatFinalSubmit 语义修复、uniqueProjects 修复）
- `apps/web/app/workspace/_components/Sidebar.tsx` | M | +8 行（玻璃质感调整：backdrop-blur-xl → backdrop-blur-md）
- `apps/web/app/workspace/_components/ChatOverlay.tsx` | M | +3 行（backdrop-blur-[8px] → backdrop-blur-sm，透明度 40% → 30%）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +50 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| ChatInputBar 中 onGoToDock 未使用触发 lint | 重命名为 _onGoToDock |
| 中文输入法候选词回车选中时发送消息 | 在 onKeyDown 中添加 !e.nativeEvent.isComposing 检查 |
| overlay 在 normal browsing 时拦截点击 | 修正 overlay 条件：只在 isChatMinimized && !chatImmersive 时拦截 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --dir apps/web lint` | ✅ 通过 |
| `pnpm --dir apps/web typecheck` | ✅ 通过 |

**手工验证步骤说明**:
1. Dock 页点击 item 打开详情无 error
2. 默认无 overlay 拦截 Dock 点击
3. 右下角浮动按钮打开记录器
4. Sidebar「记录」只打开记录器，不切换主页面
5. 记录器内 Chat / Classic 滑块正常
6. 中文输入法回车选词不发送
7. Chat 完成后"去 Dock 查看"直接显示 Dock
8. 第二步类型保存为 tag，不进入正文
9. 新建项目确认后立即回显
10. 关闭/缩小 Chat 后重新打开是新会话

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| Chat 历史列表 UI 尚未实现 | 中 | 状态已添加但未渲染 |
| 手动验证路径需要实际在浏览器中测试确认 | 中 | 所有修复基于代码逻辑分析 |

---

<!-- ============================================ -->
<!-- 分割线：Round 1 Review Fix -->
<!-- ============================================ -->

## Phase 3 Round 1 Review devlog -- 架构回退与前端稳定化

**时间戳**: 2026-04-24

**任务起止时间**: 09:00 - 10:00 CST

**任务目标**: 回退错误的全页聊天导航模型，恢复右下角浮动记录器界面，修复 Chat 焦点和状态收敛。

**改动文件及行数**:
- `apps/web/app/workspace/page.tsx` | M | +85 行（架构回退、Chat Focus & State Convergence、Sidebar & ModeSwitch 修复、Continuous Chat Flow 集成）
- `apps/web/app/workspace/_components/ChatInputBar.tsx` | M | +20 行（集成标准 ChatGuidanceService 步骤、固定句式、refill 逻辑）
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +15 行（updateSelectedActions / updateSelectedProject 接入、动态渲染选中状态）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +40 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| React useEffect 和 scope 错误（uniqueProjects） | 修复 uniqueProjects 作用域问题 |
| 标准环境验证（node/pnpm）因本地 bin path 阻塞 | 推迟到 Coordinator 处理 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --dir apps/web lint` | ✅ 通过 |
| `pnpm --dir apps/web typecheck` | ⚠️ 受阻 | 存在前端代码错误（TS1128），来自 frontend agent 的 staged 修改 |

**手工验证步骤说明**:
1. 浮动记录器行为正确：点击外部正确下沉/隐藏
2. 切换菜单时状态重置
3. Sidebar "Records" 菜单触发浮动记录器而非导航离开
4. Chat 使用标准固定句式（"这次记录是什么主题呢"等）
5. refill 逻辑正确（"想重新记录哪一部分"）
6. updateSelectedActions / updateSelectedProject 正确持久化

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 typecheck 阻塞 | 中 | 需要修复 uniqueProjects 作用域问题 |
| sourceType="chat" 创建行为需监控 | 低 | 需验证 chat 创建 DockItem 的行为正确 |

---

<!-- ============================================ -->
<!-- 分割线：Round 11 (2026-04-26) -->
<!-- ============================================ -->

## Phase 3 Round 11 devlog -- Finder 交互修复与布局重构

**时间戳**: 2026-04-26

**任务起止时间**: 02:00 - 04:00 CST

**任务目标**: 修复 Finder 模式交互（点击条目进入预览态而非立刻打开编辑区），提供进入编辑区入口，修复布局比例，增加右侧编辑区边缘拖拽调宽能力。

**改动文件及行数**:
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +55 行（左边缘拖拽调宽能力、col-resize 光标、宽度状态全局持久化）
- `apps/web/app/workspace/_components/FinderView.tsx` | M | +45 行（内部预览模式、Preview 信息完整展示、统一编辑入口）
- `apps/web/app/workspace/_components/FinderPreview.tsx` | A | +60 行（新增 - Finder 内部预览组件）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +50 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| 拖拽时的 CSS 过渡延迟 | 修复拖拽时的 CSS 过渡延迟 |
| Finder 内部编辑态逻辑与全局详情模块重叠 | 移除 Finder 内部编辑态逻辑，所有编辑行为收拢至全局详情模块 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 通过 |
| `pnpm typecheck` | ✅ 通过 |
| `pnpm build` | ✅ 通过 |

**手工验证步骤说明**:
1. Dock 交互：点开条目，右侧全局详情模块出现，拖动左边缘能改变整个模块宽度
2. List 交互：Entries/List 点开条目，右侧全局详情模块出现，拖动左边缘能改变整个模块宽度
3. Finder 预览：点击条目，只出现 Finder 内部 preview，不弹全局详情
4. Finder 预览质量：Preview 信息完整展示（标题/类型/摘要/项目/标签/关联数），无横向裁切，无异常空白
5. Finder 编辑：点击 Preview 中的"打开编辑"，全局 DetailSlidePanel 出现
6. 全局详情拖拽：Finder 打开的全局详情模块同样可拖动调宽，且调宽影响整个详情模块（不影响 textarea 局部）
7. 布局恢复：关闭详情后，Finder 仍保持正常三栏可读布局

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 拖拽性能：大数据量下可能存在重绘延迟 | 低 | 当前数据量可接受 |
| 响应式边界：极窄屏幕下（< 1024px）三栏布局可能需要进一步隐藏 Sidebar | 低 | 后续可优化 |

---

<!-- ============================================ -->
<!-- 分割线：Round 12 (2026-04-26) -->
<!-- ============================================ -->

## Phase 3 Round 12 devlog -- Finder 状态解耦与全局布局集成修复

**时间戳**: 2026-04-26

**任务起止时间**: 04:00 - 06:30 CST

**任务目标**: 解决 Finder 点击条目导致全局详情面板错误打开的问题，实现 Finder Preview 内容概要逻辑，消除全局详情面板与主内容区之间的布局 Gap。

**改动文件及行数**:
- `apps/web/app/workspace/_components/FinderView.tsx` | M | +35 行（finderPreviewEntryId 内部状态、条目点击仅影响内部预览）
- `apps/web/app/workspace/_components/DetailSlidePanel.tsx` | M | +25 行（移出 fixed 容器，进入主 Workspace 的 flex 流）
- `apps/web/app/workspace/page.tsx` | M | +20 行（handleSelectArchivedEntry 逻辑修正、主内容区 flex-1 自适应）
- `apps/web/app/workspace/_components/Inspector.tsx` | M | +15 行（line-clamp-6 与渐变淡出效果、独立滚动条）
- `docs/engineering/dev_log/Phase3/phase3-devlog-frontend.md` | M | +55 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| Round 11 错误认为交互修复已完成，实机测试发现详情面板与内容区存在 Gap | 通过布局流集成、状态内部化、宽度边界 Clamp 以及容器宽度解锁等手段彻底修复 |
| Finder 模式点击自动弹窗 | FinderView 引入内部 finderPreviewEntryId 状态，只有显式点击"打开详情"才调用 onOpenGlobalDetail |
| 预览信息被横向裁切 | 移除 max-w-4xl 限制，确保 Finder 模式下预览面板不再被横向裁切 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 通过 |
| `pnpm typecheck` | ✅ 通过 |
| `pnpm build` | ✅ 通过 |

**手工验证步骤说明**:
1. Finder 预览：点击条目，右侧出现内部 preview，摘要过长时有淡出效果，底部按钮始终可见且无裁切
2. 视图切换：在 Finder 中选中条目后切换至 List/Table 模式，全局详情面板保持关闭
3. 全局打开：在 Finder 点击"打开编辑"，全局详情面板在右侧弹出，主内容区同步压缩
4. 无缝布局：打开详情后，主内容区与详情面板紧密相连，中间无空白 Gap
5. 调宽同步：拖动分隔线，主内容区与详情区宽度同步伸缩
6. 信息完整性：Finder Preview 不仅展示关联数，还列出了前 5 个关联条目的标题；摘要展示上限提升至 12 行
7. 布局恢复：关闭详情后，主内容区自动恢复全宽
8. 宽度边界安全性：清空或篡改 localStorage 中的 atlax-global-detail-width 后刷新，详情面板宽度自动回退至 600px 默认值或安全 Min/Max 范围内

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 布局集成后 DetailSlidePanel 不再 fixed 定位 | 低 | 进入 flex 流后行为更稳定 |

---

## 关联文档

| 文档 | 路径 |
|------|------|
| 架构说明书 | `docs/product/ARCHITECTURE.md` |
| 技术规格 | `docs/product/TECH_SPEC.md` |
| Phase 3 Feature & Bugs | `docs/engineering/dev_log/Phase3/pre-phase3-demo_feature_and_bugs.md` |
| 架构调整日志 | `docs/engineering/dev_log/Phase3/pre-phase3-architecture_rebuild.md` |
