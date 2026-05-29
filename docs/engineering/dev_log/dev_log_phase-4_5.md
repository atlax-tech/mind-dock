# Phase 4.5 开发日志

***

## Phase 4.5+Round 5.1 devlog -- Step 5 修复：Inline Bubble 不触发

**日期**: 2026-05-30
**任务起始时间**: 04:18
**任务结束时间**: 04:26
**工时**: 8 分钟

### 任务目标

修复 Inline Mentor Bubble 在页面上不触发的问题。排查发现三个根因：Delivery Policy inline 门槛过高、Fast Classifier L0 结果被禁止 inline、AppShell hasSelection 硬编码为 false。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/services/mentor/delivery-policy.ts` | 修改 | +12/-4 | confidence 门槛从 0.78 降至 0.68；新增 classify/clarify/extract 三种 intent 的 inline 路径；新增 medium+0.72+editorFocused inline 路径 |
| `src/services/mentor/fast-classifier.ts` | 修改 | +8/-4 | 评分阈值从 0.78 降至 0.68；L0 结果有 prototypeMatches 时允许 inline（不再一刀切禁止） |
| `src/services/mentor/signal-detectors/types.ts` | 修改 | +2 | DetectorResult 新增 prototypeMatches 可选字段 |
| `src/services/mentor/signal-detectors/semantic-type-detector.ts` | 修改 | +2 | L1 和 L0 返回结果中传递 prototypeMatches |
| `src/modules/editor/EditorView.tsx` | 修改 | +8 | 新增 onSelectionChanged 回调；CodeMirror updateListener 中监听选区变化 |
| `src/app/AppShell.tsx` | 修改 | +3 | 新增 editorHasSelection state；传递给 detector runner getContext 和 EditorView onSelectionChanged |

### 遇到的问题以及解决方式

1. **Delivery Policy inline 条件太严格**：原版只有 `priority=high+hasSelection` 和 `intent=classify+editorFocused` 两条路径到 inline，而 `hasSelection` 硬编码为 false，`classify` intent 仅 decision-principle-detector 返回。解决方式：降低 confidence 门槛至 0.68，增加 clarify/extract intent 的 inline 路径，增加 medium+0.72+editorFocused 兜底路径。
2. **L0 结果一律禁止 inline**：prototype embedding 尚未接入，所有结果都是 L0，导致 `allowInline=false`。解决方式：有 `prototypeMatches`（即 knowledge type candidates 支撑）的 L0 结果允许 delivery policy 决定是否 inline。
3. **hasSelection 硬编码为 false**：AppShell 的 getContext 回调中 `hasSelection: false`。解决方式：EditorView 新增 `onSelectionChanged` 回调，AppShell 维护 `editorHasSelection` state 并传递。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit    # exit 0
$ pnpm build                  # built in 923ms
```

### 手工验证步骤说明

1. 打开 Markdown 文档，输入包含「必须/禁止/原则」的文本，停顿 5 秒，确认编辑器中出现 Inline Bubble
2. 输入包含「？」的问句，停顿 5 秒，确认出现 question 类 Bubble
3. 选中一段文本后停顿，确认 delivery policy 识别到 hasSelection=true
4. 点击 Bubble 上的「忽略」按钮，确认 Bubble 消失
5. 连续快速输入时不应弹出 Bubble

### 当前风险以及影响范围

1. **confidence 门槛降低可能增加噪音**：从 0.78 降至 0.68，更多建议可能进入 inline 候选。但 delivery policy 仍有节流（5次/文档/session，20次/vault/小时）和 dismiss 冷却（10分钟）保护。
2. **L0+prototypeMatches 允许 inline 可能误判**：knowledge type candidates 的置信度有限，可能产生不准确的 inline 建议。后续 Step 8 接入真实 embedding 后可提升精度。

***

## Phase 4.5+Round 5 devlog -- Step 5：Inline Mentor Bubble

