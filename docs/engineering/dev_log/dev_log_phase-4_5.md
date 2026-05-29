# Phase 4.5 开发日志

***

## Phase 4.5+Round 2 devlog -- Step 2：MentorEvent Bus 扩展与事件接线

**日期**: 2026-05-29
**任务起始时间**: 12:00
**任务结束时间**: 12:25
**工时**: 25 分钟

### 任务目标

把 Mentor 从"UI 点击触发"升级为"事件驱动"：保存、停顿、选区、capture、context pack 生成都发出标准事件，并可持久化到 SQLite mentor_events 表。新增 12 种 P4.5 事件类型，通过内存 mentorEventBus 广播 + fire-and-forget 持久化 subscriber，保留现有 provider 结构。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数变化 | 说明 |
|---|---|---:|---|
| `src/modules/ai/MentorEventBus.ts` | 修改 | +30 | 新增 P4.5 事件类型（app_started ~ mentor_suggestion_actioned），emit 方法增加 persist 参数，新增 setPersistHandler 注册持久化处理器 |
| `src/services/mentor/mentor-events.ts` | 修改 | ~7 | createEvent 的 eventType 参数从 MentorEventType 放宽为 string，兼容 MentorEventBus 扩展类型 |
| `src/modules/editor/editorContextMenu.ts` | 修改 | +8 | editorContextMenu 改为接受 options 对象（items + onSelectionCreated），右键菜单打开时通知外部 |
| `src/modules/editor/EditorView.tsx` | 修改 | +27 | 新增 vaultPath/vaultId props，document_idle debounce（5s 无输入后发射），selection_created 回调接入，idle timer 清理 |
| `src/app/AppShell.tsx` | 修改 | +27 | 注册 persistHandler，发射 app_started / document_opened / document_saved / selection_created / context_pack_generated 事件 |
| `src/modules/capture/CaptureProvider.tsx` | 修改 | +8 | 新增 capture 成功后发射 capture_created 事件 |
| `src/modules/context-pack/ContextPackPanel.tsx` | 修改 | +14 | 新增 context_pack_generated（创建 Pack）、context_pack_exported（导出 Pack） |
| `src/modules/context-pack/OutputGenerator.tsx` | 修改 | +14 | 新增 context_pack_exported（导出文件、保存为文档） |

### 遇到的问题以及解决方式

1. **MentorEventBus.MentorEventType 与 mentorEventsService.MentorEventType 类型不兼容**：两个模块各自定义了 MentorEventType，bus 扩展后包含旧类型（first_open 等），service 只有新类型。createEvent 调用时 TS 报 "is not assignable"。解决方式：将 `mentorEventsService.createEvent` 的 `eventType` 参数从字面量联合类型放宽为 `string`，因为 Rust 端 column 类型为 TEXT，接受任意字符串，无需在前端严格限制。
2. **editorContextMenu 签名变更**：从 `editorContextMenu(items)` 改为 `editorContextMenu({ items, onSelectionCreated })`，以支持 selection_created 回调。EditorView.tsx 中的调用点需同步更新。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0，无类型错误

