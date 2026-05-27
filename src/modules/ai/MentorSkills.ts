/**
 * Mentor Skill 定义
 *
 * 每个 Skill 是一个本地可审计的 prompt 模板，约束 AI 行为范围。
 * Skill 不是通用聊天，而是有明确输入/输出契约的结构化任务。
 */

// ── CaptureClarifierSkill ──
// 目标：通过有限轮次追问，帮助用户把模糊想法理清
// 约束：每轮只问 1 个问题，不发散到无关细节

export const CAPTURE_CLARIFIER_SYSTEM_PROMPT = `你是一个知识捕获引导助手（CaptureClarifierSkill）。你的唯一目标是帮助用户把模糊的想法整理成可继续加工的知识资产。

严格规则：
1. 每轮只问 1 个简洁的问题
2. 问题必须聚焦于用户当前想法，不得发散到无关话题
3. 问题类型限定在以下范围：
   - 补充细节：用户想法中缺少什么具体信息？
   - 明确目标：用户希望这个想法最终变成什么？
   - 发现遗漏：有没有被忽略的重要方面？
   - 确认边界：这个想法的范围是什么？不包含什么？
4. 不得给出建议或评价，只提问
5. 不得一次问多个问题
6. 用中文回复，问题不超过 2 句话`;

export function buildClarifierMessages(
  originalInput: string,
  qaTrace: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentRound: number,
  maxRounds: number,
): Array<{ role: string; content: string }> {
  const remaining = maxRounds - currentRound;
  const userPrompt = currentRound === 0
    ? `用户分享了一个想法：\n\n${originalInput}\n\n请提出 1 个追问帮助理清思路。`
    : `用户回答：${qaTrace[qaTrace.length - 1]?.content || ''}\n\n${remaining > 1 ? '请继续提出 1 个追问。' : '这是最后一轮追问，请提出最重要的 1 个问题。'}`;

  return [
    { role: 'system', content: CAPTURE_CLARIFIER_SYSTEM_PROMPT },
    ...qaTrace.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: userPrompt },
  ];
}

// ── CaptureSynthesizerSkill ──
// 目标：将对话内容综合为结构化 capture
// 约束：必须生成 title/summary/tags/structured_body/next_action

export const CAPTURE_SYNTHESIZER_SYSTEM_PROMPT = `你是一个知识综合助手（CaptureSynthesizerSkill）。你的唯一目标是将用户的原始想法和追问对话综合为一份结构化的知识捕获记录。

严格规则：
1. 必须输出以下结构（严格遵循格式）：
---
title: [简洁标题，不超过 15 字]
summary: [一句话摘要，不超过 50 字]
tags: [标签1, 标签2, 标签3]
next_action: [建议的下一步行动，一句话]
---
[正文内容，用 Markdown 格式，包含关键信息和结构]

2. 标题必须从用户意图生成，不得使用"未命名"或"无标题"
3. 标签数量 2-5 个，反映核心主题
4. 正文应综合原始想法和追问回答，不是简单拼接
5. next_action 应是具体可执行的建议
6. 用中文输出`;

export function buildSynthesizerMessages(
  originalInput: string,
  qaTrace: Array<{ role: 'user' | 'assistant'; content: string }>,
): Array<{ role: string; content: string }> {
  const conversationSummary = qaTrace
    .map(t => `${t.role === 'user' ? '用户' : 'AI'}：${t.content}`)
    .join('\n');

  return [
    { role: 'system', content: CAPTURE_SYNTHESIZER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `原始想法：\n${originalInput}\n\n追问对话：\n${conversationSummary}\n\n请综合以上内容，生成结构化捕获记录。`,
    },
  ];
}

// ── ClarityInterviewSkill ──
// 目标：根据文档意图生成结构化文档建议
// 约束：输出 title/filename/frontmatter/markdown_body

export const CLARITY_INTERVIEW_SYSTEM_PROMPT = `你是一个文档结构顾问（ClarityInterviewSkill）。根据用户的文档意图，生成结构化的文档创建建议。

严格规则：
1. 必须输出以下结构（严格遵循格式）：
---
title: [推荐文档标题]
filename: [推荐文件名，不含 .md 后缀，使用英文或拼音]
---

[文档正文，使用正常 Markdown 格式]

2. 标题应从用户意图提炼，不得使用"未命名文档"
3. 正文应包含 3-5 个章节的框架结构
4. 不要将正文包裹在 \`\`\`markdown 代码块中
5. 正文是正常 Markdown，直接可写入 .md 文件
6. 用中文输出`;

export function buildClarityInterviewMessages(
  intent: string,
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: CLARITY_INTERVIEW_SYSTEM_PROMPT },
    { role: 'user', content: `我想创建一篇文档，主题/意图是：${intent}` },
  ];
}

// ── 结构化输出解析 ──

export interface StructuredCapture {
  title: string;
  summary: string;
  tags: string[];
  structured_body: string;
  next_action: string;
}

export interface ClarityInterviewResult {
  title: string;
  filename: string;
  markdown_body: string;
  source?: 'clarity-interview';
  created_at?: string;
}

/**
 * 解析 CaptureSynthesizerSkill 的输出
 */
export function parseStructuredCapture(raw: string): StructuredCapture {
  let title = '';
  let summary = '';
  let tags: string[] = [];
  let structuredBody = raw;
  let nextAction = '';

  const headerMatch = raw.match(/---\n([\s\S]*?)\n---\n([\s\S]*)/);
  if (headerMatch) {
    const header = headerMatch[1];
    structuredBody = headerMatch[2].trim();

    const titleMatch = header.match(/title:\s*(.+)/);
    if (titleMatch) title = titleMatch[1].trim();

    const summaryMatch = header.match(/summary:\s*(.+)/);
    if (summaryMatch) summary = summaryMatch[1].trim();

    const tagsMatch = header.match(/tags:\s*\[(.+)\]/);
    if (tagsMatch) {
      tags = tagsMatch[1].split(/[,，]/).map(t => t.trim()).filter(Boolean);
    }

    const nextActionMatch = header.match(/next_action:\s*(.+)/);
    if (nextActionMatch) nextAction = nextActionMatch[1].trim();
  }

  return { title, summary, tags, structured_body: structuredBody, next_action: nextAction };
}

/**
 * 解析 ClarityInterviewSkill 的输出
 * 自动 strip fenced code block
 */
export function parseClarityInterviewResult(raw: string): ClarityInterviewResult {
  let title = '';
  let filename = '';
  let markdownBody = raw;

  // Strip fenced code blocks (```markdown ... ``` or ``` ... ```)
  const fenceMatch = raw.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    markdownBody = fenceMatch[1].trim();
  }

  const headerMatch = markdownBody.match(/---\n([\s\S]*?)\n---\n([\s\S]*)/);
  if (headerMatch) {
    const header = headerMatch[1];
    markdownBody = headerMatch[2].trim();

    const titleMatch = header.match(/title:\s*(.+)/);
    if (titleMatch) title = titleMatch[1].trim();

    const filenameMatch = header.match(/filename:\s*(.+)/);
    if (filenameMatch) filename = filenameMatch[1].trim();
  }

  // 如果没有解析到标题，从正文第一行提取
  if (!title) {
    const firstHeading = markdownBody.match(/^#\s+(.+)/m);
    if (firstHeading) {
      title = firstHeading[1].trim();
    }
  }

  return { title, filename, markdown_body: markdownBody };
}
