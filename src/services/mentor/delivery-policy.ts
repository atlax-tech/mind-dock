import type { MentorSuggestionSurface, MentorSuggestionIntent } from './mentor-suggestions';
import type { MentorPreferences } from './mentor-preferences';
import { getMentorPreferences } from './mentor-preferences';
import { checkInlineThrottle, type InlineThrottleState } from './inline-throttle';

/**
 * Delivery Policy
 *
 * 决定每条 suggestion 出现在哪里、什么时候出现。
 * 纯函数 policy，不调用 detector，不调用 AI，只做选择。
 *
 * 规则：
 * 1. priority=high 且当前 target 是 selection：允许 inline
 * 2. 用户正在输入：surface 改为 silent 或延后
 * 3. intent=classify 且 editor focused：允许 inline
 * 4. intent=review/resolve_conflict：进入 inbox 或 platter，不 inline
 * 5. 同一文档、同一类型 dismiss 后 10 分钟内不再 inline
 * 6. 单文档单 session 最多 5 次 inline；全 vault 每小时最多 20 次 inline
 *
 * policy 必须读取 user preference：Inline Bubble 开/关、频率、Background Mentor 开/关
 */

export interface DeliveryPolicyInput {
  intent: MentorSuggestionIntent;
  priority: 'low' | 'medium' | 'high';
  confidence: number;
  allowInline: boolean;
  targetId: string;
  signalType: string;
  userIsTyping: boolean;
  hasSelection: boolean;
  editorFocused: boolean;
  platterOpen: boolean;
  modelBusy: boolean;
  dismissedRecently: boolean;
  preferences?: MentorPreferences;
  throttleState?: InlineThrottleState;
}

export interface DeliveryPolicyResult {
  surface: MentorSuggestionSurface;
  reason: string;
  shouldPersist: boolean;
}

export function chooseSurface(input: DeliveryPolicyInput): DeliveryPolicyResult {
  const prefs = input.preferences ?? getMentorPreferences();

  // 规则 0：用户关闭 Inline Bubble → 所有建议进 inbox
  if (!prefs.inlineBubbleEnabled && input.allowInline) {
    return {
      surface: 'inbox',
      reason: '用户关闭了 Inline Bubble',
      shouldPersist: true,
    };
  }

  // 规则 1：用户正在输入 → silent 或延后
  if (input.userIsTyping) {
    return {
      surface: 'silent',
      reason: '用户正在输入，延后展示',
      shouldPersist: true,
    };
  }

  // 规则 2：intent=review/resolve_conflict → inbox 或 platter，不 inline
  if (input.intent === 'review' || input.intent === 'resolve_conflict') {
    const surface: MentorSuggestionSurface = input.platterOpen ? 'platter' : 'inbox';
    return {
      surface,
      reason: `intent=${input.intent} 不进 inline`,
      shouldPersist: true,
    };
  }

  // 规则 3：allowInline 为 false → inbox
  if (!input.allowInline) {
    return {
      surface: 'inbox',
      reason: 'classifier 不允许 inline',
      shouldPersist: true,
    };
  }

  // 规则 4：confidence < 0.68 → inbox，不 inline
  if (input.confidence < 0.68) {
    return {
      surface: 'inbox',
      reason: '置信度不足 0.68，不进 inline',
      shouldPersist: true,
    };
  }

  // 规则 5：同一文档、同一类型 dismiss 后 10 分钟内不再 inline
  if (input.dismissedRecently) {
    return {
      surface: 'inbox',
      reason: '同类建议最近被忽略，10 分钟内不再 inline',
      shouldPersist: true,
    };
  }

  // 规则 6：节流检查（单文档单 session 最多 5 次；全 vault 每小时最多 20 次）
  const throttleState = input.throttleState ?? { documentInlineCount: 0, vaultInlineCountHour: 0 };
  if (!checkInlineThrottle(throttleState, prefs)) {
    return {
      surface: 'inbox',
      reason: 'inline 次数已达上限',
      shouldPersist: true,
    };
  }

  // 规则 7：priority=high 且当前 target 是 selection → inline
  if (input.priority === 'high' && input.hasSelection) {
    return {
      surface: 'inline',
      reason: '高优先级 + 有选区，允许 inline',
      shouldPersist: true,
    };
  }

  // 规则 8：intent=classify/clarify/extract 且 editor focused → inline
  const inlineIntents: MentorSuggestionIntent[] = ['classify', 'clarify', 'extract'];
  if (inlineIntents.includes(input.intent) && input.editorFocused) {
    return {
      surface: 'inline',
      reason: `${input.intent} + 编辑器聚焦，允许 inline`,
      shouldPersist: true,
    };
  }

  // 规则 9：priority=medium 且 confidence >= 0.72 且 editor focused → inline
  if (input.priority === 'medium' && input.confidence >= 0.72 && input.editorFocused) {
    return {
      surface: 'inline',
      reason: '中等优先级 + 高置信 + 编辑器聚焦，允许 inline',
      shouldPersist: true,
    };
  }

  // 规则 9：其他高置信建议 → inbox（不主动打扰）
  return {
    surface: 'inbox',
    reason: '默认进入 inbox',
    shouldPersist: true,
  };
}
