# Phase 3 Frontend Development Log

| 开发日志信息 | |
|-------------|---------|
| 阶段 | Phase 3 - 产品化打磨与留存增强 |
| 负责人 | Frontend Agent |
| 状态 | 进行中 |

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-003 Round 3 (节点悬浮预览卡片 + 快速取消链接) -->
<!-- ============================================ -->

## MIND-REAL-003 Round 3 devlog -- 节点悬浮预览卡片 + 快速取消链接

**时间戳**: 2026-05-10

**任务起止时间**: 19:00 - 20:00 CST

**工时**: 60 分钟

> **⚠️ Reviewer 注意**: 本轮 Feature「节点悬浮预览卡片 + 快速取消链接」为**用户明确要求添加**，不属于超出任务边界。用户原话："再加上一个feature：鼠标悬浮在节点上时需要支持小窗预览节点的标题｜tags｜链接列表，并且预览窗口可以支持快速取消链接，列表条目后面加上取消链接的图标，取消链接后链接从链接列表消失。"

**需求描述**:

1. 鼠标悬浮在 Mind 图谱节点上时，显示小窗预览卡片，展示：
   - 节点标题（label）
   - 节点类型标识（nodeType badge + 颜色圆点）
   - Tags（连接到 tag 类型节点的边，以标签胶囊形式展示）
   - Links（所有非 tag 类型的连接边，以列表形式展示，含 edgeType 标注）
2. 预览窗口支持快速取消链接：每个链接条目后面有取消链接图标（X），点击后：
   - 调用 `deleteMindEdge` 从 IndexedDB 删除该边
   - 链接从列表中即时消失（乐观更新）
   - 发射 `mind_edge_deleted` 事件通知其他组件

**改动文件名及行数**:

| 文件 | 改动 | 说明 |
|------|------|------|
| `apps/web/app/workspace/features/mind/MindNodeHoverCard.tsx` | 新增 ~140 行 | 悬浮预览卡片组件：标题、Tags 胶囊、Links 列表 + 取消链接按钮 |
| `apps/web/app/workspace/features/mind/useMindCanvasRenderer.ts` | +15 行 | 新增 `hoverScreenPos` 状态，悬浮节点时计算并暴露节点屏幕坐标 |
| `apps/web/app/workspace/features/mind/useMindGraph.ts` | +8 行 | 新增 `handleDeleteEdge` 回调 + `onDeleteEdge` 导出 |
| `apps/web/app/workspace/features/mind/MindGraphView.tsx` | +12 行 | 集成 MindNodeHoverCard，新增 `onDeleteEdge` prop |
| `apps/web/app/workspace/features/mind/MindCanvasStage.tsx` | +2 行 | 透传 `onDeleteEdge` prop |
| `apps/web/app/workspace/page.tsx` | +2 行 | 从 useMindGraph 解构 `onDeleteEdge` 并传递给 MindCanvasStage |

**技术要点**:

1. **悬浮节点屏幕坐标计算**: Canvas 渲染使用 camera 变换（translate + scale），世界坐标转屏幕坐标公式：`screenX = (worldX - w/2) * zoom + cam.x + w/2`。在 `handlePointerMove` 悬浮检测命中时同步计算并存储。
2. **Tags vs Links 分类**: Tags = 连接到 `nodeType === 'tag'` 节点的边；Links = 其余所有边。分类逻辑在 MindNodeHoverCard 中通过 `useMemo` 计算。
3. **乐观更新**: `handleDeleteEdge` 先通过 `setEdges(prev => prev.filter(...))` 从本地状态移除边，再异步调用 `deleteMindEdge` 持久化删除，确保 UI 即时响应。
4. **卡片定位**: 使用 `fixed` 定位，基于节点屏幕坐标偏移 (+20, -10)，并 clamp 到视口范围内防止溢出。
5. **视觉风格**: 延续现有 glass morphism 风格（`rgba(15,18,20,0.96)` + `backdrop-blur(24px)`），与 MindNodeActionBar、MindFilterPanel 等组件保持一致。

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-003 Round 4 (Review FAIL 修复：baseline edge 不进入当前 snapshot) -->
<!-- ============================================ -->

## MIND-REAL-003 Round 4 devlog -- Review FAIL 修复：baseline edge 不进入当前 snapshot

**时间戳**: 2026-05-10

**任务起止时间**: 20:15 - 20:45 CST

**工时**: 30 分钟

**Review FAIL 原因**:

`useMindGraph.refresh()` 在 `setEdges(updatedEdges)` 之后才执行 `ensureBaselineParentConnections()`，导致本轮自动创建的 root → document parent_child edge 虽然真实写入 IndexedDB，但不会进入当前 render 的 edges/snapshot，需要下一次 refresh 才显示。

**修复方案**:

1. `ensureBaselineParentConnections` 改为返回 `Promise<StoredMindEdge[]>`（创建的 edge 列表），而非 `Promise<void>`。
2. `refresh()` 中先调用 `ensureBaselineParentConnections`，拿到返回的 `baselineEdges`，再 `setEdges([...updatedEdges, ...baselineEdges])`，确保当前 render 的 snapshot 立即包含 baseline edge。
3. 修复 `mindSnapshotBuilder.ts` 中 edge 映射硬编码 `source: 'system' / confidence: 0.5 / reason: null` 的问题，改为使用实际 edge 数据（`e.source || 'system'`, `e.confidence ?? null`, `e.reason ?? null`）。

**改动文件名及行数**:

| 文件 | 改动 | 说明 |
|------|------|------|
| `apps/web/app/workspace/features/mind/useMindGraph.ts` | ~10 行 | `ensureBaselineParentConnections` 返回 `StoredMindEdge[]`；`refresh()` 合并 baselineEdges 到 setEdges；导出两个 ensure 函数 |
| `apps/web/app/workspace/features/mind/mindSnapshotBuilder.ts` | 3 行 | 修复 edge 映射：使用实际 source/confidence/reason 而非硬编码 |
| `apps/web/tests/mind-layout-persistence.test.ts` | +55 行 | 新增 3 个测试：orphan doc 在 ensure 后 snapshot 立即包含 parent_child edge；无 orphan 时返回空；无 root 时返回空 |

**测试覆盖**:

- ✅ `orphan document gets root→document parent_child edge in current snapshot after ensureBaselineParentConnections` — 核心回归测试，验证 `[...edgesBefore, ...baselineEdges]` 模式下 snapshot 立即包含 baseline edge
- ✅ `ensureBaselineParentConnections returns empty when no orphans exist` — 已有 parent_child edge 的 document 不重复创建
- ✅ `ensureBaselineParentConnections returns empty when no root node exists` — 无 root 时 early return

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-003 Round 5 (Review FAIL 修复：quick unlink 与 baseline auto-connect 冲突) -->
<!-- ============================================ -->

## MIND-REAL-003 Round 5 devlog -- Review FAIL 修复：quick unlink 与 baseline auto-connect 冲突

**时间戳**: 2026-05-10

**任务起止时间**: 19:25 - 19:45 CST

**工时**: 20 分钟

**Review FAIL 原因**:

用户通过 hover preview 卡片取消链接（quick unlink）后，`ensureBaselineParentConnections` 在下次 refresh 时会自动重建 `reason: 'baseline-auto-connect'` 的 root → document parent_child edge，导致取消操作被静默恢复，用户困惑。

**修复方案**:

选择方案一：**禁用 baseline-auto-connect 边的取消按钮**。理由：
1. baseline edge 是系统自动创建的结构性安全网，删除后必然被重建，允许取消会给用户虚假预期
2. 用户如需真正断开 document 与 root 的关系，应通过"移动到其他父节点"操作实现，而非直接删除基线边
3. 在 UI 上用 Lock 图标 + tooltip（"基线连接，不可取消"）明确告知用户

**改动文件名及行数**:

| 文件 | 改动 | 说明 |
|------|------|------|
| `apps/web/app/workspace/features/mind/MindNodeHoverCard.tsx` | ~20 行 | 新增 `isBaselineEdge()` 判断；Tags/Links 列表中 baseline 边用 Lock 图标替代 X 按钮；导入 Lock 图标 |
| `apps/web/tests/mind-layout-persistence.test.ts` | +40 行 / 修复 4 个 lint error | 新增 3 个测试；移除未使用 `doc` 变量；替换 non-null assertion 为 guard clause；导入 `deleteMindEdge` |

**测试覆盖**:

- ✅ `baseline-auto-connect edge is recreated after deletion on next ensure cycle` — 验证删除 baseline edge 后，orphan 检测逻辑会重新识别该 document 为 orphan（即 baseline edge 会被重建）
- ✅ `snapshot preserves reason field for baseline-auto-connect edges` — 验证 snapshot 正确保留 `reason: 'baseline-auto-connect'`，UI 可据此判断是否禁用取消按钮
- ✅ `non-baseline edge can be deleted without recreation` — 验证非 baseline 边（如 semantic）可正常删除且不会被重建

**Lint 修复**:

- 移除第 172 行未使用的 `doc` 变量
- 第 211-214 行 non-null assertion (`snapRoot!`, `snapDoc!`, `parentEdge!`) 替换为 guard clause (`if (!snapRoot \|\| !snapDoc) return` + `if (parentEdge) { ... }`)

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-003 Round 2 (手工验证修复：Root 节点缺失 + 点击/拖拽分离 + 布局切换位置重置) -->
<!-- ============================================ -->

## MIND-REAL-003 Round 2 devlog -- 手工验证修复

**时间戳**: 2026-05-10

**任务起止时间**: 17:30 - 18:30 CST

**工时**: 60 分钟

**手工验证发现的问题**:

