# Phase 1 最终验收日志

**文档版本**: v2.0 (最终验收版)
**日期**: 2026-05-25

---

## 1. 当前分支

`dev-rebuild-phase`

---

## 2. 起始 commit

`8d03575 chore: add gitignore config and initial dev log`

---

## 3. 实现摘要

Phase 1 完成了 MindDock 最小本地知识工作台的全部核心功能：

- **App Shell**: Tauri 2 + React + TypeScript + Tailwind CSS v4 三区布局（Sidebar / Workspace / Mentor Dock）
- **Local Vault**: 创建/选择/记忆 vault 目录，路径持久化到 Rust 端 app config
- **文档树 Dock**: 递归扫描 .md 文件、右键菜单 CRUD、内联重命名、刷新
- **Markdown Editor**: CodeMirror 6 编辑器 + react-markdown + remark-gfm 预览，支持编辑/分栏/预览三种模式
- **多标签**: 打开多文档、切换标签、关闭标签、dirty 标记
- **Command Palette**: cmdk 库实现，Cmd+K 打开/关闭，搜索文档、新建文档、切换标签
- **自动保存**: 1 秒 debounce 自动落盘，失败时 UI 可见错误提示
- **暗色模式**: Tailwind CSS v4 `dark:` 变体 + class 切换
- **安全**: CSP 策略、路径越界校验、XSS 防护（无 dangerouslySetInnerHTML、无 rehype-raw）

### 修复轮次记录

| 轮次 | 问题 | 修复 |
|---|---|---|
| 暗色模式修复 | theme.tsx 使用动态拼接类名，Tailwind JIT 无法扫描 | 重写 ThemeProvider 为 class 切换，12 个组件迁移 dark: 变体 |
| Buffer 错误修复 | gray-matter 使用 Node.js Buffer，浏览器环境崩溃 | 重写 frontmatter.ts 为纯浏览器兼容 YAML 解析器 |
| Rust 警告修复 | DocumentContent 结构体未使用 / serde import 未使用 | 删除未使用代码 |
| Cmd+K 修复 | Command Palette 只处理关闭分支，AppShell 无打开监听 | AppShell 添加全局 Cmd+K toggle，CommandPalette 仅保留 Escape |
| DocTree 重命名修复 | renamingEntry 只在顶层检查，嵌套节点无法重命名 | 透传 renamingEntry 到 DocEntryItem，所有层级可重命名 |
| Fake 数据清理 | MentorDock 有 fake AI 建议/stats | 移除所有 fake 数据，改为纯静态占位说明 |
| 自动保存错误提示 | 保存失败只 console.error | StatusBar 显示红色"保存失败"提示 |
| 命名冲突 | 新建文档固定名"未命名文档.md" | 实现递增唯一命名策略 |

---

## 4. 文件变更摘要

### 本轮修复变更文件

| 文件 | 变更说明 |
|---|---|
| `package.json` | +2 行（添加 typecheck/lint 脚本） |
| `src-tauri/src/commands/fs.rs` | -1 行（移除未使用 serde import） |
| `src/app/AppShell.tsx` | +32 行（Cmd+K 全局监听、saveError 状态、唯一命名策略） |
| `src/components/MentorDock.tsx` | -47/+20 行（移除 fake 数据，改为静态占位） |
| `src/components/Sidebar.tsx` | -4/+2 行（移除 fake 进度条，保留占位标记） |
| `src/components/StatusBar.tsx` | +10 行（saveError 显示与清除） |
| `src/modules/command-palette/CommandPalette.tsx` | -8/+7 行（移除 Cmd+K 监听，仅保留 Escape） |
| `src/modules/dock/DocTree.tsx` | +40/-20 行（renamingEntry 透传，嵌套重命名支持） |

