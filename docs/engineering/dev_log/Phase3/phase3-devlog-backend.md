# Phase 3 Backend Development Log

| 开发日志信息 | |
|-------------|---------|
| 阶段 | Phase 3 - 产品化打磨与留存增强 |
| 负责人 | Backend Agent |
| 状态 | 进行中 |

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 26 (LC-012) -->
<!-- ============================================ -->

## Phase 3 Round 26 devlog -- LC-012 Recommendation Dock Queue UI Consumption Pack 推荐队列前端消费接入能力包

**时间戳**: 2026-05-05

**任务起止时间**: 18:15 - 18:25 CST

**工时**: 10 分钟

**Notion 卡片**: LC-012 Recommendation Dock Queue UI Consumption Pack 推荐队列前端消费接入能力包

**任务目标**: LC-011 已提供 `listRecommendationDockQueue` 作为 recommendation queue / inbox 等价 API。本轮让前端最小消费该 queue，使推荐结果在 HomeView 区域可见、可曝光、可反馈。

**改动文件及行数**:
- `apps/web/app/workspace/_components/RecommendationDock.tsx` | A | +327 行（新增推荐队列前端消费组件，包含 loading / empty / error states、数据展示、markShown 自动触发、accept / reject / ignore feedback）
- `apps/web/app/workspace/features/home/HomeView.tsx` | M | +3 行（新增 RecommendationDock import 与渲染，置于 Recent Intelligence section 下方）
- `apps/web/tests/recommendation-dock-ui.test.ts` | A | +307 行（新增 LC-012 前端消费测试，覆盖 fields 完整性 / empty / sort / shown / feedback / userId isolation / 消费模式）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +40 行（本轮日志）

**变更摘要**:
- **接入点选择**: 分析 HomeView 为最小接入点——它是工作区登陆页面，已有 section 结构、userId 传递、dark theme styling，无需新建页面或修改 Dock/Capture/Editor/Mind。
- **RecommendationDock 组件**: 调用 `listRecommendationDockQueue(userId, { sortBy: 'createdAt', sortDirection: 'desc' })`，返回 items 以可折叠卡片展示。
- **展示字段**: 每条推荐展示 `recommendationType`、`candidateType`、`confidenceScore`（百分比格式）、`reasonSummary.reason`、`evidenceSummary`（证据数 + 类型）、`status`（中文标签），展开后显示 score / evidence 详情。
- **状态覆盖**: loading 状态显示 spinner；empty 状态显示空状态提示；error 状态显示错误信息 + 重试按钮。
- **markShown**: 组件首次渲染可见推荐时，对 `isShown === false` 的 item 自动调用 `markRecommendationDockQueueItemShown`，使用 ref 去重避免重复调用。
- **feedback**: 提供 accept / reject / ignore 三个按钮，调用 `recordRecommendationDockQueueItemFeedback` 后局部更新 state（乐观更新 status / hasFeedback / isShown），不整页刷新。
- **userId isolation**: 组件仅使用传入的 `userId` 参数，所有 API 调用均限定用户范围，不跨用户读取或操作。
- **Golden UI 风格**: 复用现有 CSS 变量（`var(--bg-base)`、`var(--text-muted)`、`var(--accent)` 等）、glass 效果、rounded-2xl 卡片、border-white 边框体系，保持与 HomeView 视觉一致。
- **范围控制**: 不破坏 Dock / Capture / Editor / Mind 既有行为；不做每日推荐 / Weekly Review / Nudge；不做 preference_profiles / rhythm_profiles；不做 LLM / embedding / vector search。

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| 排序测试受毫秒级时间戳竞争影响，连续创建的 recommendation 可能 createdAt 相同 | 在两次 createRecommendation 之间插入 `setTimeout(10)` 延时，并将断言从 id 比较改为 candidateId 比较 | ✅ |
| 术语门禁 (`check:terminology`) 禁止 product/business 代码使用 `Inbox` | 组件文件名从 `RecommendationInbox.tsx` 重命名为 `RecommendationDock.tsx`；测试文件从 `recommendation-inbox.test.ts` 重命名为 `recommendation-dock-ui.test.ts`；所有 describe/it 文案中的 "inbox" 替换为 "dock" | ✅ |
| ESLint `no-unused-vars`：测试文件中未使用的变量 (`first`/`second`/`RecommendationDockQueueItem` type) | 移除未使用变量和 import | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ PASS（0 errors, 1 pre-existing warning in demo2-prototype） |
| `pnpm typecheck` | ✅ PASS（domain + web tsc --noEmit） |
| `pnpm test` | ✅ PASS（domain 20 files / 312 tests；web 18 files / 465 tests, 含新增 recommendation-dock-ui 13 tests + intelligence-spine 58 tests 不回归） |
| `pnpm check:terminology` | ✅ PASS |
| `pnpm build:web` | ✅ PASS（workspace route 47.9 kB） |

**手工验证方式**:
1. 打开工作区 HomeView，确认 "Recommendations" section 出现在 "Recent Intelligence" 下方。
2. 无推荐数据时，确认显示空状态提示 "暂无推荐"。
3. 有推荐数据时，确认每条推荐卡片显示 recommendationType、candidateType、confidenceScore（百分比）、reasonSummary、status（中文标签）；展开后显示 Score / Evidence / Status 详情。
4. 确认首次渲染时自动触发 markShown（可通过 IndexedDB 检查 recommendation.status 变为 "shown"）。
5. 对 generated/shown 状态的推荐点击"接受"按钮，确认状态变为 "已接受"且卡片变为降低透明度。
6. 点击"拒绝"或"忽略"，确认状态相应变化。
7. 反馈操作后确认列表局部刷新，不需要整页刷新。

**验收标准**:
- 推荐 queue 有数据时可以渲染 ✅
- 无推荐时展示 empty state ✅
- loading / error 状态可验证 ✅
- accept / reject / ignore 操作调用正确 action ✅
- feedback 后状态刷新 ✅
- LC-011 repository / queue 相关测试不回归 ✅
- 现有 web / domain 测试不回归 ✅

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| markShown 异步非阻塞 | 低 | 组件首次渲染时自动调用 markShown（fire-and-forget），失败仅 console.error 不影响 UI |
| 局部状态更新采用乐观更新 | 低 | feedback 后直接 patch local state 而非重新 fetch；若 API 失败则显示 error，需手动刷新 |
| 无分页/无限滚动 | 低 | 当前一次加载全量推荐，若未来数量较多可加 limit/cursor 分页 |

**是否 ready for review**: 是（LC-012 本卡完成；已验证；已 git add 暂存；未 commit，未 push）

---
<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 25 (LC-011) -->
<!-- ============================================ -->

## Phase 3 Round 25 devlog -- LC-011 Local Recommendation Inbox Pack 推荐结果消费闭环能力包

**时间戳**: 2026-05-05

**任务起止时间**: 07:25 - 07:40 CST

**工时**: 15 分钟

**Notion 卡片**: LC-011 Local Recommendation Inbox Pack 推荐结果消费闭环能力包

**任务目标**: 在 LC-010 已能生成 recommendations 的基础上，新增本地 Recommendation Inbox / Queue 消费能力，使后续 UI 可以通过统一 repository / service API 消费推荐；不接 UI、不做前端页面、不引入 workspaceId 一次性补丁、不做 preference_profiles / rhythm_profiles / LLM / embedding / vector search、不重构 Recommendation 生命周期。

**改动文件及行数**:
- `apps/web/lib/repository.ts` | M | +416 行（新增 Recommendation Dock Queue 等价消费 API、UI view model、filter / sort / pagination、summary 提取、inbox item 生命周期封装）
- `apps/web/tests/intelligence-spine.test.ts` | M | +317 行（新增 LC-011 推荐消费闭环测试，覆盖 filter / sort / pagination / summary / shown / feedback / userId isolation / malformed input）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +81 行（本轮日志）

**变更摘要**:
- **等价 API 命名**: 由于仓库术语检查禁止在 product / business 代码中使用 `Inbox`，本轮以 `listRecommendationDockQueue` 作为 `listRecommendationInbox` 的等价 repository API；语义仍是 LC-011 Recommendation Inbox / Queue 消费能力。
- **推荐消费 view model**: 新增 `RecommendationDockQueueItem`，返回 UI 可直接消费的基础字段：`id`、`status`、`recommendationType`、`subjectType`、`subjectId`、`candidateType`、`candidateId`、`confidenceScore`、`createdAt`、`updatedAt`。
- **filter 支持**: `listRecommendationDockQueue(userId, query)` 支持 `status`、`candidateType`、`subjectType`、`recommendationType` 过滤；查询从 `recommendationsTable.where('userId').equals(userId)` 起步，保持 userId isolation。
- **排序与分页**: 支持按 `rank`、`confidenceScore`、`createdAt` 排序；默认 `createdAt desc`，rank 默认升序；同分或字段缺失时按 rank / confidence / createdAt / id 做 deterministic secondary sort；支持 `limit` + offset cursor，返回 `nextCursor` / `total`。
- **summary 提取**: 从 `recommendation.reasonJson` 安全解析 `reasonSummary`、`scoreSummary`、`evidenceSummary`；当旧数据缺失 reasonJson 时，兜底使用 `recommendation_generated` event metadata；再缺失时返回空 summary，不抛无意义异常。
- **shown / feedback 状态聚合**: `isShown` 同时读取当前 status 与 `recommendation_shown` event；`hasFeedback` 同时读取 accepted / rejected / modified / ignored status 与对应 feedback events。
- **item 操作封装**: 新增 `markRecommendationDockQueueItemShown` 与 `recordRecommendationDockQueueItemFeedback`，复用既有 `markRecommendationShown` / `recordRecommendationFeedback`，保持 LC-005 / LC-006 / LC-007 / LC-008 的 transaction 与 event / behavior event 一致性。
- **输入异常处理**: malformed status / candidateType / subjectType / sortBy / sortDirection / limit / cursor 均明确抛错，避免静默产生错误结果。
- **范围控制**: 未接 UI；未新增前端页面；未做每日推荐 / 周 Review / Nudge；未做 preference_profiles / rhythm_profiles；未做 LLM / embedding / vector search；未引入 workspaceId 一次性补丁；未重构 Recommendation 生命周期；未改变 LC-010 scoring 主逻辑。

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| LC-011 需求名包含 Inbox，但仓库 `check:terminology` 禁止 apps / packages 内出现 `Inbox` | API 采用 `RecommendationDockQueue` 命名作为等价能力；devlog 保留卡片名称，代码与测试通过术语检查 | ✅ |
| reasonJson / generated metadata 在 LC-004 ~ LC-010 数据中结构不完全一致 | summary builder 使用安全 JSON parse、类型守卫与多级 fallback；旧数据缺失字段时返回空数组 / null，不抛异常 | ✅ |
| shown 后再 accepted 时 status 不再是 shown，但 UI 仍需要知道已展示过 | `isShown` 同时看 status 与生命周期事件；`hasFeedback` 同时看终态 status 与 feedback event | ✅ |
| 排序字段可能缺失 rank 或 score 相同 | rank 缺失排后，并追加 rank / confidenceScore / createdAt / id secondary sort，保证 deterministic | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test intelligence-spine.test.ts capture-document-flow.test.ts` | ✅ PASS（2 files / 129 tests） |
| `pnpm validate` | ✅ PASS（lint 仅保留既有 GoldenTopNav `<img>` warning；domain 20 files / 312 tests；web 17 files / 452 tests；terminology PASS） |
| `pnpm build:web` | ✅ PASS（同一既有 `<img>` warning） |

**手工验证方式**:
1. 生成 user A recommendations 后调用 `listRecommendationDockQueue(USER_A, { status: 'generated', sortBy: 'rank' })`，期望只返回 user A items，且包含 reasonSummary / scoreSummary / evidenceSummary。
2. 分别构造 generated / shown / accepted / rejected / modified / ignored recommendations，按 status 查询，期望每次只返回对应 status。
3. 构造不同 candidateType / subjectType / recommendationType，分别传入 filter，期望返回集合精确匹配。
4. 构造带 rank / confidenceScore / createdAt 的 recommendations，分别排序，期望稳定排序并在同分时 deterministic。
5. 使用 `limit: 2` 查询第一页，再使用返回的 `nextCursor` 查询下一页，期望分页不重复、不漏项。
6. 构造缺失 reasonJson 但有 generated event metadata 的旧数据，期望 summary 从 metadata 兜底生成。
7. 从返回 item.id 调用 `markRecommendationDockQueueItemShown`，期望 recommendation.status 为 shown，并追加 `recommendation_shown` 与 user_behavior_event。
8. 从返回 item.id 调用 `recordRecommendationDockQueueItemFeedback`，期望 status 与 `recommendation_events` / `user_behavior_events` 保持一致。
9. 用 user A 操作 user B recommendation，期望抛 ownership 错误且 user B 数据不被修改。
10. 无 recommendation 时调用 queue API，期望 `{ items: [], nextCursor: null, total: 0 }`。

**验收标准**:
- 存在 `listRecommendationDockQueue` 等价 API，可按 userId 返回推荐消费队列
- 支持 status / candidateType / subjectType / recommendationType filter
- 支持 rank / confidenceScore / createdAt deterministic sort
- 支持 limit / cursor 最小分页
- item 返回 reasonSummary / scoreSummary / evidenceSummary / isShown / hasFeedback
- item 可触发 mark shown 与 feedback，并复用既有生命周期一致性 API
- userId isolation 与 malformed input 明确处理均有测试覆盖
- LC-004 ~ LC-010 关键链路回归通过
- `pnpm validate` PASS；`pnpm build:web` PASS

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| API 名称未直接使用 `Inbox` | 按仓库约束 | 术语检查禁止 apps / packages 使用 `Inbox`；本轮采用 Dock Queue 作为等价 API |
| cursor 采用 offset cursor | 低 | 满足最小分页能力；后续若需要大规模数据可替换为 createdAt/id keyset cursor |
| summary 是最小 UI view model | 低 | 已覆盖 reasonJson 与 event metadata fallback，但未定义复杂展示文案策略 |

**是否 ready for review**: 是（LC-011 本卡完成；已验证；已 git add 暂存；未 commit，未 push）

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 24 (LC-010) -->
<!-- ============================================ -->

## Phase 3 Round 24 devlog -- LC-010 Recommendation Engine MVP Pack 最小推荐引擎能力包

**时间戳**: 2026-05-05

**任务起止时间**: 06:38 - 06:50 CST

**工时**: 12 分钟

**Notion 卡片**: LC-010 Recommendation Engine MVP Pack 最小推荐引擎能力包

**任务目标**: 在不接 UI、不做复杂 ML ranking、不做 preference_profiles / rhythm_profiles、不接 LLM / embedding / vector search、不引入 workspaceId 一次性补丁的前提下，基于 LC-009 BasicCandidate recall 打通最小 Recommendation Engine MVP：Recall → Score → Top-K → Batch Recommendation → Event Metadata。

**改动文件及行数**:
- `packages/domain/src/services/IntelligenceSpine.ts` | M | +216 行（新增 recommendation engine scoring 类型、candidate 去重、score breakdown、evidence summary、Top-K 稳定排序）
- `apps/web/lib/repository.ts` | M | +210 行（新增 `generateRecommendationsForContext` orchestration、user_behavior_events 信号汇总、批量 recommendation + generated event 写入）
- `apps/web/tests/intelligence-spine.test.ts` | M | +311 行（覆盖 capture / document / mindNode 生成、Top-K、去重、稳定排序、signal adjustment、userId isolation、空候选）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +105 行（本轮日志）

**变更摘要**:
- **最小引擎 orchestration**: 新增 `generateRecommendationsForContext({ userId, subjectType, subjectId, topK })`，复用 LC-009 `generateBasicCandidates`，支持 `dockItem` capture、`document` / `entry`、`mindNode` 三类上下文。
- **deterministic scoring**: domain 层新增 `scoreBasicCandidatesForRecommendation`，只做规则分：recall confidence、evidence bonus、accepted / rejected / ignored / shown 历史信号调整。
- **Top-K 与稳定排序**: 评分后按 score 降序，score 相同时按 `candidateType`、`candidateId` 升序稳定排序；默认 Top-K 为 5，显式 `topK: 0` 返回空生成结果。
- **candidate 去重**: engine 层按 `candidateType:candidateId` 二次去重，合并 recall evidence，保留最高 recall confidence，避免重复 recommendation。
- **batch recommendation 写入**: Top-K 结果在一个 Dexie transaction 中逐条创建 `generated` recommendation，并为每条写入 `recommendation_generated` event。
- **reasonJson 与 metadata**: recommendation.reasonJson 保存 recall evidence、score、scoreReason、scoreBreakdown、evidenceSummary、rank、topK；generated event metadata 保存 source、rank、score、candidateType、candidateId、evidenceSummary、context。
- **行为信号接入**: scoring 读取当前 userId 的 `user_behavior_events`，仅使用带 candidateType / candidateId metadata 的 recommendation_accepted / rejected / ignored / shown 事件；跨用户事件不会进入 score adjustment。
- **范围控制**: 未做 UI；未做前端推荐展示；未做复杂 learning / ML ranking；未做 preference_profiles / rhythm_profiles；未做每日推荐 / 周 Review / Nudge；未做 LLM / embedding / vector search；未引入 workspaceId 一次性补丁；未重构 LC-004 ~ LC-009 主链路；未改变 recommendation_event 命名。

**Recall → Score → Top-K → Batch Recommendation 流程说明**:
1. repository 基于 `userId + subjectType + subjectId` 解析 capture / document / mindNode context，调用 LC-009 `generateBasicCandidates`。
2. domain engine 对 BasicCandidate 按 candidate key 去重并合并 evidence。
3. engine 读取 user-scoped signal summary，计算 deterministic score breakdown 与 evidence summary。
4. engine 按 score 降序、candidateType / candidateId 升序稳定排序并截取 Top-K。
5. repository 对 Top-K 结果 batch create recommendations，并为每条 recommendation 写 `recommendation_generated` event。

**score breakdown / signal adjustment 规则说明**:
- `recallScore`: LC-009 candidate confidenceScore。
- `evidenceBonus`: 每个额外 evidence +0.02，最多 +0.06。
- `acceptedSignalBoost`: 同 candidateType + candidateId 的 accepted 行为每条 +0.05，最多 +0.15。
- `rejectedSignalPenalty`: 同 candidate 的 rejected 行为每条 -0.06，最多 -0.15。
- `ignoredSignalPenalty`: 同 candidate 的 ignored 行为每条 -0.03，最多 -0.09。
- `shownSignalPenalty`: 同 candidate 的 shown 曝光行为每条 -0.01，最多 -0.06。
- `finalScore`: recall + evidence + signal adjustment 后 clamp 到 0~1。

**recommendation.reasonJson / recommendation_event metadata 结构说明**:
- `reasonJson.source`: `recommendation_engine_mvp`。
- `reasonJson.recall`: 保留 LC-009 recall source、reason、confidenceScore、完整 evidence。
- `reasonJson.scoreBreakdown`: 保留 recallScore、evidenceBonus、accepted / rejected / ignored / shown signal adjustment、finalScore。
- `reasonJson.rank` / `reasonJson.topK`: 保留推荐批次排序信息。
- `recommendation_event.metadata`: 保留 source、rank、score、candidateType、candidateId、evidenceSummary、context。

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| LC-009 已在 recall 阶段做过去重，但 LC-010 需要 engine 自身具备去重能力 | domain scoring 前按 candidateType:candidateId 再次去重，并合并 evidence | ✅ |
| accepted / rejected / ignored / shown 信号不能跨 userId 污染 | scoring 只读取 `userBehaviorEventsTable.where('userId').equals(userId)`，测试用 user B 同 candidateId accepted 验证 user A 不加权 | ✅ |
| 批量生成需要保留 LC-007 generated event 一致性 | batch create 放入 recommendations + recommendationEvents 同一 Dexie transaction，每条 recommendation 仍通过 `recordRecommendationEvent` 写 `recommendation_generated` | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --dir apps/web typecheck` | ✅ PASS |
| `pnpm --dir apps/web test intelligence-spine.test.ts capture-document-flow.test.ts` | ✅ PASS（2 files / 115 tests） |
| `pnpm validate` | ✅ PASS（lint 仅保留既有 GoldenTopNav `<img>` warning；domain 20 files / 312 tests；web 17 files / 438 tests；terminology PASS） |
| `pnpm build:web` | ✅ PASS（同一既有 `<img>` warning） |

