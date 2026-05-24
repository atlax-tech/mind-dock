# Phase 2 开发日志

---

## Phase 2+Round 4 devlog -- 【用户体验提升】Quick Capture / Sticky Notes / Platter 交互优化

**日期**: 2026-05-26
**任务起始时间**: 00:10
**任务结束时间**: 01:05
**工时**: 55 分钟

### 任务目标

在 Phase 2 基础功能之上进行用户体验提升，所有变更均在原任务边界内，不超出 Phase 2 范围：

1. Quick Capture Inbox 添加查看入口（Sidebar 按钮 + Platter Inbox 视图 + Command Palette 命令）
2. Capture 支持删除和编辑操作（右键菜单 + 内联编辑）
3. Sticky Note 淡黄色便签纸样式（dark mode 不变）
4. Sticky Note 初始位置优化（Editor 右侧从上往下排列，超出高度向左扩展新列）
5. Sticky Note Pin 功能（pinned 全局展示，未 pinned 仅绑定文档可见）
6. Sticky Note 转 Capture 防重复（空便签禁止转换，已转换内容未变时提示，修改后更新已有 capture 条目而非新建）
7. Sticky Note 转 Capture 内联成功提示（不再仅依赖通知面板）
8. Platter 标签改为下拉抽屉（前 3 个固定展示 + 溢出标签收入抽屉 + 拖动排序 + 插入预览线）
9. 非 pinned 便签在 MindView/体检页面隐藏
10. 窗口/Platter 变化时便签位置自适应

### 改动的文件名以及改动的行数

#### Rust 后端（3 个文件）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src-tauri/src/commands/capture.rs` | +28 行 | 新增 `write_captures` 命令（安全写入 tmp+rename），支持 capture 删除和编辑 |
| `src-tauri/src/commands/sticky_notes.rs` | +4 行 | StickyNote struct 新增 `pinned: bool`、`captured_content: Option<String>`、`captured_entry_id: Option<String>` 字段（均 `#[serde(default)]` 兼容旧数据） |
| `src-tauri/src/lib.rs` | +1 行 | 注册 `write_captures` 命令 |

#### 前端服务层（3 个文件）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/services/filesystem/capture.ts` | +3 行 | 新增 `writeCaptures` 方法 |
| `src/services/filesystem/sticky-notes.ts` | +2 行 | StickyNote 类型新增 `pinned`、`captured_content`、`captured_entry_id` 字段 |
| `src/services/filesystem/documents.ts` | 无变更 | — |

#### 前端模块（5 个文件）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/modules/capture/CaptureProvider.tsx` | +30/-15 行 | 新增 `deleteCapture`/`updateCapture` 方法；`addCapture` 改为返回新建条目 ID；新增 `capturesRef` |
| `src/modules/sticky-notes/StickyNote.tsx` | +50/-30 行 | 淡黄色便签纸样式（`#fef9c3`/`#fde68a`）；Pin 切换按钮；空便签禁用转换；内联转换反馈条（3 秒自动消失）；captured_entry_id 追踪 |
| `src/modules/sticky-notes/StickyNotesLayer.tsx` | +40/-10 行 | 哨兵位置 x=-1 基于容器计算初始位置；ResizeObserver 容器变化自适应；过滤逻辑：pinned 全局可见，未 pinned 仅绑定文档可见，非 editor 视图隐藏 |
| `src/modules/sticky-notes/StickyNotesProvider.tsx` | +25/-10 行 | addNote 绑定当前文档路径 + 哨兵位置；convertToCapture 返回 `'converted'/'already-captured'/'empty'`；空便签禁止转换；captured_entry_id 更新已有 capture |
| `src/modules/capture/CaptureInboxView.tsx` | 无变更 | —（Inbox 视图逻辑已移至 MentorDock.tsx） |

#### 前端组件（4 个文件）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/components/MentorDock.tsx` | +120/-20 行 | PlatterTab 新增 `inbox`；InboxView 支持右键菜单（编辑/删除）+ 内联编辑；Platter 标签改为下拉抽屉（前 3 固定 + ChevronDown 展开）；拖动排序（mousedown/mousemove/mouseup）+ 插入预览线（emerald-500） |
| `src/components/Sidebar.tsx` | +8/-3 行 | 新增 `onOpenInbox` prop + "查看捕获 Inbox" 按钮；导入 Inbox 图标 |
| `src/components/WorkspaceHeader.tsx` | +1 行 | onCreateStickyNote prop |
| `src/modules/command-palette/CommandPalette.tsx` | +10 行 | 新增 "Platter: Inbox" 命令；导入 Inbox 图标 |