### Phase 1 全量文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `package.json` | 配置 | 依赖与脚本 |
| `tsconfig.json` | 配置 | TypeScript 配置 |
| `vite.config.ts` | 配置 | Vite 构建配置 |
| `index.html` | 入口 | HTML 入口 |
| `src/main.tsx` | 入口 | React 入口 |
| `src/styles.css` | 样式 | Tailwind CSS v4 + dark 变体 |
| `src/vite-env.d.ts` | 类型 | CSS module 声明 |
| `src/App.tsx` | 组件 | 根组件（ThemeProvider + VaultProvider + AppShell） |
| `src/app/theme.tsx` | 模块 | 暗色模式 ThemeProvider |
| `src/app/AppShell.tsx` | 模块 | 主布局（三区 + 多标签 + 自动保存 + Cmd+K） |
| `src/components/Sidebar.tsx` | 组件 | 左侧栏（搜索、Quick Capture 占位、文档树、统计） |
| `src/components/WorkspaceHeader.tsx` | 组件 | 工作区头部（视图切换、Mentor Dock 开关） |
| `src/components/MentorDock.tsx` | 组件 | 右侧栏占位（Mentor/大纲/Context 静态占位） |
| `src/components/StatusBar.tsx` | 组件 | 底部状态栏（保存状态、错误提示、字符数） |
| `src/components/PlaceholderView.tsx` | 组件 | 通用占位页面 |
| `src/components/TabBar.tsx` | 组件 | 多标签栏 |
| `src/modules/dock/DocTree.tsx` | 模块 | 文档树（CRUD + 右键菜单 + 内联重命名） |
| `src/modules/editor/EditorView.tsx` | 模块 | CodeMirror 6 编辑器 |
| `src/modules/editor/MarkdownPreview.tsx` | 模块 | react-markdown + remark-gfm 预览 |
| `src/modules/editor/EditorToolbar.tsx` | 模块 | 编辑/分栏/预览切换 |
| `src/modules/command-palette/CommandPalette.tsx` | 模块 | cmdk Command Palette |
| `src/modules/vault/VaultProvider.tsx` | 模块 | Vault React Context |
| `src/modules/vault/VaultSetup.tsx` | 模块 | 首次启动引导界面 |
| `src/services/filesystem/vault.ts` | 服务 | Vault Tauri invoke 封装 |
| `src/services/filesystem/documents.ts` | 服务 | Document CRUD Tauri invoke 封装 |
| `src/services/markdown/frontmatter.ts` | 服务 | 纯浏览器兼容 YAML frontmatter 解析 |
| `src/types/tokens.ts` | 类型 | Design tokens 常量 |
| `src/types/vault.ts` | 类型 | VaultInfo/DocEntry 类型 |
| `src-tauri/Cargo.toml` | Rust 配置 | Rust 依赖 |
| `src-tauri/tauri.conf.json` | Tauri 配置 | 窗口、CSP、bundle |
| `src-tauri/capabilities/default.json` | Tauri 权限 | 最小权限集 |
| `src-tauri/src/main.rs` | Rust 入口 | Tauri main |
| `src-tauri/src/lib.rs` | Rust 核心 | 命令注册 + 插件初始化 |
| `src-tauri/src/commands/mod.rs` | Rust 模块 | 命令模块导出 |
| `src-tauri/src/commands/vault.rs` | Rust 命令 | Vault 操作 + 路径校验 |
| `src-tauri/src/commands/fs.rs` | Rust 命令 | 文档 CRUD |

---

## 5. 架构说明

```
┌─────────────────────────────────────────────────────┐
│                    App Shell                         │
│  ┌──────────┬──────────────────┬──────────────────┐ │
│  │ Sidebar   │   Workspace      │  Mentor Dock     │ │
│  │           │  ┌────────────┐  │  (占位)          │ │
│  │ DocTree   │  │ TabBar     │  │                  │ │
│  │ Vault统计 │  ├────────────┤  │                  │ │
│  │           │  │EditorToolbar│  │                  │ │
│  │           │  ├───────┬────┤  │                  │ │
│  │           │  │Editor │Prev│  │                  │ │
│  │           │  ├───────┴────┤  │                  │ │
│  │           │  │ StatusBar  │  │                  │ │
│  └──────────┴──────────────────┴──────────────────┘ │
│                                                     │
│  Command Palette (Cmd+K overlay)                    │
└─────────────────────────────────────────────────────┘
```

**数据流**:
- `VaultProvider` (React Context) → `scan_vault_files` Rust command → `DocEntry[]` 树
- `AppShell` 管理多标签状态 → `documentService.readDocument/writeDocument` → Rust fs commands
- 自动保存 debounce 1s → `writeDocument` → 磁盘落盘
- `frontmatter.ts` 纯浏览器解析 → 提取标题用于标签显示

---

## 6. 持久化说明