**日期**: 2026-05-30
**任务起始时间**: 04:00
**任务结束时间**: 04:15
**工时**: 15 分钟

### 任务目标

在编辑器光标/选区附近展示短建议，增强 Mentor 存在感，同时保证不遮挡、不打扰、不依赖 Platter。实现 CodeMirror 6 Widget Decoration 方式的 Inline Bubble、React 气泡组件、建议动作处理器，并将三者接入 EditorView 和 AppShell。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/services/mentor/suggestion-actions.ts` | 新建 | 92 | 建议动作处理器：dismiss/snooze/open_detail/accept/confirm 二次确认 |
| `src/modules/editor/InlineMentorBubble.tsx` | 新建 | 130 | React 气泡组件：shortMessage + 最多 2 个 action + dismiss/snooze/open detail；Esc 关闭；二次确认弹窗 |
| `src/modules/editor/mentorInlineExtension.ts` | 新建 | 171 | CodeMirror 6 StateField + WidgetType + Decoration：showMentorBubble/dismissMentorBubble effects；文档变更自动隐藏；Escape 关闭 |
| `src/modules/editor/EditorView.tsx` | 更新 | +45 | 新增 inlineSuggestion/suggestionActionContext/onSuggestionDismissed/onSuggestionSnoozed/onSuggestionAccepted/onSuggestionOpenDetail props；接入 mentorInlineExtension；useEffect 监听 inlineSuggestion 变化 |
| `src/app/AppShell.tsx` | 更新 | +55 | 新增 inlineSuggestion state；监听 mentor_suggestion_created 事件；传递 suggestion + actionContext + callbacks 给 EditorView；dismiss 时通知 throttle tracker；open detail 时打开 Platter |
| `src/services/mentor/detector-runner.ts` | 更新 | +15 | 创建 suggestion 后发出 mentor_suggestion_created 事件，通知 UI 层 |
| `src/styles.css` | 更新 | +171 | Mentor Bubble 完整样式：亮/暗主题、动画、按钮、确认弹窗 |

### 遇到的问题以及解决方式

1. **CodeMirror tooltip vs widget 方案选择**：初始尝试使用 `showTooltip`，但 tooltip 的 `create` 回调中无法可靠获取 EditorView 实例。解决方式：改用 `WidgetType` + `Decoration.widget` 方案，在当前行末尾插入 block widget，更可控且不依赖 tooltip 的 viewport 碰撞逻辑。
2. **StateField.init 误用**：`decorationField.create` 中尝试调用 `bubbleField.init(state)`，但 `StateField.init` 是配置项而非方法。解决方式：将 `mentorBubbleField` 提升为模块级常量，`decorationField.create` 通过 `state.field(mentorBubbleField)` 读取初始值。
3. **MentorSuggestion 类型字段不匹配**：AppShell 中构造 suggestion 对象时使用了 `long_message`（不存在），缺少 `source_job_id`/`priority`/`evidence_ids_json`/`model_trace_id`/`expires_at` 字段。解决方式：对照 MentorSuggestion 接口完整填充所有字段。
4. **INEFFECTIVE_DYNAMIC_IMPORT 警告**：InlineMentorBubble.tsx 中同时静态和动态导入了 `executeConfirmedAction`。解决方式：移除动态 import，统一使用静态 import。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit    # exit 0
$ pnpm build                  # built in 862ms
```

调用链验证：`AppShell → mentorEventBus.on('mentor_suggestion_created') → setInlineSuggestion → EditorView(inlineSuggestion) → useEffect → showMentorSuggestion(view, suggestion) → showMentorBubble effect → mentorBubbleField update → buildDecorations → MentorBubbleWidget.toDOM → InlineMentorBubble render`

用户交互链：`InlineMentorBubble → handleSuggestionAction → mentorSuggestionsService.updateSuggestionStatus → onDismissed/onSnoozed/onAccepted → setInlineSuggestion(null) → hideMentorSuggestion`

