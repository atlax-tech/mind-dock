/**
 * Semantic Signal Detector Debug Harness
 *
 * 验证所有 detector 以"语义优先、规则兜底"原则工作。
 * 覆盖 14 条测试用例，包括语义等价但无关键词的中文输入。
 */

import { detectSemanticType } from './semantic-type-detector';
import { detectQuestionIntent } from './question-intent-detector';
import { detectDecisionPrinciple } from './decision-principle-detector';
import { detectActionIntent } from './action-intent-detector';
import { detectMissingConclusion } from './missing-conclusion-detector';
import { detectContextPackMismatch } from './context-pack-mismatch-detector';
import type { DetectorInput } from './types';
import type { ChunkResult } from '@/services/index/chunking';

interface TestCase {
  label: string;
  input: DetectorInput;
  /** 期望的 signal type（至少应该触发的类型） */
  expectSignal: boolean;
  expectType?: string;
  expectLevel?: 'L0' | 'L1';
  /** 备注 */
  note?: string;
}

function makeChunks(headings: string[]): ChunkResult[] {
  return headings.map((h, i) => ({
    id: i + 1,
    document_path: '/documents/test.md',
    heading_path: h,
    start_line: i * 10 + 1,
    end_line: (i + 1) * 10,
    content: `Content for ${h}`,
    content_hash: `hash_${i}`,
  }));
}

const BASE_INPUT: DetectorInput = {
  currentText: '',
  documentPath: '/documents/test.md',
  documentWordCount: 500,
  hasConclusion: false,
  idleDurationMs: 8000,
  knowledgeTypeCandidates: [],
  personalizationWeights: undefined,
  documentChunks: makeChunks(['# 介绍', '## 背景', '## 问题分析']),
};

// L1 prototype 模拟数据
const mockProtoMatches = {
  principle: [{ type: 'principle', score: 0.78 }],
  decision: [{ type: 'decision', score: 0.75 }],
  question: [{ type: 'question', score: 0.72 }],
  action: [{ type: 'action', score: 0.74 }],
};

const TEST_CASES: TestCase[] = [
  // ═══ 关键词存在 + L1 确认 ═══
  {
    label: '原则（关键词+语义）：禁止类',
    input: {
      ...BASE_INPUT,
      currentText: '这里我们必须禁止自动修改用户原文',
      prototypeMatches: mockProtoMatches.principle,
    },
    expectSignal: true, expectType: 'principle_like_text', expectLevel: 'L1',
    note: '有关键词「必须/禁止」+ L1 确认 → 高置信',
  },

  // ═══ 无语义关键词但语义相同 ═══
  {
    label: '原则（无语义关键词）：确认先行',
    input: {
      ...BASE_INPUT,
      currentText: '任何会改动用户原文的动作都应先让用户确认',
      prototypeMatches: mockProtoMatches.principle,
    },
    expectSignal: true, expectType: 'principle_like_text', expectLevel: 'L1',
    note: '无「必须/禁止/原则」词但 prototype 匹配 principle → 应触发',
  },
  {
    label: '原则（无语义关键词）：系统不应打断',
    input: {
      ...BASE_INPUT,
      currentText: '系统不应该在用户输入时打断写作，这会影响专注体验',
      prototypeMatches: mockProtoMatches.principle,
    },
    expectSignal: true, expectType: 'principle_like_text', expectLevel: 'L1',
  },

  // ═══ 问题意图 ═══
  {
    label: '问题（关键词+语义）：我该不该',
    input: {
      ...BASE_INPUT,
      currentText: '我该不该把 Context Pack 放到 Platter？',
      prototypeMatches: mockProtoMatches.question,
    },
    expectSignal: true, expectType: 'question_detected', expectLevel: 'L1',
  },
  {
    label: '问题（无语义关键词）：语义疑问',
    input: {
      ...BASE_INPUT,
      currentText: 'Context Pack 放在 Platter 里可能会让入口变重，这一点需要判断',
      prototypeMatches: mockProtoMatches.question,
    },
    expectSignal: true, expectType: 'question_detected', expectLevel: 'L1',
    note: '无「？/为什么/我该不该」但 prototype 匹配 question → 应触发',
  },

  // ═══ 行动意图 ═══
  {
    label: '动作（关键词+语义）：验证路径',
    input: {
      ...BASE_INPUT,
      currentText: '接下来要验证用户手动清理历史建议的路径',
      prototypeMatches: mockProtoMatches.action,
    },
    expectSignal: true, expectType: 'paragraph_idle', expectLevel: 'L1',
  },
  {
    label: '动作（无语义关键词）：需要写测试',
    input: {
      ...BASE_INPUT,
      currentText: '为 detector 写覆盖 12 条语义输入的测试用例是第一步',
      prototypeMatches: mockProtoMatches.action,
    },
    expectSignal: true, expectType: 'paragraph_idle', expectLevel: 'L1',
    note: '无「TODO/下一步/验收」但 prototype 匹配 action → 应触发',
  },

  // ═══ 决策 ═══
  {
    label: '决策（关键词+语义）：决定采用',
    input: {
      ...BASE_INPUT,
      currentText: '我们决定采用 p-queue 作为并发控制方案',
      prototypeMatches: mockProtoMatches.decision,
    },
    expectSignal: true, expectType: 'decision_like_text', expectLevel: 'L1',
  },

  // ═══ 缺失结论 ═══
  {
    label: '缺失结论：长文档无 heading 结论',
    input: {
      ...BASE_INPUT,
      currentText: '本文详细分析了系统架构的多个方面',
      documentWordCount: 2500,
      documentChunks: makeChunks(['# 概述', '## 分析', '## 实现细节']),
      idleDurationMs: 9000,
    },
    expectSignal: true, expectType: 'missing_conclusion',
    note: '文档 2500 字，无结论/下一步 heading → 应触发',
  },

  // ═══ 不应触发 ═══
  {
    label: '正常文本：无信号',
    input: { ...BASE_INPUT, currentText: '今天天气不错，适合写代码', prototypeMatches: [] },
    expectSignal: false,
  },
  {
    label: '短文本：不触发决策',
    input: {
      ...BASE_INPUT, currentText: '这个必须做',
      prototypeMatches: [],
    },
    expectSignal: false, note: '< 8 字 → 不触发',
  },
  {
    label: '已有结论 heading：不触发缺失',
    input: {
      ...BASE_INPUT,
      currentText: '本文总结了关键技术选型',
      documentWordCount: 1500,
      documentChunks: makeChunks(['# 概述', '## 分析', '## 结论']),
      idleDurationMs: 8000,
    },
    expectSignal: false, note: '已有「结论」heading → 不触发',
  },

  // ═══ 短文档有摘要：不触发缺失 ═══
  {
    label: '短文档有摘要：不触发缺失',
    input: {
      ...BASE_INPUT,
      currentText: '这是一个简短的分析',
      documentWordCount: 400,
      documentSummary: '本文分析了系统设计的几个关键点并给出了建议',
      documentChunks: makeChunks(['# 分析']),
      idleDurationMs: 9000,
    },
    expectSignal: false,
    note: '字数不足 800 + 有摘要 → 不触发',
  },

  // ═══ Context Pack mismatch ═══
  {
    label: 'Context Pack mismatch',
    input: { ...BASE_INPUT, currentText: '' },
    expectSignal: true, expectType: 'context_pack_mismatch',
    note: '通过 detectContextPackMismatch 独立测试',
  },
];