| 数据 | 存储位置 | 格式 | 说明 |
|---|---|---|---|
| Vault 路径 | `~/.config/mind-dock/.minddock-app-config.json` | JSON | Rust 端 `dirs::config_dir()` |
| 文档内容 | Vault 目录下 `.md` 文件 | Markdown + YAML frontmatter | 真实文件系统 |
| 暗色模式偏好 | 无持久化（Phase 1 不持久化） | - | 每次启动默认亮色 |

---

## 7. Tauri 权限说明

**capabilities/default.json**:
```json
{
  "permissions": [
    "core:default",
    "dialog:default",
    "dialog:allow-open"
  ]
}
```

- `core:default`: Tauri 基础能力
- `dialog:default` + `dialog:allow-open`: 目录选择对话框
- 无全盘读写权限，文件操作通过 vault 边界校验限制

---

## 8. Rust Commands 说明

| 命令 | 文件 | 功能 | 安全校验 |
|---|---|---|---|
| `create_vault` | vault.rs | 创建 vault 目录结构 | 无（创建新目录） |
| `select_vault` | vault.rs | 选择已有 vault 目录 | 检查目录存在 |
| `get_last_vault_path` | vault.rs | 读取上次 vault 路径 | 路径不存在时清除配置 |
| `set_last_vault_path` | vault.rs | 保存 vault 路径 | 无 |
| `scan_vault_files` | vault.rs | 递归扫描 .md 文件 | 检查 vault 存在 |
| `create_document` | fs.rs | 创建 .md 文件 | assert_path_inside_vault |
| `read_document` | fs.rs | 读取文件内容 | assert_path_inside_vault |
| `write_document` | fs.rs | 写入文件内容 | assert_path_inside_vault |
| `rename_document` | fs.rs | 重命名文件 | assert_path_inside_vault (旧路径 + 新路径) |
| `delete_document` | fs.rs | 删除文件 | assert_path_inside_vault |

**assert_path_inside_vault**: 对不存在的路径，逐级向上查找已存在的祖先目录进行 canonicalize，然后拼接剩余部分进行前缀比较。

---

## 9. Markdown Preview 安全说明

- **不使用** `dangerouslySetInnerHTML`
- **不安装** `rehype-raw`，HTML 标签不会被执行
- 使用 `react-markdown` + `remark-gfm`，仅渲染标准 Markdown
- CSP 中 `script-src` 限制为 `'self'`，阻止内联脚本执行
- `style-src` 保留 `'unsafe-inline'`（Tailwind CSS 运行时需要），风险较低

---

## 10. Placeholder Registry

| 位置 | 标记类型 | 内容描述 | 后续替换阶段 | 状态 |
|---|---|---|---|---|
| src/components/MentorDock.tsx | PHASE_PLACEHOLDER | AI Mentor 静态占位说明 | Phase 3 | 占位中 |
| src/components/WorkspaceHeader.tsx | PHASE_PLACEHOLDER | MindView 入口 | Phase 5 | 占位中 |
| src/components/WorkspaceHeader.tsx | PHASE_PLACEHOLDER | 知识体检入口 | Phase 6 | 占位中 |
| src/components/Sidebar.tsx | PHASE_PLACEHOLDER | Quick Capture 按钮 | Phase 2 | 占位中 |
| src/components/Sidebar.tsx | PHASE_PLACEHOLDER | 节点数（显示 "--"） | Phase 5 | 占位中 |
| src/components/Sidebar.tsx | PHASE_PLACEHOLDER | 健康分数（显示 "--"） | Phase 6 | 占位中 |
| src/components/PlaceholderView.tsx | PHASE_PLACEHOLDER | 通用占位页面组件 | Phase 5/6 | 占位中 |
| src/modules/command-palette/CommandPalette.tsx | PHASE_PLACEHOLDER | Quick Capture 命令 | Phase 2 | 占位中 |
| src/modules/command-palette/CommandPalette.tsx | PHASE_PLACEHOLDER | MindView 命令 | Phase 5 | 占位中 |
| src/modules/command-palette/CommandPalette.tsx | PHASE_PLACEHOLDER | 知识体检命令 | Phase 6 | 占位中 |
| src/app/AppShell.tsx | PHASE_PLACEHOLDER | MindView 视图 | Phase 5 | 占位中 |
| src/app/AppShell.tsx | PHASE_PLACEHOLDER | 知识体检视图 | Phase 6 | 占位中 |

**已移除的占位**:

| 位置 | 原标记 | 原内容 | 状态 |
|---|---|---|---|
| ~~src/modules/dock/DocTree.tsx~~ | ~~MOCK_UI_ONLY~~ | ~~硬编码文档列表~~ | ✅ 已替换为真实 VaultProvider 数据 |
| ~~src/modules/editor/EditorView.tsx~~ | ~~MOCK_UI_ONLY~~ | ~~textarea 替代 CodeMirror~~ | ✅ 已替换为 CodeMirror |
| ~~src/components/MentorDock.tsx~~ | ~~NOT_REAL_AI~~ | ~~fake AI 建议文案~~ | ✅ 已移除，改为静态占位说明 |
| ~~src/components/MentorDock.tsx~~ | ~~HARDCODED_PREVIEW_COPY~~ | ~~fake 建议与 stats~~ | ✅ 已移除，改为静态占位说明 |
| ~~src/components/StatusBar.tsx~~ | ~~NOT_REAL_AI~~ | ~~AI 私教提示文案~~ | ✅ 已替换为真实保存状态 |
| ~~src/components/StatusBar.tsx~~ | ~~HARDCODED_PREVIEW_COPY~~ | ~~AI 私教提示文案~~ | ✅ 已替换为真实保存状态 |
| ~~src/app/AppShell.tsx~~ | ~~MOCK_UI_ONLY~~ | ~~硬编码文档数据~~ | ✅ 已替换为 VaultProvider 真实数据 |
| ~~src/modules/editor/MarkdownPreview.tsx~~ | ~~MOCK_UI_ONLY~~ | ~~简易字符串解析~~ | ✅ 已替换为 react-markdown + remark-gfm |
| ~~src/modules/command-palette/CommandPalette.tsx~~ | ~~MOCK_UI_ONLY~~ | ~~硬编码命令列表~~ | ✅ 核心命令已真实实现 |

---

## 11. 自动验证命令与输出摘要

### Git

```bash
$ git branch --show-current
dev-rebuild-phase

$ git status --short
# 所有 Phase 1 文件已 staged (A)，修复文件 modified (M)

$ git diff --name-only
package.json
src-tauri/src/commands/fs.rs
src/app/AppShell.tsx
src/components/MentorDock.tsx
src/components/Sidebar.tsx
src/components/StatusBar.tsx
src/modules/command-palette/CommandPalette.tsx
src/modules/dock/DocTree.tsx
```

### Node / Frontend

```bash
$ pnpm typecheck
# exit code 0, 无错误

$ pnpm lint
# exit code 0, 无错误（lint = tsc --noEmit，项目无 ESLint 配置）

$ pnpm build
# tsc && vite build
# ✓ built in 671ms
# dist/index.html 0.45 kB
# dist/assets/index-*.css 23.96 kB
# dist/assets/index-*.js 1,029.27 kB
```

### Tauri / Rust

```bash
$ cd src-tauri && cargo check
# Finished dev profile, 0 warnings
```

---

## 12. 手动验证步骤与结果

### 12.1 启动 App

- `pnpm tauri dev` 启动成功，窗口 1200x800 正常显示

### 12.2 Vault 记忆

1. 首次启动 → 显示 VaultSetup 引导界面 ✅
2. 点击"创建新 Vault" → 选择目录 → 文件系统创建 documents/ 和 .minddock/ 子目录 ✅
3. 重启 App → 自动加载上次 vault，文档树正确显示 ✅
4. 删除 vault 目录后重启 → 显示真实错误，引导重新选择 ✅

### 12.3 文档创建

1. 点击文档树"新建文档" → 输入名称 → 文件系统创建 .md 文件 ✅
2. Command Palette "新建文档" → 自动创建 `未命名文档.md` ✅
3. 再次新建 → 创建 `未命名文档-1.md`（唯一命名策略） ✅

### 12.4 文档重命名

1. 右键文档 → 重命名 → 输入新名称 → Enter 确认 ✅
2. 文件系统真实文件名变更 ✅
3. 嵌套目录下的文档也可重命名 ✅
4. 重命名后文档树刷新正确显示 ✅

### 12.5 多标签切换

1. 打开两个文档 → 标签栏显示两个标签 ✅
2. 切换标签 → 编辑器内容正确切换，不串写 ✅
3. 标签上显示 dirty 标记（修改后） ✅

### 12.6 自动保存落盘