$ cd src-tauri && cargo build
# Finished dev profile，无编译错误
```

### 手工验证步骤说明

1. 启动 app，打开已有 vault，打开任意 Markdown 文档
2. 编辑文档内容后等待自动保存（约 1 秒），在 Debug Console 中确认看到 `document_saved` 事件日志（通过 network/sqlite 调试入口查看 mentor_events 表有新记录）
3. 选中一段文本并右键打开菜单，确认 `selection_created` 事件已记录
4. 连续输入文字 10 秒不间断，确认不会连续产生多条 `document_idle` 事件（debounce 仅在停止输入 5 秒后产生 1 条）
5. 创建一个 Context Pack 并导出为 Markdown，确认 `context_pack_generated` + `context_pack_exported` 事件均记录
6. 使用 Quick Capture（Cmd+Shift+C）新增一条 capture，确认 `capture_created` 事件记录
7. 检查所有事件的 payload_json 不包含完整文档正文（仅含 id / path / selectionLength / itemCount 等元数据）

### 当前风险以及影响范围

1. **事件持久化失败静默**：persistHandler 内部 catch 只输出 console.error，不会影响用户操作（如保存文档）。风险可控但需在后续 Step 9 的 Settings / 诊断入口中展示事件持久化状态。
2. **document_idle 阈值固定 5 秒**：当前硬编码 `IDLE_THRESHOLD_MS = 5000`，未来如需用户可调应在 Settings 中接入。
3. **editorContextMenu API 变更**：从数组参数改为 options 对象，如有其他调用点需同步更新。当前仅 EditorView.tsx 一处调用，影响范围可控。
4. **事件类型扩展不向后兼容**：mentor-events.ts 的 MentorEventType 类型仍保留（仅 createEvent 放宽为 string），listEvents filter 参数仍使用 MentorEventType 以提供类型安全过滤。

***

## Phase 4.5+Round 1 devlog -- Step 1：Mentor 数据层与兼容迁移

**日期**: 2026-05-29
**任务起始时间**: 11:25
**任务结束时间**: 11:35
**工时**: 10 分钟

### 任务目标

把 AI 建议从 JSONL 历史记录升级为 SQLite 中可查询、可更新、可过期、可关联 job/evidence/action 的统一数据源。新增 mentor_events、mentor_signals、mentor_suggestions、mentor_jobs 四张 SQLite 表，实现对应的 Rust Tauri commands 和前端 TypeScript service 层，并支持从旧 ai-suggestions.jsonl 兼容导入。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src-tauri/src/commands/metadata.rs` | 修改 | +81 行 | create_tables 新增 mentor_events / mentor_signals / mentor_suggestions / mentor_jobs 四张表及索引 |
| `src-tauri/src/commands/mentor_events.rs` | 新建 | 127 行 | create_mentor_event / list_mentor_events 命令 |
| `src-tauri/src/commands/mentor_signals.rs` | 新建 | 138 行 | create_mentor_signal / list_mentor_signals 命令 |
| `src-tauri/src/commands/mentor_suggestions.rs` | 新建 | 326 行 | create / list / get / update_status / snooze / delete / cleanup / import_legacy 共 8 个命令 |
| `src-tauri/src/commands/mentor_jobs.rs` | 新建 | 244 行 | create / list / update_status 命令，含去重检查和状态时间戳管理 |
| `src-tauri/src/commands/mod.rs` | 修改 | +4 行 | 注册 4 个新模块 |
| `src-tauri/src/lib.rs` | 修改 | +16 行 | 注册 15 个新 Tauri command |
| `src/services/mentor/mentor-events.ts` | 新建 | 56 行 | MentorEvent 类型 + createEvent / listEvents 服务 |
| `src/services/mentor/mentor-signals.ts` | 新建 | 63 行 | MentorSignal 类型 + createSignal / listSignals 服务 |
| `src/services/mentor/mentor-suggestions.ts` | 新建 | 155 行 | MentorSuggestion / MentorAction 类型 + 8 个服务方法 |
| `src/services/mentor/mentor-jobs.ts` | 新建 | 97 行 | MentorJob 类型 + createJob / listJobs / updateJobStatus 服务 |

### 遇到的问题以及解决方式

1. **rusqlite Row 读取与 String 错误类型不兼容**：`row.get()` 返回 `Result<_, rusqlite::Error>`，不能直接用 `?` 传播到 `Result<_, String>` 函数。解决方式：所有 `row.get()` 调用添加 `.map_err(|e| format!("...: {}", e))?` 显式转换，`row_to_suggestion` / `row_to_job` 辅助函数返回 `Result<_, rusqlite::Error>` 后在调用处用 `.map_err()` 转换。
2. **动态参数查询构建**：list 命令支持可选过滤条件（status / surface / target_id 等），需要动态拼接 SQL 和参数。解决方式：使用 `Vec<Box<dyn ToSql>>` 动态收集参数，通过 `param_refs` 切片传递给 `stmt.query()`。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0，无类型错误

$ cd src-tauri && cargo build
# Finished dev profile，无编译错误
```

### 手工验证步骤说明

1. 启动 app，打开已有 vault，确认 metadata.db 中新增了 mentor_events / mentor_signals / mentor_suggestions / mentor_jobs 四张表
2. 走一次现有 AI onboarding 或选区解释，确认旧建议仍能正常显示（旧 JSONL 未被删除）
3. 通过 Tauri command 创建 3 条不同 status 的 suggestion（pending / accepted / dismissed），再 list/filter/update，确认状态变更正确
4. 构造旧 `.minddock/ai-suggestions.jsonl`，运行 `import_legacy_ai_suggestions`，确认不会重复导入同一 id
5. 运行 `cleanup_mentor_suggestions(vault, { olderThanDays: 7, statuses: ['dismissed','expired'] })`，确认只清理目标状态，accepted/executed 近 7 天记录不被误删
6. 重启 app，确认新 suggestion 状态没有丢失

### 当前风险以及影响范围

1. **SQLite 表结构不可变**：四张表一旦创建，后续字段变更需要 ALTER TABLE 或 migration 机制，当前未实现自动 migration。影响范围：所有使用 mentor 表的功能。风险可控：本阶段为首次建表，暂不需要 migration。
2. **import_legacy_ai_suggestions 的 id 冲突**：旧 JSONL 中的 id 为 UUID，导入时直接使用原 id，如果用户多次运行导入命令，通过 `SELECT COUNT(*)` 去重检查避免重复。影响范围：仅首次从旧数据迁移时触发。
3. **cleanup 的 accepted/executed 保护**：当前 cleanup 逻辑对 accepted/executed 状态默认不清理（除非用户显式指定），但超过 older_than_days 的 accepted 记录仍会被清理。影响范围：手动清理入口。需在后续 Settings UI 中明确提示清理范围。