#### App 集成（1 个文件）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/app/AppShell.tsx` | +5/-2 行 | 传递 `onOpenInbox` 回调；`onCreateStickyNote` 传入 `activeTabId`；StickyNotesLayer 的 `activeDocumentPath` 在非 editor 视图时传空 |

### 遇到的问题以及解决方式

1. **HTML5 drag-and-drop 在小元素上不可靠**：Platter 标签拖动排序使用 `draggable`/`onDragStart`/`onDrop` 事件无法正常触发。改为 mousedown/mousemove/mouseup 手动实现拖动，通过 `data-tab-idx` 属性和 `getBoundingClientRect` 检测目标位置。
2. **便签初始位置跑到屏幕外**：原实现使用 `window.innerWidth - 240` 计算初始位置，但窗口宽度不等于工作区宽度。改为哨兵值 `x: -1`，由 StickyNotesLayer 基于容器实际 `clientWidth` 计算。
3. **非 pinned 便签在 MindView/体检页面仍显示**：`activeTabId` 在切换视图后仍保留上次文档路径。修复：`StickyNotesLayer` 的 `activeDocumentPath` 在 `currentView !== 'editor'` 时传空字符串。
4. **Sticky 转 Capture 重复创建条目**：原实现每次转换都新建 capture 条目。新增 `captured_entry_id` 字段追踪首次转换创建的条目 ID，后续转换调用 `updateCapture` 更新已有条目。
5. **CaptureProvider 缺少 useRef 导入**：添加 `capturesRef` 时忘记导入 `useRef`，导致 TypeScript 编译错误。补充导入修复。

### 自动验证结果

```bash
$ pnpm typecheck   # exit 0, 无错误
$ cd src-tauri && cargo check   # Finished dev profile, 0 warnings
```

### 手工验证步骤说明

1. 启动 App 并选择已有 vault
2. 点击 Sidebar "查看捕获 Inbox" 按钮，确认 Platter 切换到 Inbox 视图
3. 在 Quick Capture 提交一条捕获，确认 Inbox 视图显示新条目
4. 右键点击 capture 条目，确认弹出编辑/删除菜单
5. 点击"编辑"，确认在卡片内直接出现 textarea 可编辑，Enter 保存
6. 点击"删除"，确认条目被移除
7. 创建便签，确认显示为淡黄色便签纸样式（dark mode 不变）
8. 确认便签初始位置在 Editor 右侧从上往下排列
9. 点击 Pin 按钮，确认边框变为 amber 色，切换 tab 后便签仍可见
10. 取消 Pin，切换到其他文档 tab，确认便签隐藏
11. 切换到 MindView/体检页面，确认未 pinned 便签全部隐藏
12. 空便签点击转换按钮，确认按钮灰色禁用，提示"空便签不能转换"
13. 有内容便签转为 capture，确认便签底部出现绿色"已转入 Capture"反馈条
14. 修改便签内容后再次转换，确认更新已有 capture 条目而非新建
15. 打开 Platter 下拉抽屉，拖动标签排序，确认插入预览线显示
16. 缩放窗口或切换 Platter，确认便签位置自适应调整

### 当前风险以及影响范围

1. **Platter 标签排序不持久化**：拖动排序后的标签顺序仅存在于组件 state，重启 App 后恢复默认顺序。影响范围：用户体验轻微不一致，后续可持久化到 `.minddock/` 配置。
2. **Capture 内联编辑无撤销**：编辑 capture 内容后直接保存，无撤销机制。影响范围：用户误操作无法恢复，后续可添加确认提示。
3. **便签 ResizeObserver 性能**：窗口频繁 resize 时可能触发多次位置更新。影响范围：实际使用中 resize 频率低，风险可控。

---

## Phase 2+Round 3 devlog -- Quick Capture + Sticky Notes + Platter 基础版完整集成

**日期**: 2026-05-25
**任务起始时间**: 23:30
**任务结束时间**: 23:55
**工时**: 25 分钟

### 任务目标