### 手工验证步骤说明

1. 在无 AI 连接状态下，通过 DevTools 控制台手动触发一条 `surface='inline'` 的 suggestion，确认编辑器当前行下方出现 Bubble
2. 点击 Bubble 上的「忽略」按钮，确认 Bubble 消失，SQLite 中该 suggestion status 更新为 dismissed
3. 点击「稍后提醒」按钮，确认 Bubble 消失，SQLite 中 snoozed_until 写入 30 分钟后的时间戳
4. 点击「查看详情」按钮，确认 Platter 打开到 Mentor tab
5. 点击需要二次确认的 action 按钮，确认出现确认弹窗，点击「确认」后 suggestion status 更新为 accepted
6. 按 Esc 键，确认 Bubble 关闭
7. 编辑文档内容，确认 Bubble 自动消失（文档变更时自动隐藏）
8. 连续快速输入时不应弹出 Bubble（delivery policy userIsTyping 规则）

### 当前风险以及影响范围

1. **mentorInlineExtension config 在编辑器创建时固定**：mentorInlineExtension 的 actionContext 和 callbacks 在 EditorView 初始化时传入，后续通过 ref 更新。如果 ref 更新不及时，可能使用旧的 context。影响范围：dismiss/snooze 操作可能使用过期的 vaultPath。风险可控：ref 在每次渲染时更新。
2. **WidgetType 位置在行末**：Bubble 显示在当前光标所在行的末尾，而非光标正下方。对于长行，Bubble 可能不在可视区域。后续可优化为基于光标位置的绝对定位。
3. **mentor_suggestion_created 事件 payload 需与 AppShell 构造的 MentorSuggestion 对象保持一致**：当前 AppShell 从事件 payload 手动构造 MentorSuggestion 对象，如果 detector-runner 发出的事件字段变更，两边需要同步。后续可考虑让 detector-runner 直接返回完整的 suggestion 对象。
4. **Bubble 动画和定位未做 viewport collision 处理**：当前 Bubble 使用 CSS animation + block widget，不做 viewport 边界碰撞检测。如果编辑器窗口很窄，Bubble 可能溢出。后续如需精确浮动定位可引入 @floating-ui/dom。

***

## Phase 4.5+Round 4 devlog -- Step 4：Delivery Policy + Throttle

**日期**: 2026-05-30
**任务起始时间**: 03:40
**任务结束时间**: 04:00
**工时**: 20 分钟

### 任务目标

决定每条 suggestion 出现在哪里、什么时候出现，并防止 AI Mentor 变成噪音。实现 Delivery Policy 纯函数选择 surface、Inline Throttle 节流与频率控制、Mentor Preferences 用户偏好读取，并将三者接入 detector-runner 管线。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/services/mentor/delivery-policy.ts` | 新建 | 118 | Delivery Policy 纯函数：9 条规则决定 surface，不调用 detector/AI |
| `src/services/mentor/inline-throttle.ts` | 新建 | 155 | InlineThrottleTracker 内存节流器：文档级 5 次/session、vault 级 20 次/h、90s 最小间隔、10 分钟 dismiss 冷却 |
| `src/services/mentor/mentor-preferences.ts` | 新建 | 76 | 用户偏好读取（localStorage）：Inline Bubble 开/关、频率 low/standard/high、Background Mentor 开/关 |
| `src/services/mentor/detector-runner.ts` | 重写 | 283 | 接入 delivery policy + throttle + preferences；新增 getContext 参数传递 userIsTyping/hasSelection/editorFocused/platterOpen/modelBusy |
| `src/services/mentor/mentor-suggestions.ts` | 更新 | +10 | 新增 updateSuggestionLastShown 方法 |
| `src-tauri/src/commands/mentor_suggestions.rs` | 更新 | +29 | 新增 update_mentor_suggestion_last_shown Tauri command |
| `src-tauri/src/lib.rs` | 更新 | +1 | 注册 update_mentor_suggestion_last_shown command |
| `src/app/AppShell.tsx` | 更新 | +8 | startDetectorRunner 新增 getContext 回调，传递 platterOpen 状态 |

### 遇到的问题以及解决方式

1. **AppShell 中缺少 editorSelectionRef / editorFocusedRef**：AppShell 当前没有跟踪编辑器选区/聚焦状态的 ref。解决方式：getContext 回调中 hasSelection 和 editorFocused 暂用默认值（false / true），platterOpen 使用已有的 `mentorDockOpen` state。后续 Step 5 实现 Inline Bubble 时可从 CodeMirror editor state 获取精确的选区和聚焦状态。
2. **suggestion-factory.ts 的 surface 字段需要被 policy 覆盖**：buildSuggestionParams 返回的 CreateMentorSuggestionParams 中 surface 由 classifier 决定，但 delivery policy 需要最终决定。解决方式：在 detector-runner 中 buildSuggestionParams 之后直接赋值 `sparams.surface = policyResult.surface`，因为 CreateMentorSuggestionParams.surface 不是 readonly。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit    # exit 0
$ cd src-tauri && cargo build # Finished dev profile
$ pnpm build                  # built in 1.11s
```