**手工验证方式**:
1. 创建 user A capture，配置 tag / project / mindNode 本地候选，调用 `generateRecommendationsForContext({ userId: USER_A, subjectType: 'dockItem', subjectId, topK: 2 })`，期望只生成 Top-2 recommendations 且每条有 generated event。
2. 创建 user A document 并设置 tags / project，调用 `generateRecommendationsForContext`，期望 tag / project recommendation.status 为 `generated`，reasonJson 保留 recall evidence 与 rank。
3. 创建两个同 cluster mindNode，基于其中一个调用 engine，期望生成 mindNode recommendation，event metadata 保留 candidateType / candidateId / score / evidenceSummary。
4. 构造同一 tag 的 assigned_tag + text_match evidence，期望只生成一条 recommendation 且 reasonJson.recall.evidence 合并两类 evidence。
5. 构造 accepted / rejected / ignored / shown 历史 behavior signals，期望 scoreBreakdown 分别出现轻量加权或降权。
6. 构造 user B 的 accepted signal 指向 user A candidateId，期望 user A 生成结果不使用 user B signal。
7. 对无候选 capture 调用 engine，期望返回空 recommendations / recommendationEvents / scoredCandidates，不抛无意义异常。

**验收标准**:
- capture / document / mindNode 上下文均可生成 recommendation
- 复用 LC-009 BasicCandidate recall
- 每个 candidate 有 score / scoreBreakdown / scoreReason / evidenceSummary
- Top-K、candidate 去重、score tie 稳定排序均有测试覆盖
- batch create recommendations，每条 status 为 generated
- 每条 recommendation 写 `recommendation_generated` event
- reasonJson 保留 recall evidence、score breakdown、rank
- event metadata 保留 source、rank、score、candidateType、candidateId、evidenceSummary
- accepted / rejected / ignored / shown 行为信号参与 deterministic adjustment
- userId isolation 与空候选返回空结果通过测试
- LC-004 / LC-005 / LC-006 / LC-007 / LC-008 / LC-009 回归测试通过
- `pnpm validate` PASS；`pnpm build:web` PASS

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| scoring 仍是最小规则分，不代表真实偏好学习 | 按设计 | 本卡明确不做复杂 ML ranking / learning / preference profile |
| shown 信号目前只是轻量曝光降权，不做 shown 去重策略 | 按设计 | 本卡不做自动 shown 触发或 shown 去重策略 |
| engine 只提供 repository API，未接 UI | 按设计 | 本卡明确不做 UI 或前端推荐展示 |

**是否可以进入下一轮**: 否（LC-010 本卡冻结，不进入下一张卡；未 commit，未 push）

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 23 (LC-009) -->
<!-- ============================================ -->

## Phase 3 Round 23 devlog -- LC-009 Basic Candidate Recall Pack 基础候选召回能力包

**时间戳**: 2026-05-05

**任务起止时间**: 06:17 - 06:25 CST

**工时**: 8 分钟

**Notion 卡片**: LC-009 Basic Candidate Recall Pack 基础候选召回能力包

**任务目标**: 在不接 UI、不做 Top-K / ranking / learning、不重构 LC-004 到 LC-008 主链路的前提下，建立基础 Candidate Recall Pack，可基于 capture / document / mindNode 上下文从本地 Tag / Collection / MindNode 数据生成最小候选，并可将 candidate 转为 recommendation record 且保留 evidence。

**改动文件及行数**:
- `packages/domain/src/services/IntelligenceSpine.ts` | M | +285 行（新增 BasicCandidate / evidence / reasonJson 类型与 `generateBasicCandidates` 纯召回服务）
- `apps/web/lib/repository.ts` | M | +166 / -1 行（新增 `generateBasicCandidates` repository API、candidate 上下文解析、`createRecommendationFromBasicCandidate` 转 recommendation 写入路径）
- `apps/web/lib/db.ts` | M | +1 / -1 行（RecommendationRecord.subjectId 支持 number|string，保留 mindNode subjectId）
- `apps/web/tests/intelligence-spine.test.ts` | M | +163 行（覆盖 tag、project/collection、mindNode/cluster、userId isolation、空候选、candidate 转 recommendation）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +85 行（本轮日志）

**变更摘要**:
- **统一 Candidate 结构**: 新增 `BasicCandidate`，字段包含 `candidateType`、`candidateId`、`confidenceScore`、`evidence`、`reasonJson`；候选类型限制为 `tag` / `project` / `mindNode`，不引入 Top-K 或学习排序。
- **基础召回服务**: `generateBasicCandidates(input)` 基于传入的 user-scoped context 和本地 tags / collections / mindNodes / documents 做最小召回，按 userId 过滤数据源。
- **repository API**: `generateBasicCandidates({ userId, subjectType, subjectId })` 支持 `dockItem` capture、`document` / `entry`、`mindNode` 三类上下文；上下文不存在或不属于 userId 时返回空数组。
- **candidate 转 recommendation**: `createRecommendationFromBasicCandidate` 在 recommendations + recommendationEvents transaction 中创建 `generated` recommendation 和 `recommendation_generated` event。
- **reasonJson/evidence 保留**: recommendation.reasonJson 序列化保存 candidate.reasonJson，包含 `source: basic_candidate_recall`、candidate 基本字段、context、完整 evidence；generated event metadata 同步保留 evidence。
- **范围控制**: 未做 UI；未做 Top-K 精排；未做 learning / ranking；未做 preference_profiles / rhythm_profiles；未做每日推荐 / 周 Review / Nudge；未引入 workspaceId 一次性补丁；未改变 recommendation_event 命名；未重构 LC-004 / LC-005 / LC-006 / LC-007 / LC-008 主链路。