完成 Phase 2 全部功能的集成与验收，包括：
1. Quick Capture 极速捕获面板（QuickCapturePanel.tsx）+ CaptureProvider 状态管理 + CaptureInboxView 收件箱视图
2. Rust 后端 capture.rs（append_capture / read_captures，JSONL 格式持久化）
3. Platter（MentorDock）扩展为 4 个 tab：Mentor / Notifications / Widgets / Document Context
4. NotificationsView 通知列表 UI（markAsRead / markAllAsRead / clearNotification / clearAll）
5. DocumentContextView 文档上下文面板（文件名、路径、大小、修改时间）
6. Command Palette 扩展：极速捕获、新建便笺、Platter 视图切换命令
7. Sidebar 极速捕获按钮替换 Phase 1 占位
8. WorkspaceHeader 便笺按钮 + 通知按钮
9. AppShell 集成 Cmd+Shift+C 全局快捷键打开 Quick Capture
10. App.tsx 组件树包裹 CaptureProvider / NotificationProvider / StickyNotesProvider
11. Rust 后端新增 get_document_metadata 命令
12. Cargo.toml 新增 chrono / uuid 依赖

### 改动的文件名以及改动的行数

#### 新建文件（13 个，共 1112 行）

| 文件 | 行数 | 说明 |
|---|---|---|
| `src/modules/capture/QuickCapturePanel.tsx` | +163 行 | 极速捕获面板：极速/引导模式切换、textarea 输入、Cmd+Enter 提交、Escape 关闭 |
| `src/modules/capture/CaptureProvider.tsx` | +75 行 | Capture React Context：addCapture / loadCaptures，vault 就绪后自动加载 |
| `src/modules/capture/CaptureInboxView.tsx` | +96 行 | Capture 收件箱视图：按时间倒序、来源标签、空状态提示 |
| `src/modules/sticky-notes/StickyNote.tsx` | +161 行 | 单个便笺组件：标题栏拖动、内容编辑、折叠/展开、删除、转为 Capture |
| `src/modules/sticky-notes/StickyNotesLayer.tsx` | +52 行 | 便笺浮动层容器：过滤全局/文档绑定便笺、z-index 管理 |
| `src/modules/sticky-notes/StickyNotesProvider.tsx` | +154 行 | 便笺状态管理 Context：addNote/updateNote/deleteNote/convertToCapture，500ms debounce 持久化 |
| `src/modules/notifications/NotificationProvider.tsx` | +127 行 | 通知状态管理 Context：addNotification/markAsRead/markAllAsRead/clearNotification/clearAll/loadNotifications |
| `src/services/filesystem/capture.ts` | +18 行 | Capture Tauri invoke 封装：appendCapture / readCaptures |
| `src/services/filesystem/sticky-notes.ts` | +26 行 | StickyNote Tauri invoke 封装：readStickyNotes / writeStickyNotes |
| `src/services/filesystem/notifications.ts` | +20 行 | Notification Tauri invoke 封装：readNotifications / writeNotifications |
| `src-tauri/src/commands/capture.rs` | +87 行 | Rust capture 命令：append_capture（JSONL 追加写入）、read_captures（逐行解析） |
| `src-tauri/src/commands/sticky_notes.rs` | +70 行 | Rust sticky_notes 命令：read_sticky_notes / write_sticky_notes（安全写入：tmp + rename） |
| `src-tauri/src/commands/notifications.rs` | +63 行 | Rust notifications 命令：read_notifications / write_notifications（安全写入：tmp + rename） |