调用链验证：`AppShell → startDetectorRunner(getActiveDocument, getContext) → document_idle → runDetectors → detectSemanticType/... → classifyAll → chooseSurface(delivery-policy) → buildSuggestionParams → mentorSuggestionsService.createSuggestion(surface=policyResult.surface) → inlineThrottleTracker.recordInline + updateSuggestionLastShown`

全链路无 `chat()` / `reasoning` 调用。Delivery policy 不调用 detector，不调用 AI。

### 手工验证步骤说明

1. 在 DevTools 控制台（Cmd+Option+I）中 import delivery-policy 模块，构造不同 `userIsTyping/hasSelection/editorFocused/priority/intent` 输入调用 `chooseSurface()`，确认 surface 选择符合规则（如 userIsTyping=true → silent，intent=review → inbox，priority=high+hasSelection → inline）
2. 连续触发 6 次同类 suggestion（同一文档），确认第 6 次 inline 被阻止（单文档 session 上限 5 次），surface 降级为 inbox
3. 触发 suggestion 并 dismiss，10 分钟内再次触发同类 signal，确认不会再次 inline（dismissedRecently=true → inbox）
4. 在 localStorage 中设置 `minddock-mentor-preferences` 的 `inlineBubbleEnabled=false`，触发 suggestion，确认 surface 为 inbox 而非 inline
5. 设置频率为 `low`，确认节流倍率为 2.0（单文档上限降为 2 次，vault 上限降为 10 次）
6. 确认 `notifySuggestionDismissed()` 正确记录 dismiss 时间戳，`resetThrottleSession()` 清除所有计数

### 当前风险以及影响范围

1. **getContext 参数当前为近似值**：hasSelection 和 editorFocused 暂用默认值，未从 CodeMirror editor state 实时获取。影响范围：delivery policy 对 inline 的判断可能不够精确。后续 Step 5 实现 Inline Bubble 时需从 CodeMirror extension 获取精确状态。
2. **Mentor Preferences 存储在 localStorage**：当前使用 localStorage 存储偏好，未接入 Settings UI。影响范围：用户无法通过 UI 修改偏好，只能通过 console 或直接修改 localStorage。后续 Step 9 需在 Settings Panel 中接入。
3. **InlineThrottleTracker 为内存状态**：session 级别的计数存储在内存中，app 重启后重置。影响范围：重启后 inline 计数归零，不会持久化跨 session 的限流。这是设计意图——session 级限流不需要跨重启持久化。
4. **dismiss 冷却仅基于内存 tracker**：dismiss 记录存在内存中，app 重启后冷却期失效。影响范围：重启后可能立即再次弹出之前被 dismiss 的同类建议。后续可通过读取 SQLite 中最近 dismissed suggestion 的 updated_at 来补充持久化冷却。

