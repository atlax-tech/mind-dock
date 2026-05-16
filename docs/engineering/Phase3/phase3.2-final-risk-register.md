# Phase 3.2 Final Risk Register — P32-CLOSEOUT-003

> 本文档为 Phase 3.2 收尾阶段的风险登记，记录已解决、待解决、延期及观察项。
> 生成日期：2026-05-16

---

## 1. Solved in P32-CLOSEOUT-003

以下风险/缺陷在本轮收尾中已确认解决：

| # | 风险项 | 解决方式 | 验证状态 |
|---|--------|----------|----------|
| 1 | Review suggestions navigation — 建议项不可点击，无法导航至处理上下文 | suggestions 现在可点击并导航至对应的处理上下文 (Dock/Mind/Editor)，但保持只读 — 不执行破坏性操作 | ✅ 已验证 |
| 2 | Recommendation shown tracking — Dock 推荐队列未追踪推荐项是否已展示 | Dock 推荐队列现在在首次展示及 drawer/inspector 打开时标记推荐为 shown，带去重保护 | ✅ 已验证 |
| 3 | Editor Source Packet — 显示虚假的 "0 个项目" 静态描述 | 现在基于 draft sourceEntryId/sourceType 展示真实源数据 | ✅ 已验证 |
| 4 | Editor metadata — tags 和 project 未暴露且不可编辑 | Inspector 中 tags 和 project 最小化暴露且可编辑，collection 显示为 Planned | ✅ 已验证 |
| 5 | Settings/Toolbox planned boundary — "更改位置" 按钮无禁用状态，Cloud/WebDAV/S3 未从路线图中移除 | "更改位置" 按钮具有正确的 disabled 状态及 tooltip，Cloud/WebDAV/S3 已从当前路线图移除，Toolbox 不显示为可安装 | ✅ 已验证 |
| 6 | Dock weak taxonomy parity — weaklyClassifiedEntries 过滤器与 LocalHealthReport 不一致 | weaklyClassifiedEntries 过滤器现在与 LocalHealthReport 完全一致 | ✅ 已验证 |
| 7 | Home/Daily Brief — BriefHint 导航不精确，Home Mind 条目不可点击 | BriefHint 精确导航，Home Mind 条目可点击 | ✅ 已验证 |

---

## 2. Phase 3.3 Must Take

以下风险/技术债必须在 Phase 3.3 中优先处理：

| # | 风险项 | 影响范围 | 严重度 | 说明 |
|---|--------|----------|--------|------|
| 1 | **workspaceId missing** | 数据隔离 | 🔴 高 | 当前 schema 仅使用 userId，无法实现多工作区隔离 |
| 2 | **_legacy fallback** | 数据迁移 | 🔴 高 | 旧数据归属于 '_legacy' 用户，迁移时存在归属混乱风险 |
| 3 | **localStorage boundary** | 数据一致性 | 🟡 中 | auth/events/editor settings 直接使用 localStorage 而非 repository，绕过数据层 |
| 4 | **UI direct Dexie table access** | 架构耦合 | 🟡 中 | DraftEditorView 直接导入 entriesTable，localHealthReport 直接导入 tables，破坏仓储抽象 |
| 5 | **Dock Collection/Tag CRUD** | 功能完整性 | 🟡 中 | collections 和 tags 可查看但无法从 UI 创建/编辑/删除 |
| 6 | **Review suggestions → Dock maintenance action queue** | 工作流闭环 | 🟡 中 | 建议可导航但不创建可执行任务 |
| 7 | **similarity/scoring/feedback learning** | 智能推荐 | 🟡 中 | 无文本相似度、无时间衰减评分、无反馈学习循环 |

---

## 3. Phase 3.3 Cleanup

以下为 Phase 3.3 应清理的技术债和功能缺口：

| # | 清理项 | 说明 |
|---|--------|------|
| 1 | **Recommendation auto-trigger** | 推荐仅在用户显式操作时生成，不会在内容创建时自动触发 |
| 2 | **Dock batch operations** | 无多选、无批量归档/删除/分类功能 |
| 3 | **Archive/Hidden/Deleted lifecycle unification** | archived entries、hidden mind nodes、discarded drafts 之间语义混淆，生命周期未统一 |
| 4 | **Tag/Project source of truth** | entry.tags string[] vs TagRecord vs EntryTagRelationRecord 存在冗余，单一事实来源未确立 |

---

## 4. Phase 4 / Desktop Deferred

以下风险/功能明确延期至 Phase 4 或 Desktop 阶段：

| # | 延期项 | 延期原因 | 阶段归属 |
|---|--------|----------|----------|
| 1 | **Review report export** | 故意保持禁用，导出应在 Desktop App 打包 / 文件适配器边界明确后处理 | Phase 4 |
| 2 | **Import/Export full service** | 无文件导入/导出管道 | Phase 4 |
| 3 | **Cloud/Desktop vault path** | 无真实文件系统访问，当前仅限浏览器 | Desktop |
| 4 | **Cloud/WebDAV/S3 storage** | 不在当前路线图中，属于未来考量，**不是计划功能** | 未规划 |
| 5 | **Seed / seed-mind route** | 按 PM 指示故意延期至 Desktop 打包 / 发布安全闸门 | Desktop |

---

## 5. Observation Only

以下为观察项，当前无需立即行动，但需持续关注：

| # | 观察项 | 说明 |
|---|--------|------|
| 1 | **Full IndexedDB scan performance** | health report 和 Dock 计算需扫描全部记录，大数据集下可能性能退化 |
| 2 | **External network requests** | 主路径中未发现外部网络请求，本地架构得以维持 |
| 3 | **Build includes /seed and /seed-mind routes** | 生产构建暴露了 demo 数据路由，发布前应加以防护 |