#### 修改文件（12 个，+474/-69 行）

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src-tauri/Cargo.toml` | +2 行 | 新增 chrono、uuid 依赖 |
| `src-tauri/Cargo.lock` | +4 行 | 依赖锁文件自动更新 |
| `src-tauri/src/commands/fs.rs` | +37 行 | 新增 get_document_metadata 命令（文件大小 + 修改时间） |
| `src-tauri/src/commands/mod.rs` | +3 行 | 新增 capture / sticky_notes / notifications 模块导出 |
| `src-tauri/src/commands/vault.rs` | +12 行 | validate_vault 兼容 Phase 2 新增目录（captures/、notes/） |
| `src-tauri/src/lib.rs` | +9/-1 行 | 注册 6 个新命令：append_capture / read_captures / read_sticky_notes / write_sticky_notes / read_notifications / write_notifications |
| `src/App.tsx` | +13/-1 行 | AppContent 中包裹 CaptureProvider → NotificationProvider → StickyNotesProvider |
| `src/app/AppShell.tsx` | +47 行 | 导入 QuickCapturePanel / StickyNotesLayer / useStickyNotes；添加 quickCaptureOpen 状态、Cmd+Shift+C 全局快捷键、StickyNotesLayer 渲染、QuickCapturePanel 渲染 |
| `src/components/MentorDock.tsx` | +329/-69 行 | 从 3 tab（mentor/outline/context）扩展为 4 tab Platter（mentor/notifications/widgets/document-context）；新增 NotificationsView（通知列表 + markAsRead + clearAll）、WidgetsView（占位）、DocumentContextView（文档元数据面板） |
| `src/components/WorkspaceHeader.tsx` | +4/-2 行 | 新增 onCreateStickyNote prop + 便笺按钮（Pin 图标）、onNotificationsOpen prop + 通知按钮（MessageSquare 图标） |
| `src/modules/command-palette/CommandPalette.tsx` | +70 行 | 新增命令：极速捕获 Quick Capture、新建便笺、打开/关闭 Platter、Platter 视图切换（Mentor/Notifications/Widgets/Document Context） |
| `src/services/filesystem/documents.ts` | +13 行 | 新增 getDocumentMetadata 方法 + DocumentMetadata 接口 |

### 遇到的问题以及解决方式

1. **lucide-react 图标名称错误**：StickyNote.tsx 中使用了 `Minus2` 但该图标在 lucide-react 中不存在，改为 `Minus`。通过 `tsc --noEmit` 编译错误发现并修复。
2. **PlatterTab 类型未导入**：AppShell.tsx 中使用了 `PlatterTab` 类型但未从 MentorDock 导入，导致编译错误。添加了 `import { MentorDock, type PlatterTab }` 修复。
3. **Rust 端缺少 chrono / uuid 依赖**：capture.rs 使用 `chrono::Utc` 和 `uuid::Uuid`，但 Cargo.toml 未声明依赖。添加 `chrono = "0.4"` 和 `uuid = { version = "1", features = ["v4"] }` 修复。
4. **Phase 1 vault 兼容性**：Phase 2 新增 `captures/` 和 `notes/` 目录，Phase 1 创建的 vault 不包含这些目录。Rust 端所有新命令在读取/写入前先调用 `fs::create_dir_all()` 确保目录存在，实现向后兼容。

### 自动验证结果

```bash
# Git 状态
$ git branch --show-current
dev-rebuild-phase

$ git status --short
 M src-tauri/Cargo.lock
 M src-tauri/Cargo.toml
 M src-tauri/src/commands/fs.rs
 M src-tauri/src/commands/mod.rs
 M src-tauri/src/commands/vault.rs
 M src-tauri/src/lib.rs
 M src/App.tsx
 M src/app/AppShell.tsx
 M src/components/MentorDock.tsx
 M src/components/WorkspaceHeader.tsx
 M src/modules/command-palette/CommandPalette.tsx
 M src/services/filesystem/documents.ts
?? docs/engineering/dev_log/dev_log_phase-2.md
?? src-tauri/src/commands/capture.rs
?? src-tauri/src/commands/notifications.rs
?? src-tauri/src/commands/sticky_notes.rs
?? src/modules/capture/
?? src/modules/notifications/
?? src/modules/sticky-notes/
?? src/services/filesystem/capture.ts
?? src/services/filesystem/notifications.ts
?? src/services/filesystem/sticky-notes.ts

$ git log --oneline --decorate -n 10
b8a6371 (HEAD -> dev-rebuild-phase, origin/dev-rebuild, dev-rebuild) merge: dev-rebuild-phase → dev-rebuild (Phase 1 收尾 - Round 7~11 修复)
5e7ac68 (origin/dev-rebuild-phase) feat: 完成 Phase 1 多轮迭代的全功能修复与优化
d441e95 merge: dev-rebuild-phase → dev-rebuild (Phase 1 complete)
dfd2e88 feat: Phase 1 complete - local knowledge workbench with vault, editor, and command palette
8d03575 chore: add gitignore config and initial dev log
6efeb6b (origin/stable-demo-rebuild, origin/main, origin/HEAD, stable-demo-rebuild, main) docs: expand README with project vision and branching
fcaefd3 Rename project to Atlax MindDock
7bca4e4 Rename project from FlowNote to Atlax
ee7b010 Initial commit