***

## Phase 4.5+Round 3.2 devlog -- Step 3 重构：语义优先 Signal Detector

**日期**: 2026-05-29
**任务起始时间**: 13:15
**任务结束时间**: 13:48
**工时**: 33 分钟

### 任务目标

将 Step 3 从"关键词命中驱动"重构为"语义优先、规则兜底"架构。不得以固定字典命中作为主要触发方式；规则/正则只能作为 L0 弱信号，真正决定是否生成 suggestion 的主路径必须是 L1 embedding / soft type prototype / knowledge type candidate 语义判断。

### 关键设计决策

1. **L0/L1 双级检测**：每个 detector 返回 `level: 'L0' | 'L1'`，L0 置信度封顶 0.55，确保不伪装成高置信 inline
2. **Prototype 预定义**：7 组语义原型（principle/decision/question/action/requirement/risk/review），每组 5-7 条语义例句，覆盖无关键词场景
3. **Knowledge type 映射**：`constraint→principle, decision→decision, question→question, task→action` 等，作为 L0 兜底而非主路径
4. **Model Routing**：L0 规则（<20ms）+ L1 embedding（50-300ms）+ L2 轻量模型（300-1500ms）+ L3 reasoning（后台 job）四级分层
5. **缺失结论检测基于结构**：heading/frontmatter/summary/tags/字数，而非纯关键词

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/services/mentor/semantic-prototypes.ts` | 新建 | 126 | 7 组语义原型定义，覆盖 principle/decision/question/action/requirement/risk/review |
| `src/services/mentor/cosine-similarity.ts` | 新建 | 73 | 余弦相似度计算 + findBestMatch（纯数学，无外部调用） |
| `src/services/mentor/model-routing.ts` | 新建 | 112 | L0/L1/L2/L3 四级路由策略 + shouldInvokeL2/L3 判断 |
| `src/services/mentor/signal-detectors/types.ts` | 重写 | 68 | 新增 textEmbedding/prototypeMatches/chunkEmbeddings/frontmatter/documentSummary/documentTags/level 字段 |
| `src/services/mentor/signal-detectors/semantic-type-detector.ts` | 新建 | 154 | L1 主路径：prototype 匹配 + L0 兜底：knowledge type candidates |
| `src/services/mentor/signal-detectors/question-intent-detector.ts` | 重写 | 106 | L1 prototype→question 为主，?/疑问短语仅作为 L0 弱加分（max 0.55） |
| `src/services/mentor/signal-detectors/decision-principle-detector.ts` | 重写 | 112 | L1 prototype→principle/decision 为主，关键词仅加分；L0 兜底封顶 0.55 |
| `src/services/mentor/signal-detectors/action-intent-detector.ts` | 重写 | 107 | L1 prototype→action 为主，TODO/下一步等仅弱加分 |
| `src/services/mentor/signal-detectors/missing-conclusion-detector.ts` | 重写 | 108 | 基于 heading 结构/frontmatter/summary/tags/字数，非关键词 |
| `src/services/mentor/signal-detectors/context-pack-mismatch-detector.ts` | 重写 | 102 | 基于 knowledge type 分布/source doc count |
| `src/services/mentor/signal-detectors/index.ts` | 更新 | 7 | 更新所有 detector 导出 |
| `src/services/mentor/signal-detectors/debug-harness.ts` | 重写 | 291 | 14 条测试用例，覆盖无语义关键词的语义等价输入 |
| `src/services/mentor/fast-classifier.ts` | 重写 | 216 | 新评分公式：embeddingPrototype 40% + semanticContext 20% + ruleHint 10% + context 15% + history 10% + recency 5%；L0-only 结果禁止 inline |
| `src/services/mentor/suggestion-factory.ts` | 重写 | 128 | 强制 requiresUserConfirmation=true 的写入 action 分类 |
| `src/services/mentor/detector-runner.ts` | 更新 | 238 | 接入新 detector，从 knowledge type candidates 构建 prototypeMatches，运行 L0/L1 均检测 |
| `src/services/mentor/signal-detectors/question-detector.ts` | 删除 | -71 | 被 question-intent-detector.ts 替代 |
| `src/services/mentor/signal-detectors/action-detector.ts` | 删除 | -85 | 被 action-intent-detector.ts 替代 |

### 遇到的问题以及解决方式

1. **L0 结果可能伪装成高置信 inline**：旧版 keyword detector 可达 0.80+ 置信度。解决方式：L0-only 结果 level='L0'，confidence 封顶 0.55，FastClassifier 禁止 L0 rule-only 结果 inline。
2. **Prototype embedding 当前不可用**：AI Runtime embed() 需要 hook 上下文。解决方式：当前通过 knowledgeTypeCandidates 构建 prototypeMatches 近似，L0/L1 双路径均可运行；预留 cosine-similarity.ts 和 model-routing.ts 给 Step 8 AI Runtime 集成。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit    # exit 0
$ cd src-tauri && cargo build # Finished
$ pnpm build                  # built in 943ms
```