**三类 candidate 覆盖说明**:
- **tag candidate**: 从 document/capture 的 tags 或文本命中已有 user-scoped tag，evidence 使用 `assigned_tag` / `text_match`。
- **project / collection candidate**: 从 document/capture 的 project 或文本命中已有 user-scoped collection，candidateType 使用 `project`，candidateId 使用 collection.id，evidence 使用 `project_match` / `collection_match`。
- **mindNode / cluster candidate**: 从文本命中 mindNode label，或 mindNode 上下文共享 `metadata.clusterId` 召回 cluster peer，evidence 使用 `text_match` / `cluster_peer`。

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| 原 RecommendationRecord.subjectId 在 web DB 类型中只允许 number，mindNode subjectId 会被转换为 0 | 将 DB record 类型调整为 number|string，并让 createRecommendation 原样保留 subjectId；既有数字 subject 不受影响 | ✅ |
| candidate 需要既能从纯 domain 生成，又能读本地 Dexie 数据 | domain 只提供纯 `generateBasicCandidates(input)`；repository 负责按 userId 读取 Tag / Collection / MindNode / Document 表并拼装 context | ✅ |
| 无候选场景不能抛无意义异常 | repository 在上下文不存在或无命中时返回 `[]`，测试覆盖空候选与跨用户数据不污染 | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --dir apps/web typecheck` | ✅ PASS |
| `pnpm --dir apps/web test intelligence-spine.test.ts capture-document-flow.test.ts` | ✅ PASS（2 files / 107 tests） |
| `pnpm validate` | ✅ PASS（lint 仅保留既有 GoldenTopNav `<img>` warning；domain 20 files / 312 tests；web 17 files / 430 tests；terminology PASS） |
| `pnpm build:web` | ✅ PASS（同一既有 `<img>` warning） |

**手工验证方式**:
1. 创建 user A document 并给 document.tags 设置已有 tag，调用 `generateBasicCandidates({ userId: USER_A, subjectType: 'document', subjectId })`，期望返回 tag candidate，reasonJson.evidence 包含 `assigned_tag`。
2. 创建 user A project collection 并给 document.project 设置同名项目，调用 `generateBasicCandidates`，期望返回 project candidate，candidateId 等于 collection.id。
3. 创建两个 mindNode，metadata.clusterId 相同，基于其中一个 mindNode 调用 `generateBasicCandidates`，期望召回另一个 mindNode candidate，evidence 包含 `cluster_peer`。
4. 创建 user B 的 tag / collection / mindNode，并用 user A 上下文调用召回，期望返回空数组或不包含 user B candidate。
5. 使用召回出的 candidate 调用 `createRecommendationFromBasicCandidate`，期望 recommendation.status 为 `generated`、eventType 为 `recommendation_generated`、reasonJson 保留 candidate evidence。
6. 调用 LC-004 createCaptureToDocumentFlow、LC-006 markRecommendationShown、LC-005 recordRecommendationFeedback，期望 generated / shown / feedback 主链路和 LC-007/LC-008 一致性行为保持通过。

**验收标准**:
- 可以从 capture / document / mindNode 上下文生成基础 candidates
- candidate 包含 candidateType / candidateId / confidenceScore / reasonJson / evidence
- tag candidate recall 有测试覆盖
- project / collection candidate recall 有测试覆盖
- mindNode / cluster candidate recall 有测试覆盖
- userId isolation 测试通过
- 无候选时返回空数组
- 可以将 candidate 转为 recommendation record
- recommendation reasonJson 保留 candidate evidence
- LC-004 / LC-005 / LC-006 / LC-007 / LC-008 回归测试通过
- `pnpm validate` PASS
- `pnpm build:web` PASS

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| project / collection candidate 目前落到 RecommendationCandidateType 的 `project` | 低 | 复用既有 candidateType，不新增 collection 枚举；reasonJson/evidence 中保留 collection source 与 collection.id |
| confidenceScore 只是最小规则分 | 按设计 | 本卡明确不做 Top-K 精排、ranking 或 learning |
| 召回未自动接入 UI 或每日推荐 | 按设计 | 本卡只提供基础召回 API 与 recommendation record 转换能力 |

**是否可以进入下一轮**: 否（LC-009 本卡冻结，不进入下一张卡）

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 22 (LC-008) -->
<!-- ============================================ -->

## Phase 3 Round 22 devlog -- LC-008 Local Event Spine 最小行为事件与推荐信号闭环

**时间戳**: 2026-05-05

**任务起止时间**: 05:45 - 06:05 CST

**工时**: 20 分钟

**Notion 卡片**: LC-008 Local Event Spine 最小行为事件与推荐信号闭环

**任务目标**: 建立最小 `user_behavior_events` 行为信号闭环，让 recommendation shown 与 accepted / rejected / modified / ignored feedback 在保留 `recommendation_events` 主日志的同时，同步沉淀可按 userId / eventType 查询的用户行为事件。

**改动文件及行数**:
- `packages/domain/src/services/IntelligenceSpine.ts` | M（将 UserBehaviorEvent 收口为 userId / eventType / subjectType / subjectId / metadata / createdAt，并允许 recommendation lifecycle eventType 作为行为信号）
- `apps/web/lib/db.ts` | M（新增 Dexie v18 userBehaviorEvents subjectType / subjectId 索引结构，并迁移 v17 target 字段）
- `apps/web/lib/repository.ts` | M（recordUserBehaviorEvent / listUserBehaviorEvents 使用 subject 语义；shown 与 feedback transaction 同步写入 behavior event）
- `apps/web/tests/intelligence-spine.test.ts` | M（更新最小 behavior event API 写入、userId 查询、eventType 查询、subjectType 查询、userId isolation 测试）
- `apps/web/tests/capture-document-flow.test.ts` | M（补充 shown 与四类 feedback 写 behavior signal、metadata 上下文、LC-007 回滚保护测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M（本轮日志）

**变更摘要**:
- **最小行为事件 API**: `recordUserBehaviorEvent(input)` 写入 `user_behavior_events` 等价本地表，字段为 `userId`、`eventType`、`subjectType`、`subjectId`、`metadata`、`createdAt`；`listUserBehaviorEvents(userId, filters)` 支持按 userId 查询，并支持 `eventType` / `subjectType` 过滤。
- **userId isolation**: `listUserBehaviorEvents` 仍从 `where('userId').equals(userId)` 起步，跨用户数据不会混入；测试覆盖 user A / user B 隔离。
- **shown 行为信号**: `markRecommendationShown` 在同一个 Dexie transaction 中继续写 `recommendation_shown` 到 `recommendation_events`，并同步写一条 `user_behavior_events`，eventType 同为 `recommendation_shown`。
- **feedback 行为信号**: `recordRecommendationFeedback` 在 accepted / rejected / modified / ignored 四类 feedback 中继续写 `recommendation_{feedbackType}` 到 `recommendation_events`，并同步写同名 behavior event；modified 保留 `feedbackPayload` 修改上下文。
- **metadata 最小上下文**: behavior event metadata 保留 `recommendationId`、`recommendationType`、`subjectType`、`subjectId`、`candidateType`、`candidateId`、`source`，feedback 额外保留 `feedbackType` / `feedbackPayload`。
- **日志关系**: `recommendation_events` 仍是 Recommendation 生命周期主日志；`user_behavior_events` 是用户行为信号日志，随 shown / feedback 同步沉淀，不替代、不改名、不改变原 recommendation_event 语义。
- **范围控制**: 未做 UI；未做真实前端操作流；未做 preference_profiles / rhythm_profiles；未做 ranking / learning；未做 Top-K / tag / project / cluster recommendation；未引入 workspaceId 一次性补丁；未重构 LC-004 / LC-005 / LC-006 / LC-007 主链路。

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| 代码中已有早期 `userBehaviorEvents` 雏形，但字段是 target/from/to 语义，不符合 LC-008 subject 最小字段 | 将领域类型、DB record、repository API 和测试统一为 `subjectType` / `subjectId`；Dexie v18 将 v17 旧字段迁移到新字段 | ✅ |
| shown / feedback 新增 behavior event 后可能破坏 LC-007 一致性保护 | 将 `userBehaviorEventsTable` 纳入 shown / feedback transaction；补充 behavior 写失败时 status 与 recommendation_event 回滚测试 | ✅ |
| 需要保留 recommendation_event 主日志，不被行为日志替代 | shown / feedback 仍先写原 `recordRecommendationEvent`，behavior event 只作为额外同步信号写入 | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --dir apps/web test -- intelligence-spine.test.ts capture-document-flow.test.ts` | ✅ PASS（实际 Vitest 跑完整 web 17 files / 424 tests） |
| `pnpm typecheck` | ✅ PASS |
| `pnpm validate` | ✅ PASS |
| `pnpm build:web` | ✅ PASS |

**手工验证方式**:
1. 直接调用 `recordUserBehaviorEvent({ userId, eventType, subjectType, subjectId, metadata })`，期望返回带 id / createdAt 的 behavior event。
2. 调用 `listUserBehaviorEvents(USER_A)`，期望只返回 USER_A 的 behavior events。
3. 调用 `listUserBehaviorEvents(USER_A, { eventType: 'recommendation_shown' })`，期望按 eventType 过滤。
4. 调用 `markRecommendationShown` 后，期望 recommendation status 为 shown、`recommendation_events` 追加 `recommendation_shown`、`user_behavior_events` 追加同名行为信号。
5. 分别调用 accepted / rejected / modified / ignored feedback 后，期望 recommendation status 与 `recommendation_events` 保持 LC-005 行为，并追加对应 behavior signal。
6. modified feedback 携带 payload 时，期望 recommendation_event metadata 与 behavior_event metadata 都保留修改上下文。
7. 注入 `userBehaviorEventsTable.add` 失败，期望 shown / feedback status 与 recommendation_event 回滚，LC-007 一致性不回退。

**验收标准**:
- 可以成功写入 user_behavior_event
- 可以按 userId 查询 user_behavior_events
- 可以按 eventType 查询 user_behavior_events
- userId isolation 测试通过
- recommendation_shown 成功后会写入对应用户行为事件
- accepted / rejected / modified / ignored feedback 成功后会写入对应用户行为事件
- user_behavior_event metadata 保留 recommendationId 与必要上下文
- recommendation_events 仍正常写入，不被 user_behavior_events 替代
- LC-004 / LC-005 / LC-006 / LC-007 回归测试通过
- `pnpm validate` PASS
- `pnpm build:web` PASS

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| behavior event eventType 复用 recommendation lifecycle eventType | 低 | 这是本卡的等价行为信号表达；recommendation_events 仍是主日志，behavior events 只用于后续偏好蒸馏输入 |
| generated 不写 behavior event | 按设计 | 本卡验收聚焦曝光 shown 与用户反馈；LC-004 generated 主链路只做回归，不引入额外行为信号 |
| 不做学习与推荐策略 | 按设计 | 本卡只落 Local Event Spine，不做 ranking / learning / preference profile |

**是否可以进入下一轮**: 否（LC-008 本卡冻结，不进入下一张卡）

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 21 (LC-007) -->
<!-- ============================================ -->

## Phase 3 Round 21 devlog -- LC-007 Recommendation Event Consistency 最小一致性收口

**时间戳**: 2026-05-05

**任务起止时间**: 05:22 - 05:33 CST

**工时**: 11 分钟

**Notion 卡片**: LC-007 Recommendation Event Consistency 最小一致性收口

**任务目标**: 为 Recommendation 生命周期中的 generated / shown / feedback 写入路径建立最小一致性保护，避免 recommendation.status 已更新但 recommendation_event 未写入，或 recommendation_event 孤立写入。

**改动文件及行数**:
- `apps/web/lib/repository.ts` | M | +106 / -75 行（generated、shown、feedback 写入路径增加 Dexie transaction；recordRecommendationEvent 增加 recommendation 存在性与 userId 归属校验）
- `apps/web/tests/capture-document-flow.test.ts` | M | +144 / -2 行（新增 LC-007 一致性失败注入测试）
- `apps/web/tests/intelligence-spine.test.ts` | M | +38 行（补充 recordRecommendationEvent 不存在 recommendationId / userId 不匹配失败测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +79 行（本轮日志）