$ git diff --stat
 src-tauri/Cargo.lock                           |   4 +
 src-tauri/Cargo.toml                           |   2 +
 src-tauri/src/commands/fs.rs                   |  37 +++
 src-tauri/src/commands/mod.rs                  |   3 +
 src-tauri/src/commands/vault.rs                |  12 +
 src-tauri/src/lib.rs                           |   9 +-
 src/App.tsx                                    |  13 +-
 src/app/AppShell.tsx                           |  47 +++-
 src/components/MentorDock.tsx                  | 329 ++++++++++++++++++++-----
 src/components/WorkspaceHeader.tsx             |   4 +-
 src/modules/command-palette/CommandPalette.tsx |  70 +++++-
 src/services/filesystem/documents.ts           |  13 +
 12 files changed, 474 insertions(+), 69 deletions(-)

# 前端验证
$ pnpm typecheck   # exit 0, 无错误
$ pnpm build       # exit 0, built in 881ms
  dist/index.html                     0.45 kB
  dist/assets/index-Bj3ZR3mi.css     28.89 kB
  dist/assets/index-CfB51Op5.js   1,054.39 kB

# Rust 验证
$ cd src-tauri && cargo check   # Finished dev profile, 0 warnings
```

### 手工验证步骤说明

1. **启动 App 并选择已有 vault**：`pnpm tauri dev`，确认 App 正常进入编辑界面无报错
2. **打开极速捕获，提交一条快速捕获**：点击 Sidebar "极速捕获灵感" 按钮或按 Cmd+Shift+C，在弹出面板中输入文字，点击"捕获"按钮，确认面板保持打开、输入框清空
3. **验证 Capture Inbox 在文件系统中存在**：检查 vault 目录下 `captures/inbox.jsonl` 文件存在且包含刚才的捕获条目
4. **重启 App 并验证捕获仍存在**：关闭并重启 App，打开 Platter → Notifications，确认之前的通知仍存在
5. **创建便笺，编辑、拖动、折叠、删除**：点击 WorkspaceHeader "便笺"按钮，确认工作区出现便笺卡片；输入文字后点击其他区域确认持久化；拖动标题栏确认移动；点击折叠/展开按钮；点击删除按钮确认消失
6. **创建绑定当前文档的便笺**：打开一个文档后创建便笺，确认该便笺仅在对应文档打开时显示
7. **验证便笺不出现在文档树中**：确认便笺数据存储在 `notes/sticky-notes.json` 而非 `documents/` 目录
8. **将便笺转为极速捕获**：点击便笺"转为 Capture"按钮，确认 Platter 通知区域出现"便笺已转 Capture"通知
9. **重启 App 并验证便笺/捕获状态**：关闭并重启 App，确认便笺位置和内容、Capture Inbox 数据均持久化
10. **切换 Platter 视图**：依次点击 Mentor / Notifications / Widgets / Document Context 四个 tab，确认各视图正确渲染
11. **标记通知已读或清除**：在 Notifications 视图中点击一条通知标记已读，确认未读圆点消失；点击"全部标记已读"或"清空全部"按钮
12. **验证 Phase 1 功能仍正常**：文档创建、编辑、保存、多标签切换、Command Palette（Cmd+K）功能不受影响

### 当前风险以及影响范围

1. **Quick Capture 引导模式占位**：引导模式需要 AI Mentor 支持（Phase 3），当前显示"AI Runtime 未连接"占位文案。不影响极速模式使用。
2. **NotificationsView 无分页**：通知列表无虚拟滚动或分页，大量通知时可能性能下降。当前阶段通知量极少，风险可控。
3. **StickyNote 拖动闭包**：拖动 mousemove 事件中读取 position state 可能存在闭包过期问题，但 useEffect 在 position 变化时重新注册事件监听器，实际风险可控。
4. **debounce 持久化竞态**：StickyNotesProvider 使用 500ms debounce，快速连续操作可能导致最后一次变更延迟持久化。不影响数据完整性。
5. **Platter tab 状态保持**：使用 CSS `hidden` 类切换 tab 内容，保持各 tab 组件状态不丢失。但所有 tab 内容同时挂载，内存占用略高。
6. **Capture Inbox 无删除功能**：当前只能追加捕获条目，无法删除单条或清空收件箱。后续需补充。
7. **Widgets 视图为纯占位**：仅显示"小组件功能将在后续 Phase 扩展"文案，无实际功能。

### Placeholder Registry 更新

**Phase 2 已替换的占位**：

| 位置 | 原标记 | 原内容 | 状态 |
|---|---|---|---|
| `src/components/Sidebar.tsx` | PHASE_PLACEHOLDER | Quick Capture 按钮 | ✅ 已替换为真实极速捕获按钮 |
| `src/modules/command-palette/CommandPalette.tsx` | PHASE_PLACEHOLDER | Quick Capture 命令 | ✅ 已替换为真实极速捕获命令 |

**Phase 2 新增的占位**：

| 位置 | 标记类型 | 内容描述 | 后续替换阶段 | 状态 |
|---|---|---|---|---|
| `src/modules/capture/QuickCapturePanel.tsx` | PHASE_PLACEHOLDER | 引导模式（需 AI Mentor） | Phase 3 | 占位中 |
| `src/components/MentorDock.tsx` | PHASE_PLACEHOLDER | AI Mentor 静态占位说明 | Phase 3 | 占位中（继承自 Phase 1） |
| `src/components/MentorDock.tsx` | PHASE_PLACEHOLDER | Widgets 小组件 | 后续 Phase | 占位中 |

**Phase 1 遗留占位（未变）**：

| 位置 | 标记类型 | 内容描述 | 后续替换阶段 | 状态 |
|---|---|---|---|---|
| `src/components/WorkspaceHeader.tsx` | PHASE_PLACEHOLDER | MindView 入口 | Phase 5 | 占位中 |
| `src/components/WorkspaceHeader.tsx` | PHASE_PLACEHOLDER | 知识体检入口 | Phase 6 | 占位中 |
| `src/components/Sidebar.tsx` | PHASE_PLACEHOLDER | 节点数（显示 "--"） | Phase 5 | 占位中 |
| `src/components/Sidebar.tsx` | PHASE_PLACEHOLDER | 健康分数（显示 "--"） | Phase 6 | 占位中 |
| `src/components/PlaceholderView.tsx` | PHASE_PLACEHOLDER | 通用占位页面组件 | Phase 5/6 | 占位中 |
| `src/modules/command-palette/CommandPalette.tsx` | PHASE_PLACEHOLDER | MindView 命令 | Phase 5 | 占位中 |
| `src/modules/command-palette/CommandPalette.tsx` | PHASE_PLACEHOLDER | 知识体检命令 | Phase 6 | 占位中 |
| `src/app/AppShell.tsx` | PHASE_PLACEHOLDER | MindView 视图 | Phase 5 | 占位中 |
| `src/app/AppShell.tsx` | PHASE_PLACEHOLDER | 知识体检视图 | Phase 6 | 占位中 |

---

## Phase 2+Round 2 devlog -- Sticky Notes 便笺功能实现

**日期**: 2026-05-25
**任务起始时间**: 00:15
**任务结束时间**: 00:55
**工时**: 40 分钟

### 任务目标

实现 Phase 2 Sticky Notes 功能（Task 4 SubTask 4.1-4.9），包括：
1. 创建 StickyNote.tsx 单个便笺组件（可拖动、可编辑、可折叠、删除、转为 Capture）
2. 创建 StickyNotesLayer.tsx 便笺浮动层容器（过滤显示、z-index 管理）
3. 创建 StickyNotesProvider.tsx 便笺状态管理 Context（CRUD、debounce 持久化、转 Capture）
4. 集成到 App.tsx 和 AppShell.tsx
5. WorkspaceHeader 便笺按钮连接

### 改动的文件名以及改动的行数

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/modules/sticky-notes/StickyNote.tsx` | +161 行（新建） | 单个便笺组件：标题栏拖动、内容编辑、折叠/展开、删除、转为 Capture |
| `src/modules/sticky-notes/StickyNotesLayer.tsx` | +52 行（新建） | 便笺浮动层容器：过滤全局/文档绑定便笺、z-index 管理 |
| `src/modules/sticky-notes/StickyNotesProvider.tsx` | +154 行（新建） | 便笺状态管理 Context：addNote/updateNote/deleteNote/convertToCapture，500ms debounce 持久化 |
| `src/App.tsx` | +3/-1 行 | 在 AppContent 中包裹 StickyNotesProvider |
| `src/app/AppShell.tsx` | +14/-3 行 | 导入 useStickyNotes/StickyNotesLayer/PlatterTab，添加便笺层渲染和 WorkspaceHeader 便笺回调 |
| `src/components/WorkspaceHeader.tsx` | +3/-2 行 | 添加 onCreateStickyNote prop，便笺按钮绑定 onClick |