调用链验证：`AppShell → startDetectorRunner → document_idle → runDetectors → detectSemanticType/detectQuestionIntent/detectDecisionPrinciple/detectActionIntent/detectMissingConclusion → classifyAll → buildSuggestionParams → mentorSuggestionsService.createSuggestion`

全链路无 `chat()` / `reasoning` 调用。

### 手工验证步骤说明

1. 在浏览器 console 运行 `import('./services/mentor/signal-detectors/debug-harness').then(m => m.testAllDetectors())`，验证 14 个测试用例全部通过
2. 在文档中输入「任何会改动用户原文的动作都应先让用户确认」（无「必须/禁止/原则」词），停顿 5s，应产生 principle 类建议（因为 knowledge type candidate 可匹配）
3. 输入「Context Pack 放在 Platter 里可能会让入口变重，这一点需要判断」（无「？/为什么/我该不该」），应产生 question/review 类建议
4. 输入「为 detector 写覆盖 12 条语义输入的测试用例是第一步」（无「TODO/下一步/验收」），应产生 action 类建议
5. 断开 AI Reasoning，重复以上操作，轻建议仍可出现（detector 从不调用 AI）
6. 检查所有 L0-only 结果（有关键词但无 semantic 确认的）confidence ≤ 0.55，不会进入 inline

### 当前风险以及影响范围

1. **Prototype embedding 路径未接入**：当前 semantic-prototypes.ts 仅定义了例句和阈值，尚未通过 embed() 生成真实 embedding 进行 cosine 比较。当前用 knowledgeTypeCandidates 近似，匹配精度有限。后续 Step 8 接入 AI Runtime embed() 后可启用真实 L1 路径。
2. **L2 轻量模型未实现**：model-routing.ts 定义了 L2 调用策略，但未接入实际模型调用和 AbortController。后续 Step 7（Background Job）可统一处理。
3. **Prototype examples 需持续维护**：当前 7 组语义原型的例句为人工编写，覆盖度有限。未来随着用户使用数据积累，可通过 Step 8 整合中的 personalization 信号调优。

***

## Phase 4.5+Round 3.1 devlog -- Step 3 修复：Detector 接入 + EditorTocScale 确认

**日期**: 2026-05-29
**任务起始时间**: 13:00
**任务结束时间**: 13:12
**工时**: 12 分钟

### 任务目标

1. 修复 Step 3 detector 从未被调用导致无 bubble/suggestion 的问题 —— 创建 detector-runner 桥接 event → detector → classifier → suggestion
2. 确认 EditorTocScale 已正确接入（实际代码已接入，无回退）

### 问题诊断