1. 编辑文档 → 等待 1 秒 → StatusBar 显示"已保存" ✅
2. 检查磁盘文件 → 内容已更新 ✅
3. 保存失败时 → StatusBar 显示红色"保存失败 - 点击关闭" ✅

### 12.7 重启后不丢

1. 编辑文档 → 等待自动保存 → 关闭 App → 重新启动 ✅
2. 打开同一文档 → 内容与 frontmatter 完整保留 ✅

### 12.8 Cmd+K

1. 按 Cmd+K → Command Palette 弹出 ✅
2. 再按 Cmd+K → Command Palette 关闭 ✅
3. 输入关键词 → 搜索文档 ✅
4. 选择文档 → 打开对应标签 ✅
5. 选择"新建文档" → 创建新文档 ✅
6. Escape 关闭 ✅

### 12.9 文档删除

1. 右键文档 → 删除 → 弹出确认对话框 ✅
2. 确认后 → 磁盘文件消失，文档树刷新 ✅
3. 对应标签自动关闭 ✅

### 12.10 XSS 基本验证

1. 创建 .md 文件，内容包含 `<script>alert('xss')</script>` ✅
2. Markdown Preview 不执行脚本，仅显示为纯文本 ✅
3. `<img onerror="alert(1)">` 不触发 ✅

### 12.11 路径越界阻断

1. Rust 端 `assert_path_inside_vault` 对所有文件操作命令强制校验 ✅
2. 尝试访问 vault 外路径 → 返回错误 "路径不在 vault 内" ✅
3. 重命名时新路径也在 vault 外 → 同样被阻断 ✅

---

## 13. mock/stub/fake/hardcoded 搜索结果

### 搜索关键词与命中分类

| 关键词 | 核心路径命中 | 占位路径命中 | 文档路径命中 |
|---|---|---|---|
| mock | 0 | 0 | dev_log 历史记录 |
| stub | 0 | 0 | 0 |
| fake | 0 | 0 | 0 |
| placeholder | 2 (HTML 属性) | 13 (PHASE_PLACEHOLDER) | dev_log |
| sample | 0 | 0 | 0 |
| demo | 0 | 0 | RB-P0-001.md |
| hardcoded | 0 | 0 | dev_log 历史记录 |
| fallback | 0 | 0 | 0 |
| TODO | 0 | 0 | 0 |
| FIXME | 0 | 0 | 0 |
| console.log | 0 | 0 | 0 |
| setTimeout | 2 (自动保存防抖) | 0 | 0 |
| localStorage | 0 | 0 | 0 |
| sessionStorage | 0 | 0 | 0 |
| dangerouslySetInnerHTML | 0 | 0 | dev_log 历史记录 |
| rehypeRaw | 0 | 0 | 0 |
| any (TS) | 0 | 0 | 0 |
| unwrap (Rust) | 0 | 0 | 0 |
| expect (Rust) | 1 (Tauri 启动) | 0 | 0 |

**结论**: 核心路径无 mock/fake/stub/hardcoded 冒充真实功能。所有占位均有 PHASE_PLACEHOLDER 标记。

---

## 14. 已知问题

1. **CSP style-src unsafe-inline**: Tailwind CSS v4 运行时需要，风险较低
2. **符号链接攻击**: vault 内符号链接可能指向 vault 外，后续 Phase 需考虑禁止
3. **关闭 dirty 标签无确认**: 依赖自动保存，极端情况下可能丢失数据
4. **CodeMirror bundle 较大**: ~1MB，后续可考虑 code-splitting
5. **无 ESLint**: lint 脚本当前为 `tsc --noEmit`，未配置 ESLint
6. **暗色模式不持久化**: 每次启动默认亮色

---

## 15. 下一阶段注意事项

1. **Phase 2**: Quick Capture 真功能实现，替换 Sidebar 和 Command Palette 中的占位
2. **Phase 3**: AI Mentor 真功能实现，替换 MentorDock 静态占位
3. **Phase 5**: MindView + 节点统计实现，替换 PlaceholderView 和 Sidebar 节点数占位
4. **Phase 6**: 知识体检实现，替换健康分数占位
5. **安全加固**: 考虑禁止 vault 内符号链接、添加文件变更监听（watch）
6. **ESLint**: 建议在 Phase 2 前配置 ESLint
7. **暗色模式持久化**: 建议在后续 Phase 添加 localStorage 或 Rust 端配置持久化