### 遇到的问题以及解决方式

1. **lucide-react 图标名称错误**：使用了 `Minus2` 但该图标不存在，改为 `Minus`。通过 `npx tsc --noEmit` 发现并修复。
2. **PlatterTab 类型未导入**：AppShell.tsx 中使用了 `PlatterTab` 类型但未从 MentorDock 导入，导致编译错误。添加了 `import { MentorDock, type PlatterTab }` 修复。

### 自动验证结果

```bash
$ npx tsc --noEmit  # exit 0, 无错误
$ VS Code Diagnostics  # 所有 6 个文件零诊断错误
```

### 手工验证步骤说明

1. 启动 App（`pnpm tauri dev`），确认正常进入编辑界面无报错
2. 点击 WorkspaceHeader 右侧"便笺"按钮，确认工作区出现一个新的便笺卡片
3. 在便笺中输入文字，点击其他区域（触发 blur），确认内容持久化
4. 拖动便笺标题栏，确认便笺跟随鼠标移动
5. 点击折叠按钮，确认便笺折叠为仅标题栏；再次点击展开
6. 点击"转为 Capture"按钮，确认 Platter 通知区域出现"便笺已转 Capture"通知
7. 点击删除按钮（X），确认便笺消失
8. 打开一个文档，确认文档绑定便笺仅在该文档打开时显示