const ALL_DETECTORS = [
  { name: 'semantic-type', fn: detectSemanticType },
  { name: 'question-intent', fn: detectQuestionIntent },
  { name: 'decision-principle', fn: detectDecisionPrinciple },
  { name: 'action-intent', fn: detectActionIntent },
  { name: 'missing-conclusion', fn: detectMissingConclusion },
];

function runStandardDetectors(input: DetectorInput) {
  for (const d of ALL_DETECTORS) {
    const result = d.fn(input);
    if (result) return { detector: d.name, result };
  }
  return null;
}

export function testAllDetectors(): { passed: number; failed: number; results: string[] } {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  for (const tc of TEST_CASES) {
    // context-pack-mismatch 使用独立测试路径
    if (tc.label === 'Context Pack mismatch') {
      const mismatchResult = detectContextPackMismatch(BASE_INPUT, {
        packName: 'Test Pack',
        packId: 'pack-1',
        outputType: 'prd',
        sourceKnowledgeTypes: ['task', 'constraint', 'task', 'task'],
        sourceDocumentCount: 4,
      });
      if (mismatchResult && mismatchResult.signalType === 'context_pack_mismatch') {
        passed++;
        results.push(`✅ ${tc.label}`);
      } else {
        failed++;
        results.push(`❌ ${tc.label}: 应检测到 context_pack_mismatch`);
      }
      continue;
    }

    const detected = runStandardDetectors(tc.input);

    if (!tc.expectSignal) {
      if (detected === null) {
        passed++;
        results.push(`✅ ${tc.label} (正确不触发)${tc.note ? ` — ${tc.note}` : ''}`);
      } else {
        failed++;
        results.push(`❌ ${tc.label}: 不应触发，但检测到 ${detected.detector} → ${detected.result.signalType} (L${detected.result.level})`);
      }
      continue;
    }

    if (detected === null) {
      failed++;
      results.push(`❌ ${tc.label}: 应触发但无结果${tc.note ? ` — ${tc.note}` : ''}`);
      continue;
    }

    const typeOk = !tc.expectType || detected.result.signalType === tc.expectType;
    const levelOk = !tc.expectLevel || detected.result.level === tc.expectLevel;

    if (typeOk && levelOk) {
      passed++;
      results.push(`✅ ${tc.label} → ${detected.result.signalType} (L${detected.result.level}, conf=${Math.round(detected.result.confidence * 100)}%)${tc.note ? ` — ${tc.note}` : ''}`);
    } else if (!typeOk) {
      failed++;
      results.push(`❌ ${tc.label}: 期望 signal=${tc.expectType}，实际=${detected.result.signalType}`);
    } else {
      failed++;
      results.push(`❌ ${tc.label}: 期望 level=${tc.expectLevel}，实际=${detected.result.level}`);
    }
  }

  console.log(`\n=== Semantic Detector Debug Harness ===`);
  console.log(`通过: ${passed}/${passed + failed}`);
  for (const r of results) console.log(r);
  console.log(`=======================================\n`);

  return { passed, failed, results };
}