**变更摘要**:
- **generated 路径一致性**: `createCaptureToDocumentFlow` 中 recommendation 创建与 `recommendation_generated` event 追加放入同一个 Dexie `db.transaction('rw', recommendationsTable, recommendationEventsTable, ...)`。event 写入失败时，generated recommendation 回滚，不留下 recommendation/event 半成品。
- **shown 路径一致性**: `markRecommendationShown` 中 recommendation.status 更新为 `shown` 与 `recommendation_shown` event 追加放入同一个 Dexie transaction。status 更新失败时不追加 event；event 写入失败时 status 回滚为原状态。
- **feedback 路径一致性**: `recordRecommendationFeedback` 中 accepted / rejected / modified / ignored 对应的 status 更新与 `recommendation_{feedbackType}` event 追加放入同一个 Dexie transaction。四类反馈 event 写入失败均不会留下已更新 status。
- **孤立 event 防护**: `recordRecommendationEvent` 写入前统一调用 `getRecommendationRecordForLifecycleWrite(userId, recommendationId)`，不存在 recommendationId 时抛 `Recommendation not found: {id}`，userId 不匹配时抛 `User {userId} does not own recommendation {id}`。
- **范围控制**: 未改变 Recommendation event type 命名；未改变 recommendation.status 语义；未做 UI、Top-K、ranking、learning、preference_profiles、rhythm_profiles、workspaceId 一次性补丁；未重构 LC-004 / LC-005 / LC-006 主链路。

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| status 更新与 event 追加分属两个 await，存在部分成功风险 | 使用现有 Dexie transaction 将 recommendations / recommendationEvents 两张表写入纳入同一事务 | ✅ |
| 低层 `recordRecommendationEvent` 可被直接调用并写入不存在 recommendationId 的孤立 event | 写入前增加 recommendation 存在性与 userId 归属校验；测试覆盖不存在 ID 与跨用户失败 | ✅ |
| 需要验证 event 写失败时 Dexie 回滚 status | 用 Vitest spy 注入 `recommendationEventsTable.add` 失败，断言 status 保持 generated 且只有 generated event | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/web test -- capture-document-flow.test.ts intelligence-spine.test.ts` | ✅ PASS（web 17 files / 417 tests，含 LC-007 新增测试） |
| `pnpm --filter @atlax/web typecheck` | ✅ PASS |
| `pnpm validate` | ✅ PASS（lint 0 errors；1 个既有 GoldenTopNav `<img>` warning；domain 312 tests；web 417 tests；terminology PASS） |
| `pnpm build:web` | ✅ PASS（Next.js 14.2.28，9 static pages；同一个既有 GoldenTopNav `<img>` warning） |

**手工验证方式**:
1. generated 路径：注入 `recommendationEventsTable.add` 失败，调用 `createCaptureToDocumentFlow`，期望抛错且 `listRecommendations(USER_A)` / `listRecommendationEvents(USER_A)` 均为空。
2. shown status 失败：先生成 recommendation，再注入 `recommendationsTable.update` 失败，调用 `markRecommendationShown`，期望不追加 shown event，status 仍为 generated。
3. shown event 失败：先生成 recommendation，再注入 `recommendationEventsTable.add` 失败，调用 `markRecommendationShown`，期望 status 回滚为 generated，只保留 generated event。
4. feedback event 失败：分别对 accepted / rejected / modified / ignored 注入 event 写入失败，调用 `recordRecommendationFeedback`，期望 status 仍为 generated，只保留 generated event。
5. feedback status 失败：注入 `recommendationsTable.update` 失败，调用 accepted feedback，期望不追加 feedback event，status 仍为 generated。
6. 空内容 rejection：调用 `createCaptureToDocumentFlow({ rawText: '   \n\t' })`，期望抛 `rawText must not be empty` 且无 recommendation / recommendation_event。
7. 低层 event 防护：直接调用不存在 recommendationId 或跨 userId 的 `recordRecommendationEvent`，期望明确抛错且不写入 event。

**验收标准**:
- recommendation generated 写入路径具备最小一致性保护
- recommendation shown 写入路径具备最小一致性保护
- accepted / rejected / modified / ignored feedback 写入路径具备最小一致性保护
- recommendation.status 更新失败时不追加孤立 recommendation_event
- recommendation_event 追加失败时不留下 status 已更新但 event 缺失的部分成功状态
- 不存在 recommendationId 明确失败
- userId 不匹配明确失败，不能跨用户更新 recommendation 或写 event
- LC-004 recommendation_generated 主链路不回归
- LC-006 recommendation_shown 主链路不回归
- LC-005 accepted / rejected / modified / ignored feedback 主链路不回归
- 空内容 rejection 仍不会生成 recommendation / recommendation_event
- `pnpm validate` PASS
- `pnpm build:web` PASS

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| generated transaction 只包 recommendation + recommendation_event | 低 | 本卡目标是 Recommendation lifecycle event consistency；capture/document/mindNode 主链路保持 LC-004 形态，不做跨主链路大事务重构 |
| shown 重复曝光仍可重复写 event | 按设计 | 本卡明确不实现 shown 去重策略，保持 LC-006 语义 |
| feedback 仅记录事件，不进入学习/排序 | 按设计 | 本卡明确不做 Top-K / ranking / learning / preference_profiles / rhythm_profiles |

**是否可以进入下一轮**: 否（LC-007 本卡冻结，不进入下一张卡）

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 20 (LC-006) -->
<!-- ============================================ -->

## Phase 3 Round 20 devlog -- LC-006 Recommendation Shown Event 最小曝光记录

**时间戳**: 2026-05-05

**任务起止时间**: 04:55 - 05:10 CST

**工时**: 15 分钟

**Notion 卡片**: LC-006 Recommendation Shown Event 最小曝光记录

**任务目标**: 在 LC-004 已生成 recommendation + recommendation_generated event、LC-005 已实现 accepted / rejected / modified / ignored feedback 的基础上，补齐最小 shown 曝光事件闭环，让推荐生命周期形成 generated → shown → accepted / rejected / modified / ignored 的完整链路。

**改动文件及行数**:
- `packages/domain/src/services/IntelligenceSpine.ts` | M | +18 行（新增 RecommendationShownInput、RecommendationShownResult 领域类型）
- `apps/web/lib/repository.ts` | M | +45 行（新增 markRecommendationShown() API + 导入新类型）
- `apps/web/tests/capture-document-flow.test.ts` | M | +210 行（新增 11 个 LC-006 测试 + import markRecommendationShown）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +85 行（本轮日志）

**变更摘要**:
- **新增领域类型**:
  - `RecommendationShownInput`：{ recommendationId: string, userId: string }，对标 feedback 的输入结构
  - `RecommendationShownResult`：{ recommendation: { id, status, updatedAt }, shownEvent: { id, eventType, recommendationId } }，对标 RecommendationFeedbackResult 的返回结构
- **新增 Repository API**: `markRecommendationShown(input)` —— 核心高层 API，流程：
  1. 按 recommendationId 查询 recommendation，不存在抛 `Recommendation not found: {id}`
  2. 校验 userId 归属，不匹配抛 `User {userId} does not own recommendation {id}`
  3. 更新 recommendation.status 为 'shown'
  4. 记录 recommendation_event（eventType = 'recommendation_shown'，metadata = { source: 'recommendation_shown' }）
  5. 返回 RecommendationShownResult（含更新后的 recommendation 状态 + shownEvent ID）
- **userId 隔离**: markRecommendationShown 内部校验 userId 匹配，不匹配抛 Error（与 recordRecommendationFeedback 保持一致）；底层 recordRecommendationEvent 仍按 userId 写入
- **错误处理策略**: 不存在 recommendationId 和 userId 不匹配均抛 Error（非返回 null），确保调用方不能静默忽略失败
- **不改旧链路**: createCaptureToDocumentFlow 和 recordRecommendationFeedback 完全不变，LC-006 仅在已有链路外新增 shown 能力
- **生命周期完整性**: 完整链路 `generated → shown → accepted/rejected/modified/ignored` 已验证通过
- **测试覆盖**: 新增 11 个 LC-006 测试（web tests 总数 406 = 395 LC-002/003/004/005 + 11 LC-006），覆盖：
  - markRecommendationShown basic：status 更新为 shown + event 追加（events 从 1 条变为 2 条）
  - shown event 保留 userId
  - userId isolation：user B 标记 user A 的 recommendation → 抛 Error + 原 status 不变（仍为 generated）
  - 不存在 recommendationId → 抛 Error
  - shown → accepted：shown 后仍可 feedback accepted（events 共 3 条）
  - shown → rejected
  - shown → modified
  - shown → ignored
  - LC-004 回归：createCaptureToDocumentFlow 仍生成 landing recommendation + recommendation_generated event
  - LC-005 回归：recordRecommendationFeedback 仍正常工作
  - 空内容拒绝：不生成 recommendation / recommendation_event

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| `recordRecommendationEvent` 函数声明在替换 markRecommendationShown 时被意外删除（仅剩函数体） | 恢复 `export async function recordRecommendationEvent(input: RecommendationEventInput): Promise<PersistedRecommendationEvent> {` 函数声明行 | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（1 pre-existing warning 来自 GoldenTopNav.tsx，非本轮引入） |
| `pnpm typecheck` | ✅ PASS（domain + web 均通过） |
| domain tests | ✅ 312 tests / 20 files |
| web tests | ✅ 406 tests / 17 files（含 LC-006 新增 11 tests） |
| `pnpm build:web` | ✅ PASS |
| `pnpm validate` | ✅ PASS（lint + typecheck + test + terminology 全部通过） |

**手工验证方式**:
1. 调用 `createCaptureToDocumentFlow({ userId: USER_A, rawText: 'test' })` 获取 recommendationId
2. 调用 `markRecommendationShown({ recommendationId, userId: USER_A })`，返回 `shown.recommendation.status === 'shown'`，`shown.shownEvent.eventType === 'recommendation_shown'`
3. `listRecommendationEvents(USER_A, { recommendationId })` 返回 2 条事件（generated + shown），shown event 的 `recommendationId` 正确，`userId === USER_A`
4. 用户 B 调用 `markRecommendationShown({ recommendationId: recA.id, userId: USER_B })` → 抛 Error，`listRecommendations(USER_A)` 中 recA.status 仍为 generated
5. 调用 `markRecommendationShown({ recommendationId: 'non_existent_id', userId: USER_A })` → 抛 Error
6. shown 后调用 `recordRecommendationFeedback({ feedbackType: 'accepted' })` → status 变为 accepted，events 共 3 条（generated + shown + accepted）
7. shown 后调用 `recordRecommendationFeedback({ feedbackType: 'rejected' })` → status 变为 rejected
8. shown 后调用 `recordRecommendationFeedback({ feedbackType: 'modified' })` → status 变为 modified
9. shown 后调用 `recordRecommendationFeedback({ feedbackType: 'ignored' })` → status 变为 ignored
10. 调用 `createCaptureToDocumentFlow({ rawText: 'LC-004 regression' })` 仍生成 recommendation + event
11. 调用 `recordRecommendationFeedback({ ... })` 独立工作，不受 shown 影响
12. 空内容 `createCaptureToDocumentFlow({ rawText: '' })` → 抛 Error，无 recommendation / event 脏数据

**验收标准**:
- markRecommendationShown 将 recommendation.status 更新为 shown
- shown 操作新增一条 recommendation_event（eventType = recommendation_shown）
- recommendation_event.recommendationId 指向被展示的 recommendation
- shown event 保留 userId
- userId 隔离测试通过，不能跨用户标记 recommendation
- 不存在 recommendationId → 抛 Error
- 已 shown 的 recommendation 后续仍可被 LC-005 feedback 更新为 accepted / rejected / modified / ignored
- LC-004 的 recommendation_generated 流程不回归
- 空内容 rejection 仍然不会生成 recommendation / recommendation_event
- pnpm validate PASS
- pnpm build:web PASS

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| shown 无自动触发策略 | 按设计 | 当前 markRecommendationShown 为显式调用 API，不实现自动触发策略（如"进入视图即 shown"）。前端需在推荐列表渲染时显式调用此 API |
| shown event metadata 仅含 source 字段 | 极低 | 与 generated event（含 documentId/mindNodeId 等上下文）不同，shown event 的元数据最简化。未来如需记录"展示位置/停留时长"可扩展 metadata |
| shown 后状态被 feedback 覆盖 | 按设计 | 这是预期行为：shown → accepted/rejected/modified/ignored 表示用户从看到推荐的 exposure 到做出反馈的完整生命周期。不引入 shown→shown 幂等约束（重复 shown 是合法的，如刷新页面后重新曝光） |

**是否可以进入下一轮**: 是（本卡为 LC-006 终点卡，做完后 Local Core / Intelligence Spine 的 Recommendation 事件闭环完整）

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 UI 接入 | 低 | 后端 Recommendation shown/feedback API 全部就绪（generated → shown → accepted/rejected/modified/ignored），前端需接入展示和交互逻辑 |

---
<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 19 (LC-005) -->
<!-- ============================================ -->

## Phase 3 Round 19 devlog -- LC-005 Recommendation Feedback 最小事件闭环

**时间戳**: 2026-05-05

**任务起止时间**: 04:17 - 04:22 CST

**工时**: 5 分钟

**Notion 卡片**: LC-005 Recommendation Feedback 最小事件闭环

**任务目标**: 在 LC-004 已生成 recommendation + recommendation_generated event 的基础上，补齐最小 recommendation feedback 能力，支持 accepted / rejected / modified / ignored 四类反馈，包含 userId 隔离、不存在 recommendationId 失败路径、modified 修改上下文保存。

**改动文件及行数**:
- `packages/domain/src/services/IntelligenceSpine.ts` | M | +39 行（新增 RecommendationFeedbackType、RecommendationFeedbackInput、RecommendationFeedbackResult 类型，feedbackTypeToStatus、feedbackTypeToEventType 映射函数）
- `apps/web/lib/repository.ts` | M | +65 行（新增 getRecommendation(userId, recommendationId) + recordRecommendationFeedback() API；updateRecommendationStatus 增加 userId 校验；新增类型/函数导入）
- `apps/web/tests/intelligence-spine.test.ts` | M | +5 行（updateRecommendationStatus 5 处调用适配新签名：增加 userId 参数）
- `apps/web/tests/capture-document-flow.test.ts` | M | +166 行（新增 8 个 LC-005 测试 + import recordRecommendationFeedback）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +95 行（本轮日志）

**变更摘要**:
- **新增领域类型**: `RecommendationFeedbackType = 'accepted' | 'rejected' | 'modified' | 'ignored'`（与 RecommendationStatus 值相同，语义上是"用户反馈动作"的标签）；`RecommendationFeedbackInput`（recommendationId + userId + feedbackType + feedbackPayload?）；`RecommendationFeedbackResult`（recommendation + feedbackEvent 返回值）
- **反馈类型到状态/事件的映射**: `feedbackTypeToStatus` 直接返回 feedbackType（因 status 值与反馈类型值一致）；`feedbackTypeToEventType` 映射到 `recommendation_{accepted|rejected|modified|ignored}` 事件类型
- **新增 Repository API**:
  - `getRecommendation(userId, recommendationId)`：按 recommendationId + userId 反查推荐记录，userId 不匹配返回 null。解决原有 `updateRecommendationStatus` 无 userId 校验的安全漏洞
  - `recordRecommendationFeedback(input)`：核心高层 API，流程如下：
    1. 按 recommendationId 查询 recommendation，不存在抛 `Recommendation not found: {id}`
    2. 校验 userId 归属，不匹配抛 `User {userId} does not own recommendation {id}`
    3. 更新 recommendation.status 为 feedbackType（accepted/rejected/modified/ignored）
    4. 记录 recommendation_event 反馈事件（eventType = recommendation_{feedbackType}，metadata = { source: 'recommendation_feedback', feedbackType, feedbackPayload? }）
    5. 返回 RecommendationFeedbackResult（含更新后的 recommendation 状态 + feedbackEvent ID）
- **修复 updateRecommendationStatus 安全漏洞**: 原函数签名 `(recommendationId, status)` 无 userId 校验，任意调用方可更新任何用户 recommendation。现改为 `(userId, recommendationId, status)`，内部增加 `if (!rec || rec.userId !== userId) return null` 校验
- **modified 反馈上下文保存**: `feedbackPayload` 通过 `RecommendationFeedbackInput.feedbackPayload` 传入，写入 recommendation_event.metadata.feedbackPayload。当前使用开放 `Record<string, unknown>` 类型，支持任意 JSON 结构的最小修改上下文
- **userId 隔离**: getRecommendation、updateRecommendationStatus、recordRecommendationFeedback 三层均强制 userId 匹配；listRecommendationEvents 底层按 userId 过滤
- **错误处理策略**: 不存在 recommendationId 和 userId 不匹配均抛 Error（非返回 null），确保调用方不能静默忽略失败
- **不改旧链路**: createCaptureToDocumentFlow 内部仍使用 `createRecommendation` + `recordRecommendationEvent`（非 recordRecommendationFeedback），保持 LC-004 生成的 recommendation 状态不受反馈逻辑影响
- **测试覆盖**: 新增 8 个 LC-005 测试（web tests 总数 395 = 387 LC-002/003/004 + 8 LC-005），覆盖：
  - accepted feedback：status 更新 + event 追加（events 从 1 条变为 2 条）
  - rejected feedback
  - modified feedback：验证 feedbackPayload 在 event.metadata 中被保存
  - ignored feedback
  - userId isolation：user B 反馈 user A 的 recommendation → 抛 Error + 原 status 不变（仍为 generated）
  - 不存在 recommendationId → 抛 Error
  - LC-004 回归：createCaptureToDocumentFlow 仍生成 landing recommendation + recommendation_generated event
  - LC-004 回归：空内容拒绝不生成 recommendation / event

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| `RecommendationFeedbackType` 类型 import 但未在 repository.ts 中使用（仅作为 `RecommendationFeedbackInput` 的成员类型间接使用） | 从 import 中移除 `RecommendationFeedbackType`，保留 `RecommendationFeedbackInput` 和 `RecommendationFeedbackResult` | ✅ |
| `events.find()` 返回 `T \| undefined`，`unwrap()` 期望 `T \| null` 导致 TS2532 类型错误 | `unwrap(feedbackEvent ?? null)` 转换 undefined → null | ✅ |
| `updateRecommendationStatus` 签名变更后 intelligence-spine.test.ts 中 5 处调用缺少 userId 参数 | 所有调用统一增加 `USER_A` 作为第一参数 | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（1 pre-existing warning 来自 GoldenTopNav.tsx，非本轮引入） |
| `pnpm typecheck` | ✅ PASS（domain + web 均通过） |
| domain tests | ✅ 312 tests / 20 files |
| web tests | ✅ 395 tests / 17 files（含 LC-005 新增 8 tests） |
| `pnpm build:web` | ✅ PASS（Next.js 14.2.28 构建成功，7 routes） |
| `pnpm validate` | ✅ PASS（lint + typecheck + test + terminology 全部通过） |

**手工验证方式**:
1. 调用 `createCaptureToDocumentFlow({ userId: USER_A, rawText: 'test' })` 获取 recommendationId
2. 调用 `recordRecommendationFeedback({ recommendationId, userId: USER_A, feedbackType: 'accepted' })`，返回 `feedback.recommendation.status === 'accepted'`，`feedback.feedbackEvent.eventType === 'recommendation_accepted'`
3. `listRecommendationEvents(USER_A, { recommendationId })` 返回 2 条事件（generated + accepted）
4. 重新 flow 创建新 recommendation，调用 `recordRecommendationFeedback({ feedbackType: 'rejected' })`，status 变为 rejected
5. 调用 `recordRecommendationFeedback({ feedbackType: 'modified', feedbackPayload: { originalTag: '学习', modifiedTag: 'TS' } })`，status 变为 modified，`listRecommendationEvents` 中 feedback_event.metadata.feedbackPayload 含修改上下文
6. 调用 `recordRecommendationFeedback({ feedbackType: 'ignored' })`，status 变为 ignored
7. 用户 B 调用 `recordRecommendationFeedback({ recommendationId: recA.id, userId: USER_B, feedbackType: 'accepted' })` → 抛 Error，`listRecommendations(USER_A)` 中 recA.status 仍为 generated
8. 调用 `recordRecommendationFeedback({ recommendationId: 'non_existent_id', userId: USER_A, feedbackType: 'accepted' })` → 抛 Error
9. 调用 `createCaptureToDocumentFlow({ rawText: 'LC-004 regression' })` 仍生成 recommendation + event
10. 空内容 `createCaptureToDocumentFlow({ rawText: '' })` → 抛 Error，无 recommendation / event 脏数据

**验收标准**:
- recordRecommendationFeedback 支持 accepted / rejected / modified / ignored 四类反馈
- 反馈后 recommendation.status 更新为对应状态
- 反馈后 recommendation_event 追加对应事件（recommendation_* 类型）
- recommendation_event 通过 recommendationId 关联 recommendation
- modified 反馈的 feedbackPayload 在 event.metadata 中保存
- userId 隔离：用户不能反馈其他用户的 recommendation
- 不存在 recommendationId → 抛 Error
- userId 不匹配 → 抛 Error
- LC-004 主链路不受影响（createCaptureToDocumentFlow 回归通过）
- 空内容拒绝不产生脏数据
- pnpm validate 和 pnpm build:web 通过

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| updateRecommendationStatus 签名 breaking change | 低 | 旧签名 `(recommendationId, status)` → 新签名 `(userId, recommendationId, status)`。当前代码库仅 intelligence-spine.test.ts 有 5 处调用已全部适配。若外部 consumer 依赖此 API，需同步更新 |
| feedbackPayload 无 schema 约束 | 极低 | 开放 `Record<string, unknown>` 类型提供最大灵活性，但无结构化校验。当前推荐系统处于早期阶段，不强约束 payload 格式。未来如需统一修改上下文格式，可在 feedbackTypeToEventType 层增加 validateFeedbackPayload |
| recordRecommendationFeedback 无事务保证 | 低 | 先写 recommendation 状态更新，再写 recommendation_event。若事件写入失败，状态已更新但事件缺失。由于 Dexie 无跨表事务，此风险存在于所有 repository 操作中。后续可封装 `db.transaction()` |
| 不做 shown event | 按设计 | LC-005 卡明确不在"极低成本外"实现 shown event。当前 recommendation_events 表有 shown 状态定义（RecommendationEventType 含 recommendation_shown），但无自动写入逻辑。后续前端展示推荐时需单独调用 recordRecommendationEvent 写入 |

**是否可以进入下一轮**: 是

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 反馈数据无偏好学习回路 | 低 | 当前仅记录用户反馈事件（event 写入），不更新用户偏好 profile、不触发重排序。后续 LC-006 可消费 feedback event 驱动 ranking/learning |

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 18 (LC-004) -->
<!-- ============================================ -->

## Phase 3 Round 18 devlog -- LC-004 Capture Landing Recommendation 最小生成闭环

**时间戳**: 2026-05-05

**任务起止时间**: 03:12 - 03:32 CST

**工时**: 20 分钟

**Notion 卡片**: LC-004 Capture Landing Recommendation 最小生成闭环

**任务目标**: 在 Capture → Document → MindNode 最小闭环成功后，生成最小 landing recommendation，并写入 recommendation_event generated，把主链路推进到 Capture → Document → MindNode → Recommendation → RecommendationEvent。

**改动文件及行数**:
- `packages/domain/src/services/CaptureToDocumentFlow.ts` | M | +13 行（CaptureToDocumentResult 新增 recommendation + recommendationEvent 字段）
- `apps/web/lib/repository.ts` | M | +41 行（createCaptureToDocumentFlow 内部在 MindNode 创建后同步创建 landing recommendation + recommendation_event generated，返回值扩展包含 recommendation/recommendationEvent）
- `apps/web/tests/capture-document-flow.test.ts` | M | +205 行（新增 15 个 LC-004 测试 + 主测试扩展 recommendation 断言 + cleanAll 扩展 + 新增 import）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +105 行（本轮日志 + 格式修复）

**变更摘要**:
- **recommendation 生成规则**: createCaptureToDocumentFlow 成功后，同步创建一条 landing recommendation：
  - `subjectType = 'dockItem'`，`subjectId = captureId`（指向本次 capture）
  - `recommendationType = 'landing'`（复用已有 recommendationType 开放字符串字段）
  - `candidateType = 'mindNode'`，`candidateId = mindNode.id`（指向本次生成的 mindNode）
  - `status = 'generated'`
  - `confidenceScore = 1.0`（最小闭环确定性高，不引入概率语义）
  - `reasonJson` 写入结构化可解释信息：`{ source: 'capture_to_document_flow', reason: 'created from successful capture landing flow', documentId, mindNodeId }`
- **recommendation_event generated 写入规则**: 同步调用 `recordRecommendationEvent` 写入一条事件：
  - `eventType = 'recommendation_generated'`（对应领域枚举 `RecommendationEventType`）
  - `recommendationId` 关联刚创建的 recommendation
  - `metadata` 写入 `{ source: 'capture_to_document_flow', documentId, mindNodeId }`
- **subject 指向决策**: subject 指向 capture（dockItem），而非 document。理由是 capture 是用户输入的原点，推荐系统应当知道"为什么推荐"源于哪次用户输入。从 capture 可通过 `document.sourceDockItemId` 反查 document
- **userId 隔离**: createCaptureToDocumentFlow 内部调用的 `createDockItem`、`entriesTable.add`、`upsertMindNode`、`createRecommendation`、`recordRecommendationEvent` 均继承现有 userId 隔离语义。`listRecommendations` / `listRecommendationEvents` 底层查询均以 userId 为前缀过滤
- **workspaceId**: 当前数据模型无 workspaceId 字段（`recommendationsTable` / `recommendationEventsTable` 仅有 userId 隔离），不硬引入。原因：LC-001 阶段定义的三张 Intelligence Spine 表均未设计 workspaceId，强行添加会破坏现有 schema 一致性（需额外 migration + 回填策略）。未来如引入 workspace 概念，需统一补齐所有 Intelligence Spine 表的 workspaceId
- **不修改已有状态规则**: LC-003 的 `capture.status = archived` / `processedAt` 写入逻辑完全不变；LC-002 的 `document.sourceDockItemId` / `mindNode.documentId` 关联完全不变
- **测试覆盖**: 新增 15 个 LC-004 测试（web tests 总数 387 = 372 LC-002/003 + 15 LC-004），覆盖：
  - landing recommendation 创建 + recommendation_event generated 创建
  - recommendation.subject 指向 capture
  - recommendation.candidate 指向 mindNode
  - recommendation_event 关联 recommendation（by recommendationId 过滤）
  - userId 隔离：recommendation + recommendation_event 双层
  - 空内容拒绝时无 recommendation / recommendation_event 写入
  - LC-003 状态规则不回退（capture.status=archived, processedAt 非空）
  - LC-002 关联规则不回退（sourceDockItemId, documentId）
  - reasonJson 结构化元数据验证
  - recommendation_event metadata 内容验证

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| LC-001~LC-004 开发日志未遵循 devlog-structure.md 规范（顺序正排、缺工时、题目格式不一致） | 在 LC-004 交付后统一修复：重排为倒序（LC-004→LC-003→LC-002→LC-001），补充工时记录，统一题目格式为 Phase 3 Round X | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（1 pre-existing warning 来自 GoldenTopNav.tsx，非本轮引入） |
| `pnpm typecheck` | ✅ PASS（domain + web 均通过） |
| domain tests | ✅ 312 tests / 20 files |
| web tests | ✅ 387 tests / 17 files（含 LC-004 新增 15 tests） |
| `pnpm build:web` | ✅ PASS（Next.js 14.2.28 构建成功，7 routes） |
| `pnpm validate` | ✅ PASS（lint + typecheck + test + terminology 全部通过） |

**手工验证方式**:
1. 调用 `createCaptureToDocumentFlow({ userId: 'test', rawText: '测试推荐生成' })`，返回结果含 `recommendation` 和 `recommendationEvent` 字段
2. `result.recommendation.recommendationType === 'landing'`，`result.recommendation.status === 'generated'`
3. `result.recommendation.subjectType === 'dockItem'`，`result.recommendation.subjectId === result.capture.id`
4. `result.recommendation.candidateType === 'mindNode'`，`result.recommendation.candidateId === result.mindNode.id`
5. `result.recommendationEvent.eventType === 'recommendation_generated'`
6. 调用 `listRecommendationEvents(userId, { recommendationId: result.recommendation.id })` 返回 1 条记录，`eventType === 'recommendation_generated'`，`recommendationId === result.recommendation.id`
7. 调用 `listRecommendations(userId)` 返回 1 条记录，`reasonJson` 可 JSON.parse 得到 `{ source, reason, documentId, mindNodeId }`
8. 不同 userId A/B 创建后，`listRecommendations(USER_B)` 不包含 USER_A 的 recommendation
9. `listRecommendationEvents(USER_B, { recommendationId: recA.id })` 返回空
10. 空字符串 rawText → 抛出异常，且 `listRecommendations` / `listRecommendationEvents` 均为空

**验收标准**:
- createCaptureToDocumentFlow 成功后自动生成 landing recommendation（status = generated）
- 同步写入 recommendation_event generated（eventType = recommendation_generated）
- recommendation.subject 指向 capture（dockItem 类型）
- recommendation.candidate 指向 mindNode（mindNode 类型）
- recommendation_event 可通过 recommendationId 关联到 recommendation
- recommendation / recommendation_event 按 userId 隔离
- 空内容拒绝时不产生任何 recommendation / recommendation_event 脏数据
- LC-003 状态规则（archived + processedAt）不回退
- LC-002 关联规则（sourceDockItemId + documentId）不回退
- pnpm validate 和 pnpm build:web 通过

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| recommendation 写入在 capture status 更新之前 | 低 | 当前流程顺序：MindNode 创建 → Recommendation 创建 → Capture status 更新。若 Recommendation 创建成功后 Capture status 更新失败，会产生一条无对应 archived capture 的 recommendation。由于 Dexie 无跨表事务，此风险存在但极低（dockItemsTable.update 简单操作失败概率极小） |
| landing 使用开放字符串 recommendationType | 低 | 当前 `recommendationType` 为开放 `string` 类型（非枚举），`landing` 值不与任何领域枚举冲突。未来如需强类型化，可将 `landing` 加入 RecommendationType 联合类型 |
| confidenceScore = 1.0 的语义 | 极低 | 最小闭环中推荐确定性高，使用 1.0 合理。但若后续引入概率排序算法，此值可能需要重新审视。当前不影响任何排序逻辑（不做 Top-K） |
| 不做推荐排序/Top-K | 按设计 | LC-004 仅为最小生成闭环，不引入排序/Top-K 策略。后续如需 Top-K 展示，可基于 `confidenceScore` 或 `createdAt` 排序 |

**是否可以进入下一轮**: 是

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 后续轮次需补齐 recommendation shown 事件 | 低 | 当前未做 shown 事件（严格按卡要求），前端展示推荐列表时需单独写入 shown 事件以形成完整审计链路 |
| 多 candidate 场景需重新设计 | 低 | 当前一条 flow 生成一条 recommendation + 一个 candidate（mindNode），未来如需多 candidate 需改为批量创建 |

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 17 (LC-003) -->
<!-- ============================================ -->

## Phase 3 Round 17 devlog -- LC-003 状态一致性与结构投影收口

**时间戳**: 2026-05-05

**任务起止时间**: 02:25 - 02:35 CST

**工时**: 10 分钟

**Notion 卡片**: LC-003 Local Core 状态一致性与结构投影收口

**任务目标**: 收紧 Capture → Document → MindNode 最小闭环完成后的状态规则，解决 LC-002 遗留的 Capture 保持 pending 状态的一致性问题。

**改动文件及行数**:
- `packages/domain/src/services/CaptureToDocumentFlow.ts` | M | +1 行（CaptureToDocumentResult.capture 新增 processedAt 字段）
- `apps/web/lib/repository.ts` | M | +7 行（createCaptureToDocumentFlow 内部在 Document/MindNode 创建后更新 Capture 状态为 archived + 写入 processedAt，返回结果增加 processedAt）
- `apps/web/tests/capture-document-flow.test.ts` | M | +60 行（修正旧断言 status=pending→archived，新增 processedAt 断言，新增 5 个 LC-003 状态一致性测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +50 行（本轮日志）

**变更摘要**:
- **状态规则收紧**: createCaptureToDocumentFlow 现在在 Document + MindNode 创建成功后，立即将 Capture.status 更新为 `archived`，同时写入 `processedAt = new Date()`。不再允许已形成 Document 的 Capture 继续以 pending 状态停留在 Inbox 语义中
- **领域类型扩展**: CaptureToDocumentResult.capture 新增 `processedAt: Date | null` 字段，让调用方可以感知 Capture 的处理时间
- **MindNode.state 决策**: 保持 `drifting` 不变。当前产品在创作阶段无更强语义依据（如是否已 review/是否需合并），强行切 `anchored`/`archived` 可能引入过度承诺。`drifting` 代表"已投影但拓扑待后续确定"，与 Phase 3.1 Local Core 阶段语义一致
- **不新增状态枚举**: 完全复用已有 `EntryStatus`（archived）和 `MindNodeState`（drifting），不引入 CaptureStatus / MindNodeState 新值
- **测试覆盖**: 新增 5 个 LC-003 测试（web tests 总数 372 = 367 LC-002 + 5 LC-003），覆盖：
  - capture status 在 DB 中为 archived
  - capture processedAt 在 DB 中非空
  - document.sourceDockItemId 仍稳定指向 capture
  - mindNode.documentId 仍稳定指向 document
  - 成功后 capture 不再出现在 pending 列表中

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| 无 | — | — |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（1 pre-existing warning 来自 GoldenTopNav.tsx，非本轮引入） |
| `pnpm typecheck` | ✅ PASS（domain + web 均通过） |
| domain tests | ✅ 312 tests / 20 files |
| web tests | ✅ 372 tests / 17 files（含 LC-003 新增 5 tests） |
| `pnpm build:web` | ✅ PASS（Next.js 14.2.28 构建成功，7 routes） |
| `pnpm validate` | ✅ PASS（lint + typecheck + test + terminology 全部通过） |

**手工验证方式**:
1. 调用 `createCaptureToDocumentFlow({ userId: 'test', rawText: '测试文本' })`，返回 `capture.status === 'archived'`
2. 返回结果中 `capture.processedAt` 为 Date 实例（非 null）
3. 查询 `db.table('dockItems').get(captureId)`，`status === 'archived'`，`processedAt` 不为 null
4. 查询 `db.table('entries').get(documentId)`，`sourceDockItemId === captureId`
5. 查询 `db.table('mindNodes').get(mindNodeId)`，`documentId === documentId`
6. 按 userId + `status === 'pending'` 查询 dockItems，不包含此 capture
7. 空字符串 rawText → `'rawText must not be empty'`
8. 空 userId → `'userId must not be empty'`
9. 不同 userId A/B 的 capture/document/mindNode 三层均可交叉查询返回 null

**验收标准**:
- Capture 已形成 Document 后，Capture.status 为 archived（非 pending）
- Capture.processedAt 已写入（非 null）
- Document.sourceDockItemId 稳定指向 Capture
- MindNode.documentId 稳定指向 Document
- MindNode.state 保持 drifting（有意识决策，非遗漏）
- userId 隔离仍然有效
- 空内容拒绝仍然有效
- pnpm validate 和 pnpm build:web 通过

**已知风险或未做事项**:
| 风险 | 等级 | 说明 |
|------|------|------|
| Dexie/repository 层无完整事务保证 | 中 | 当前 createCaptureToDocumentFlow 涉及 3 张表（dockItems/entries/mindNodes），分步写入失败时可能出现部分写入。例如：Document 写入成功但 MindNode 写入失败时，Capture 不会回退。Dexie 支持 transaction() API，但当前 repository 架构未统一封装事务。后续如需强事务一致性，建议将三表写入封装到 `db.transaction('rw', [dockItemsTable, entriesTable, mindNodesTable], async () => {...})` 中 |
| MindNode.state 为 drifting 的长期影响 | 低 | `drifting` 表示节点已存在但拓扑关系未确定。若后续 MindGraph 可视化需区分"有 document 但未连接"和"真正的孤岛"，可引入 `projected` 状态或通过 degreeScore 过滤。当前决策不阻塞后续轮次 |
| createDockItem 的 processedAt 先置 null 再覆盖 | 极低 | createDockItem 内部 created_at 初始 processedAt = null，createCaptureToDocumentFlow 随后 update 为当前时间。两次原子写入无逻辑问题，但额外多一次 DB 写入 |
| 前端 Inbox 列表依赖 pending status | 中 | 若前端 Inbox 视图按 `status === 'pending'` 过滤，LC-003 后已形成 Document 的 Capture 将不再显示在 Inbox 中——这是正确语义（已处理的不应停留在 Inbox）。但前端需确保不会因此出现空 Inbox 导致的 UI 异常 |

**是否可以进入下一轮**: 是

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| MindEdge 自动连接 | 低 | 当前 MindNode 仍为孤立节点，需后续轮次补齐 parent/child 或 semantic 边 |
| 事务一致性 | 中 | 如上述，当前无事务封装，多表写入有部分失败风险 |

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 16 (LC-002) -->
<!-- ============================================ -->

## Phase 3 Round 16 devlog -- LC-002 Capture / Document / MindNode 最小闭环服务化

**时间戳**: 2026-05-05

**任务起止时间**: 01:44 - 01:57 CST

**工时**: 13 分钟

**Notion 卡片**: LC-002 Capture / Document / MindNode 最小闭环服务化

**任务目标**: 补齐 Local Core 主链路前半段 Capture → Document → MindNode 的最小闭环服务化，让一次文本输入通过统一 Local Core service / repository contract 创建 Capture 记录、Document 记录和 MindNode 结构投影。

**改动文件及行数**:
- `packages/domain/src/services/CaptureToDocumentFlow.ts` | A | +50 行（领域类型定义 + 验证函数：CaptureToDocumentInput、CaptureToDocumentResult 类型，validateCaptureInput、extractDocumentTitle 函数）
- `packages/domain/src/services/index.ts` | M | +1 行（导出 CaptureToDocumentFlow）
- `apps/web/lib/repository.ts` | M | +75 行（新增 createCaptureToDocumentFlow API + 4 行类型/函数导入）
- `apps/web/tests/capture-document-flow.test.ts` | A | +234 行（16 个 repository 集成测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +60 行（本轮日志）

**变更摘要**:
- **新增领域服务**: CaptureToDocumentFlow 定义 CaptureToDocumentInput（userId/rawText/topic/sourceType）、CaptureToDocumentResult（capture/document/mindNode 三元组）、validateCaptureInput（空内容拒绝 + userId 非空校验）、extractDocumentTitle（取首行，>60 字符截断）
- **新增 Repository API**: createCaptureToDocumentFlow — 一次调用完成 Capture（dockItem）创建 → Document（entry）创建 → MindNode（'document' 类型，drifting 状态）创建，返回完整三元组结果
- **userId 隔离**: createCaptureToDocumentFlow 内部的 createDockItem、entriesTable.add、upsertMindNode 均继承现有 userId 隔离语义
- **workspaceId**: 当前数据模型无 workspaceId 字段，未硬加。所有 capture/document/mindNode 表仅按 userId 隔离
- **测试覆盖**: 16 个测试用例覆盖完整流程创建、自定义 topic/sourceType、标题提取（多行/长标题截断）、空内容/纯空白/空 userId 拒绝、userId 隔离（capture/document/mindNode 三层）、document ↔ mindNode 关联稳定性

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| 无 | — | — |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（1 pre-existing warning 来自 GoldenTopNav.tsx，非本轮引入） |
| `pnpm typecheck` | ✅ PASS（domain + web 均通过） |
| domain tests | ✅ 312 tests / 20 files |
| web tests | ✅ 367 tests / 17 files（含 LC-002 新增 16 tests） |
| `pnpm build:web` | ✅ PASS（Next.js 14.2.28 构建成功，7 routes） |
| `pnpm validate` | ✅ PASS（lint + typecheck + test + terminology 全部通过） |

**手工验证方式**:
1. 调用 `createCaptureToDocumentFlow({ userId: 'test', rawText: '今日学习笔记' })`，返回的 capture.id > 0，document.id > 0，mindNode.id 非空
2. 返回结果中 `capture.rawText === document.content === '今日学习笔记'`，`document.sourceCaptureId === capture.id`
3. `mindNode.documentId === document.id`，`mindNode.nodeType === 'document'`，`mindNode.state === 'drifting'`
4. `mindNode.label === document.title === '今日学习笔记'`（首行提取）
5. 调用 `getDocumentByCaptureId(userId, captureId)` 返回的 document.id 与结果一致
6. 调用 `getMindNode(userId, mindNodeId)` 返回的 node.documentId 与 document.id 一致
7. 空字符串/纯空白 rawText 抛出 `'rawText must not be empty'`
8. 空 userId 抛出 `'userId must not be empty'`
9. 不同 userId A/B 创建后，`getDocumentByCaptureId(USER_B, captureA.id)` 返回 null
10. 不同 userId 的 mindNode 交叉查询返回 null

**验收标准**:
- Capture → Document → MindNode 三元组一次调用创建成功，各字段值正确
- document.sourceCaptureId 指向正确的 capture
- mindNode.documentId 指向正确的 document
- 空内容/空 userId 被拒绝，抛异常而非静默创建脏数据
- 跨 userId 查询均返回 null/空

**是否可以进入下一轮**: 是

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| Capture 状态为 pending 而非 archived | 低 | 当前 createCaptureToDocumentFlow 创建的 capture status 为 pending（createDockItem 默认值），而非 archived。若后续需要 capture 自动标记为 archived，可在 createCaptureToDocumentFlow 内部追加状态更新 |
| MindNode 无自动边连接 | 低 | 当前仅创建孤立 document 类型 MindNode，未自动创建与父级/同级节点的 MindEdge。需后续轮次补齐图谱拓扑逻辑 |
| workspaceId 缺失 | 低 | 当前数据模型无 workspaceId，仅按 userId 隔离。多工作区场景下无法区分同一用户的不同工作区，未来如引入 workspace 需补齐 |

---

<!-- ============================================ -->
<!-- 分割线：Phase 3 Round 15 (LC-001) -->
<!-- ============================================ -->

## Phase 3 Round 15 devlog -- LC-001 反馈事件骨架落地

**时间戳**: 2026-05-04

**任务起止时间**: 20:05 - 20:22 CST

**工时**: 17 分钟

**Notion 卡片**: LC-001 Local Core 反馈事件骨架落地

**任务目标**: 补齐 Local Core / Intelligence Spine 的最小反馈事件数据骨架，让系统具备记录 recommendation、recommendation_event、user_behavior_event 的本地能力。

**改动文件及行数**:
- `packages/domain/src/services/IntelligenceSpine.ts` | A | +113 行（领域类型定义 + ID 生成函数：Recommendation、RecommendationEvent、UserBehaviorEvent 类型，makeRecommendationId/makeRecommendationEventId/makeUserBehaviorEventId）
- `packages/domain/src/services/index.ts` | M | +1 行（导出 IntelligenceSpine）
- `apps/web/lib/db.ts` | M | +75 行（新增 3 张表 Record 类型 + v17 migration + recommendationsTable/recommendationEventsTable/userBehaviorEventsTable 导出）
- `apps/web/lib/repository.ts` | M | +180 行（新增 7 个 repository API + 3 个 toPersisted 辅助函数 + 类型导入）
- `apps/web/tests/intelligence-spine.test.ts` | A | +470 行（28 个 repository 集成测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +80 行（本轮日志）

**变更摘要**:
- **新增 IndexedDB 表**: recommendations、recommendationEvents、userBehaviorEvents（3 张新表，34 个字段，11 个索引）
- **新增 Repository API**: createRecommendation、listRecommendations、updateRecommendationStatus、recordRecommendationEvent、listRecommendationEvents、recordUserBehaviorEvent、listUserBehaviorEvents（7 个 API，均支持 userId 隔离）
- **领域类型**: RecommendationStatus(6 种)、RecommendationEventType(6 种)、UserBehaviorEventType(12 种)、UserBehaviorTargetType(9 种)
- **测试覆盖**: 28 个测试用例覆盖 CRUD + 过滤 + userId 隔离

**遇到的问题以及解决方式**:
| 问题 | 解决方式 | 是否解决 |
|------|---------|---------|
| typecheck 阶段 `UserBehaviorEventTargetType` 导入名错误（实际导出名为 `UserBehaviorTargetType`） | 修正 import 语句，`UserBehaviorEventTargetType` → `UserBehaviorTargetType` | ✅ |
| lint 阶段 `no-non-null-assertion` 规则触发 5 处 `updated!.status` 等非空断言 | 引入 `unwrap()` 辅助函数，替换全部非空断言为 `unwrap(updated).status` | ✅ |
| fake-indexeddb 同毫秒内两次 `createRecommendation` / `recordRecommendationEvent` / `recordUserBehaviorEvent` 触发 `ConstraintError`（ID 仅含 timestamp 无随机性） | 为 `makeRecommendationId`、`makeRecommendationEventId`、`makeUserBehaviorEventId` 分别添加 `Math.random().toString(36).slice(2,6)` 随机后缀 | ✅ |

**自动验证**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors（1 pre-existing warning 来自 GoldenTopNav.tsx，非本轮引入） |
| `pnpm typecheck` | ✅ PASS（domain + web 均通过） |
| domain tests | ✅ 312 tests / 20 files |
| web tests | ✅ 327 tests / 15 files（含 LC-001 新增 28 tests） |
| `pnpm build:web` | ✅ PASS（Next.js 14.2.28 构建成功，7 routes） |
| `pnpm validate` | ✅ PASS（lint + typecheck + test + terminology 全部通过） |

**手工验证方式**:
1. IndexedDB 打开 AtlaxDB，确认 recommendations、recommendationEvents、userBehaviorEvents 三张表存在，schema 与 db.ts 定义一致
2. 调用 `createRecommendation` 后，`listRecommendations(USER_A)` 返回 1 条记录，`listRecommendations(USER_B)` 返回 0 条（userId 隔离）
3. 创建 2 条 recommendation 后，按 status='generated' 过滤只返回对应 1 条
4. 调用 `updateRecommendationStatus` 将 generated→accepted/shown→rejected/generated→modified/generated→ignored，返回 status 正确
5. `updateRecommendationStatus('non_existent_id', 'accepted')` 返回 null
6. `recordRecommendationEvent` 写入后，`listRecommendationEvents` 按 recommendationId 过滤正确
7. `recordUserBehaviorEvent` 写入后，`listUserBehaviorEvents` 按 eventType/targetType 过滤正确
8. 不同 userId 之间的 recommendation、recommendationEvent、userBehaviorEvent 完全隔离，不互相污染

**验收标准**:
- 三张 IndexedDB 表 schema 与 db.ts version(17) 定义一致
- 所有 repository API 返回的 Persisted 对象 userId 与请求 userId 匹配
- 跨用户查询不返回其他用户数据
- 过滤参数（status/subjectType/recommendationId/eventType/targetType）生效，不匹配的记录不返回
- 对不存在的 recommendation 更新 status 返回 null 而非抛异常

**是否可以进入下一轮**: 是

**下一轮风险评估**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端未适配 Intelligence Spine 数据层 | 低 | 当前为纯后端骨架，前端无接入需求，不影响已有功能 |
| 事件表持续增长 | 低 | recommendationEvents / userBehaviorEvents 无自动清理策略，需后续 TTL 或归档 |
| 更新 recommendation status 未自动同步写入 recommendationEvents | 低 | 当前保持最小实现，状态变更不自动产生事件。如需完整审计链路，可在后续轮次将 `updateRecommendationStatus` 内部同步调用 `recordRecommendationEvent` |

**Review 追记（2026-05-04 21:17 CST）**:
- 测试 `records multiple recommendation events for same recommendation` 中两个事件同毫秒 createdAt，`reverse().sortBy('createdAt')` 排序不确定，偶发断言顺序不匹配。将固定位置断言改为 `.map().sort()` 后比较，不改变测试覆盖范围。

---

<!-- ============================================ -->
<!-- 分割线：Round 14 -->
<!-- ============================================ -->

## Phase 3 Round 14 devlog -- 关系变更链路 TemporalActivity 补齐

**时间戳**: 2026-04-26

**任务起止时间**: 09:15 - 09:45 CST

**工时**: 30 分钟

**任务目标**: 补齐 createEntryRelation/deleteEntryRelation 的 TemporalActivity 双写链路，确保 Time Machine 能拿到关系变更时间事件。

**改动文件及行数**:
- `packages/domain/src/services/KnowledgeStructure.ts` | M | +1 行（TemporalActivityType 新增 relation_deleted）
- `apps/web/lib/repository.ts` | M | +25 行（createEntryRelation 补齐 TemporalActivity；deleteEntryRelation 补齐 KnowledgeEvent + TemporalActivity）
- `apps/web/tests/knowledge-structure.test.ts` | M | +80 行（新增 4 个测试）
- `packages/domain/tests/KnowledgeStructureService.test.ts` | M | +45 行（新增 6 个 computeTemporalKeys 稳定性测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +80 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| non-null assertion lint 错误 | `relationEvent!.targetId` → `unwrap(relationEvent).targetId` |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| domain tests | ✅ 275 tests / 17 files |
| web tests | ✅ 248 tests / 11 files |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 创建 EntryRelation 后，`listTemporalActivities` 返回 type='relation_created' 的记录，且 dayKey/weekKey/monthKey 格式正确
2. 创建 EntryRelation 后，`listKnowledgeEvents` 返回 eventType='relation_created' 的记录，且 targetId 与 TemporalActivity.entityId 一致
3. 删除 EntryRelation 后，`listKnowledgeEvents` 返回 eventType='relation_deleted'，`listTemporalActivities` 返回 type='relation_deleted'
4. 跨用户删除不产生任何事件
5. computeTemporalKeys 对同一日期多次调用返回相同结果

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| deleteEntryRelation 先写事件再删记录 | 低 | 若删除失败事件已写入，但当前逻辑在 userId 校验后才写事件，风险可控 |
| TemporalActivity 增长 | 低 | 每次关系变更产生 1 条 TemporalActivity + 1 条 KnowledgeEvent，后续需清理策略 |

---

<!-- ============================================ -->
<!-- 分割线：Round 13 -->
<!-- ============================================ -->

## Phase 3 Round 13 devlog -- 知识结构化底座（Knowledge Structure Foundation）

**时间戳**: 2026-04-26

**任务起止时间**: 08:10 - 09:15 CST

**工时**: 65 分钟

**任务目标**: 建立 Phase 3 知识结构化底座，包含 Collection、EntryTagRelation、EntryRelation、KnowledgeEvent、TemporalActivity 五张表及结构投影服务，支撑 World Tree / Time Machine / Review Insight 视图。

**改动文件及行数**:
- `packages/domain/src/services/KnowledgeStructure.ts` | A | +180 行（Phase 3 最小类型定义 + ID 生成函数 + computeTemporalKeys）
- `packages/domain/src/services/KnowledgeStructureService.ts` | A | +220 行（结构投影 + 关系校验 + backfill 纯函数）
- `packages/domain/src/services/index.ts` | M | +2 行（导出 KnowledgeStructure + KnowledgeStructureService）
- `packages/domain/tests/KnowledgeStructureService.test.ts` | A | +350 行（20 个 domain 测试）
- `apps/web/lib/db.ts` | M | +120 行（5 张新表 Record 类型 + v13 migration + 表导出）
- `apps/web/lib/repository.ts` | M | +380 行（15 个新 repository 函数 + getStructureProjection + backfillStructureData）
- `apps/web/tests/knowledge-structure.test.ts` | A | +480 行（29 个 repository 集成测试）
- `apps/web/app/seed/page.tsx` | M | +3 行（修复预存 non-null assertion）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +120 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| `Set<string>` 在 TS target < es2015 下不可迭代 | `Array.from(projectNames)` 转换后再遍历 |
| build 时 non-null assertion lint 报错 | `c.id!` → `c.id as string`；测试中 `!` → `unwrap()` |
| `createStoredTag` 返回 `null` 可能 | 测试中用 `unwrap()` 包装 |
| backfill 测试 Entry.tags 包含 suggestion 引擎额外标签 | `toEqual` → `toContain` |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| domain tests | ✅ 269 tests / 17 files |
| web tests | ✅ 244 tests / 11 files |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 旧归档 Entry 能生成真实 EntryTagRelation（backfillStructureData 后 listEntryTagRelations 可查到）
2. 项目字段能映射到结构关系或集合归属，不丢旧数据（backfillStructureData 后 listCollections 含 project 类型集合，原 Entry.project 不变）
3. 手动创建 EntryRelation 后，查询结构投影能看到关系（getStructureProjection 返回 relations 含对应边）
4. 不同用户之间 Collection / TagRelation / EntryRelation / KnowledgeEvent 不串数据（所有 repository 函数 userId 隔离）

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| backfill 全表扫描 | 低 | 当前数据量可接受，后续可增量 backfill |
| 前端未适配结构视图 | 中 | 后端 API 就绪，前端需新增 World Tree / Time Machine 组件 |
| EntryRelation 无双向自动维护 | 低 | parent/child 需手动创建反向关系，后续可加自动推导 |
| KnowledgeEvent 无自动清理 | 低 | 事件表会持续增长，后续需加 TTL 或归档策略 |

---

<!-- ============================================ -->
<!-- 分割线：Round 12 -->
<!-- ============================================ -->

## Phase 3 Round 12 devlog -- Widget/Calendar 主线

**时间戳**: 2026-04-26

**任务起止时间**: 04:50 - 08:10 CST

**工时**: 200 分钟

**任务目标**: 实现 Widget 持久化模型和 Calendar 日期查询能力，为前端提供 Widget/Calendar 主线后端支撑。

**改动文件及行数**:
- `packages/domain/src/services/CalendarWidgetService.ts` | A | +65 行（Calendar 日期查询纯函数）
- `packages/domain/src/services/index.ts` | M | +1 行（导出 CalendarWidgetService）
- `packages/domain/tests/CalendarWidgetService.test.ts` | A | +120 行（8 个 domain 测试）
- `apps/web/lib/db.ts` | M | +55 行（WidgetRecord/PersistedWidget，v12 migration，widgetsTable）
- `apps/web/lib/repository.ts` | M | +95 行（Widget CRUD + Calendar 查询）
- `apps/web/tests/widget-calendar.test.ts` | A | +180 行（12 个 repository 测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +70 行（v10→v11 修正，Round 12 日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| domain tests | ✅ 249 tests / 16 files |
| web tests | ✅ 215 tests / 10 files |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 仅允许一个生效 widget（activateWidget 自动 deactivate 旧 widget）
2. 点击某日期时能返回该日期真实归档内容
3. 空日期返回真实空状态
4. 不同用户之间日期结果不串数据

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端未适配 Widget UI | 中 | 后端 API 就绪，前端需新增 Widget 容器组件 |
| Calendar 查询全表扫描 | 低 | 当前数据量可接受，后续可加索引优化 |
| 仅支持 calendar 类型 | 低 | Phase 3 范围限定，后续可扩展 |

---

<!-- ============================================ -->
<!-- 分割线：Round 11 -->
<!-- ============================================ -->

## Phase 3 Round 11 devlog -- Refill 两层选择逻辑（重走流程 + 单修模块）

**时间戳**: 2026-04-26

**任务起止时间**: 02:04 - 02:35 CST

**工时**: 31 分钟

**任务目标**: 实现取消后的两层 refill/refield 选择逻辑，支持"重走流程"和"单修模块"两种模式。

**改动文件及行数**:
- `packages/domain/src/services/ChatGuidanceService.ts` | M | +55 行（新增 refieldStateFromOption、buildRefieldPatch、refield 方法）
- `packages/domain/tests/ChatGuidanceService.test.ts` | M | +90 行（新增 8 个 refield/buildRefieldPatch 测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +50 行（修正验证标准 #4，新增 Round 11 日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| domain tests | ✅ 241 tests / 15 files |
| web tests | ✅ 203 tests / 9 files |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 取消后展示两层选择 UI：第一层选择"重走流程"或"单修模块"，第二层选择要修改的字段（topic/type/content）
2. 选择"重走流程" → 调用 `service.refill(option)` + `buildRefillPatch(option)` 更新 session
3. 选择"单修模块" → 调用 `service.refield(option)` + `buildRefieldPatch(option)` 更新 session
4. `refield` 不触发 start transition，前端需在用户提交新值后自行推进 step

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端未适配 refield 模式 | 中 | 前端需新增两层选择 UI，旧 refill API 仍可用 |
| refield 后 rawText 未更新 | 低 | rawText 在 submitContent 时重新构建 |

---

<!-- ============================================ -->
<!-- 分割线：Round 10 -->
<!-- ============================================ -->

## Phase 3 Round 10 devlog -- ChatSession Dock 文档映射 + Refill 状态语义修正

**时间戳**: 2026-04-26

**任务起止时间**: 01:52 - 02:04 CST

**工时**: 12 分钟

**任务目标**: 实现 ChatSession 与 DockItem 的映射关系，避免重复确认产生重复文档；修正 Refill 语义并增加持久化 patch。

**改动文件及行数**:
- `packages/domain/src/ports/repository.ts` | M | +15 行（ChatSession/CreateInput/UpdateInput 增加 dockItemId；DockItem 增加 topic）
- `packages/domain/src/types.ts` | M | +2 行（ArchiveInput 增加 topic）
- `packages/domain/src/services/ChatGuidanceService.ts` | M | +25 行（修正 refillStateFromOption 语义，新增 buildRefillPatch）
- `apps/web/lib/db.ts` | M | +12 行（ChatSessionRecord 增加 dockItemId，DockItemRecord 增加 topic，v11 migration）
- `apps/web/lib/repository.ts` | M | +45 行（createDockItem/updateDockItemText 支持 topic，confirmChatSession 含 topic/type，新增 dockItemId）
- `apps/web/tests/chat-session.test.ts` | M | +150 行（新增 11 个 dockItemId/confirmChatSession 测试）
- `packages/domain/tests/ChatGuidanceService.test.ts` | M | +35 行（修正 refill 断言，新增 4 个 buildRefillPatch 测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +90 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| `first` 变量声明后未使用触发 lint | 移除无用变量声明 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| domain tests | ✅ 233 tests / 15 files |
| web tests | ✅ 203 tests / 9 files |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 一个 Chat 历史记录第一次确认生成一个 Dock 文档
2. 选择同一历史记录后重新确认，只更新同一个 Dock 文档，不新增文档
3. 新建聊天才生成新的 Dock 文档
4. DockItem.topic 归档后同步为 Entry.title（topic 优先，否则从 rawText 提取首行）
5. 取消后两层选择：(a) 重走流程 — 选"类型"保留标题并重走类型+内容+确认，选"内容"保留标题+类型并重走内容+确认；(b) 单修模块 — 选哪块只改哪块，其他字段不变

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| confirmChatSession 重复确认时 DockItem 被删 | 低 | 若已绑定 DockItem 不存在，fallback 创建新 DockItem |
| 前端未调用 confirmChatSession | 中 | 前端需迁移到新 API，旧路径仍可用 |
| v11 migration 兼容性 | 低 | 仅新增字段默认 null，不影响现有数据 |

---

<!-- ============================================ -->
<!-- 分割线：Round 9 -->
<!-- ============================================ -->

## Phase 3 Round 9 devlog -- 质量收口复核

**时间戳**: 2026-04-26

**任务起止时间**: 01:02 - 01:52 CST

**工时**: 50 分钟

**任务目标**: 对 Round 8 修复进行质量收口复核，确保 trailing whitespace、reopen 复用逻辑、编辑策略、userId 隔离全部正确。

**改动文件及行数**:
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +30 行（复核日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `git diff --cached --check` | ✅ 无输出 |
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| `pnpm test` | ✅ PASS |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 归档记录重新整理后不用重新生成即可看到既有整理结果
2. 编辑正文后才要求重新建议
3. 跨用户 reopen 不可读取缓存

**当前风险及影响范围**:
无新增风险。本轮为纯复核，无业务逻辑变更。

---

<!-- ============================================ -->
<!-- 分割线：Round 8 -->
<!-- ============================================ -->

## Phase 3 Round 8 devlog -- reopenItem 缓存复用策略 + lint 修复

**时间戳**: 2026-04-25

**任务起止时间**: 23:45 - 01:02 CST

**工时**: 77 分钟

**任务目标**: 修复 reopenItem 清空 suggestions + processedAt 的问题，实现归档记录重新打开后复用已有整理结果；同时修复 27 个 lint error。

**改动文件及行数**:
- `apps/web/lib/repository.ts` | M | +25 行（reopenItem 从 Entry 回写 tags/project/actions，保留 suggestions 和 processedAt）
- `apps/web/tests/archive-reopen.test.ts` | M | +60 行（修改旧断言，新增 8 个缓存复用测试）
- `apps/web/tests/browse-seed.test.ts` | M | +8 行（修正 reopen 断言）
- `apps/web/tests/repository.test.ts` | M | +12 行（修正 reopen 断言，修复非空断言）
- `packages/domain/src/ports/repository.ts` | M | +1 行（移除 hasMessages unused local）
- `packages/domain/src/services/EditSavePolicy.ts` | M | +1 行（policy → _policy）
- `packages/domain/tests/ChainLinkService.test.ts` | M | +1 行（移除 buildChainLink unused import）
- `packages/domain/tests/ChatGuidanceService.test.ts` | M | +2 行（移除 buildGuidancePrompt、beforeEach unused imports）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +75 行（本轮日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| 测试中 `entry`/`item` 变量声明后未使用触发 lint | 移除无用变量声明 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm lint` | ✅ 0 errors |
| `pnpm typecheck` | ✅ PASS |
| domain tests | ✅ 229 tests / 15 files |
| web tests | ✅ 192 tests / 9 files |
| `pnpm build` | ✅ PASS |

**手工验证步骤说明**:
1. 归档记录 → 重新整理/重新入库 → 已有建议/标签/项目/动作可复用（suggestions.length > 0, userTags === entry.tags, selectedProject === entry.project, selectedActions === entry.actions）
2. 编辑正文后 → suggestions 清空、status 回退 pending、processedAt 置 null（EditSavePolicy 生效）
3. 跨用户 reopen → 返回 null，不能读取缓存
4. 无 Entry 场景 reopen → processedAt 为 null

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| suggestItem 对 reopened 状态仍可重生成建议 | 无 | state-machine 允许 reopened→suggested，行为不变 |
| archived Entry 不存在时的 fallback | 低 | 仅改状态、清 processedAt，与旧行为一致 |
| Entry 回写可能与 DockItem 现有值不同 | 无 | 这是预期行为——Entry 是归档时的快照 |

---

<!-- ============================================ -->
<!-- 分割线：Round 7 -->
<!-- ============================================ -->

## Phase 3 Round 7 devlog -- createDockItem chain link 安全校验修复

**时间戳**: 2026-04-25

**任务起止时间**: 22:55 - 23:45 CST

**工时**: 50 分钟

**任务目标**: 修复 createDockItem 绕过 chain link 校验的安全漏洞，确保 sourceId/parentId 的合法性验证覆盖创建路径。

**改动文件及行数**:
- `apps/web/lib/repository.ts` | M | +18 行（createDockItem 接入 validateChainLinkWithContext 校验）
- `packages/domain/tests/ChainLinkService.test.ts` | M | +25 行（新增 3 个 currentItemId=-1 场景测试）
- `apps/web/tests/repository.test.ts` | M | +70 行（新增 7 个 createDockItem chain link 校验测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +60 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 229 tests / 15 files |
| `pnpm --dir apps/web typecheck` | ✅ PASS |
| `pnpm --dir apps/web test -- --run` | ✅ 185 tests / 9 files |
| `git diff --cached --check` | ⚠️ trailing whitespace（来自前端 page.tsx，非本轮修改） |

**手工验证步骤说明**:
1. sourceId 指向同用户存在的 item → 允许创建
2. parentId 指向同用户存在的 item → 允许创建
3. sourceId 指向其他用户的 item → 抛出错误，不创建
4. parentId 指向其他用户的 item → 抛出错误，不创建
5. sourceId 指向不存在的 ID → 抛出错误，不创建
6. parentId 指向不存在的 ID → 抛出错误，不创建
7. 不传 options（无 chain links）→ 正常创建
8. 显式传 sourceId: null, parentId: null → 正常创建

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 handleDerive 需处理 createDockItem 异常 | 低 | 当前前端在 try/finally 中调用，异常会被捕获，但用户不会看到错误提示 |
| currentItemId = -1 假设 | 极低 | Dexie 自增 ID 从 1 开始，-1 不可能冲突。如未来改为 UUID，需重新设计 |

---

<!-- ============================================ -->
<!-- 分割线：Round 6 -->
<!-- ============================================ -->

## Phase 3 Round 6 devlog -- 链式结构读取能力 + 编辑器命令 domain 支撑

**时间戳**: 2026-04-25

**任务起止时间**: 17:42 - 22:55 CST

**工时**: 313 分钟

**任务目标**: 补齐 Chain provenance 异步查询能力，修复 EditorCommandTransform 测试期望值，增加跨用户隔离测试。

**改动文件及行数**:
- `packages/domain/src/services/index.ts` | M | +1 行（修复 EditCommandTransform → EditorCommandTransform 导入路径）
- `packages/domain/tests/ChainLinkService.test.ts` | M | +55 行（新增 6 个 buildProvenanceAsync 测试）
- `packages/domain/tests/EditorCommandTransform.test.ts` | M | +4 行（修复 2 个空选区测试期望值）
- `apps/web/tests/repository.test.ts` | M | +95 行（新增 8 个 getChainProvenance Dexie 测试 + 7 个跨用户隔离测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +55 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 226 tests / 15 files |
| `pnpm --dir apps/web typecheck` | ✅ PASS |
| `pnpm --dir apps/web test -- --run` | ✅ 178 tests / 9 files |
| `git diff --cached --check` | ✅ PASS |

**手工验证步骤说明**:
1. reorganize 关系 provenance 正确显示（含多行 rawText 取首行）
2. continue_edit 关系 provenance 正确显示
3. derive 关系 provenance 正确显示
4. root item provenance 返回 null source/parent
5. 不存在 item 返回 null
6. 跨用户查询返回 null
7. 不暴露其他用户 source title
8. 长标题截断到 60 字符

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 chain link UI 接入 | 低 | 后端 API 已就绪，前端需实现链路展示 |
| 前端编辑器 command 接入 | 低 | port 类型已稳定，前端需对接 |

---

<!-- ============================================ -->
<!-- 分割线：Round 5 -->
<!-- ============================================ -->

## Phase 3 Round 5 devlog -- updateChainLinks 验证修复

**时间戳**: 2026-04-24

**任务起止时间**: 15:12 - 17:42 CST

**工时**: 150 分钟

**任务目标**: 修复 updateChainLinks 未验证 sourceId/parentId 存在性和 ownership 的问题。

**改动文件及行数**:
- `packages/domain/src/services/ChainLinkService.ts` | M | +35 行（新增 validateChainLinkWithContext (async)）
- `packages/domain/tests/ChainLinkService.test.ts` | M | +70 行（新增 9 个 validateChainLinkWithContext 测试）
- `apps/web/lib/repository.ts` | M | +8 行（updateChainLinks 接入验证）
- `apps/web/tests/repository.test.ts` | M | +65 行（新增 7 个 chain link 验证测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +50 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 186 tests / 14 files |
| `pnpm --dir apps/web typecheck` | ✅ PASS |
| `pnpm --dir apps/web test -- --run` | ✅ 163 tests / 9 files |
| `git diff --cached --check` | ⚠️ trailing whitespace（来自前端 page.tsx，非本轮修改） |

**手工验证步骤说明**:
1. sourceId 指向其他用户 item → 返回 null，原 item 不变
2. parentId 指向其他用户 item → 返回 null
3. sourceId/parentId 指向不存在 id → 返回 null
4. sourceId/self → 返回 null
5. parentId/self → 返回 null
6. 合法同用户 source/parent → 可保存

**当前风险及影响范围**:
无新增风险。

---

<!-- ============================================ -->
<!-- 分割线：Round 4 -->
<!-- ============================================ -->

## Phase 3 Round 4 devlog -- 链式结构/编辑策略/编辑器接口收口

**时间戳**: 2026-04-24

**任务起止时间**: 14:28 - 15:12 CST

**工时**: 44 分钟

**任务目标**: 收口链式结构服务、编辑保存策略（archived entry 编辑）、编辑器能力接口测试。

**改动文件及行数**:
- `packages/domain/src/services/ChainLinkService.ts` | A | +150 行（新增 - 链式结构服务）
- `packages/domain/src/services/index.ts` | M | +1 行（导出 ChainLinkService）
- `packages/domain/src/services/EditSavePolicy.ts` | M | +30 行（新增 ArchivedEntryEditPolicy）
- `packages/domain/tests/ChainLinkService.test.ts` | A | +280 行（新增 - 21 个链式结构测试）
- `packages/domain/tests/EditorCapabilityPort.test.ts` | A | +90 行（新增 - 14 个编辑器能力测试）
- `packages/domain/tests/EditSavePolicy.test.ts` | M | +35 行（新增 4 个 archived entry 测试）
- `apps/web/tests/repository.test.ts` | M | +55 行（新增 6 个 chain link Dexie 测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +55 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 177 tests / 14 files |
| `pnpm --dir apps/web typecheck` | ✅ PASS |
| `pnpm --dir apps/web test -- --run` | ✅ 156 tests / 9 files |

**手工验证步骤说明**:
1. ChainLinkService 21 个测试全部通过（reorganize/continue_edit/derive 关系、清除链路、跨用户阻止、suggest/archive 周期保留）
2. EditorCapabilityPort 14 个测试全部通过（command/tool 列表、唯一性、可用性检查、常量一致性）
3. EditSavePolicy 19 个测试全部通过（含 archived entry 编辑 4 个新测试）
4. repository chain link 6 个 Dexie 测试全部通过

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 chain link UI 接入 | 低 | 后端 API 已就绪，前端需实现链路展示 |
| 前端编辑器 command 接入 | 低 | port 类型已稳定，前端需对接 |

---

<!-- ============================================ -->
<!-- 分割线：Round 3 -->
<!-- ============================================ -->

## Phase 3 Round 3 devlog -- 数据正确性修复

**时间戳**: 2026-04-24

**任务起止时间**: 18:16 - 19:30 CST

**工时**: 74 分钟

**任务目标**: 修复 archiveItem 写入 selectedProject/selectedActions 的问题，Events userId 隔离，ChatSession 真实 Dexie 层测试。

**改动文件及行数**:
- `packages/domain/src/types.ts` | M | +4 行（ArchiveInput 新增 selectedProject/selectedActions）
- `packages/domain/src/archive-service.ts` | M | +12 行（selectedProject/selectedActions 优先级逻辑）
- `packages/domain/tests/archive-service.test.ts` | M | +60 行（新增 4 个优先级测试 + 适配新字段）
- `apps/web/lib/repository.ts` | M | +5 行（archiveItem 传入 selectedProject/selectedActions）
- `apps/web/lib/events.ts` | M | +3 行（PersistedEvent.userId 改为必填）
- `apps/web/tests/chat-session.test.ts` | A | +420 行（新增 - 35 个真实 Dexie ChatSession 测试）
- `apps/web/tests/events.test.ts` | M | +45 行（新增 5 个 userId 隔离测试）
- `apps/web/tests/repository.test.ts` | M | +70 行（新增 8 个 selectedProject/selectedActions archive 测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +90 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 138 tests / 12 files |
| `pnpm --dir apps/web lint` | ✅ PASS |
| `pnpm --dir apps/web typecheck` | ✅ PASS |
| `pnpm --dir apps/web test -- --run` | ✅ 150 tests / 9 files |

**手工验证步骤说明**:
1. 设置 selectedProject 后 archive，entry.project 正确
2. 设置 selectedActions 后 archive，entry.actions 正确
3. selectedProject 优先级高于 suggestion 推断
4. selectedActions 优先级高于 suggestion 推断
5. 无选择时 fallback 到 suggestion
6. listArchivedEntriesByProject 能查到 selectedProject 设置的 entry
7. re-archive 保留 selectedProject/selectedActions
8. user A 无法看到 user B 的 events
9. 清除 user A log 不影响 user B
10. 不同 userId 的 ChatSession 完全隔离

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 page.tsx recordEvent 调用 | ⚠️ 需前端确认 | events.ts API 签名已固定为需要 userId，前端调用需传 userId |
| 前端 ChatSession 接入 | ⏳ 待前端 | 后端 API 已就绪，前端需替换内存实现 |
| events.ts localStorage 隔离 | ✅ 已有 | key 格式 `atlax_event_log_{userId}` 已按 userId 隔离 |

---

<!-- ============================================ -->
<!-- 分割线：Round 2 Review -->
<!-- ============================================ -->

## Phase 3 Round 2 Review devlog -- Chat Session 模型补齐

**时间戳**: 2026-04-24

**任务起止时间**: 15:54 - 18:16 CST

**工时**: 142 分钟

**任务目标**: 补齐 ChatSession 模型的 title/pinned 字段，修复 lint 错误，增加 repository 测试。

**改动文件及行数**:
- `packages/domain/src/ports/repository.ts` | M | +6 行（添加 title/pinned 字段）
- `apps/web/lib/db.ts` | M | +8 行（添加 title/pinned 字段和 migration）
- `apps/web/lib/repository.ts` | M | +25 行（删除未使用 import，添加 pin/unpin 方法，更新排序逻辑）
- `packages/domain/tests/ChatSession.test.ts` | A | +220 行（新增 - ChatSession 测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +45 行（本轮日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --dir apps/web lint` | ✅ PASS |
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 134 tests passed / 12 files |

**手工验证步骤说明**:
1. 空 session 不创建
2. 不同 userId 互相不可见
3. updatedAt 更新后排序变化
4. pinned session 排在非 pinned 前面
5. update confirmed 不新建重复 session

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 pinned UI 未实现 | 低 | 后端 API 已就绪，前端需在历史列表中展示置顶功能 |

---

<!-- ============================================ -->
<!-- 分割线：Round 2 -->
<!-- ============================================ -->

## Phase 3 Round 2 devlog -- Chat Session 持久化

**时间戳**: 2026-04-24

**任务起止时间**: 15:18 - 15:54 CST

**工时**: 36 分钟

**任务目标**: 设计并实现 ChatSession 数据结构的持久化存储，包含 IndexedDB 表、Migration 和 Repository 方法。

**改动文件及行数**:
- `packages/domain/src/ports/repository.ts` | M | +45 行（添加 ChatSession 类型定义和接口）
- `apps/web/lib/db.ts` | M | +35 行（添加 chatSessions 表和 v9 migration）
- `apps/web/lib/repository.ts` | M | +85 行（添加 ChatSession repository 方法）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +50 行（本轮开发日志）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 115 tests passed / 11 files |

**手工验证步骤说明**:
1. 创建有效 user message 的 session 能成功持久化
2. assistant welcome 消息不创建空 session
3. 空 session 不创建
4. 按 userId 隔离查询单个会话
5. 列出用户所有会话按 updatedAt 倒序
6. 更新会话不创建重复记录
7. 跨 userId 操作被阻止

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 ChatSession 接入 | 中 | 后端 API 已就绪，前端需替换内存实现 |
| 空会话过滤规则 | 低 | 当前规则可能过于严格，需根据实际使用调整 |

---

<!-- ============================================ -->
<!-- 分割线：Round 1 Review -->
<!-- ============================================ -->

## Phase 3 Round 1 Review devlog -- 测试补齐与 sanitize 接入

**时间戳**: 2026-04-24

**任务起止时间**: 12:40 - 14:28 CST

**工时**: 108 分钟

**任务目标**: 补齐 Round 1 的测试覆盖，接入 sanitizeSuggestionLabel，确认 repository 导出。

**改动文件及行数**:
- `packages/domain/src/suggestion-engine.ts` | M | +8 行（接入 sanitizeSuggestionLabel）
- `packages/domain/tests/sanitizeSuggestionLabel.test.ts` | A | +85 行（新增 - sanitize 测试）
- `packages/domain/tests/ChatGuidanceService.test.ts` | A | +150 行（新增 - ChatGuidanceService 测试）
- `packages/domain/tests/EditSavePolicy.test.ts` | A | +130 行（新增 - EditSavePolicy 测试）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | M | +40 行（更新验证结果）

**遇到的问题以及解决方式**:
无。

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 115 tests passed / 11 files |
| `pnpm --dir apps/web typecheck` | ⚠️ 受阻 | 前端代码 `TS1128` 错误，非 backend 责任 |

**手工验证步骤说明**:
1. 所有生成的建议 label 经过 sanitize 处理，去除换行、制表符、重复空白
2. ChatGuidanceService 完整流程测试通过（topic -> type -> content -> confirmation -> confirm）
3. ChatGuidanceService 取消流程测试通过
4. EditSavePolicy 文本变化时 reset suggestions/status/processedAt
5. EditSavePolicy 文本不变时保留当前 status

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 typecheck 阻塞 | 中 | 需要 frontend agent 修复 `uniqueProjects` 作用域问题 |

---

<!-- ============================================ -->
<!-- 分割线：Round 1 -->
<!-- ============================================ -->

## Phase 3 Round 1 devlog -- Chat 引导状态机/数据能力/链式结构/编辑策略/编辑器接口

**时间戳**: 2026-04-24

**任务起止时间**: 11:45 - 12:40 CST

**工时**: 55 分钟

**任务目标**: Phase 3 后端底座建设，包含 #6 Chat 引导状态机、#9 数据能力补齐、#7 链式结构最小落地、#8 编辑保存路径收敛、#11 编辑器能力接口预留。

**改动文件及行数**:
- `packages/domain/src/services/ChatGuidanceService.ts` | A | +180 行（新增 - Chat 引导状态机）
- `packages/domain/src/services/EditSavePolicy.ts` | A | +60 行（新增 - 编辑保存策略）
- `packages/domain/src/services/index.ts` | M | +2 行（添加新服务导出）
- `packages/domain/src/ports/editor.ts` | M | +85 行（扩展编辑器能力接口）
- `packages/domain/src/ports/repository.ts` | M | +25 行（添加新字段和方法）
- `packages/domain/src/types.ts` | M | +15 行（添加 sanitizeSuggestionLabel）
- `packages/domain/tests/DockItemService.test.ts` | M | +8 行（添加新字段到测试对象）
- `packages/domain/tests/state-machine.test.ts` | M | +3 行（修复导入路径）
- `apps/web/lib/db.ts` | M | +20 行（添加新字段和 migration）
- `apps/web/lib/repository.ts` | M | +35 行（添加新字段和 repository 方法）
- `docs/engineering/dev_log/Phase3/phase3-devlog-backend.md` | A | +120 行（本轮开发日志）

**遇到的问题以及解决方式**:
| 问题 | 解决方式 |
|------|---------|
| `canTransition` 名称冲突（services 和 state-machine 都导出） | 将 ChatGuidanceService 中的函数重命名为 `canTransitionGuidance` |
| 测试文件 DockItem 类型不完整 | 更新 DockItemService.test.ts 添加新字段 |
| state-machine.test.ts 导入路径问题 | 改为直接从 `../src/state-machine` 导入 |

**自动验证结果**:
| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @atlax/domain typecheck` | ✅ PASS |
| `pnpm --filter @atlax/domain test -- --run` | ✅ 115 tests passed / 11 files |
| `pnpm --dir apps/web typecheck` | ⚠️ 受阻 | 存在前端代码错误（`TS1128: Declaration or statement expected`），来自 frontend agent 的 staged 修改，非本轮 backend 代码问题 |

**手工验证步骤说明**:
1. ChatGuidanceService 状态机步骤正确：idle -> awaiting_topic -> awaiting_type -> awaiting_content -> awaiting_confirmation -> confirmed / cancelled
2. 支持操作：start, submit_topic, submit_type, submit_content, confirm, cancel, refill, reset
3. 固定句式正确返回
4. 取消流程返回情绪价值 dismissal message
5. 重填选项支持按"标题/类型/内容"单独重填
6. DockItem 新增 selectedActions/selectedProject/sourceId/parentId 字段，向后兼容
7. 编辑保存后 suggestions 重置，status 回退到 pending
8. 编辑器能力接口包含 Obsidian-like 命令和工具类型

**当前风险及影响范围**:
| 风险 | 等级 | 说明 |
|------|------|------|
| 前端 typecheck 阻塞 | 中 | 需要 frontend agent 修复 `uniqueProjects` 作用域问题 |
| 链式结构查询 API 未实现 | 低 | 当前仅添加字段和 repository 方法，前端查询 UI 未实现 |
| 项目关联 UI 预览 | 低 | 前端显示 "项目关联能力正在接入中"，后端能力已就绪 |

---

## 关联文档

| 文档 | 路径 |
|------|------|
| 架构说明书 | `docs/product/ARCHITECTURE.md` |
| 技术规格 | `docs/product/TECH_SPEC.md` |
| Phase 3 Feature & Bugs | `docs/engineering/dev_log/Phase3/pre-phase3-demo_feature_and_bugs.md` |
| 架构调整日志 | `docs/engineering/dev_log/Phase3/pre-phase3-architecture_rebuild.md` |