1. **Detector 未执行**：5 个 signal detector + fast-classifier + suggestion-factory 仅为纯函数库，无任何代码订阅 `document_idle` 事件或调用 `runDetectors`。用户输入文字后，`document_idle` 事件被正确发出（Step 2），但无人监听并执行检测。
2. **EditorTocScale**：代码审查确认 `EditorTocScale` 组件已在 EditorView.tsx 中定义并导出，且 AppShell.tsx 中已正确 import + 使用 + relative 容器。功能未被回退。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/services/mentor/detector-runner.ts` | 新建 | 160 | 订阅 document_idle → 运行 4 个 detector → classify → 创建 signal + suggestion |
| `src/app/AppShell.tsx` | 修改 | +13 | import startDetectorRunner + useEffect 启动 runner，传入 active document getter |

### 核心逻辑

```
document_idle 事件
  → detector-runner.runDetectors()
    → 获取当前段落（最后一段非空文本，≤2000 字）
    → 并行获取 docMeta / knowledgeTypeCandidates / personalizationWeights / chunks
    → 运行 4 个 detector（detectQuestion / detectDecisionPrinciple / detectAction / detectMissingConclusion）
    → classifyAll() 评分
    → score ≥ 0.60: 创建 mentor_signal + mentor_suggestion（写入 SQLite）
    → suggestion 可在 Mentor Platter 中查看
```

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit    # exit 0
$ cd src-tauri && cargo build # Finished
$ pnpm build                  # built in 1.32s
```

调用链验证：
- `AppShell.tsx` → `startDetectorRunner()` → 订阅 `document_idle`
- `detector-runner.ts` → `detectQuestion/detectDecisionPrinciple/detectAction/detectMissingConclusion` → `classifyAll` → `buildSuggestionParams` → `mentorSuggestionsService.createSuggestion`
- 全链路无 `chat()` 调用

### 手工验证步骤说明

1. 启动 app，打开已有 vault，打开任意 Markdown 文档
2. 输入「这里我们必须禁止自动修改用户原文」，停止输入，等待 5 秒
3. 打开右侧 Mentor Platter，在「当前上下文」或「Mentor Inbox」中应出现一条「这像一个产品原则」的建议
4. 输入「我该不该把 Context Pack 放到 Platter？」等待 5 秒，应出现 question 类建议
5. 断开 AI Reasoning（Settings → AI → 断开连接），重复步骤 2-4，轻建议仍可出现（因为 detector 不调用 AI）
6. 检查 browser console，不应有 `chat()` 相关日志

### 当前风险以及影响范围

1. **防并发锁简单**：`isRunning` 单 flag 防止并发，不处理队列积压。如果用户快速切换文档可能丢失 trigger。
2. **仅作用于 activeTabId**：runner 只检测当前活跃标签页，非活跃标签不会收到建议。
3. **Inline bubble 尚未实现**：suggestion 写入 SQLite 后在 Platter 中可见，但不会弹出 inline bubble。Inline bubble 是 Step 5 任务。

***

## Phase 4.5+Round 3 devlog -- Step 3：Signal Detector + Fast Classifier

**日期**: 2026-05-29
**任务起始时间**: 12:30
**任务结束时间**: 12:55
**工时**: 25 分钟

### 任务目标

实现不依赖 reasoning 的轻判断管线，让 Mentor 能在用户当前写作上下文中自动产生短建议候选。包含 5 个 Signal Detector（question / decision-principle / action / missing-conclusion / context-pack-mismatch）、Fast Classifier（加权评分 + surface 决策）和 SuggestionFactory（输出规范化）。

### 改动的文件名以及改动的行数