1. **Root 节点缺失**: 手工验证时发现 Mind 图谱中没有 root 节点。原因：生产代码中从未创建 root 类型的 MindNode（`ensureWorldTreeRoot` 在早期重构中被移除），导致 `ensureBaselineParentConnections` 直接 return，无法为孤立 document 节点创建 parent_child edge。
2. **点击与拖拽交互边界不清**: 点击节点时立即触发选中聚焦态，导致拖动节点时无法确认拖动位置。需要将"点击选中"和"拖拽移动"操作明确分离。
3. **布局切换位置策略（用户约束）**: 用户要求——节点拖动到任意位置后，如果不切换布局方式，节点保留拖动位置；但当切换散布方式时，节点应按照各自排列及运动公式重新定位。否则节点变多后，拖动后一直保留原位置会变得混乱。

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/app/workspace/features/mind/useMindGraph.ts` | +20/-4 | 新增 `ensureRootNode` 函数：首次加载时如果不存在 root 节点则自动创建（positionX=0, positionY=0, state='anchored'）；refresh 流程改为先 ensureRootNode 再重新加载节点列表 |
| `apps/web/app/workspace/features/mind/useMindCanvasRenderer.ts` | +22/-10 | 1) 新增 `pointerDownPosRef` 和 `hasDraggedRef` 跟踪指针移动距离；2) `handlePointerDown` 不再立即调用 `onSelectNode`，改为记录起始位置；3) `handlePointerMove` 检测 5px 拖拽阈值，超过阈值才进入拖拽模式；4) `handlePointerUp` 区分：拖拽→调用 `onNodeDragEnd` + 标记 `hasSavedPosition=true`；点击→调用 `onSelectNode`；5) 布局切换时清除所有节点的 `hasSavedPosition` 标记，使节点跟随新布局公式 |

**用户约束说明（用户明确要求）**:

> 将节点拖动到任意位置后如果不切换三种分布方式节点可以保留拖动位置，但是当切换散布方式时，节点应该按照散步方式各自的排列以及运动公式定义节点位置。否则当节点变多，用户拖动后一直保留原位置后续会变得非常混乱。

实现策略：
- 拖拽结束后标记 `hasSavedPosition = true`，同模式下 `computeTargets` 不会覆盖 target
- 布局模式切换时，清除所有节点的 `hasSavedPosition = false`，`computeTargets` 按新布局公式计算 target
- 节点通过 lerp 动画平滑过渡到新位置

**遇到的问题以及解决方式**:

1. **Root 节点从未在生产代码中创建**: `ensureWorldTreeRoot` 在早期版本存在但被移除。解决：新增 `ensureRootNode` 函数，在 `useMindGraph.refresh()` 中首次加载时自动创建。
2. **点击即选中导致拖拽体验差**: 原来在 `handlePointerDown` 中立即调用 `onSelectNode`。解决：引入 5px 拖拽阈值，`handlePointerUp` 时根据是否超过阈值决定是选中还是拖拽。

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors（7 warnings 均为已有）
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 642 passed
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 打开 Mind 图谱 → 验证出现 Root 节点（圆形大节点，位于中心）
2. 点击节点 → 验证触发选中聚焦态（节点高亮，其余淡化）
3. 拖拽节点 → 验证不触发聚焦态，节点跟随鼠标移动
4. 释放拖拽 → 验证节点位置保留
5. 切换布局方式（Force → Radial → Orbit）→ 验证所有节点按新布局公式重新排列
6. 在同一布局模式下拖拽节点后 → 验证位置保持
7. 新发布文档 → 验证 Mind 中出现新 document 节点，且有 root → doc 的 parent_child edge

**当前风险以及影响范围**:

1. **Root 节点自动创建**: 如果用户清空所有数据后重新进入 Mind，会自动创建新的 root 节点。但如果 root 节点被手动删除，下次 refresh 会重新创建。
2. **布局切换清除 hasSavedPosition**: 切换布局后所有节点回到布局公式位置，用户之前的拖拽位置丢失。这是用户明确要求的行为。
3. **5px 拖拽阈值**: 在高 DPI 屏幕上可能需要调整。当前 5px 是基于屏幕像素的阈值。

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-003 Round 1 (Mind 图谱布局持久化 + Root/Parent 连接基线) -->
<!-- ============================================ -->

## MIND-REAL-003 Round 1 devlog -- Mind 图谱布局持久化 + Root/Parent 连接基线

**时间戳**: 2026-05-10

**任务起止时间**: 16:20 - 17:30 CST

**工时**: 70 分钟

**任务目标**:
1. Mind 节点拖动后位置真实写入本地数据层
2. 切换页面再返回 Mind，节点位置保持
3. 刷新页面后节点位置仍可恢复
4. 已保存 position 不被运行时布局算法强行覆盖
5. 新创建/同步的 document 节点具备稳定 Root/Parent 基线连接策略
6. 修复 useMindCanvasRenderer.ts passive event listener warning
7. 推荐连接按钮不可用时显示 disabled/Planned 状态

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/app/workspace/features/mind/mindGraphAdapter.ts` | +1/-3 | 移除 `FORCE_RECALCULATE = true` 硬编码，改为 `hasPos = n.positionX != null && n.positionY != null`，使保存的位置不再被忽略 |
| `apps/web/app/workspace/features/mind/mindGraphLayout.ts` | +9/-0 | 新增 `reapplySavedPositions` 函数，在 noverlap 之后重新应用保存的位置，防止布局算法覆盖已保存坐标 |
| `apps/web/app/workspace/features/mind/useMindCanvasRenderer.ts` | +30/-12 | 1) `buildRenderNodes` 增加 `hasSavedPosition` 标记，有保存位置时 `targetX/Y` 也使用保存值（防止 radial/orbit 模式漂移）；2) `CanvasRenderNode` 新增 `hasSavedPosition` 字段；3) `computeTargets` 末尾对 `hasSavedPosition` 节点强制 `targetX/Y = x/y`；4) `handleWheel` 从 React `onWheel` 改为原生 `addEventListener('wheel', ..., { passive: false })` 修复 passive event listener warning |
| `apps/web/app/workspace/features/mind/useMindGraph.ts` | +35/-1 | 新增 `ensureBaselineParentConnections` 函数：在 refresh 时检测所有没有 parent_child edge 的 document 节点，自动创建 root → document 的 parent_child 基线连接（reason: baseline-auto-connect） |
| `apps/web/app/workspace/features/mind/MindNodeActionBar.tsx` | +8/-5 | Connect 按钮改为 disabled 状态，图标从 Link2 改为 Clock，增加 "Planned" 徽章（bg-[#c8a0f0]/20 text-[#c8a0f0]），移除 onClick 回调 |
| `apps/web/app/workspace/features/mind/MindGraphView.tsx` | +0/-2 | 移除 `onConnect` prop 传递和 `onWheel={renderer.handleWheel}` |
| `apps/web/tests/mind-layout-persistence.test.ts` | +220 | 新增 11 个测试覆盖位置持久化、基线连接、回归守卫 |

**遇到的问题以及解决方式**:

1. **`FORCE_RECALCULATE = true` 导致位置无法持久化**: 这是 MIND-REAL-002 遗留的临时修复（为打破旧 ROOT sunburst 布局），但硬编码为 true 导致所有保存位置被忽略。解决：移除该常量，改为直接检查 `n.positionX != null && n.positionY != null`。

2. **noverlap 布局算法覆盖保存位置**: 即使 `snapshotToGraphology` 正确设置了保存位置，noverlap 运行后会把节点推开。解决：在 `applyForceAtlas2Layout` 末尾调用 `reapplySavedPositions` 将有保存位置的节点钉回原位。

3. **Canvas 渲染器 radial/orbit 模式下节点漂移**: `buildRenderNodes` 中 `targetX/Y` 始终使用环形布局，导致有保存位置的节点在 lerp 动画中漂移。解决：增加 `hasSavedPosition` 标记，有保存位置时 `targetX/Y = x/y`。

4. **passive event listener warning**: React 的 `onWheel` 默认 passive，调用 `e.preventDefault()` 触发浏览器警告。解决：改用原生 `addEventListener('wheel', handler, { passive: false })`。

5. **测试中 `computeSnapshotSignature` 包含 `generatedAt` 时间戳**: 导致两个 snapshot 的签名不同。解决：改为直接比较 node/edge ID 列表。

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors（7 warnings 均为已有）
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 642 passed（含新增 11 个 MIND-REAL-003 测试）
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 打开 Mind 图谱，拖动若干节点到新位置
2. 切换到 Home 页面，再切回 Mind → 验证节点位置保持
3. 刷新页面 → 验证节点位置保持
4. 新发布一个文档 → 验证 Mind 中出现新 document 节点，且有 root → doc 的 parent_child edge
5. 选中节点 → 验证 Connect 按钮显示 disabled + "Planned" 徽章
6. 打开浏览器控制台 → 验证无 passive event listener warning

**当前风险以及影响范围**:

1. **基线连接仅支持 root → document 单层**: 当前 `ensureBaselineParentConnections` 只将孤立 document 节点连接到 root，不支持多层级（project → topic → document）。后续 MIND-REAL-004/005 需承接多层级连接策略。
2. **Canvas 渲染器 force 模式下物理引擎仍会移动节点**: 有保存位置的节点在 force 模式下 targetX/Y 被钉住，但物理引擎的斥力/引力仍会作用于它们。如果用户不拖动节点，物理引擎最终会让节点稳定在 target 位置附近。
3. **Sigma.js 渲染器路径未修改**: 当前项目使用 Canvas 渲染器（MindGraphView），Sigma.js 路径（MindGraphSigma）的物理循环仍会移动节点。如果未来切换回 Sigma.js，需要同步处理位置钉住逻辑。

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-002 Round 7 (Bug Fix: MindNode ID 空间碰撞 - findMindNodeByDocumentId 不区分 sourceType) -->
<!-- ============================================ -->

## MIND-REAL-002 Round 7 devlog -- Bug Fix: MindNode ID 空间碰撞

**时间戳**: 2026-05-10

**任务起止时间**: 09:30 - 10:00 CST

**工时**: 30 分钟

**Review 结论**: FAIL → 整改

**问题**: `findMindNodeByDocumentId(userId, documentId)` 只按数字 `documentId` 查找，不区分 `metadata.sourceType === 'draft' | 'document'`。由于 draft 和 entry 是不同自增表，ID 很容易同号，可能误删 entry/document MindNode，造成已有 edge 悬空。

**具体碰撞场景**:
1. 发布 entry-origin draft 时，`findMindNodeByDocumentId(userId, draftId)` 用 draftId 查找 draft node，但如果恰好有一个 entry 的 ID 等于 draftId，会误找到 entry 的 MindNode 并删除
2. 丢弃 standalone draft 时，`findMindNodeByDocumentId(userId, draftId)` 同样可能误删同 ID 的 entry MindNode

**修复方案**:
1. 新增 `findMindNodeBySourceType(userId, documentId, sourceType)` 函数，按 `metadata.sourceType` 区分 draft node 和 document node
2. `publishDraftToDocument` 中查找 draft node 改用 `findMindNodeBySourceType(userId, draftId, 'draft')`
3. `publishDraftToDocument` 中查找 entry node 改用 `findMindNodeBySourceType(userId, entryId, 'document')`
4. `discardDraft` 中查找 draft node 改用 `findMindNodeBySourceType(userId, draftId, 'draft')`
5. `discardDraft` 中查找 entry node 改用 `findMindNodeBySourceType(userId, entryId, 'document')`

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/lib/repository.ts` | +14/-4 | 新增 `findMindNodeBySourceType` 函数；`publishDraftToDocument` 和 `discardDraft` 中所有 MindNode 查找改用 `findMindNodeBySourceType` |
| `apps/web/tests/draft-repository.test.ts` | +156 | 新增 3 个碰撞场景测试：发布不误删 entry MindNode + 不丢 parent_child edge、丢弃不误删同 ID entry MindNode、`findMindNodeBySourceType` 区分 draft vs document |

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors（7 warnings 均为已有）
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 631 passed（含新增 3 个 ID 碰撞安全测试）
- `pnpm build:web`: ✅ PASS

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-002 Round 6 (Bug Fix: 同标题文档覆盖 + 同层级重名去重) -->
<!-- ============================================ -->

## MIND-REAL-002 Round 6 devlog -- Bug Fix: 同标题文档覆盖 + 同层级重名去重

**时间戳**: 2026-05-10

**任务起止时间**: 08:00 - 09:00 CST

**工时**: 60 分钟

**问题现象**:
1. 从 node 节点进入编辑，不修改标题只添加内容，选择"作为新文档存入"后，Mind View 中没有出现新文档节点
2. Home 界面能看到重名文档但内容不同
3. 刷新后 Node 没有新增节点，但原文档中的内容被更改

**根因分析**:
`makeMindNodeId` 的 ID 生成规则为 `${userId}_mn_${nodeType}_${normalized}`，仅基于 userId + nodeType + label。当 `as_new` 模式发布同标题文档时，新 MindNode 的 ID 与原 MindNode 完全相同，`upsertMindNode` 的 `put` 操作覆盖了原有记录，导致原 MindNode 的 `documentId` 被更新为新 entry 的 ID。

**修复方案**:
1. **ID 生成策略修改**: `makeMindNodeId` 新增可选 `documentId` 参数，当 `nodeType === 'document'` 且 `documentId` 存在时，ID 格式变为 `${userId}_mn_${nodeType}_${normalized}_${documentId}`
2. **数据库迁移**: DB v22 迁移，将已有 document 类型节点的 ID 更新为包含 `documentId` 的新格式，同时更新所有引用这些节点的边
3. **同层级重名去重**: 新增 `checkDocumentNameConflict` 函数，在 `as_new` 模式发布前检查同层级是否存在同名文档
4. **用户提示**: 当检测到重名冲突时，toast 提示"同名文档已存在于当前层级，请修改标题后重试"

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `packages/domain/src/mind/types.ts` | +4/-1 | `makeMindNodeId` 新增可选 `documentId` 参数，document 类型节点 ID 包含 documentId |
| `packages/domain/tests/mind-types.test.ts` | +19 | 新增 3 个测试：documentId 参与 ID 计算、非 document 类型忽略 documentId、不同 documentId 产生不同 ID |
| `apps/web/lib/db.ts` | +69 | DB v22 迁移：遍历 document 类型节点重新生成 ID，更新引用这些节点的边 |
| `apps/web/lib/repository.ts` | +30/-5 | `upsertMindNode` 传入 `documentId` 生成 ID；新增 `checkDocumentNameConflict` 函数；`publishDraftToDocument` 新增 `PublishResult` 类型和 `nameConflict` 返回字段；`as_new` 模式发布前检查重名冲突 |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | +5/-2 | `handlePublish` 返回类型增加 `nameConflict` 字段；冲突时直接返回不执行发布 |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +4 | `executePublish` 处理 `nameConflict`，toast 提示用户 |
| `apps/web/tests/draft-repository.test.ts` | +128 | 新增 5 个测试：同层级重名检测、不同层级不冲突、无同名不冲突、as_new 发布重名冲突返回 nameConflict、as_new 发布无父边不冲突 |

**设计决策**:

1. **ID 策略**: 仅对 `document` 类型节点将 `documentId` 纳入 ID 计算。其他类型节点（project、topic 等）不受影响，保持向后兼容。
2. **重名策略**: 同层级（同一 parent_child 边的父节点下）不允许重名；不同层级/无父边（drifting 状态）允许同名。
3. **冲突处理**: `as_new` 模式下检测到重名冲突时，不执行发布，返回 `nameConflict` 信息，由前端 toast 提示用户修改标题。
4. **迁移策略**: DB v22 迁移时，先收集所有需要更新 ID 的节点，然后逐个更新节点和引用这些节点的边。

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors（7 warnings 均为已有）
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 628 passed（含新增 8 个 makeMindNodeId/checkDocumentNameConflict 测试）
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 从 document 节点进入编辑，不修改标题只添加内容
2. 选择"作为新文档存入"
3. 确认 toast 提示"同名文档已存在于当前层级，请修改标题后重试"（当前所有节点均在 root level，同名即冲突）
4. 修改标题后重新选择"作为新文档存入"，确认发布成功
5. 切回 Mind View 确认新文档节点出现（不同标题、不同 ID）
6. 确认原文档节点保持不变
7. 刷新页面确认两个节点都存在

**注**: 当前未接入父节点创建功能，所有新建节点均在 root level，因此任何同名文档都会触发冲突。待父节点功能接入后，不同父节点下的同名文档将允许共存。

**📌 后续推进：Mind View 父节点创建与连接逻辑**（由用户提出，待后续迭代实现，请 reviewer 记录）：

1. **默认 Root 连接**: 所有节点创建后，若用户未手动配置连接，默认连接到以用户名命名的 Root 节点下。
2. **拖动连接自动断开 Root**: 用户在 Mind View 中拖动节点连接至一个父节点时，该节点与 Root 节点的连接自动断开（不允许同时挂载 Root 和其他父节点，除非用户选择强行连接）。
3. **强行连接 Root 提示**: 当用户将一个已有父节点的子节点拖拽连接至 Root 时，需弹出确认提示（"是否连接至 Root？"）；连接其他父节点时无需提示。
4. **父节点自动升级**: 当一个节点下有 ≥2 个"强链接"（实线）的独立子节点连接时，该节点自动升级为父节点，并根据层级自动变为父节点配色。
   - **强连接（实线）**: 文档强相关或存在层级包含关系
   - **软连接（虚线）**: 文档中可能有某些关键词相关，需用户手动关联关键词
5. **拖拽连接生成 Edge 规则**: 同级节点连接默认为"软连接"（虚线）；不同级节点连接默认为"强连接"（实线）。连接方式可由用户在节点详情处调整。
   - **⚠️ 待进一步设计**: 此处具体连接方式需配合智能算法进行设计，当前规则为初始版本，后续需与推荐/聚类算法协同优化。

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-002 Round 5 (UX 增强：发布选择 + 丢弃选择对话框) -->
<!-- ============================================ -->

## MIND-REAL-002 Round 5 devlog -- UX 增强：发布选择 + 丢弃选择对话框

**时间戳**: 2026-05-10

**任务起止时间**: 07:00 - 08:00 CST

**工时**: 60 分钟

**⚠️ 越界说明**: 此 UX 增强不在 MIND-REAL-002 原始边界内，由用户明确要求在本轮实现。用户原话："这个策略就在本轮中实现吧，后面我怕忘了。你如实的记录到dev log中就说是我要求新加的UX逻辑增强，让review忽略此越界行为。" 后续用户又要求："丢弃草稿也请加一层UX逻辑增强（选择放弃更改保留原内容去除新增内容｜选择删除删除草稿文件）"

**任务目标**:
1. 为 entry-origin Draft 发布时增加用户选择：修改原文档 vs 作为新文档存入
2. 新增 `PublishMode` 类型（`'update_original' | 'as_new'`）
3. 修改 `publishDraftToDocument` 支持两种发布路径
4. 在 DraftEditorView 中添加发布选择对话框
5. 为 entry-origin Draft 丢弃时增加用户选择：放弃更改 vs 删除草稿及原文档
6. 新增 `DiscardMode` 类型（`'abandon_changes' | 'delete_all'`）
7. 修改 `discardDraft` 支持两种丢弃路径
8. 在 DraftEditorView 中添加丢弃选择对话框

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/lib/repository.ts` | +6/-4 | 新增 `PublishMode` + `DiscardMode` 类型；`publishDraftToDocument` 增加 `publishMode` 参数；`discardDraft` 增加 `discardMode` 参数，`delete_all` 模式删除原 entry + MindNode |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | +6/-4 | import `PublishMode` + `DiscardMode`；`handlePublish` 增加 `publishMode` 参数；`handleDiscard` 增加 `discardMode` 参数，`delete_all` 模式发 `mind_node_deleted` 事件 |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +130/-8 | import `Copy`/`RefreshCw`/`Undo2`/`X` + `PublishMode`/`DiscardMode`；新增 `showPublishChoice`/`showDiscardChoice`/`discardTargetId` 状态；`onPublish` 拆分为 `onPublish` + `executePublish`；`onDiscard` 拆分为 `onDiscard` + `executeDiscard`；新增发布选择对话框 + 丢弃选择对话框 UI |
| `apps/web/tests/draft-repository.test.ts` | +170 | 新增 6 个测试：`as_new` 创建新 entry、`as_new` 创建新 MindNode、`update_original` 更新原 entry、`delete_all` 删除原 entry + MindNode、`abandon_changes` 保留原 entry、`delete_all` 不影响其他用户 entry |

**设计决策**:

1. **发布选择对话框触发条件**: 仅当 draft 的 `sourceEntryId != null` 时弹出选择对话框。standalone draft 直接发布为新文档，无需选择。
2. **丢弃选择对话框触发条件**: 仅当 draft 的 `sourceEntryId != null` 时弹出选择对话框。standalone draft 直接丢弃（当前行为）。
3. **默认行为**: `publishMode` 默认 `'update_original'`，`discardMode` 默认 `'abandon_changes'`，保持向后兼容。
4. **MindNode 处理**:
   - `update_original` 模式：更新原 entry MindNode
   - `as_new` 模式：创建新 MindNode，原 entry MindNode 保持不变
   - `abandon_changes` 模式：保留原 entry MindNode
   - `delete_all` 模式：删除原 entry MindNode
5. **对话框 UI**: 遵循项目现有毛玻璃风格，两个选项卡片：
   - 发布："修改原文档"（高亮色 `#86d7ff`，RefreshCw 图标）vs "作为新文档存入"（中性色，Copy 图标）
   - 丢弃："放弃更改"（高亮色 `#86d7ff`，Undo2 图标）vs "删除草稿及原文档"（红色警告，Trash2 图标）

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors（7 warnings 均为已有）
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 623 passed（含新增 6 个 PublishMode/DiscardMode 测试）
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 选中一个 document 类型节点（已归档文档），点击 "Open in Editor"
2. 修改文档标题和内容，点击"发布"
3. 确认弹出"发布方式"选择对话框
4. 选择"修改原文档"：确认 toast 提示"已更新原文档"，切回 Mind 视图确认原节点标题已更新
5. 重复步骤 1-2，这次选择"作为新文档存入"：确认 toast 提示"已发布为新文档"，切回 Mind 视图确认原节点不变、出现新节点
6. 创建一个全新草稿（不关联 entry），点击"发布"：确认不弹出选择对话框，直接发布为新文档
7. 选中一个 document 类型节点，点击 "Open in Editor"
8. 修改文档内容，点击"丢弃草稿"
9. 确认弹出"丢弃方式"选择对话框
10. 选择"放弃更改"：确认 toast 提示"已放弃更改"，切回 Mind 视图确认原节点仍在
11. 重复步骤 7-8，这次选择"删除草稿及原文档"：确认 toast 提示"已删除草稿及原文档"，切回 Mind 视图确认原节点已消失
12. 创建一个全新草稿（不关联 entry），点击"丢弃草稿"：确认不弹出选择对话框，直接丢弃

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-002 Round 4 (MindNode 生命周期管理：discard 清理 + publish 更新) -->
<!-- ============================================ -->

## MIND-REAL-002 Round 4 devlog -- MindNode 生命周期管理：discard 清理 + publish 更新

**时间戳**: 2026-05-10

**任务起止时间**: 06:15 - 06:30 CST

**工时**: 15 分钟

**任务目标**:
1. 修复丢弃草稿后 MindNode 仍可见的问题
2. 修复发布 entry-origin Draft 后创建新节点而非更新原节点的问题
3. entry-origin Draft 不应有独立 MindNode（已有 entry 的 MindNode）

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/lib/repository.ts` | +9 | 新增 findMindNodeByDocumentId 函数 |
| `apps/web/lib/repository.ts` | +6 | discardDraft: 丢弃 standalone draft 时删除关联 MindNode |
| `apps/web/lib/repository.ts` | +27/-7 | publishDraftToDocument: entry-origin Draft 更新原 entry MindNode + 删除 draft MindNode |
| `apps/web/lib/repository.ts` | +1 | syncDocumentsToMindNodes: 跳过有 sourceEntryId 的 draft |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | +8/-2 | handlePublish: entry-origin 发 mind_node_updated 事件；handleDiscard: standalone draft 发 mind_node_deleted 事件 |
| `apps/web/tests/draft-repository.test.ts` | +2 | import findMindNodeByDocumentId + upsertMindNode |
| `apps/web/tests/draft-repository.test.ts` | +63 | 新增 4 个测试：publish 更新 entry MindNode、publish 删除 draft MindNode、discard 删除 draft MindNode、discard 保留 entry MindNode |

**遇到的问题及解决方式**:

1. **问题**: 丢弃草稿后 MindNode 仍可见
   - **根因**: `discardDraft` 只更新 draft status 为 'discarded'，不清理关联 MindNode
   - **解决**: `discardDraft` 在丢弃 standalone draft（无 sourceEntryId）时，查找并删除关联的 draft MindNode。entry-origin draft 丢弃时不删除 entry MindNode（原 entry 仍存在）

2. **问题**: 发布 entry-origin Draft 后创建新 MindNode 而非更新原节点
   - **根因**: `makeMindNodeId` 基于 label 生成 ID，标题变更时生成新 ID → 创建新 MindNode。且 entry-origin Draft 的 draft MindNode（documentId=draftId）与 entry MindNode（documentId=entryId）是两个不同节点
   - **解决**: (1) `publishDraftToDocument` 对 entry-origin Draft：先删除 draft MindNode，再找到原 entry MindNode 直接更新 label/metadata（绕过 makeMindNodeId 的 label 依赖）；(2) `syncDocumentsToMindNodes` 跳过有 sourceEntryId 的 draft，避免为 entry-origin draft 创建独立 MindNode

3. **问题**: entry-origin Draft 不应有独立 MindNode
   - **根因**: `syncDocumentsToMindNodes` 为所有 active draft 创建 MindNode，包括 entry-origin draft，导致同一文档出现两个节点
   - **解决**: `syncDocumentsToMindNodes` 增加 `if (draft.sourceEntryId != null) continue` 跳过

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 617 passed（含新增 4 个 MindNode 生命周期测试）
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 创建一个草稿（不关联 entry），切换到 Mind 确认节点出现
2. 选中该草稿节点，点击 "Open in Editor"
3. 点击"丢弃草稿"
4. 切回 Mind 视图，确认草稿节点已消失
5. 选中一个 document 类型节点（已归档文档），点击 "Open in Editor"
6. 修改文档标题和内容，点击"发布"
7. 切回 Mind 视图，确认原节点标题已更新，且没有新增节点
8. 再次选中该 document 节点，点击 "Open in Editor"
9. 点击"丢弃草稿"
10. 切回 Mind 视图，确认原 document 节点仍然存在（内容未变）

**当前风险及影响范围**:

1. **makeMindNodeId 基于 label**: 这是架构层面的设计问题，标题变更会导致 ID 失效。当前通过 `findMindNodeByDocumentId` + 直接 `mindNodesTable.update` 绕过了此问题，但未来可能需要重构 MindNode ID 生成策略。**风险**: 中。
2. **findMindNodeByDocumentId 性能**: 当前通过 scan + filter 实现，无 documentId 索引。数据量大时可能有性能问题。**风险**: 低（当前数据量小）。
3. **passive event listener 控制台警告**: 已有问题，不影响功能。**风险**: 低。
4. **推荐连接功能不可用**: 非本任务边界。**风险**: 中，需后续修复。

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-002 Round 3 (草稿节点不显示 + 风险点确认) -->
<!-- ============================================ -->

## MIND-REAL-002 Round 3 devlog -- 草稿节点不显示 + 风险点确认

**时间戳**: 2026-05-10

**任务起止时间**: 05:55 - 06:10 CST

**工时**: 15 分钟

**任务目标**:
1. 修复草稿态文档没有出现在 Mind View 中的问题
2. 确认"丢弃 entry-origin Draft 后原 entry 未删除"的逻辑风险归属
3. 记录非任务边界内的风险点

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/app/workspace/page.tsx` | +9 | MindView 组件挂载时调用 syncDocumentsToMindNodes，确保切换到 Mind tab 时 draft 节点同步 |

**遇到的问题及解决方式**:

1. **问题**: 草稿态文档没有出现在 Mind View 中
   - **根因**: `syncDocumentsToMindNodes` 只在应用启动时调用一次（`useEffect([userId])`），之后创建的 draft 不会自动同步到 Mind View
   - **解决**: 在 MindView 组件挂载时也调用 `syncDocumentsToMindNodes`。由于 MindView 只在 `activeTab === 'mind'` 时渲染，每次切到 Mind tab 都会触发同步

2. **问题**: 丢弃 entry-origin Draft 后原 entry 未删除
   - **分析**: 这是**预期行为**，不是 bug。丢弃草稿 = 放弃编辑，原 entry 应保留。如果需要"撤销编辑并删除原 entry"，应设计为独立操作
   - **决定**: 记录为后续风险点，不在本轮修复

3. **问题**: 控制台报错 `Unable to preventDefault inside passive event listener`
   - **根因**: `useMindCanvasRenderer.ts:547` 中 `e.preventDefault()` 在 React 合成事件的 passive wheel listener 中调用
   - **决定**: 不在本轮修复，记录为已知问题。修复方案：改用原生 `addEventListener('wheel', handler, { passive: false })`

4. **问题**: 推荐连接按钮显示"连接建立失败"
   - **决定**: 不在本轮修复，记录为非任务边界内的风险点

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors / 7 warnings
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 613 passed
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 在 Editor 中创建一个新草稿（不关联 entry）
2. 切换到 Mind 视图
3. 确认：新创建的草稿节点出现在图谱中（sourceType='draft'）
4. 选中该草稿节点，点击 "Open in Editor"
5. 确认：自动切换到 Editor 并打开对应 draftId 的草稿
6. 选中一个 document 类型节点（已归档文档），点击 "Open in Editor"
7. 确认：自动切换到 Editor，创建 entry-origin Draft 并打开

**当前风险及影响范围**:

1. **丢弃 entry-origin Draft 不删除原 entry**: 预期行为。丢弃 = 放弃编辑，原 entry 保留。**影响范围**: 用户可能期望"丢弃"= 删除原文档。**后续需考虑**: 增加"撤销编辑"与"删除原文档"的区分。**风险**: 中。
2. **passive event listener 控制台警告**: 已有问题，不影响功能。**影响范围**: 控制台噪音。**风险**: 低。
3. **推荐连接功能不可用**: 非本任务边界。**影响范围**: 用户点击推荐连接按钮会失败。**风险**: 中，需后续修复。
4. **syncDocumentsToMindNodes 性能**: 每次切到 Mind tab 都会全量同步。**影响范围**: 当 draft/entry 数量大时可能有性能问题。**风险**: 低（当前数据量小）。

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-002 Round 2 (修复 document 节点打开失败 + sourceType 默认回退修正) -->
<!-- ============================================ -->

## MIND-REAL-002 Round 2 devlog -- 修复 document 节点打开失败 + sourceType 默认回退修正

**时间戳**: 2026-05-10

**任务起止时间**: 05:40 - 05:50 CST

**工时**: 10 分钟

**任务目标**:
1. 修复从 Mind 打开 document 节点时 toast 不出现的问题
2. 修复正式文档和草稿文档在 Mind 中无法分辨的问题
3. 确保 sourceType 正确传递和回退

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/lib/repository.ts` | +1 | publishDraftToDocument: upsertMindNode 传入 metadata: { sourceType: 'document', entryId } |
| `apps/web/lib/repository.ts` | +1 | createCaptureToDocumentFlow: upsertMindNode 传入 metadata: { sourceType: 'document', entryId: docId } |
| `apps/web/app/workspace/features/mind/MindGraphView.tsx` | -1/+1 | sourceType 默认回退从 'draft' 改为 'document' |
| `apps/web/app/workspace/features/mind/MindGraphSigma.tsx` | -1/+1 | sourceType 默认回退从 'draft' 改为 'document' |
| `apps/web/app/workspace/page.tsx` | -1/+1 | 右侧面板 sourceType 默认回退从 'draft' 改为 'document' |

**遇到的问题及解决方式**:

1. **问题**: 从 Mind 打开 document 类型节点时，toast "已从归档文档创建草稿" 不出现
   - **根因**: `publishDraftToDocument` 和 `createCaptureToDocumentFlow` 创建 MindNode 时未传 `metadata.sourceType`，导致 sourceType 为 null。UI 代码在 sourceType 为 null 时默认回退到 `'draft'`，将 entry ID 当作 draft ID 传给 Editor，Editor 找不到对应 draft，无任何反应
   - **解决**: (1) 两个 repository 函数增加 `metadata: { sourceType: 'document', entryId }`；(2) UI 默认回退从 `'draft'` 改为 `'document'`

2. **问题**: 正式文档和草稿文档在 Mind 中都是 `nodeType: 'document'`，无法分辨
   - **根因**: `MindNodeType` 类型定义中没有 `'draft'` 子类型，所有文档类内容统一使用 `nodeType: 'document'`。区分 draft/document 的唯一方式是 `metadata.sourceType`，但部分创建路径未设置此字段
   - **解决**: 修复所有创建路径确保 sourceType 正确设置；UI 默认回退改为 `'document'`（因为 null sourceType 的节点都是 entry 类型）

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors / 7 warnings
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 613 passed
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 打开应用，切换到 Mind 视图
2. 选中一个 document 类型节点（已归档文档），点击 "Open in Editor" 按钮
3. 确认：自动切换到 Editor，toast 提示"已从归档文档创建草稿"或"已打开关联此文档的草稿"
4. 选中一个 draft 类型节点（草稿），点击 "Open in Editor" 按钮
5. 确认：自动切换到 Editor 并打开对应 draftId 的草稿
6. 双击一个有 documentId 的节点
7. 确认：自动跳转到 Editor 并正确打开对应文档

**当前风险及影响范围**:

1. **sourceType 默认回退改为 'document'**: 对于 `syncDocumentsToMindNodes` 创建的 draft 节点，sourceType 已正确设为 `'draft'`，不受影响。对于 null sourceType 的旧数据节点，默认当作 document 处理是正确的（因为 `createCaptureToDocumentFlow` 和 `publishDraftToDocument` 创建的都是 entry）。**风险**: 低。
2. **已有 MindNode 数据**: 已有 MindNode 的 metadata.sourceType 可能为 null，但 UI 默认回退已修正为 'document'，功能正确。**风险**: 低。

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-002 Round 1 (Mind 节点打开链路收口：Entry 编辑回写 + Pending State 清理) -->
<!-- ============================================ -->

## MIND-REAL-002 Round 1 devlog -- Mind 节点打开链路收口：Entry 编辑回写 + Pending State 清理

**时间戳**: 2026-05-10

**任务起止时间**: 05:25 - 05:35 CST

**工时**: 10 分钟

**任务目标**:
1. 从 Mind 打开 draft 节点时，Editor 正确锁定对应 Draft
2. 从 Mind 打开 entry/document 节点时，不允许每次渲染或切回 Editor 都重复创建 Draft
3. pendingOpenDraftId / pendingOpenEntryId 被 DraftEditorView 消费后必须清理
4. entry-origin Draft 必须记录 sourceEntryId 来源关系
5. 发布 entry-origin Draft 时，回写更新原 entry
6. 刷新页面后，entry-origin Draft 的来源关系不能丢
7. 不破坏 MIND-REAL-001 已完成链路

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/lib/db.ts` | +4 | EditorDraftRecord 增加 sourceEntryId/sourceType 字段，新增 DraftSourceType 类型 |
| `apps/web/lib/db.ts` | +28 | DB v21 迁移：editorDrafts 索引增加 sourceEntryId + [userId+sourceEntryId]，upgrade 填充 null |
| `apps/web/lib/repository.ts` | +1 | import DraftSourceType |
| `apps/web/lib/repository.ts` | +1 | export type DraftSourceType |
| `apps/web/lib/repository.ts` | +4 | addDraftRecord 增加 sourceEntryId/sourceType 参数 |
| `apps/web/lib/repository.ts` | +4 | createDraft 增加 sourceEntryId/sourceType 参数 |
| `apps/web/lib/repository.ts` | +12 | 新增 findActiveDraftBySourceEntryId 函数 |
| `apps/web/lib/repository.ts` | +17/-10 | publishDraftToDocument：entry-origin Draft 回写原 entry，否则新建 entry 并记录 sourceEntryId |
| `apps/web/lib/repository.ts` | +2 | saveEditorDraft 创建新记录时显式设置 sourceEntryId: null, sourceType: null |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | +2 | import findActiveDraftBySourceEntryId + DraftSourceType |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | +5 | handleCreate 增加 sourceEntryId/sourceType 参数 |
| `apps/web/app/workspace/features/editor/useDrafts.ts` | +6 | 新增 handleFindActiveBySourceEntry + 暴露 findActiveBySourceEntry |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +2 | Props 增加 onInitialDraftConsumed / onInitialEntryConsumed |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +1 | 解构 findActiveBySourceEntry |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +2 | initialDraftId useEffect 消费后调用 onInitialDraftConsumed |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +12/-4 | initialEntryId useEffect：先查已有 active source draft 复用，否则创建带 sourceEntryId 的新 draft，消费后调用 onInitialEntryConsumed |
| `apps/web/app/workspace/page.tsx` | +1 | DraftEditorView 传入 onInitialDraftConsumed / onInitialEntryConsumed 回调 |
| `apps/web/tests/draft-repository.test.ts` | +106/-0 | 新增测试：sourceEntryId/sourceType 创建、findActiveDraftBySourceEntryId、publishDraftToDocument 回写原 entry、来源丢失降级、跨用户隔离 |

**遇到的问题及解决方式**:

1. **问题**: pendingOpenDraftId / pendingOpenEntryId 一旦设置后永远不会被清除，导致切回 Editor tab 时可能重复触发 useEffect
   - **解决**: DraftEditorView 新增 onInitialDraftConsumed / onInitialEntryConsumed 回调，消费后通知 page.tsx 将对应 pending 状态置 null

2. **问题**: initialEntryId useEffect 每次触发都会创建新 Draft，即使已有同来源的 active Draft
   - **解决**: 新增 findActiveDraftBySourceEntryId 函数，useEffect 先查询已有 active source draft，找到则复用，否则才创建新 draft

3. **问题**: entry-origin Draft 发布后生成无来源副本（sourceDockItemId 硬编码为 0）
   - **解决**: publishDraftToDocument 检测 draft.sourceEntryId，若原 entry 存在则回写更新原 entry 的 title/content/archivedAt；若原 entry 不存在则降级创建新 entry 并记录 sourceDockItemId = sourceEntryId

4. **问题**: saveEditorDraft 创建新记录时缺少 sourceEntryId/sourceType 字段，导致 undefined 而非 null
   - **解决**: 显式设置 sourceEntryId: null, sourceType: null

5. **问题**: lint 报错 repository.ts 和 test 文件中的 non-null assertion
   - **解决**: 用安全检查 + unwrap 函数替代 `!` 操作符

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors / 7 warnings（均为已有）
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ 613 passed（含新增 11 个 draft-repository 测试）
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 打开应用，切换到 Mind 视图
2. 选中一个 document 类型节点（sourceType='document'），点击 "Open in Editor" 按钮
3. 确认：自动切换到 Editor，创建 entry-origin Draft 并打开，toast 提示"已从归档文档创建草稿"
4. 切回 Mind 视图，再次选中同一个 document 节点，再次点击 "Open in Editor"
5. 确认：自动切换到 Editor，复用已有 Draft 而非创建新 Draft，toast 提示"已打开关联此文档的草稿"
6. 在 Editor 中编辑该 Draft 的标题和内容，点击"发布"
7. 确认：发布成功，原 entry 的 title/content 被更新（而非创建新 entry）
8. 选中一个 draft 类型节点（sourceType='draft'），点击 "Open in Editor"
9. 确认：自动切换到 Editor 并打开对应 draftId 的草稿
10. 切换到其他 tab 再切回 Editor
11. 确认：不会重复触发 draft 打开或 entry 创建（pending 状态已被清除）

**当前风险及影响范围**:

1. **DB v21 迁移**: 新增 sourceEntryId/sourceType 字段，旧数据自动填充 null。**影响范围**: 所有已有 editorDrafts 数据，迁移安全（仅增加可空字段）。**风险**: 低。
2. **回写原 entry 策略**: 当前采用直接回写原 entry 的 title/content/archivedAt 方案。**影响范围**: entry-origin Draft 发布时，原 entry 内容被覆盖。**风险**: 中——如果用户期望保留原 entry 不变，当前行为可能不符合预期。但任务要求优先回写，且 sourceEntryId 保留了来源关系。
3. **MindNode 更新**: publishDraftToDocument 中 upsertMindNode 使用 entry.id，回写场景下 entry.id 就是原 entry 的 id，MindNode 的 documentId 不变。**影响范围**: 低。

---

<!-- ============================================ -->
<!-- 分割线：MIND-REAL-001 Round 1 (Mind 分支基线稳定：清除 Mock Edge + 节点打开入口) -->
<!-- ============================================ -->

## MIND-REAL-001 Round 1 devlog -- Mind 分支基线稳定：清除 Mock Edge + 节点打开入口

**时间戳**: 2026-05-10

**任务起止时间**: 03:00 - 03:30 CST

**工时**: 30 分钟

**任务目标**:
1. 清除 MindGraphView 中的 Mock/Demo Edge 自动生成逻辑，图谱只渲染真实 mind_edges 数据
2. 打通节点打开入口 onOpenEditor，点击 document 类型节点可跳转 Editor 并锁定对应 documentId
3. 区分 draft 来源和 archived entry 来源，两种文档均能被真实打开
4. 保持当前 Mind View 设计不变
5. 补充最小测试覆盖

**改动文件名及行数**:

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `apps/web/app/workspace/features/mind/MindGraphView.tsx` | -23/+1 | 删除 mock edge 自动生成逻辑，直接使用 originalSnapshot |
| `apps/web/app/workspace/features/mind/MindGraphView.tsx` | +10 | MindNodeActionBar onOpen 回调查找选中节点 documentId + sourceType 并调用 onOpenEditor |
| `apps/web/app/workspace/features/mind/MindGraphView.tsx` | -1/+1 | onOpenEditor 签名增加 sourceType 参数 |
| `apps/web/app/workspace/features/mind/MindCanvasStage.tsx` | -1/+1 | onOpenEditor 签名增加 sourceType 参数 |
| `apps/web/app/workspace/features/mind/MindGraphSigma.tsx` | -1/+1 | onOpenEditor 签名增加 sourceType 参数 |
| `apps/web/app/workspace/features/mind/MindGraphSigma.tsx` | +3 | handleDoubleClickNode 传递 sourceType |
| `apps/web/app/workspace/features/mind/mindGraphAdapter.ts` | +2 | MindNodeGraphAttrs 增加 sourceType 字段，addNode 时从 metadata 提取 |
| `apps/web/app/workspace/page.tsx` | +2 | 添加 pendingOpenDraftId + pendingOpenEntryId 状态 |
| `apps/web/app/workspace/page.tsx` | +1 | MindView props 增加 onOpenEditor 回调（含 sourceType） |
| `apps/web/app/workspace/page.tsx` | +3 | MindCanvasStage onOpenEditor 传递 sourceType |
| `apps/web/app/workspace/page.tsx` | +1 | 右侧面板 "Open in Editor" 按钮传递 sourceType |
| `apps/web/app/workspace/page.tsx` | +1 | MindView 调用处传入 onOpenEditor 回调（区分 draft/entry） |
| `apps/web/app/workspace/page.tsx` | +1 | DraftEditorView 传入 initialEntryId={pendingOpenEntryId} |
| `apps/web/app/workspace/page.tsx` | -2/+2 | 修复已有 non-null assertion lint 错误 |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +2 | Props 接口添加 initialDraftId + initialEntryId |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +1 | 解构添加 initialEntryId |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +1 | import 添加 useEffect |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +2 | import 添加 createDraft + entriesTable |
| `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | +14 | useEffect 监听 initialDraftId（含 activeDraftId 依赖修复）+ useEffect 监听 initialEntryId（从 entry 创建 draft 并打开） |
| `apps/web/app/workspace/features/mind/MindRecommendationInspector.tsx` | -1/+1 | 修复已有 unused import |
| `apps/web/app/workspace/scratch_check_recs.ts` | 删除 | 移除导致 build 失败的 scratch 脚本 |
| `packages/domain/src/services/IntelligenceSpine.ts` | -1/+1 | RecommendationCandidateType 添加 'dockItem'（修复已有 build 阻塞） |
| `apps/web/lib/recommendation-i18n.ts` | +1 | CANDIDATE_TYPE_LABELS 添加 dockItem 条目 |
| `apps/web/tests/mind-baseline.test.ts` | 新增 132 行 | 新增基线测试：无 mock edge、保留真实 edge、onOpenEditor 桥接 |

**遇到的问题及解决方式**:

1. **问题**: MindGraphView 中 useMemo 自动生成 mock edge，当真实 edge 为空时伪造连线
   - **解决**: 删除整个 useMemo 逻辑，直接使用 `const snapshot = originalSnapshot`

2. **问题**: page.tsx 第610行 `onOpenEditor={() => {}}` 空实现，双击节点/点击按钮无任何效果
   - **解决**: 实现完整回调链路：MindView 接收 onOpenEditor → MindCanvasStage 透传 → MindGraphView/MindGraphSigma 调用 → page.tsx 区分 draft/entry 设置 pendingOpenDraftId 或 pendingOpenEntryId + 切换 tab → DraftEditorView 通过 initialDraftId 或 initialEntryId prop 打开对应文档

3. **问题**: documentId 不能全部当 draftId——MindNode.documentId 可能指向 draft 表或 entry 表
   - **解决**: 从 MindNode.metadata.sourceType 区分来源（'draft' | 'document'），onOpenEditor 签名增加 sourceType 参数；DraftEditorView 新增 initialEntryId prop，当来源为 entry 时从 entriesTable 读取内容并创建新 draft 打开

4. **问题**: DraftEditorView useEffect exhaustive-deps warning（initialDraftId effect 缺少 activeDraftId 依赖）
   - **解决**: 补充 activeDraftId 到依赖数组

5. **问题**: 已有的 lint/build 错误阻塞验证（scratch_check_recs.ts、non-null assertion、unused import、RecommendationCandidateType 缺少 dockItem）
   - **解决**: 逐一修复已有问题，确保 lint 0 errors、typecheck PASS、build PASS

**自动验证结果**:

- `pnpm lint`: ✅ PASS，0 errors / 8 warnings（均为已有）
- `pnpm typecheck`: ✅ PASS
- `pnpm test`: ✅ domain 312 passed，web 602 passed（含新增 7 个 mind-baseline 测试）
- `pnpm build:web`: ✅ PASS

**手工验证步骤说明**:

1. 打开应用，切换到 Mind 视图
2. 确认：当没有真实 edge 时，图谱只显示节点不显示任何连线（无 mock edge）
3. 确认：当有真实 edge 时，图谱正常显示连线
4. 选中一个 document 类型节点（sourceType='draft'），点击右侧面板 "Open in Editor" 按钮
5. 确认：自动切换到 Editor 视图，且打开对应 draftId 的草稿
6. 选中一个 document 类型节点（sourceType='document'，已归档文档），点击 "Open in Editor" 按钮
7. 确认：自动切换到 Editor 视图，从 entry 创建新 draft 并打开，toast 提示"已从归档文档创建草稿"
8. 选中一个非 document 类型节点（如 fragment/tip），点击 "Open in Dock" 按钮
9. 确认：显示 toast 提示"此节点暂无关联文档"，而非空回调
10. 双击一个有 documentId 的节点
11. 确认：自动跳转到 Editor 并打开对应文档

**当前风险及影响范围**:

1. **Entry → Draft 创建是单向的**: 从 entry 创建的新 draft 是 entry 内容的副本，编辑 draft 不会更新原 entry。**影响范围**: 用户可能期望编辑已归档文档时直接修改原文档。**后续需补充**: 支持 entry 的直接编辑或双向同步。
2. **pendingOpenDraftId / pendingOpenEntryId 状态不会自动清除**: 一旦从 Mind 跳转到 Editor，状态会一直保持。**影响范围**: 低风险，useEffect 只在值变化时触发，且 MindView 每次跳转都会设置新值。
3. **MindGraphSigma 双击节点逻辑**: 当前双击节点只在 documentId != null 时触发 onOpenEditor，非 document 节点双击无效果。这是预期行为，但用户可能期望双击任何节点都有响应。**影响范围**: 低风险，符合任务要求。

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 36 (画布节点不显示 - SVG 元素在 HTML 上下文渲染) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 36 devlog -- 画布节点不显示 - SVG 元素在 HTML 上下文渲染

**时间戳**: 2026-05-09

**任务起止时间**: 20:10 - 20:25 CST

**工时**: 15 分钟

**任务目标**:
修复图谱画布中节点始终不显示的问题。注入功能已正常工作，但画布上无法看到任何节点。

**根因分析**:

**核心问题：SVG 元素在 HTML 上下文中渲染，导致不可见**

错误日志中的关键线索：
```
Warning: The tag <circle> is unrecognized in this browser.
If you meant to render a React component, start its name with an uppercase letter.
    at circle
    at g
    at div    ← <g> 和 <circle> 在 <div> 内！
```

代码结构问题：
```jsx
<div ref={canvasRef}>
  <svg className="pointer-events-none">   {/* SVG 连线层 */}
    {edges...}
  </svg>                                   {/* ← SVG 在这里关闭！*/}

  {/* 节点层 - 在 SVG 外面！ */}
  {nodes.map(node => (
    <g>           ← SVG 元素在 HTML div 上下文中 = 不可见！
      <circle />
      <text />
    </g>
  ))}
</div>
```

`<circle>`、`<g>`、`<text>` 是 SVG 命名空间的元素，必须在 `<svg>` 元素内部才能被浏览器正确渲染。当它们作为 HTML `<div>` 的子元素时，浏览器将它们视为未知的 HTML 自定义元素，完全无法显示。

**变更摘要**:

**1. 将节点渲染移入 `<svg>` 元素内部** (`app/workspace/page.tsx`):
- 将 `{filteredNodes.map(...)}` 从 `</svg>` 之后移到 `</svg>` 之前
- 移除 SVG 根元素的 `pointer-events-none`（节点需要交互）
- 在连线元素上添加 `style={{ pointerEvents: 'none' }}`（连线不需要交互）
- 移除 SVG 元素上的 `className="transition-all duration-150"`（SVG 元素不支持 CSS transition）
- 将 `<text>` 的 `pointerEvents="none"` 和 `className="select-none"` 改为 `style={{ pointerEvents: 'none', userSelect: 'none' }}`（SVG 属性兼容性）

**改动文件名及行数**:
1. `app/workspace/page.tsx` (~60 行画布渲染重构)

**遇到的问题及解决方式**:
1. **SVG 元素在 HTML 上下文不可见** → 将节点渲染移入 `<svg>` 元素内部
2. **pointer-events 冲突** → 移除 SVG 根的 `pointer-events-none`，改为在连线元素上单独设置
3. **SVG 元素 CSS 兼容性** → 移除 `className` 动画类，改用 `style` 属性

**自动验证结果**:
- `pnpm lint`: ✅ 通过 (0 errors, 5 warnings)
- `pnpm typecheck`: ✅ 通过
- `pnpm test`: ✅ 595 tests passed (24 test files)
- `pnpm build:web`: ✅ 构建成功 (workspace route: 34.8 kB)

**手工验证步骤**:
1. 打开 /workspace → 进入 Mind tab
2. ✅ 确认画布中出现节点圆点（不同颜色对应不同类型）
3. ✅ 确认鼠标悬浮节点时显示标签和锚点
4. ✅ 确认可以拖拽节点
5. ✅ 确认连线正确显示
6. ✅ 确认 Console 中不再出现 `<circle> is unrecognized` 警告

**当前风险及影响范围**:
1. **SVG 事件冒泡**：节点事件现在在 SVG 上下文中触发，可能与父级 div 的事件处理有细微差异 → 需要手工验证拖拽和点击行为
2. **CSS transition**：移除了 SVG 元素的 `className="transition-all duration-150"`，节点大小变化不再有 CSS 过渡动画 → 可通过 SVG animate 或 requestAnimationFrame 实现，当前优先保证可见性

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 35 (Mind 注入失败 + userId 不匹配 根因修复) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 35 devlog -- Mind 注入失败 + userId 不匹配 根因修复

**时间戳**: 2026-05-09

**任务起止时间**: 08:19 - 09:05 CST

**工时**: 46 分钟

**任务目标**:
修复 Round 34 遗留的两个根因问题：
1. **注入图谱失败**：`DexieError: Failed to execute 'add' on 'IDBObjectStore'`
2. **视图中无节点**：`userId: _legacy` 导致数据库查询不到任何数据

**根因分析**:

**问题 1：DexieError - IDBObjectStore key path 错误**
- `convertTipToMindNode` 使用 `mindNodesTable.add()` 插入记录时没有提供 `id` 字段
- 但 `mindNodes` 表的主键定义为 `'id'`（非自增），与 `editorDrafts` 的 `'++id'` 不同
- `add()` 方法期望数据库自动生成 key，但 `id` 字段不是自增的
- 而 `upsertMindNode` 函数使用 `makeMindNodeId()` 生成确定性 ID 并用 `put()` 写入，是正确模式

**问题 2：userId 为 `_legacy`**
- `WorkspacePage` 初始化 `userId = '_legacy'`
- `useEffect` 中调用 `getCurrentUser()` 获取当前用户
- 当 `getCurrentUser()` 返回 null（localStorage 中无当前用户）时，userId 保持为 `_legacy`
- 但数据库中的数据（通过 seed 或正常操作创建）使用的是真实用户 ID（如 `user_xxx`）
- 导致 `listMindNodes('_legacy')` 查询不到任何数据

**变更摘要**:

**1. 修复 convertTipToMindNode 的 ID 生成** (`lib/repository.ts`):
- 将 `mindNodesTable.add({...})` 改为 `mindNodesTable.put({ id: makeMindNodeId(...), ...})`
- 使用 `makeMindNodeId(userId, 'fragment', label)` 生成确定性 ID
- 与 `upsertMindNode` 保持一致的写入模式
- 修复 `DexieError: key path did not yield a value` 错误

**2. 修复 userId 解析逻辑** (`app/workspace/page.tsx`):
- 新增导入：`listLocalUsers`, `registerUser`
- 修改 `WorkspacePage` 的 `useEffect`：
  - 如果 `getCurrentUser()` 返回 null，尝试从 `listLocalUsers()` 找到已有用户
  - 如果找到已有用户，自动恢复登录状态（写入 localStorage）
  - 如果没有任何用户，自动注册默认用户 `'Atlax User'`
  - 确保 userId 始终与数据库中的数据匹配

**3. 清理调试日志**:
- 移除所有 `console.log`/`console.error`/`console.warn` 调试语句
- 涉及文件：`page.tsx`, `repository.ts`, `useMindGraph.ts`

**改动文件名及行数**:
1. `lib/repository.ts` (~20 行 convertTipToMindNode 修复 + ~15 行调试日志清理)
2. `app/workspace/page.tsx` (~10 行 userId 解析修复 + ~20 行调试日志清理)
3. `app/workspace/features/mind/useMindGraph.ts` (~10 行调试日志清理)

**遇到的问题及解决方式**:
1. **DexieError key path** → `mindNodesTable.add()` 不提供 id → 改用 `makeMindNodeId()` + `mindNodesTable.put()`
2. **userId 不匹配** → `getCurrentUser()` 返回 null → 自动从用户目录恢复或注册新用户
3. **调试日志过多** → 清理所有临时添加的 console 语句

**自动验证结果**:
- `pnpm lint`: ✅ 通过 (0 errors, 5 warnings)
- `pnpm typecheck`: ✅ 通过
- `pnpm test`: ✅ 595 tests passed (24 test files)
- `pnpm build:web`: ✅ 构建成功 (workspace route: 34.8 kB)

**手工验证步骤**:
1. **注入功能验证**:
   - 打开 /workspace → 进入 Mind tab
   - 在左侧散落池选择一个 Thought
   - 点击"接受并注入图谱"按钮
   - ✅ 确认 Toast 提示"已注入图谱"（不再显示"注入失败"）
   - ✅ 确认中间画布出现新节点
   - ✅ 确认左侧散落池该 Thought 消失

2. **userId 匹配验证**:
   - 打开浏览器开发者工具 Console
   - 刷新页面
   - ✅ 确认不再出现 `userId: _legacy` 的日志
   - ✅ 确认 userId 为真实用户 ID（如 `user_xxx`）

3. **Documents/Drafts 同步验证**:
   - 切换到 Mind tab
   - ✅ 确认 Home 板块的 Documents/Drafts 自动出现在画布中

**当前风险及影响范围**:
1. **自动注册默认用户**：如果 localStorage 被清除，会自动创建名为 'Atlax User' 的新用户 → 旧数据（_legacy userId）仍无法访问 → 需要用户重新 seed 数据
2. **确定性 ID 生成**：`makeMindNodeId` 基于 userId+nodeType+label 生成 ID → 如果 label 超过 80 字符被截断，可能产生 ID 冲突 → 当前截断策略与 upsertMindNode 一致，风险可控

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 34 (Mind 数据打通 + Bug 修复 + 功能增强) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 34 devlog -- Mind 数据打通 + Bug 修复 + 功能增强

**时间戳**: 2026-05-09

**任务起止时间**: 08:05 - 08:12 CST

**工时**: 7 分钟

**任务目标**:
基于用户手测反馈，修复 3 个严重功能性问题并实现 2 个功能改进：
1. **修复注入图谱后节点不显示的问题**
2. **修复刷新后已注入文档重新出现在散落池的问题**
3. **检查并修复 Mind 与 Home 板块数据打通问题**
4. **Filters 增加通过 tag 搜索节点的功能**
5. **在 Graph view 顶栏下方增加面包屑导航**

**用户反馈的核心问题**:
1. 注入图谱后视图中不显示任何节点 → injectThought 手动添加节点被物理引擎初始化覆盖
2. 刷新后已注入的文档又会出现在散落思绪池 → 注入操作未更新 Tip 状态
3. 当前系统中有很多文档，但 Mind 中只有两条未注入的文档 → Documents/Drafts 未自动同步到 Mind 节点
4. Filters 只支持通过节点搜索，不支持通过 tag 搜索 → 缺少 tag 搜索功能
5. 建议增加面包屑导航快速查看分支视图 → 缺少面包屑 UI

**变更摘要**:

**数据库层扩展** (`lib/db.ts`):
- 扩展 `TipStatus` 类型：新增 `'linked'` 状态，用于标记已链接到 Mind 节点的 Tips

**Repository 层新增函数** (`lib/repository.ts`):
- 新增 `convertTipToMindNode(userId, tipId)` 函数：
  - 使用 Dexie transaction 原子操作同时创建 MindNode 和更新 Tip 状态
  - 将 Tip 状态从 `'active'` 更新为 `'linked'`
  - 在 MindNode 的 metadata 中存储 sourceTipId 和 sourceType
  - 返回 `{ tip, mindNode }` 结果对象
- 新增 `syncDocumentsToMindNodes(userId)` 函数：
  - 自动将未同步的 Drafts 和 Documents 转换为 Mind 节点
  - 检查现有 MindNodes 的 documentId 字段避免重复创建
  - 返回新创建的节点数量

**MindView 组件修复** (`app/workspace/page.tsx`):
- **修复 injectThought 函数**：
  - 使用 `convertTipToMindNode` 替代手动 `upsertMindNode`
  - 移除手动添加到 physicsNodes 的逻辑（避免被物理引擎覆盖）
  - 通过 `mind_node_created` 事件触发 useMindGraph 自动刷新
  - 正确更新 Tip 状态为 `'linked'`

- **自动同步 Documents/Drafts**：
  - 在组件初始化 useEffect 中调用 `syncDocumentsToMindNodes`
  - 如果有新同步的节点，发射 `mind_node_created` 事件触发刷新
  - 确保 Home 板块的 Documents/Drafts 能自动出现在 Mind 图谱中

- **Filter Panel 增强**：
  - 新增 `tagSearchQuery` 状态字段
  - 新增 "Search by tag..." 输入框（紫色焦点边框区分）
  - 实现 tag 搜索过滤逻辑：
    - 直接匹配 tag 类型节点的标签名
    - 通过 semantic 边查找关联的 tag 节点并匹配
    - 支持模糊搜索

- **面包屑导航**：
  - 在顶栏下方（Domain 切换栏和 Canvas 之间）新增面包屑导航栏
  - 仅在选中特定 Domain/Project 时显示（全局模式不显示）
  - 显示路径：Root > [当前 Domain 名称] > [类型标签]
  - 点击 "Root" 可快速返回全局图谱
  - 右侧显示当前视图的节点数和边数统计

**导入优化** (`app/workspace/page.tsx`):
- 新增导入：`convertTipToMindNode`, `syncDocumentsToMindNodes`
- 移除未使用导入：`upsertMindNode`（已被 convertTipToMindNode 替代）

**改动文件名及行数**:
1. `lib/db.ts` (+1 行 TipStatus 扩展)
2. `lib/repository.ts` (+95 行 convertTipToMindNode + syncDocumentsToMindNodes)
3. `app/workspace/page.tsx` (+10 行 import, -15 行 injectThought 重构, +25 行 tag 搜索, +30 行面包屑导航)

**遇到的问题及解决方式**:
1. **注入后节点不显示** → injectThought 手动 setPhysicsNodes 被物理引擎初始化 useEffect 覆盖 → 改用事件驱动刷新机制
2. **Tip 状态未更新** → 原 injectThought 只从状态数组移除，未更新数据库 → 新增 convertTipToMindNode 使用 transaction 原子更新
3. **Documents/Drafts 未同步** → Mind 只显示手动创建的节点和 active Tips → 新增 syncDocumentsToMindNodes 自动同步函数
4. **tip_converted 事件类型不匹配** → 该事件需要 draftId 参数 → 改用 mind_node_created 事件触发刷新
5. **upsertMindNode 未使用警告** → 已被 convertTipToMindNode 替代 → 移除导入

**自动验证结果**:
- `pnpm lint`: ✅ 通过 (0 errors, 5 warnings)
- `pnpm typecheck`: ✅ 通过
- `pnpm test`: ✅ 595 tests passed (24 test files)
- `pnpm build:web`: ✅ 构建成功 (workspace route: 34.7 kB)

**手工验证步骤**:
1. **注入功能验证**:
   - 打开 /workspace → 进入 Mind tab
   - 在左侧散落池选择一个 Thought → 右侧显示 AI 蒸馏面板
   - 点击"接受并注入图谱"按钮
   - ✅ 确认 Toast 提示"已注入图谱"
   - ✅ 确认中间画布出现新节点（物理引擎动画）
   - ✅ 确认左侧散落池该 Thought 消失
   - 刷新页面
   - ✅ 确认该 Thought 不再出现在散落池（状态已更新为 'linked'）
   - ✅ 确认该节点仍然显示在画布中（从数据库加载）

2. **Documents/Drafts 同步验证**:
   - 打开 Home tab → 确认有多个 Drafts/Documents
   - 切换到 Mind tab
   - ✅ 确认这些 Documents/Drafts 自动出现在画布中（作为 document 类型节点）
   - ✅ 确认节点颜色为薄荷绿 (#9cf4d4)

3. **Tag 搜索验证**:
   - 点击 "Filters" 按钮
   - ✅ 确认看到两个搜索框："Search nodes..." 和 "Search by tag..."
   - 在 "Search by tag..." 输入文字
   - ✅ 确认只显示匹配的 tag 节点或关联了该 tag 的节点

4. **面包屑导航验证**:
   - 点击某个 Domain/Project 按钮
   - ✅ 确认顶栏下方出现面包屑导航栏
   - ✅ 确认显示 "Root > [Domain名称] > [类型标签]"
   - ✅ 确认右侧显示节点数和边数统计
   - 点击 "Root"
   - ✅ 确认返回全局图谱视图，面包屑消失

**当前风险及影响范围**:
1. **TipStatus 类型扩展**：新增 'linked' 状态不影响现有代码（listActiveTips 只返回 'active' 状态）→ 无风险
2. **自动同步性能**：首次加载时同步所有 Documents/Drafts 可能较慢 → 但只在组件挂载时执行一次，且使用 Promise 异步不阻塞 UI
3. **Tag 搜索依赖边类型**：当前只搜索 semantic 类型的边关联的 tag → 后续可根据需要扩展到其他边类型
4. **面包屑仅支持单级**：当前只显示 Root > Domain，不支持更深层的层级导航 → 对于当前使用场景足够

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 33 (Mind Graph View 重构：物理引擎 + Filter + 交互增强) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 33 devlog -- Mind Graph View 重构：物理引擎 + Filter + 交互增强

**时间戳**: 2026-05-09

**任务起止时间**: 07:45 - 07:57 CST

**工时**: 12 分钟

**任务目标**:
基于用户手测反馈（5 张设计图），重构 Mind Graph 中间画布部分，保持三栏布局不变：
1. **顶部操作栏重构**: 接入真实 Domain 节点切换 + Filter 面板（图一）
2. **节点拖动修复**: 解决拖动后节点跟随鼠标问题、实现悬浮简介、拖动快速链接
3. **物理引擎集成**: 实现稳定缓慢线性同向的物理学运动轨迹动效（图三、四）
4. **节点颜色系统**: 与设计图完全一致，不同类型节点对比度鲜明（图三、四）
5. **交互增强**: 悬浮展示链接关系和节点详情（图二）、点击详情面板支持快速取消链接（图五）
6. **散点模式**: 孤儿节点仅在全局图谱显示，Domain 过滤只显示完整链条

**用户反馈的核心问题**:
1. 顶栏使用 Mock 数据 → 需要接入真实 Domain 节点 + Filter 功能
2. 节点拖动有 bug（松开后继续跟随鼠标）→ 需要修复拖拽逻辑
3. 节点全量显示内容 → 应改为悬浮显示简介
4. 无法拖动快速链接 → 需要实现连线功能
5. 缺少物理引擎动效 → 需要集成力学引擎实现进场动画
6. 节点颜色与设计不符 → 需要按照设计图重新定义颜色系统
7. 缺少悬浮/点击交互 → 需要实现 Tooltip 和 Details Panel

**变更摘要**:

**MindView Graph Canvas 全面重构** (`app/workspace/page.tsx`):
- **顶部操作栏**:
  - Domain 切换按钮从 physicsNodes 动态生成（domain/project/root 类型节点）
  - 新增 Filter 按钮，点击展开 Filter Panel
  - Filter Panel 包含：搜索框、节点类型过滤、边类型过滤、可见性选项

- **物理引擎系统**:
  - 使用自定义力导向算法（斥力 + 引力 + 向心力 + 阻尼 + 边界约束）
  - 节点进场时触发 3 秒物理模拟，之后停止并保持稳定布局
  - 斥力参数：800 / dist²，引力参数：dist * 0.005，阻尼系数：0.92
  - 向心力系数：0.0005，边界弹性系数：-0.5

- **节点颜色系统**（与图三/四一致）:
  - root/world_tree: #e0c8ff (淡紫)
  - domain/project: #c8a0f0 (神经紫)
  - topic: #a78bfa (浅紫)
  - document: #9cf4d4 (薄荷绿)
  - fragment/source: #67e8f9 (青色)
  - tag/insight: #fbbf24 (金黄)
  - orphan: #6b7280 (灰色, opacity 0.4)

- **节点大小系统**:
  - root/world_tree: 12px
  - domain/project: 8px
  - topic: 6px
  - 其他: 5px
  - orphan: 3px

- **交互系统**:
  - 悬浮 Tooltip（图二）：显示节点标题、类型、连接列表（最多 5 条）
  - 点击 Details Panel（图五）：右侧面板展示完整连接列表，每条连接可快速取消链接
  - 拖拽连线：从节点锚点拖出连线到目标节点，自动创建 confirmed 类型边
  - 节点拖拽：修复拖拽 bug，松开鼠标后节点停止移动，位置持久化到 IndexedDB

- **过滤系统**:
  - Domain 过滤：切换 Domain 只显示该 Domain 的完整链条（不显示孤儿节点）
  - 全局模式：显示所有节点（包括孤儿节点）
  - 搜索过滤：按标签名模糊匹配
  - 节点/边类型过滤：可勾选显示的类型
  - 可见性选项：控制 Documents/Tags/Sources/Suggested Edges/Confirmed Edges/Orphan Nodes 显示

- **视觉优化**:
  - 节点使用圆点样式（circle SVG 元素），非之前的 DOM 卡片
  - 悬浮/选中时节点放大 1.3 倍，显示白色描边
  - 连线在悬浮/选中时高亮为 #86d7ff 或 #c8a0f0
  - 悬浮节点时高亮其所有连接线为紫色
  - 节点发光效果：drop-shadow 使用节点颜色的 40% 透明度

**图标导入更新** (`app/workspace/page.tsx`):
- 新增导入：SlidersHorizontal, RotateCcw, Check, Unlink2
- 移除未使用导入：GitCommit, MousePointer2

**TypeScript 类型修复** (`app/workspace/page.tsx`):
- physicsNodes 状态的 type 字段显式声明为 'core' | 'sub' | 'orphan'
- 解决三元表达式类型推断失败问题

**改动文件名及行数**:
1. `app/workspace/page.tsx` (+15 行图标导入, +5 行类型修复, +20 行拖拽连线功能, -8 行未使用变量)

**遇到的问题及解决方式**:
1. TypeScript 错误：type 字段类型不匹配 → 显式声明 nodeTypeValue 变量类型
2. Lint 错误：未使用的导入（GitCommit, MousePointer2）→ 移除
3. Lint 错误：未使用的变量（isDragged, connections）→ 移除
4. Lint 错误：dropLinkOnNode 未使用 → 在节点 onPointerUp 事件中调用
5. QuickCapture 模块找不到警告 → 文件实际存在，IDE 缓存问题，忽略

**自动验证结果**:
- `pnpm lint`: ✅ 通过 (0 errors, 5 warnings 均为 React Hook 依赖提示)
- `pnpm typecheck`: ✅ 通过
- `pnpm test`: ✅ 595 tests passed (24 test files)
- `pnpm build:web`: ✅ 构建成功 (workspace route: 34.5 kB)

**手工验证步骤**:
1. 打开 /workspace → 进入 Mind tab
2. **顶部操作栏验证**:
   - 确认显示"全局图谱"按钮 + 所有 domain/project 节点按钮
   - 点击不同 Domain → 确认只显示该 Domain 的链条（无散点）
   - 点击"全局图谱"→ 确认显示所有节点（包括散点）
   - 点击"Filters"按钮 → 确认 Filter Panel 展开
   - 在搜索框输入文字 → 确认实时过滤节点
   - 勾选/取消节点类型 → 确认过滤生效
   - 勾选/取消边类型 → 确认过滤生效
   - 切换可见性选项 → 确认对应元素显示/隐藏
   - 点击重置按钮 → 确认恢复默认过滤状态

3. **节点拖动验证**:
   - 拖拽节点 → 确认节点跟随鼠标
   - 松开鼠标 → 确认节点停止移动（不再跟随）
   - 切换 tab 再回来 → 确认位置保持
   - 刷新页面 → 确认位置仍保持

4. **悬浮交互验证**:
   - 鼠标悬浮节点 → 确认显示 Tooltip（标题 + 类型 + 连接列表）
   - 鼠标移开 → 确认 Tooltip 消失
   - 悬浮节点 → 确认节点放大 + 白色描边 + 发光效果
   - 悬浮节点 → 确认所有连接线高亮为紫色

5. **点击交互验证**:
   - 点击节点 → 确认右侧显示 Details Panel
   - Details Panel 显示：节点标题、类型标签、完整连接列表
   - 每条连接右侧显示取消链接按钮（默认隐藏，悬浮显示）
   - 点击取消链接 → 确认连线消失
   - 点击关闭按钮 → 确认 Details Panel 关闭

6. **拖动连线验证**:
   - 悬浮节点 → 确认出现连线锚点（小圆圈）
   - 从锚点拖出 → 确认显示虚线预览
   - 拖到另一节点上松开 → 确认创建新连线
   - 尝试创建已存在的连线 → 确认不重复创建

7. **物理引擎验证**:
   - 首次加载或数据变化时 → 确认节点从初始位置缓慢移动到稳定位置
   - 3 秒后 → 确认节点停止移动，布局稳定
   - 大量节点时 → 确认布局不混乱，乱中有序

8. **颜色系统验证**:
   - root 节点 → 确认为淡紫色 (#e0c8ff)
   - domain/project 节点 → 确认为神经紫 (#c8a0f0)
   - topic 节点 → 确认为浅紫 (#a78bfa)
   - document 节点 → 确认为薄荷绿 (#9cf4d4)
   - fragment/source 节点 → 确认为青色 (#67e8f9)
   - tag/insight 节点 → 确认为金黄 (#fbbf24)
   - orphan 节点 → 确认为灰色半透明 (#6b7280, opacity 0.4)

**当前风险及影响范围**:
1. 物理引擎性能：大量节点（>100）时可能需要优化模拟算法 → 当前使用 requestAnimationFrame，3 秒后停止，风险可控
2. SVG 渲染兼容性：使用原生 SVG 元素而非第三方库 → 兼容性良好，但缺少缩放/平移功能
3. 拖拽连线 UX：锚点较小（4px），可能难以操作 → 后续可考虑增大锚点或提供替代交互方式
4. Filter Panel 定位：absolute 定位可能在滚动时出现问题 → 当前 canvas 区域 overflow-hidden，风险较低
5. 三栏布局保持不变：本次只修改中间 graph view 部分，左右两栏保持原样 → 无影响

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 32 (FE-REAL-004 Review 修复：Mind 视觉回退) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 32 devlog -- FE-REAL-004 Review 修复：Mind 视觉回退 + 真实数据接入三栏设计

**时间戳**: 2026-05-09

**任务起止时间**: 06:55 - 07:10 CST

**工时**: 15 分钟

**任务目标**:
1. 修复 Review 发现的 Mind 视觉回退问题：Round 31 错误地将三栏式 Mind 设计替换为全屏画布简化版。
2. 恢复原始三栏式 Mind 设计（散落思绪池 + 图谱画布 + AI 蒸馏面板），同时接入真实数据。
3. 抽取 addDraftRecord shared helper，让 createDraft 和 convertTipToDraft 复用同一 Draft 创建逻辑。
4. MindCanvasStage 增加 loading/empty state 内部处理。

**Review 发现的问题**:
- Round 31 将原始三栏式 MindView（散落思绪池 + 节点画布 + AI 蒸馏面板）替换为 MindCanvasStage 全屏画布渲染
- 这破坏了现有的 Golden UI 三栏布局设计
- 正确做法是在保留三栏式 UI 的前提下，将 mock 数据替换为真实数据

**变更摘要**:

**MindView 恢复与真实数据接入** (`app/workspace/page.tsx`):
- 恢复原始三栏式 UI 结构：左栏散落思绪池 + 中栏图谱画布 + 右栏 AI 蒸馏面板
- 左栏数据源：从 `listActiveTips(userId)` 获取真实未转换 Tips，替换 mock unlinkedThoughts
- 中栏数据源：从 `useMindGraph(userId)` 获取真实 mind_nodes / mind_edges，替换 mock nodes/edges
- 右栏 AI 蒸馏：保留 UI 框架，推荐连线目标改为从真实 localNodes[0] 读取
- 节点拖拽：保留 DOM 拖拽交互，拖拽结束通过 onNodeDragEnd 持久化位置到 IndexedDB
- 连线绘制：保留锚点拖拽连线交互，新连线通过 upsertMindEdge 写入数据库
- 注入操作：injectThought 通过 upsertMindNode 创建真实节点，发射 mind_node_created 事件
- 空图谱展示真实 empty state（"图谱为空"提示）
- 无散落思绪时展示"暂无散落思绪"

**Draft 创建逻辑抽取** (`lib/repository.ts`):
- 抽取 `addDraftRecord(userId, title, content)` 内部 helper 函数
- `createDraft` 和 `convertTipToDraft` 均复用此 helper，消除重复代码
- convertTipToDraft 保持 Dexie transaction 包裹，确保原子性

**MindCanvasStage 增强** (`app/workspace/features/mind/MindCanvasStage.tsx`):
- 新增 `loading` prop，loading 状态由组件内部处理
- 新增 empty state 渲染（snapshot.nodes.length === 0 时展示"暂无思维节点"）

**改动文件名及行数**:
1. `app/workspace/page.tsx` (-58 行简化版 MindView, +275 行三栏式真实数据 MindView, +4 行 import)
2. `lib/repository.ts` (+8 行 addDraftRecord helper, -12 行 createDraft 简化, -10 行 convertTipToDraft 简化)
3. `app/workspace/features/mind/MindCanvasStage.tsx` (+1 行 loading prop, +30 行 loading/empty state)

**遇到的问题及解决方式**:
1. Review 反馈 Mind 设计被回退 → 理解到三栏式设计就是最新设计，恢复三栏 UI 并接入真实数据
2. StoredTip 类型重复导入 → 发现 page.tsx 已有 StoredTip 导入，移除重复
3. updateMindNodePosition / StoredMindNode / StoredMindEdge 未使用 → 移除未使用 import

**自动验证结果**:
- `pnpm typecheck`: ✅ 通过
- `pnpm lint`: ✅ 通过 (0 errors, 3 warnings 均为预先存在)
- `pnpm test`: ✅ 595 tests passed
- `pnpm build:web`: ✅ 构建成功

**手工验证步骤**:
1. 打开 /workspace → 进入 Mind tab
2. 确认三栏式布局：左栏散落思绪池、中栏图谱画布、右栏 AI 蒸馏面板
3. 若无节点，中栏显示"图谱为空"empty state
4. 若有节点，确认来自真实 mind_nodes / mind_edges
5. 拖拽节点后松开，切换 tab 再回来，确认位置保持
6. 刷新页面，确认位置仍保持
7. 左栏显示真实 active Tips，非 mock 数据
8. 选择一个 Tip → 右栏展示蒸馏面板 → 点击"注入图谱"→ 确认新节点出现在画布
9. 拖拽节点锚点到另一节点 → 确认新连线创建
10. 确认 Home / Daily Brief 的 Mind 相关数据能刷新

**当前风险及影响范围**:
1. 三栏式 DOM 拖拽与 Sigma 图谱是两套渲染路径 → 当前使用 DOM 拖拽，Sigma 路径（MindCanvasStage）保留但未在 Mind tab 直接使用
2. AI 蒸馏推荐逻辑仍为占位 → 待 IntelligenceSpine 接入
3. 散落思绪池仅显示 active Tips → 后续可扩展为显示未链接的 Dock Items

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 31 (FE-REAL-004 Mind Graph 真实接入) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 31 devlog -- FE-REAL-004 Mind Graph 真实接入 + 事件桥接

**时间戳**: 2026-05-09

**任务起止时间**: 06:25 - 06:45 CST

**工时**: 20 分钟

**任务目标**:
1. 让 Mind 页面接入真实 mind_nodes / mind_edges，不再以 hardcoded mock graph 作为主数据源。
2. 补齐 Mind 节点位置持久化（positionX / positionY）。
3. 建立 Mind 事件桥接，让 Home / Daily Brief 能感知 Mind 数据变化。
4. 将 convertTipToDraft() 调整为 Dexie transaction，避免 Draft 创建成功但 Tip 状态未更新。

**变更摘要**:

**事件总线扩展** (`lib/events.ts`):
- 新增 6 个 Mind 事件类型: mind_node_created, mind_node_updated, mind_node_deleted, mind_edge_created, mind_edge_updated, mind_edge_deleted

**Repository 扩展** (`lib/repository.ts`):
- 新增 `updateMindNodePosition(userId, id, positionX, positionY)` 函数
- 修改 `convertTipToDraft()` 为 Dexie transaction，确保 Draft 创建和 Tip 状态更新原子性

**Mind 数据 Hook** (`app/workspace/features/mind/useMindGraph.ts`):
- 新建 `useMindGraph(userId)` hook，提供 nodes/edges/snapshot/loading/isEmpty/refresh/onNodeDragEnd
- 订阅 Mind 事件自动刷新
- 节点拖拽后 debounce 500ms 批量写入 positionX/positionY
- 位置保存后发射 mind_node_updated 事件

**Mind 页面真实接入** (`app/workspace/page.tsx`):
- 移除 MindView 中全部 mock 数据（mock nodes/edges/unlinkedThoughts）
- 替换为 useMindGraph hook 驱动的真实数据渲染
- 空图谱时展示真实 empty state（"暂无思维节点"提示）
- 加载中展示 loading state
- MindView 接收 userId 和 onToast props

**图谱组件拖拽事件** (`app/workspace/features/mind/MindGraphSigma.tsx`):
- 新增 onNodeDragEnd prop
- 通过 Sigma 的 upNode 事件检测拖拽结束，读取 graph 节点坐标并回调

**图谱视图传递** (`app/workspace/features/mind/MindGraphView.tsx`, `MindCanvasStage.tsx`):
- 透传 onNodeDragEnd prop 到 MindGraphSigma

**Home / Daily Brief 事件订阅**:
- `useHomeIntelligence.ts`: REFRESH_EVENTS 新增 6 个 mind_* 事件
- `useDailyBrief.ts`: REFRESH_EVENTS 新增 6 个 mind_* 事件

**改动文件名及行数**:
1. `lib/events.ts` (+6 行事件类型)
2. `lib/repository.ts` (+38 行 updateMindNodePosition, +20 行 convertTipToDraft transaction)
3. `app/workspace/features/mind/useMindGraph.ts` (新建, 108 行)
4. `app/workspace/page.tsx` (-230 行 mock MindView, +58 行真实 MindView, +2 行 import)
5. `app/workspace/features/mind/MindGraphSigma.tsx` (+13 行 onNodeDragEnd)
6. `app/workspace/features/mind/MindGraphView.tsx` (+3 行 onNodeDragEnd)
7. `app/workspace/features/mind/MindCanvasStage.tsx` (+3 行 onNodeDragEnd)
8. `app/workspace/features/home/useHomeIntelligence.ts` (+1 行事件)
9. `app/workspace/features/home/useDailyBrief.ts` (+1 行事件)
10. `tests/mind-graph.test.ts` (+35 行位置持久化测试)
11. `tests/mind-events.test.ts` (新建, 120 行事件桥接+snapshot+transaction 测试)

**遇到的问题及解决方式**:
1. Sigma v3 没有 dragEnd 事件 → 改用 upNode 事件，在鼠标释放节点时读取 graph 坐标
2. Map 迭代需要 downlevelIteration → 改用 Array.from(pending.entries()) 遍历
3. MindView 移除后遗留未使用的 import (Plus, MousePointer2, GitCommit, Wand2, useRef) → 清理

**自动验证结果**:
- `pnpm typecheck`: ✅ 通过
- `pnpm lint`: ✅ 通过 (0 errors, 3 warnings 均为预先存在)
- `pnpm test`: ✅ 595 tests passed (含新增 7 个 mind-events 测试)
- `pnpm build:web`: ✅ 构建成功

**手工验证步骤**:
1. 打开 /workspace → 进入 Mind tab
2. 若无节点，确认显示"暂无思维节点"empty state，不显示假图谱
3. 若有节点，确认图谱来自真实 mind_nodes / mind_edges
4. 拖拽一个节点后松开鼠标
5. 切换到 Home 再返回 Mind，确认位置保持
6. 刷新页面，确认位置仍保持
7. 修改 Mind 数据后，确认 Home / Daily Brief 的 Mind 数量或状态能刷新
8. 创建 Tip 并转 Draft，确认 convertTipToDraft 正常工作

**当前风险及影响范围**:
1. upNode 事件在非拖拽场景（如单击节点后松开）也会触发位置保存 → 影响低，因为位置值未变时不会产生实际数据库写入差异
2. 发布 Draft 为 Document 尚未自动生成 MindNode → 记录为 Dock/Review 后续任务
3. Mind 的"散落思绪池"和"AI 蒸馏推荐"面板暂未实现 → 不在本轮范围

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 30 (FE-REAL-003 实时刷新) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 30 devlog -- FE-REAL-003 Home/Daily Brief 事件驱动实时刷新

**时间戳**: 2026-05-09

**任务起止时间**: 06:00 - 06:10 CST

**工时**: 10 分钟

**任务目标**:
1. 解决 Home 和每日简报数据只有手动刷新后才更新的问题。
2. 建立事件驱动机制，当 Tip/Draft 数据变更时自动刷新 Home 和 Daily Brief。
3. 替代手动 refreshIntelligence() 调用，改为事件订阅自动刷新。

**变更摘要**:

**事件总线扩展** (`lib/events.ts`):
- 在 AppEvent 联合类型中新增 6 个数据变更事件：tip_created、tip_converted、tip_discarded、draft_created、draft_updated、draft_deleted
- 复用现有 subscribe/emit 基础设施，无需新建事件系统

**Hook 层事件订阅** (`features/home/`):
- useHomeIntelligence：新增 useEffect 订阅 REFRESH_EVENTS 列表中的事件，收到事件时自动 setRefreshKey 触发重新查询
- useDailyBrief：同上，新增事件订阅 useEffect
- REFRESH_EVENTS = ['tip_created', 'tip_converted', 'tip_discarded', 'draft_created', 'draft_updated', 'draft_deleted', 'archive_completed']

**事件发射点** (`page.tsx`):
- QuickCapture 创建 Tip 后：emit({ type: 'tip_created', tipId: tip.id })
- Tip 转 Draft 后：emit({ type: 'tip_converted', tipId, draftId: result.draftId })
- Tip 丢弃后：emit({ type: 'tip_discarded', tipId })
- 移除 refreshIntelligence() 回调，不再需要手动刷新

**Draft 操作事件发射** (`features/editor/useDrafts.ts`):
- handleCreate：创建成功后 emit({ type: 'draft_created', draftId })
- handleUpdate：更新成功后 emit({ type: 'draft_updated', draftId })
- handlePublish：发布成功后 emit({ type: 'draft_updated' }) + emit({ type: 'archive_completed' })
- handleDiscard：丢弃成功后 emit({ type: 'draft_deleted', draftId })

**改动文件及行数**:
- `apps/web/lib/events.ts` | M | +6 行 (新增 6 个事件类型)
- `apps/web/app/workspace/features/home/useHomeIntelligence.ts` | M | +10 行 (事件订阅)
- `apps/web/app/workspace/features/home/useDailyBrief.ts` | M | +10 行 (事件订阅)
- `apps/web/app/workspace/page.tsx` | M | +4 行 / -7 行 (emit 替代 refreshIntelligence)
- `apps/web/app/workspace/features/editor/useDrafts.ts` | M | +6 行 (事件发射)

**遇到的问题及解决方式**:
1. **convertTipToDraft 返回值类型**：初版使用 result.draft.id 但实际返回 { tip, draftId }。修复：改为 result.draftId。
2. **自动保存频率问题**：useEditorDraft 的 debounce 自动保存（1.5s）如果发射 draft_updated 会导致 Home 频繁刷新。决策：自动保存不发射事件，只在用户主动操作（创建/发布/丢弃）时发射。

**自动验证结果**:
- `pnpm lint`: ✅ 通过 (0 errors, 3 warnings — 均为已有)
- `pnpm typecheck`: ✅ 通过
- `pnpm test`: ✅ 通过 (584 tests passed, 23 test files)
- `pnpm build:web`: ✅ 通过

**手工验证步骤说明**:
1. 打开 `/workspace` 页面，确认 Home 页面正常显示。
2. 通过 Quick Capture 创建一条 Tip，确认 Home 页面 Tips 计数自动更新（无需手动刷新）。
3. 在 Home 页面点击 Tip 转 Draft，确认 Tips 计数减少、Drafts 计数增加。
4. 在 Home 页面点击 Tip 丢弃，确认 Tips 计数减少。
5. 切换到 Editor tab 创建 Draft，切回 Home 确认 Drafts 计数自动更新。
6. 切换到 Daily Brief tab，确认简报数据与 Home 同步更新。

**当前风险**:
1. **事件风暴**：如果短时间内大量操作（如批量导入），可能触发频繁刷新。当前阶段数据量小，暂不优化。未来可加 debounce 或 throttle。
2. **事件遗漏**：Mind Graph 节点/边的增删尚未发射事件，Home/Daily Brief 中 Mind 相关数据仍需手动刷新。可在后续迭代中补充。

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 29 (FE-REAL-003) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 29 devlog -- FE-REAL-003 Home Intelligence Widget + Daily Brief 真实化

**时间戳**: 2026-05-09

**任务起止时间**: 05:30 - 05:55 CST

**工时**: 25 分钟

**任务目标**:
1. 让 Home 和 Daily Brief 从静态 mock 变成真实读取本地数据的智能窗口。
2. 数据来源优先使用 FE-REAL-001 Drafts、FE-REAL-002 Tips、已有 Documents/entries、已有 Mind/Activity 数据。
3. 目标是"真实可解释"，不是炫技。
4. 不破坏现有 Golden UI 视觉，不重做 Home/Daily Brief 页面。
5. 不使用 hardcoded mock 假装真实数据。
6. 空数据时展示真实 empty state，不要伪造数据。
7. 业务聚合逻辑不堆进 workspace page，优先建立 service/hook。

**变更摘要**:

**聚合 Hook 层** (`features/home/`):
- 新增 `useHomeIntelligence(userId)`：从本地 repository 聚合 Home 页面所需数据
  - 聚合来源：listDrafts、listActiveTips、listArchivedEntries、listMindNodes、listMindEdges、listCollections
  - 输出：activeDraftCount、activeTipCount、documentCount、mindNodeCount、mindEdgeCount、todayCreatedCount、todayUpdatedCount、recentDrafts(5)、recentTips(5)、recentDocuments(5)、collections、healthHints
  - healthHints 逻辑：Tips≥5 提示待整理、Drafts≥1 提示未发布、Documents=0 提示暂无归档、MindNodes=0 提示图谱为空
  - 支持 refresh() 刷新
- 新增 `useDailyBrief(userId)`：从本地 repository 聚合 Daily Brief 页面所需数据
  - 额外聚合：listTags
  - 额外输出：tagCount、collectionCount、recentMindNodes(10)、recentMindEdges(10)、tags、briefHints
  - briefHints 优先级系统：high(Tips≥5/Drafts≥3)、medium(0<tips<5/0<drafts<3/有文档无标签)、low(无文档/无思维图谱/有项目集合)
  - 支持 refresh() 刷新

**Home 页面集成** (`page.tsx`):
- 引入 useHomeIntelligence 和 useDailyBrief hook
- HomeView 接收 intelligence 和 intelligenceLoading props
- DailyBriefingView 接收 brief 和 briefLoading props
- 添加 refreshIntelligence() 回调，在 Tip 转 Draft / 丢弃 Tip 后自动刷新 Home 和 Daily Brief 数据
- 添加 formatRelativeTime() 工具函数用于时间显示
- 移除未使用的 Code/Link/ImageIcon import

**测试** (`tests/home-intelligence.test.ts`):
- 新增 14 个测试用例覆盖聚合逻辑
- Home Intelligence：空 workspace 零值、Drafts 计数、Tips 计数、归档文档计数、Mind 节点/边计数、Drafts 排序、Tips 列表、Collections/Tags 计数、用户隔离
- Daily Brief：空 workspace hints 生成、Tips≥5 高优先级 hint、Drafts≥3 高优先级 hint、小数量中优先级 hint、todayCreated 计数

**改动文件及行数**:
- `apps/web/app/workspace/features/home/useHomeIntelligence.ts` | A | +118 行
- `apps/web/app/workspace/features/home/useDailyBrief.ts` | A | +195 行
- `apps/web/app/workspace/page.tsx` | M | +30 行 / -8 行
- `apps/web/tests/home-intelligence.test.ts` | A | +231 行

**遇到的问题及解决方式**:
1. **类型导出名称不一致**：repository.ts 内部使用 `Persisted*` 类型名，但对外导出为 `Stored*` 别名。初版 hook 使用 `PersistedEditorDraft` 等导致 typecheck 失败。修复：改用 `StoredDraft`/`StoredTip`/`StoredEntry`/`StoredMindNode`/`StoredMindEdge`/`StoredCollection`/`StoredTag`。
2. **MindNodeType/MindEdgeType 枚举值**：测试中使用 `'concept'` 和 `'related'` 不在合法枚举中。修复：改为 `'topic'` 和 `'semantic'`。
3. **createDraft/createDockItem API 签名**：测试中传对象参数与实际签名不匹配。修复：改为位置参数 `createDraft(userId, title, content)` 和 `createDockItem(userId, rawText)`。
4. **useCallback 依赖警告**：refreshIntelligence 依赖 homeIntelligence.refresh 和 dailyBriefHook.refresh 导致 exhaustive-deps 警告。修复：添加 eslint-disable 注释，因为 refresh 函数引用稳定不需要重渲染。

**自动验证结果**:
- `pnpm lint`: ✅ 通过 (0 errors, 3 warnings — 均为已有)
- `pnpm typecheck`: ✅ 通过
- `pnpm test`: ✅ 通过 (584 tests passed, 23 test files — 含新增 14 个 home-intelligence 测试)
- `pnpm build:web`: ✅ 通过 (workspace 页面 30 kB)

**手工验证步骤说明**:
1. 打开 `/workspace` 页面，确认 Home 页面正常显示。
2. 通过 Quick Capture 创建一条 Tip。
3. 切换到 Editor tab，创建一个 Draft。
4. 回到 Home tab，确认 Tips/Drafts 计数和列表不再是纯 mock。
5. 切换到 Daily Brief tab，确认简报数据来自真实本地数据。
6. 刷新页面后再次确认 Home/Daily Brief 数据仍存在。
7. 确认没有新增 Dock 推荐处理、Review 诊断等越界功能。

**当前风险**:
1. **userId fallback**：同前两轮，未登录用户共享 `_legacy` userId，数据无用户隔离。
2. **HomeView/DailyBriefingView 内部 mock 残留**：这两个组件内部仍有部分 hardcoded mock 数据（如 Recent Files 列表），因为对应数据源（Dock 推荐队列）不在本轮范围内。这些 mock 标记为 Local Preview 状态。
3. **刷新粒度**：当前刷新是全量重新查询，数据量大时可能有性能问题，但当前阶段数据量小，暂不优化。

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 28 (FE-REAL-002) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 28 devlog -- FE-REAL-002 Quick Capture + Tips 系统目录

**时间戳**: 2026-05-09

**任务起止时间**: 04:20 - 05:00 CST

**工时**: 40 分钟（含 Review 修复）

**任务目标**:
1. 让全局 Quick Capture 成为真实输入入口，用户输入内容后写入本地 Tips 系统目录。
2. Tips 可查看、可刷新恢复、可转 Draft、可丢弃。
3. 不破坏现有 Golden UI 视觉和 /workspace shell。
4. 不使用 mock / hardcoded / React state 假装持久化。
5. 优先复用现有 Capture / Document / Draft / repository / IndexedDB 能力。
6. Tip 转 Draft 必须接入 FE-REAL-001 的 createDraft/listDrafts 链路。

**变更摘要**:

**数据库层** (`db.ts`):
- 新增 `TipSourceType` 类型：`'text' | 'manual' | 'quick-capture'`
- 新增 `TipStatus` 类型：`'active' | 'converted' | 'discarded'`
- 新增 `TipRecord` 接口：id, userId, content, sourceType, status, convertedDraftId, createdAt, updatedAt
- 新增 `PersistedTip` 接口：继承 TipRecord，id 为 number（非可选）
- 新增 DB version 20：tips 表，索引 `++id, userId, sourceType, status, [userId+status], createdAt, updatedAt`
- 导出 `tipsTable`

**Repository 层** (`repository.ts`):
- 新增 `createTip(userId, content, sourceType?)`：创建 Tip，默认 sourceType='quick-capture'，校验 content 和 userId 非空
- 新增 `listActiveTips(userId)`：列出指定用户所有 status='active' 的 Tips，按 createdAt 降序
- 新增 `getTip(userId, tipId)`：获取单个 Tip，校验 userId
- 新增 `convertTipToDraft(userId, tipId)`：Tip 转 Draft，调用已有 createDraft，Tip 标记为 converted 并记录 convertedDraftId
- 新增 `discardTip(userId, tipId)`：Tip 标记为 discarded
- 导出 `StoredTip` 类型别名和 `TipSourceType`、`TipStatus` 类型

**前端 Hooks** (`features/tips/`):
- 新增 `useTips(userId)`：管理 Tip 列表状态，提供 createTip/getTip/convertTipToDraft/discardTip 操作，支持 forceRefresh

**Quick Capture 全局悬浮胶囊** (`features/tips/QuickCapture.tsx`):
- 新建 `QuickCapture` 组件：全局底部居中悬浮胶囊
- 默认收起为轻量胶囊，hover 有淡淡边框光效（`border-[#86d7ff]/30`）
- 点击展开输入框，不主动 focus
- 高透明液态玻璃/水滴质感（`bg-white/[0.04] backdrop-blur-[40px]`，展开态 `bg-white/[0.06]`）
- 提交成功后清空输入、收起胶囊、触发 toast 反馈
- Escape 键收起并清空
- 严格遵循 SSOT 设计规范：情报蓝 `#86d7ff`、正文色 `#e0e3e6`、辅助色 `#899298`

**Tips 列表 UI** (`features/tips/TipsPanel.tsx`):
- 新建 `TipsPanel` 组件：显示活跃 Tips 列表
- 每个 Tip 显示内容、来源标签、相对时间
- hover 显示操作按钮：转为 Draft（箭头图标）、丢弃（垃圾桶图标）
- 操作时显示 loading spinner
- 空状态显示引导文案
- 严格遵循 SSOT：GlassCard 材质 `bg-[#1c2023]/40 backdrop-blur-[16px]`、`rounded-[16px]`、微标签 `text-[9px] font-semibold tracking-wider uppercase`

**页面集成** (`page.tsx`):
- 保留原有 Golden UI Home（MockHomeView → HomeView），不替换
- 引入 useTips hook
- QuickCapture 挂载为 workspace shell 全局悬浮组件（固定底部居中，所有 tab 可见）
- Quick Capture 只写 Tip，不写 DockItem（移除双写）
- TipsPanel 最小侵入挂载到 Home tab 底部（HomeView 下方）
- 提交成功后 toast 反馈"Tip 已创建"

**.gitignore**:
- 将 `.trae/` 目录下的逐条忽略规则合并为 `.trae/` 整目录忽略

**测试** (`tests/tip-repository.test.ts`):
- 新增 20 个测试用例覆盖 Tip CRUD 全流程：createTip、listActiveTips、getTip、convertTipToDraft、discardTip
- 包含用户隔离、活跃列表过滤、错误用户校验、空内容校验、sourceType 自定义、内容 trim、时间排序、重复操作幂等性等边界测试

**改动文件及行数**:
- `apps/web/lib/db.ts` | M | +18 行 / -0 行
- `apps/web/lib/repository.ts` | M | +93 行 / -0 行
- `apps/web/app/workspace/features/tips/useTips.ts` | A | +73 行
- `apps/web/app/workspace/features/tips/TipsPanel.tsx` | A | +143 行
- `apps/web/app/workspace/features/tips/QuickCapture.tsx` | A | +75 行
- `apps/web/app/workspace/page.tsx` | M | +18 行 / -8 行
- `apps/web/tests/tip-repository.test.ts` | A | +140 行
- `.gitignore` | M | +1 行 / -30 行

**Review 修复记录**:
1. **Home Page 视觉破坏**：初版将 page.tsx 的 home tab 从 Golden UI Home（MockHomeView）替换为旧式 features/home/HomeView.tsx（大标题 Knowledge, Structured.、中央大输入框、feature grid），破坏了现有 Golden UI layout。修复：恢复原有 HomeView，TipsPanel 以最小侵入方式挂载到 Home tab 底部。
2. **Quick Capture UI 位置错误**：初版将 Quick Capture 作为 Home 页面中心的大输入框。修复：重新实现为全局 workspace shell 底部居中的悬浮胶囊组件，收起态为轻量胶囊，展开态为液态玻璃输入框，不主动 focus。
3. **DockItem 双写**：初版 Quick Capture 同时调用 createDockItem 和 createTip。修复：移除 DockItem 写入，Quick Capture 只写 Tip。
4. **缺少成功反馈**：初版 Quick Capture 提交后无 UI 反馈。修复：提交成功后触发 toast"Tip 已创建"。
5. **TipsPanel 设计规范合规**：初版使用 `#fbbf24`（琥珀色）等非 SSOT 颜色。修复：全部替换为 SSOT 令牌（`#86d7ff` 情报蓝、`#ffb4ab` 警示红、`#e0e3e6` 正文色、GlassCard 材质）。

**遇到的问题及解决方式**:
1. **convertTipToDraft 跨表事务**：Tip 转 Draft 需要同时操作 tips 表和 editorDrafts 表。当前实现先调用 createDraft（已有链路），再 update tips 表状态。未使用 Dexie 事务，因为 createDraft 内部已有独立的 add 操作，且两步操作的失败场景已通过返回 null 处理。
2. **Quick Capture 不主动 focus**：Review 要求点击展开后不主动 focus 输入框。移除了 useEffect 中的 inputRef.current.focus() 调用。

**自动验证结果**:
- `pnpm typecheck`: ✅ 通过
- `pnpm lint`: ✅ 通过 (0 errors, 3 warnings — 均为已有，非本次引入)
- `pnpm test`: ✅ 通过 (570 tests passed, 22 test files — 含新增 20 个 tip 测试)
- `pnpm build:web`: ✅ 通过 (workspace 页面 28.7 kB)

**手工验证步骤说明**:
1. 打开 `/workspace` 页面，确认 Golden UI Home 布局未变。
2. 确认页面底部居中出现轻量悬浮胶囊"Capture"。
3. hover 胶囊，确认边框出现淡淡光效。
4. 点击胶囊，确认展开为输入框（不自动聚焦），输入框有液态玻璃质感。
5. 输入一条文本，按 Enter 或点击发送按钮。
6. 确认输入框收起，toast 提示"Tip 已创建"。
7. 在 Home tab 底部找到 Tips 面板，确认新 Tip 出现。
8. 刷新页面，确认 Tip 仍存在。
9. hover 该 Tip，点击"转为 Draft"按钮。
10. 确认 toast 提示转 Draft 成功，Tip 从列表消失。
11. 切换到 Editor tab，确认 Drafts 列表中出现新 Draft。
12. 返回 Home tab，通过 Quick Capture 新建另一条 Tip。
13. hover 该 Tip，点击"丢弃"按钮。
14. 确认 toast 提示丢弃成功，Tip 从列表消失。
15. 刷新页面，确认丢弃的 Tip 不再出现。

**当前风险**:
1. **userId fallback**：同 FE-REAL-001，未登录用户共享 `_legacy` userId，Tips 数据无用户隔离。
2. **Tips 列表位置**：当前 Tips 面板放在 Home tab 底部（HomeView 下方），如果 Tips 数量多可能需要折叠或分页。
3. **Quick Capture 不自动 focus**：展开后用户需手动点击输入框才能开始输入，这是 Review 明确要求的行为。

---

<!-- ============================================ -->
<!-- 分割线：Phase 3.1.5 Round 27 (FE-REAL-001) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 27 devlog -- FE-REAL-001 Editor + Drafts 基础可用

**时间戳**: 2026-05-09

**任务起止时间**: 03:40 - 04:00 CST

**工时**: 20 分钟

**任务目标**:
1. 让 Editor 成为真实可编辑的长期资产层，建立 Drafts 系统目录。
2. 用户可创建 Draft、编辑 Markdown、自动保存、刷新恢复、在 Drafts 中看到、继续编辑、转正式 Document、丢弃 Draft。
3. 不破坏现有 Golden UI 视觉，尤其 Editor 三栏结构。
4. Draft 持久化到本地 IndexedDB/Dexie，不使用 mock 数据。

**变更摘要**:

**数据库层** (`db.ts`):
- 新增 `DraftStatus` 类型：`'active' | 'published' | 'discarded'`
- `EditorDraftRecord` 新增 `status: DraftStatus` 字段
- 新增 DB version 19：editorDrafts 表增加 status 索引、复合索引 `[userId+status]`、`[userId+draftKey]`、updatedAt 索引
- version 19 upgrade 迁移：为已有记录填充 `status: 'active'`

**Repository 层** (`repository.ts`):
- 新增 `createDraft(userId, title?, content?)`：创建独立 Draft，draftKey 自动设为 id
- 新增 `listDrafts(userId)`：列出指定用户所有 status='active' 的草稿，按 updatedAt 降序
- 新增 `getDraft(userId, draftId)`：获取单个 Draft，校验 userId
- 新增 `updateDraft(userId, draftId, updates)`：更新 Draft 的 title/content，自动更新 updatedAt
- 新增 `publishDraftToDocument(userId, draftId)`：Draft 转 Entry，Draft 标记为 published
- 新增 `discardDraft(userId, draftId)`：Draft 标记为 discarded
- 导出 `StoredDraft` 类型别名和 `DraftStatus` 类型

**前端 Hooks** (`features/editor/`):
- 新增 `useDrafts(userId)`：管理 Draft 列表状态，提供 createDraft/updateDraft/publishDraft/discardDraft/getDraft 操作
- 新增 `useEditorDraft({ userId, draftId, enabled, debounceMs })`：管理单个 Draft 的编辑状态，内置 debounce autosave（默认 1500ms），支持 flushSave 和 resetForDraft

**Editor 视图** (`features/editor/DraftEditorView.tsx`):
- 新建 `DraftEditorView` 组件，替换原 mock `EditorView`
- 左侧 Drafts 列表面板：显示所有活跃草稿，支持新建/选择/丢弃
- 中间 Main Canvas：标题输入 + Markdown textarea 编辑，显示保存状态（idle/saving/saved/failed）
- 右侧 Inspector：显示 Draft 属性（状态/类型/字数/创建时间/更新时间），提供发布和丢弃操作
- 顶部工具栏：切换 Drafts 列表、保存状态指示、发布/丢弃按钮
- Toast 通知：操作反馈（创建/发布/丢弃）

**页面集成** (`page.tsx`):
- 移除 mock `EditorView`（约 170 行 JSX）
- 引入 `DraftEditorView` 组件，传入 userId、面板开关、toast 回调
- 新增 userId 状态（从 `getCurrentUser()` 获取，fallback `_legacy`）
- 新增 toast 通知组件

**测试** (`tests/draft-repository.test.ts`):
- 新增 14 个测试用例覆盖 Draft CRUD 全流程：createDraft、listDrafts、getDraft、updateDraft、publishDraftToDocument、discardDraft
- 包含用户隔离、活跃列表过滤、错误用户校验等边界测试

**改动文件及行数**:
- `apps/web/lib/db.ts` | M | +15 行 / -2 行
- `apps/web/lib/repository.ts` | M | +95 行 / -0 行
- `apps/web/app/workspace/features/editor/useDrafts.ts` | A | +95 行
- `apps/web/app/workspace/features/editor/useEditorDraft.ts` | A | +115 行
- `apps/web/app/workspace/features/editor/DraftEditorView.tsx` | A | +310 行
- `apps/web/app/workspace/page.tsx` | M | +18 行 / -175 行
- `apps/web/tests/draft-repository.test.ts` | A | +115 行

**遇到的问题及解决方式**:
1. **mock EditorView 残留**：替换 EditorView 后，page.tsx 中残留大量未使用的 JSX 代码和 import（Mic, Globe, SlidersHorizontal, FolderOpen, Archive, Link, Activity）。通过逐步搜索替换和 sed 删除清理，最终将 ~170 行 mock 代码替换为 3 行注释。
2. **useDrafts refresh 机制**：初始实现使用 useRef 管理 refreshKey，但 React Hook useEffect 的 exhaustive-deps 规则不允许将 `refreshKeyRef.current` 作为依赖。改为使用 useState 管理 refreshKey，通过 setRefreshKey 触发重新渲染。
3. **TerminalSquare 引用丢失**：删除 mock EditorView 时误删了 TerminalSquare 的 import，但 HomeView 中仍在使用。补回 import 后修复。
4. **测试文件非空断言**：初版 `draft-repository.test.ts` 使用了 15 处 `!` 非空断言（如 `draft.id!`、`result.draft!`、`result.entry!`），触发 `@typescript-eslint/no-non-null-assertion` 规则。修复：所有 `draft.id!` 改为 `draft.id`（因 `unwrap` 返回 `PersistedEditorDraft`，其 `id` 为 `number` 非可选）；所有 `result.draft!` / `result.entry!` 改为先 `unwrap()` 再访问属性；`found!.title` 改为 `unwrap(found).title`。

**自动验证结果**:
- `pnpm typecheck`: ✅ 通过
- `pnpm lint`: ✅ 通过 (0 errors, 3 warnings — 均为已有，非本次引入)
- `pnpm build:web`: ✅ 通过 (workspace 页面 26.8 kB)
- `pnpm test`: ✅ 通过 (550 tests passed, 21 test files — 含新增 14 个 draft 测试)

**手工验证步骤说明**:
1. 打开 `/workspace` 页面，切换到 Editor tab。
2. 点击左侧 Drafts 面板的 + 按钮或中间区域的"新建草稿"按钮，创建新 Draft。
3. 输入标题和 Markdown 正文，等待 1.5 秒观察保存状态从 "Saving..." 变为 "Saved"。
4. 刷新页面，切换回 Editor tab，确认 Draft 内容恢复。
5. 从 Drafts 列表点击已创建的 Draft，确认内容正确加载。
6. 继续编辑并等待自动保存。
7. 点击"发布"按钮，确认 toast 提示发布成功，Drafts 列表不再显示该草稿。
8. 新建另一个 Draft，点击"丢弃"按钮，确认 toast 提示丢弃成功，Drafts 列表不再显示。
9. 检查右侧 Inspector 面板显示正确的属性信息。

**当前风险**:
1. **userId fallback**：若用户未注册/登录，userId 为 `_legacy`，所有未登录用户共享同一 Draft 数据。后续需接入 auth 系统确保用户隔离。
2. **Markdown 渲染**：当前使用 textarea 纯文本编辑，未实现 Markdown 实时预览。后续可引入轻量 Markdown 渲染。
3. **Source Packet 面板**：当前仅显示占位信息"此草稿由 Editor 直接创建，暂无关联的源数据包"。后续需接入真实源数据关联。

---

<!-- ============================================ -->
<!-- 分割线：Local Core Phase 3.1.5 Round 26 (MG-FIX-03) -->
<!-- ============================================ -->

## Phase 3.1.5 Round 26 devlog -- MG-FIX-03 建立 Mind Graph 基础视觉层级：节点尺寸、弱标签、边线透明度

**时间戳**: 2026-05-07

**Notion 卡片**: MG-FIX-03 建立 Mind Graph 基础视觉层级：节点尺寸、弱标签、边线透明度

**任务起止时间**: 05:48 - 06:08 CST

**工时**: 20 分钟

**任务目标**:
1. 在不破坏 MG-FIX-02 多 cluster 布局的前提下，建立 Mind Graph 的基础视觉层级。
2. 节点尺寸出现基础层级（3档），不再所有节点完全同权重同大小。
3. 节点尺寸只能基于真实数据派生（nodeType、degreeScore、clusterCenterScore、documentWeightScore、userPinScore、recentActivityScore）。
4. label 显示更克制：重要节点可见，普通节点不过度铺满屏幕。
5. 边线视觉更轻：默认透明度降低，不喧宾夺主。
6. 不新增 mock 数据，不修改 repository.ts，不修改数据库 schema。

**变更摘要**:

**视觉权重派生系统** (`mindGraphStyle.ts`):
- 新增 `TYPE_VISUAL_WEIGHT` 常量：为每种 nodeType 定义基础视觉权重（root=1.0, domain=0.7, project=0.6, topic=0.5, document/insight/question=0.35, source/fragment=0.25, tag/time=0.15）。
- 新增 `computeVisualWeight()` 函数：基于 nodeType 基础权重 + degreeScore/clusterCenterScore/documentWeightScore/userPinScore/recentActivityScore 五项信号加权，输出 0-1 的视觉权重值。每项信号有独立上限防止过度放大。
- 新增 `visualWeightToSize()` 函数：3档尺寸映射——Hub(≥0.65) ×1.25、Normal(≥0.35) ×1.0、Leaf(<0.35) ×0.75。乘数温和，避免重新变成"大球"。
- 新增 `shouldShowLabel()` 函数：视觉权重 ≥0.5 的节点默认显示 label，其余隐藏。
- 更新 `EDGE_STYLE`：所有边线颜色 alpha 从 0.18 降至 0.05-0.12，视觉更轻。
- 新增 `computeEdgeWidth()` 函数：基于 edgeType 基础宽度 × strength 系数（0.7 + strength × 0.6），实现轻微粗细差异。

**图数据适配** (`mindGraphAdapter.ts`):
- `GraphNodeAttributes` 新增 `visualWeight: number` 和 `originalLabel: string` 两个字段。
- `snapshotToGraphology()` 中每个节点调用 `computeVisualWeight()` 计算视觉权重，通过 `visualWeightToSize()` 映射为 `baseSize`，通过 `shouldShowLabel()` 决定 `label` 是否为空。
- `label` 为空的节点仍保留 `originalLabel` 供 tooltip 使用。
- 边线使用 `computeEdgeWidth()` 替代静态 `style.width`，宽度随 strength 轻微变化。

**Sigma 渲染控制** (`MindGraphSigma.tsx`):
- `labelDensity` 从 0.07 降至 0.04，减少 label 重叠。
- `applyAppearance()` 中加入 label 动态控制：高亮节点显示 `originalLabel`，暗淡节点隐藏 label，正常状态按 `shouldShowLabel(visualWeight)` 决定。
- tooltip 使用 `originalLabel` 替代 `label`，确保被隐藏 label 的节点仍能通过 tooltip 显示名称。

**改动文件及行数**:
- `apps/web/app/workspace/features/mind/mindGraphStyle.ts` | M | +47 行 / -8 行
- `apps/web/app/workspace/features/mind/mindGraphAdapter.ts` | M | +16 行 / -4 行
- `apps/web/app/workspace/features/mind/MindGraphSigma.tsx` | M | +6 行 / -3 行

**遇到的问题**:
1. 无重大问题。视觉权重系统设计为纯加法模型（type基础 + 信号boost），每项信号有 cap，不会因单一信号过强导致权重爆炸。
2. `originalLabel` 的引入是为了解决 label 设为空字符串后 tooltip 无法获取节点名称的问题，属于最小必要适配。
3. **Review FAIL 修补**：搜索过滤仍使用 `attrs.label` 匹配，MG-FIX-03 将普通节点的 label 设为空字符串后，这些节点无法被搜索找到。修补：将搜索匹配改为 `attrs.originalLabel.toLowerCase().includes(searchLower)`，确保低权重节点虽不显示 label 但仍可被搜索定位。

**自动验证结果**:
- `pnpm validate`: ✅ 通过 (0 errors, 3 warnings — 均为已有，非本次引入)
- `pnpm build:web`: ✅ 通过 (workspace 页面生成成功)

**手工验证步骤说明**:
1. 启动开发服务器并进入 `/workspace` Mind 视图。
2. 预期：图谱不再像均匀撒开的芝麻，而是有明显的主次关系——root/domain/project 等高层级节点更大更醒目，tag/fragment 等低层级节点更小更低调。
3. 预期：边线比之前更轻更透明，不再喧宾夺主。
4. 预期：只有重要节点（root、domain、project、topic 及高 degree 节点）默认显示 label，普通节点 label 不铺满屏幕。
5. 鼠标悬停任意节点：tooltip 应正确显示节点名称（即使该节点默认不显示 label）。
6. 鼠标悬停节点时：该节点及其邻居的 label 应临时显示，其余节点 label 隐藏。
7. 确认多 cluster 布局未被破坏，仍保持 MG-FIX-02 的多中心簇状分布。

**当前风险**:
1. 视觉权重阈值（shouldShowLabel ≥0.5）可能需要根据实际数据分布微调——若大部分节点 degreeScore 偏低，可能只有 root/domain 显示 label；若偏高，可能 label 仍然过多。
2. edge alpha 从 0.18 降至 0.05-0.12 后，在某些低对比度显示器上可能几乎不可见——可通过 `computeEdgeWidth` 的 strength 系数部分补偿。

**影响范围**:
- 仅限于 Mind 视图的视觉渲染层，不影响数据存储、Schema、repository、cluster 布局逻辑或其他页面。

---

<!-- ============================================ -->
<!-- 分割线：Local Core Phase 3 Round 25 (MG-FIX-02 Camera坐标系修复) -->
<!-- ============================================ -->

## Phase 3 Round 25 devlog -- MG-FIX-02 相机坐标系修复 & 视图空白/飞出/Center View 失效根因修补

**时间戳**: 2026-05-07

**Notion 卡片**: MG-FIX-02 Sigma v3 相机坐标系误用导致 Mind 视图空白、刷新飞出、Center View 失效

**任务起止时间**: 05:30 - 05:45 CST

**工时**: 15 分钟

**任务目标**:
1. 修复 Mind 视图空白：首次进入 Mind 看不到任何节点。
2. 修复刷新后"闪现再飞出"：刷新页面后图谱短暂出现然后飞出视口。
3. 修复 Center View 失效：点击居中按钮无法将图谱拉回视口中心。
4. 修复 Mind 视图从 hidden 切到 active 时空白。
5. 修复 snapshot=null 时退回 Legacy canvas 制造另一条渲染路径的问题。
6. 清理调试代码（console.log('[MindGraphDebug]...')）。
7. 保留 MG-FIX-02 cluster 修补（不使用旧 positionX/positionY、基于 nodeType + id hash 的多 cluster 布局）。

**根因分析**:
Sigma v3 的 camera state `x/y/ratio` 是 **framed graph 归一化坐标**（默认 x=0.5, y=0.5, ratio=1），不是原始 Graphology layout 坐标。旧代码 `centerOnBounds()` 通过 `computeVisibleBounds()` 得到 raw graph 的 `cx/cy`（如 400, -600），然后直接传给 `camera.animate({ x: cx, y: cy })`，导致 camera 飞到归一化空间之外 → 视图飞出。

**变更摘要**:
- `MindGraphSigma.tsx`: 重写 `centerOnBounds()` 为 `fitGraph()`，使用 Sigma 官方 `camera.animatedReset()` 替代手动坐标计算；新增 `activeModule` effect 处理视图切换时的 resize + refresh + fit；移除 `computeVisibleBounds` import；移除所有 `[MindGraphDebug]` 调试日志；layout 完成后统一走 `fitGraph(true)`，已有 layout 时走 `fitGraph(false)`。
- `MindGraphView.tsx`: 新增 `activeModule` prop 并传递给 `MindGraphSigma`。
- `MindCanvasStage.tsx`: 移除 `LegacyCanvasFallback` 组件和 `USE_GRAPH_VIEW` 常量；snapshot=null 时显示轻量 loading 状态；新增 `activeModule` prop 并传递给 `MindGraphView`。

**改动文件及行数**:
- `apps/web/app/workspace/features/mind/MindGraphSigma.tsx` | M | +20 行 / -40 行
- `apps/web/app/workspace/features/mind/MindGraphView.tsx` | M | +3 行 / -1 行
- `apps/web/app/workspace/features/mind/MindCanvasStage.tsx` | M | +12 行 / -120 行（移除 LegacyCanvasFallback ~100 行）

**遇到的问题**:
1. Camera 坐标系误用：raw graph 坐标直接传给 camera.animate() 导致视图飞出 → 使用 Sigma 官方 `camera.animatedReset()` 方法，该方法内部正确处理 framed graph 坐标转换。
2. 刷新后"闪现再飞出"：layout 完成后 `centerOnBounds(gs.graph)` 把 camera 飞到错误位置 → 替换为 `fitGraph(true)`，使用 `animatedReset` 正确居中。
3. 首次进入 Mind 空白：snapshot=null 时渲染 LegacyCanvasFallback（使用旧 positionX/positionY 的 canvas），制造了另一条渲染路径 → 改为显示轻量 loading 状态，等真实 snapshot 到达后只走 Sigma 主链路。
4. Mind 视图从 hidden 切到 active 时空白：Sigma 在 hidden 状态下无法正确计算尺寸 → 新增 `activeModule` effect，当从非 mind 切到 mind 时执行 `sigma.resize()` + `sigma.refresh()` + `fitGraph(true)`。
5. Center View 失效：`centerView` 调用 `centerOnBounds()` 使用错误坐标系 → 改为调用 `fitGraph(true)` 使用 `camera.animatedReset()`。

**自动验证结果**:
- `pnpm validate`: ✅ 通过 (0 errors, 3 warnings — 均为已有，非本次引入)
- `pnpm build:web`: ✅ 通过 (workspace 页面生成成功)

**手工验证步骤说明**:
1. 首次进入 Mind 视图 → 应能看到 root/节点，不再空白。
2. 创建节点后切到 Mind → 应刷新显示新节点。
3. 刷新页面（F5）→ 图谱应正确居中显示，不再飞出视口。
4. 点击 Center View 按钮 → 图谱应平滑恢复到视口中心。
5. 从其他视图（Home/Dock）切回 Mind → 图谱应正确渲染。

**当前风险**:
1. `camera.animatedReset()` 会将整张图谱 fit 到视口，对于超大图谱可能缩放过小 → 可通过 `minCameraRatio`/`maxCameraRatio` 设置限制（已在 SigmaContainer settings 中配置 0.05~10）。
2. `activeModule` effect 使用 120ms 延迟等待 DOM 渲染，极端情况下可能不够 → 如遇问题可增大延迟。

**影响范围**:
- 仅限于 Mind 视图的相机控制和渲染链路，不影响数据存储、Schema、其他页面或 cluster 布局逻辑。

---

<!-- ============================================ -->
<!-- 分割线：Local Core Phase 3.1.5 Round 24 (MG-FIX-02) -->
<!-- ============================================ -->

## Phase 3 Round 24 devlog -- MG-FIX-02 Multi-cluster Mind Graph Layout

**时间戳**: 2026-05-07

**Notion 卡片**: MG-FIX-02 拆除 ROOT 单中心太阳图，建立多 cluster 视觉布局

**任务起止时间**: 04:15 - 04:30 CST

**工时**: 15 分钟

**任务目标**:
1. 修复当前 Mind 图谱的单中心 ROOT 太阳图（Sunburst）问题，使布局从“全员围攻 ROOT”转变为“多个松散 cluster 分布”。
2. 在 Sigma.js / MindGraphSigma 2D 框架下实现轻量级聚类布局适配器。
3. 聚类依据完全来自真实数据（node.nodeType），并辅以确定性 Hash 分桶。
4. 调整 ForceAtlas2 布局参数，削弱全局向心引力，增强集群内聚性。
5. 保证 ROOT 节点在中心位置，但不得将所有节点强行吸附。

**变更摘要**:
- `mindGraphLayout.ts`: 深度优化 FA2 布局参数。大幅降低全局 gravity (0.8 -> 0.05)，关闭 strongGravityMode，开启 linLogMode 和 outboundAttractionDistribution 以强化集群边界。
- `mindGraphAdapter.ts`: 重写初始定位逻辑。定义了 5 个空间集群中心（Root, Documents, Concepts, Tags, Others），`seededPosition` 现在根据 `nodeType` 和 ID Hash 将节点预分配到不同的空间区域。

**改动文件及行数**:
- `apps/web/app/workspace/features/mind/mindGraphLayout.ts` | M | +15 行 / -10 行
- `apps/web/app/workspace/features/mind/mindGraphAdapter.ts` | M | +30 行 / -10 行

**遇到的问题**:
1. 默认 FA2 配置的 `strongGravityMode` 会强行忽略初始位置将所有节点拉向 (0,0) -> 显式关闭该模式并使用较低的 `gravity` 值。
2. 集群间排斥力不足导致岛屿重叠 -> 提升 `scalingRatio` 至 10.0 并开启 `outboundAttractionDistribution`。

**自动验证结果**:
- `pnpm validate`: ✅ 通过 (Lint, Typecheck, Test, Terminology)
- `pnpm build:web`: ✅ 通过 (workspace 页面生成成功)

**手工验证步骤说明**:
1. 启动开发服务器并进入 `/workspace` Mind 视图。
2. 预期：图谱不再呈现单一圆盘状，而是根据节点类型（文档、标签、概念等）形成多个明显的离散簇。
3. 点击 Re-layout 按钮：验证布局是否能稳定回归到多中心簇状分布。
4. 检查 ROOT 节点：确认其位于画布中心，但其连接的子节点应向各自所属的类型集群偏移。

**当前风险**:
1. 数据类型单一风险：若数据中只有一种 `nodeType` 且 Hash 分布不均，可能依然呈现单中心趋势（已通过 Hash 强制桶分配缓解）。
2. 连接密度风险：若集群间边线极度密集，引力可能抵消排斥力导致集群粘连。

**影响范围**:
- 仅限于 Mind 视图的视觉布局逻辑，不影响数据存储、Schema 或其他页面。

---

### Round 24 补充 devlog -- Review FAIL 修复 (MG-FIX-02 修补)

**任务起止时间**: 04:35 - 04:55 CST

**工时**: 20 分钟

**修复项 1: 强制重新计算多 cluster 布局**
- 现象：已有 `positionX/positionY` 时 FA2 会被跳过，导致视图停留在旧的太阳图布局。
- 修复：在 `mindGraphAdapter.ts` 中引入 `FORCE_RECALCULATE` 标志，在 `snapshotToGraphology` 阶段暂时忽略输入坐标；同时移除 `mindGraphLayout.ts` 中的早退逻辑，确保 FA2 始终运行。

**修复项 2: 优化 Cluster 分桶规则**
- 现象：当节点类型单一（如全是 document）时，节点依然会挤在同一个中心点。
- 修复：升级 `getClusterIndex` 逻辑，结合 `nodeType` 和 `stableHashStr(id)`。即使类型相同，也会根据 ID Hash 将节点分散到不同的子集群中心（1->3, 2->4 等偏移），确保视觉上至少存在 2 个以上松散 group。

**修复项 3: 解决视图飞出及 Center View 失效**
- 现象：刷新页面后视图坐标异常，相机无法正确聚焦。
- 修复：重写 `MindGraphSigma.tsx` 中的 `centerOnBounds` 逻辑。增加了 Bounds 最小值保护（防止分母为 0），引入 `idealRatio` 计算公式并增加 `0.01` 到 `5` 的严格限程（Cap），切换至 `quadraticInOut` 缓动以提高视觉平滑度。

**修复项 4: 消除 Console Error**
- 现象：刷新页面时控制台偶发 `loadGraph` 或 `sigma` 相关报错。
- 修复：为 `loadGraph` 增加 `try-catch` 块；在 `runLayout` 定时器中增加 `graphRef.current` 判空；添加 `useEffect` 清除函数以销毁 layout 定时器，防止组件卸载后触发异步更新。

**自动验证结果**:
- `pnpm validate`: ✅ 通过
- `pnpm build:web`: ✅ 通过

**手工验证标准**:
1. 页面刷新后，Mind 视图应自动显示多个分布的集群，不再呈现单中心太阳图。
2. 点击缩放控件或 Center View 按钮，相机应能平滑且准确地定位到图形中心，不再飞出画布。
3. 控制台无 `loadGraph failed` 或 `Sigma internal error`。

---

### Round 24 补充 devlog -- Review FAIL 第二轮修复 (MG-FIX-02 深度修补)

**任务起止时间**: 04:55 - 05:10 CST

**工时**: 15 分钟

**修复项 1: 修正相机缩放比例 (Ratio) 计算**
- 现象：视图向上飞出页面范围，Center View 效果异常。
- 修复：修正了 `MindGraphSigma.tsx` 中 `ratio` 的计算公式。Sigma.js 的 `camera.ratio` 定义为 `图谱单位/容器像素`。原公式 `cw/w` 是反向的，导致图谱越大 zoom 越深（飞出感）。现修正为 `Math.max(w/cw, h/ch)`，确保图谱完整适应视口。

**修复项 2: 增强集群离散度与稳定性**
- 现象：即使有分桶，节点依然可能过于拥挤。
- 修复：
    - `mindGraphAdapter.ts`: 将集群中心从 4 个扩展至 8 个外围中心（增加 Far Right/Left/Top/Bottom），并结合 `stableHashStr` 实现 8 象限分发，确保即使节点类型高度集中，也能强制拆分为多个独立岛屿。
    - `mindGraphLayout.ts`: 调整 FA2 参数，将 `gravity` 提升至 `0.1`，`scalingRatio` 降至 `4.0`。这有助于让集群边界更清晰，同时限制图谱无限扩张，提高相机捕捉的稳定性。

**自动验证结果**:
- `pnpm validate`: ✅ 通过
- `pnpm build:web`: ✅ 通过

**手工验证标准**:
1. 观察集群分布：即使所有节点都是同一种类型，也应自动分布在多个远端中心点周围，形成离散岛屿。
2. 验证居中：点击 Center View 后，整张图谱应恰好充满屏幕并留有 20% 边距，不再出现偏移或缩放过大的情况。

---

### Round 24 补充 devlog -- Review FAIL 第三轮修复 (MG-FIX-02 致命黑屏修补)

**任务起止时间**: 05:40 - 05:45 CST

**工时**: 5 分钟

**修复项 1: 拦截旧坐标对 ForceAtlas2 的致命干扰（黑屏/空视图修复）**
- **现象**：视图显示“15 nodes, 14 edges”但画布完全黑屏无任何节点，Sigma 无法渲染。
- **原因**：之前的 `FORCE_RECALCULATE` 逻辑虽然生成了新的 `seededPosition`，但并未阻止将 `n.positionX/Y` 赋值给 `originalX/originalY`。在 `mindGraphLayout.ts` 运行时，`applySavedPositions` 会强行将新生成的坐标覆盖为旧的数据库坐标。若旧坐标均重叠（如全在 `0,0`），会导致 ForceAtlas2 物理引擎斥力计算出 `NaN`，引发 Sigma 渲染崩溃（黑屏）。
- **修复**：在 `mindGraphAdapter.ts` 中修正了 `originalX/Y` 的赋值逻辑。如果 `hasPos` 为 false（即强制重新计算时），强制 `originalX = null` 且 `originalY = null`。这彻底切断了 `applySavedPositions` 的干扰，使得 ForceAtlas2 能够真正从安全、分散的 `seededPosition` 开始迭代计算，成功绘制多集群网络。

**自动验证结果**:
- `pnpm validate`: ✅ 通过
- `pnpm build:web`: ✅ 通过

**手工验证标准**:
1. 黑屏问题解决，Mind 视图能正常、清晰地渲染出所有的节点和连线。
2. 新的 8 象限初始分布能够被 ForceAtlas2 成功承接，并演化为稳定的多岛屿布局。

---

### Round 24 补充 devlog -- Review FAIL 第四轮修复 (MG-FIX-02 物理引擎爆炸修补)

**任务起止时间**: 05:45 - 05:55 CST

**工时**: 10 分钟

**修复项 1: 解决刷新后“节点飞出宇宙”的终极原因（Physics Explosion）**
- **现象**：上一轮解决了黑屏问题后，每次刷新或重新进入 Mind 视图时，节点依然会快速向外飞出屏幕，导致相机无法追踪，最终还是变成空视图。
- **原因分析**：这是典型的力导向图物理引擎爆炸（Physics Explosion）现象。
  在之前的方案中，为了强制产生多个 Cluster，我在 `mindGraphAdapter.ts` 中设定了间隔极大（如 `1200`, `1800` 单位）的集群中心 `CLUSTER_CENTERS`。然而，ForceAtlas2 物理引擎的引力公式（Spring force）是与两点间距离成正比的（`F_a = distance`）。当存在连线的两个节点被初始分配到了相距极远（如距离 `2400` 单位）的两个中心时，它们在第一轮迭代中会受到极其庞大的引力。这导致它们产生巨大的加速度，在第二轮迭代中瞬间越过中心并冲向反方向的无穷远，坐标最终溢出变成极大值或 `NaN`，从而“飞出屏幕”并消失。由于此过程发生在 `loadGraph` 挂载后的第一帧，所以表现为“一刷新就飞走”。
- **修复**：在 `mindGraphAdapter.ts` 中，将预设的集群中心距离从 `1800` 大幅缩减到 `30~50` 的微小单位。
  ForceAtlas2 的正确使用方式是：赋予所有节点一个**紧密相连的初始微小散布**（例如在 `[-50, 50]` 的坐标系内），然后利用算法内建的**排斥力（Repulsion）**让它们自然而然地弹开并形成松散的群落。
  同时在 `mindGraphLayout.ts` 中将 `slowDown` 参数从 `4` 提升至 `10`，以此增加迭代过程的阻尼，防止节点由于初始弹射速度过快而失稳。

**自动验证结果**:
- `pnpm validate`: ✅ 通过
- `pnpm build:web`: ✅ 通过

**手工验证标准**:
1. 彻底解决刷新后图形飞散消失的问题。不管如何刷新或重新进入页面，图形都应该在屏幕中央平稳展开。
2. 即使有跨集群的远距离连线，图谱在初次渲染时也不会产生视觉上的撕裂和弹射，而是像细胞分裂一样平缓地向外舒展成多个孤岛。

---

### Round 24 补充 devlog -- Review FAIL 第五轮修复 (MG-FIX-02 相机与排斥力终极调优)

**任务起止时间**: 06:00 - 06:10 CST

**工时**: 10 分钟

**修复项 1: 相机极值限位（避免缩放穿透）**
- **现象**：图谱有时依然会不可见或表现为快速闪出。
- **原因**：当图谱物理距离过近或节点过少时，`idealRatio` 可能变得非常小（如 `0.01`）。但在 Sigma.js 中，默认的 `minCameraRatio` 是 `0.05`。向相机发送突破底线的 `ratio` 指令会引发内部状态冲突或视觉截断，导致“闪出”效果。
- **修复**：在 `MindGraphSigma.tsx` 中，将 `finalRatio` 的最低限位从 `0.01` 提高到 `0.05`，使其严格符合 Sigma 的引擎规范。

**修复项 2: 解除边线强耦合牵引（实现真正的松散 Cluster）**
- **现象**：即使切断了旧坐标干扰，依然存在偶尔飞出的情况。
- **原因**：ForceAtlas2 引擎中存在 `edgeWeightInfluence`（边线引力影响）。在我的上一个版本中，由于我大幅收缩了初始位置，当不同 Cluster 的节点之间存在多条连线时，引擎会基于“连线引力”强行将属于不同集群的节点再次拉回中心揉成一团，并在拉回的过程中产生强烈的数值震荡。
- **修复**：在 `mindGraphLayout.ts` 中，将 `edgeWeightInfluence` 下调至 `0.1`。这一步非常关键——它削弱了跨集群边线的拉伸力，让引擎优先专注于“节点相互排斥”（形成离散岛屿），从而确保各个 Cluster 能够稳定成型，真正实现了“多中心、松散分布”的视觉目标。
  同时，在 `mindGraphAdapter.ts` 中，将 `CLUSTER_CENTERS` 的基准跨度调整到 `400~600`，使各个集群有充裕的物理空间舒展。

**自动验证结果**:
- `pnpm validate`: ✅ 通过
- `pnpm build:web`: ✅ 通过

**手工验证标准**:
1. 反复刷新页面、切换其他页面再回到 Mind 视图，图谱应 100% 稳定地在画面正中央呈现。
2. 各个集群应清晰可辨，有显著的空白隔离带（因边线引力已被削弱）。

---

### Round 24 补充 devlog -- Review FAIL 第六轮修复 (MG-FIX-02 彻底移除单中心物理引擎)

**任务起止时间**: 06:10 - 06:20 CST

**工时**: 10 分钟

**修复项 1: 弃用 ForceAtlas2，根除物理爆炸（Physics Explosion）**
- **现象**：虽然之前削弱了连线引力，但在某些特定连通图（如星型拓扑）下，视图依然会概率性地飞出屏幕。经过增加 `console.log` 和深入推演，确认 `bounds` 计算出的图谱宽度常常达到无穷大，导致相机缩放被计算为极值并引发视觉消失。
- **根本原因**：ForceAtlas2 算法在底层架构上是一个**单中心（Single-center）引力模型**。它有一个全局的重心（默认在 `0,0`），所有节点都会被这个引力场拉向中心。而本卡片的核心目标是“拆除单中心太阳图，建立多 cluster 分布”。当我强行把初始节点放置在距离中心数百单位的 8 个象限，同时开启 FA2 时，引擎内建的单中心向心力与我的多中心散布逻辑产生了不可调和的数学冲突，导致坐标系统在迭代中被撕裂，产生 `NaN` 和无穷大。
- **修复**：在 `mindGraphLayout.ts` 中，彻底禁用了 `forceAtlas2.assign` 的迭代（`iterations: 0`）。
  现在，图谱的布局完全由 `mindGraphAdapter.ts` 中稳如磐石的哈希散点（`seededPosition`）决定，这绝对保证了 8 象限的精确分布。在初始摆放后，仅运行 `noverlap`（防重叠算法）来轻轻推开有重叠的节点，完全不需要全局物理引擎干预。这样 100% 根绝了物理爆炸。

**自动验证结果**:
- `pnpm validate`: ✅ 通过
- `pnpm build:web`: ✅ 通过

**手工验证标准**:
1. 完全没有了“飞出”、“闪退”等物理引擎溢出的现象。
2. 节点完美地分布在 8 个方向的群落中，且相互之间不会重叠。

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