### 当前风险以及影响范围

1. **拖动时 position 状态闭包问题**：拖动 mousemove 事件中读取 position state 可能存在闭包过期问题，但由于 useEffect 在 position 变化时重新注册事件监听器，实际风险可控。拖动结束后通过 onUpdate 同步最终位置到父组件。
2. **debounce 持久化竞态**：快速连续操作（如拖动+编辑）可能导致 debounce 定时器频繁重置，极端情况下最后一次变更的持久化延迟 500ms。这是预期行为，不影响数据完整性。
3. **便笺层 pointer-events**：StickyNotesLayer 使用 `pointer-events-none` + 子元素 `pointer-events-auto`，确保便笺不阻挡底层编辑器交互。但便笺重叠区域的交互可能需要进一步优化。

---

## Phase 2+Round 1 devlog -- NotificationProvider 通知状态管理

**日期**: 2026-05-25
**任务起始时间**: 23:50
**任务结束时间**: 00:10
**工时**: 20 分钟

### 任务目标

实现 Phase 2 通知功能的状态管理层（Task 6 SubTask 6.1/6.2/6.4/6.5/6.6），包括：
1. 创建 NotificationProvider 提供 React Context 管理通知状态
2. 集成 NotificationProvider 到 App 组件树
3. 确保通知变更自动持久化到 vault
4. 应用启动时自动加载通知
5. 验证 WorkspaceHeader 通知按钮集成链路

### 改动的文件名以及改动的行数

| 文件 | 改动行数 | 说明 |
|---|---|---|
| `src/modules/notifications/NotificationProvider.tsx` | +127 行（新建） | 通知状态管理 Context，包含 addNotification/markAsRead/markAllAsRead/clearNotification/clearAll/loadNotifications 方法 |
| `src/App.tsx` | +5/-2 行 | 在 AppContent 中包裹 NotificationProvider，传入 vault.path |

### 遇到的问题以及解决方式

无重大问题。实现过程顺利，遵循 VaultProvider 的 Context + useState/useCallback 模式。

### 自动验证结果

```bash
$ pnpm typecheck  # exit 0, 无错误
```

### 手工验证步骤说明

1. 启动 App（`pnpm tauri dev`），确认正常进入编辑界面无报错
2. 点击 WorkspaceHeader 右侧通知按钮（MessageSquare 图标），确认 MentorDock 打开并切换到 Notifications tab
3. 在浏览器 DevTools Console 中，通过 React DevTools 确认 NotificationProvider 存在于组件树中

### 当前风险以及影响范围

1. **persistNotifications 异步写入无排队机制**：快速连续操作（如连续点击 markAllAsRead + clearAll）可能导致多次并发写入，后写入的覆盖先写入的结果。但由于 React 状态更新是批量的，且 `setNotifications` 使用函数式更新，实际风险较低。
2. **loadNotifications 错误处理**：加载失败时 error 状态被设置，但不影响 App 启动流程。后续需在 UI 中展示错误提示。