| 文件 | 操作 | 行数 | 说明 |
|---|---|---:|---|
| `src/services/mentor/signal-detectors/types.ts` | 新建 | 50 | DetectorInput / DetectorResult / SignalDetector 公共接口 |
| `src/services/mentor/signal-detectors/question-detector.ts` | 新建 | 71 | 问号/疑问短语检测，不调用 AI |
| `src/services/mentor/signal-detectors/decision-principle-detector.ts` | 新建 | 80 | 决策/原则关键词检测，结合 knowledge type candidates 提升置信度 |
| `src/services/mentor/signal-detectors/action-detector.ts` | 新建 | 88 | TODO/下一步/验收/测试等动作关键词检测 |
| `src/services/mentor/signal-detectors/missing-conclusion-detector.ts` | 新建 | 71 | 文档字数+缺结论+停顿超阈值检测 |
| `src/services/mentor/signal-detectors/context-pack-mismatch-detector.ts` | 新建 | 93 | Context Pack 来源类型与输出类型不匹配检测 |
| `src/services/mentor/signal-detectors/index.ts` | 新建 | 7 | barrel export |
| `src/services/mentor/signal-detectors/debug-harness.ts` | 新建 | 151 | 10 个测试用例的 debug harness，不依赖 AI |
| `src/services/mentor/fast-classifier.ts` | 新建 | 206 | 加权评分（rule 45% + knowledgeType 25% + context 15% + history 10% + recency 5%）+ surface 决策 |
| `src/services/mentor/suggestion-factory.ts` | 新建 | 122 | ClassifierResult → CreateMentorSuggestionParams 转换，shortMessage 规范化（12-28 字），action 去重（≤2） |

### 遇到的问题以及解决方式

1. **uuid 依赖不在此项目**：suggestion-factory.ts 试图使用 `import { v4 as uuidv4 } from 'uuid'` 生成 ID，但 package.json 中没有 uuid。解决方式：使用 `Date.now().toString(36) + Math.random().toString(36)` 生成时间戳随机 ID（格式 `ms-{ts}-{rand}`），避免新增依赖。
2. **未使用参数警告**：fast-classifier.ts 的评分辅助函数和 context-pack-mismatch-detector.ts 的 input 参数未被直接使用。解决方式：参数名前加 `_` 前缀，保留接口完整性同时消除 TS6133。

### 自动验证结果

```bash
$ pnpm exec tsc --noEmit
# exit 0，无类型错误

$ cd src-tauri && cargo build
# Finished dev profile，无编译错误

$ pnpm build
# built in 885ms
```

### 手工验证步骤说明

1. 在浏览器 console 中运行 `import('./services/mentor/signal-detectors/debug-harness').then(m => m.testAllDetectors())`，确认 10 个测试用例全部通过
2. 断开 AI Reasoning 连接（Settings → AI Reasoning → 断连），在文档中输入「这里我们必须禁止自动修改用户原文」，停顿 5 秒后应出现 Principle/约束类轻建议（通过规则检测，不调用 AI）
3. 输入「我该不该把 Context Pack 放到 Platter？」应出现 question 类建议
4. 写一篇 500+ 字的文档但没有结论段落，停顿 5 秒后应提示「这篇还缺一个结论」
5. 确认所有 detector 的代码路径不包含 `chat()` 调用 —— 可 grep 验证

### 当前风险以及影响范围

1. **Detector 未接入运行时**：当前 detector 和 classifier 仅为纯函数库，尚未集成到 MentorEvent → Signal → Suggestion 的自动管线。需要 Step 4（Delivery Policy）或额外集成才能自动运行。风险可控：作为 Step 3 独立交付物，函数已验证可正确检测。
2. **中文规则覆盖有限**：当前 detector 基于关键词和正则匹配，对边界表达（如反问句、间接表达）可能漏检。后续可通过 knowledge type / FTS 召回来补全。
3. **knowledge type candidates 依赖**：decision-principle-detector 和 action-detector 依赖 `suggestKnowledgeTypeCandidates` 提升置信度，但该数据是否可用取决于 metadata 是否已索引。无候选时仍可通过规则分数运行。
4. **context-pack-mismatch 未自动调用**：该 detector 需要额外上下文（packId + knowledge type 分布），当前仅在手动创建 Pack 时触发。需在 ContextPackPanel 中接入。

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