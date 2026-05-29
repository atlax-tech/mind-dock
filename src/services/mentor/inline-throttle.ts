import type { MentorPreferences } from './mentor-preferences';
import { getFrequencyMultiplier } from './mentor-preferences';

/**
 * Inline Throttle
 *
 * 防止 AI Mentor 变成噪音。
 *
 * 限流规则：
 * - 同一文档至少间隔 90 秒
 * - 单文档单 session 最多 5 次 inline
 * - 全 vault 每小时最多 20 次 inline
 * - 输入中不弹（suppressWhileTypingMs=1200）
 * - dismiss 后 10 分钟不再提示同类
 *
 * 用户 snooze 后必须写入 snoozed_until
 * last_shown_at 必须更新，便于节流与审计
 */

export interface InlineThrottleState {
  documentInlineCount: number;
  vaultInlineCountHour: number;
  lastInlineAtByDoc?: Record<string, string>;
  dismissedAtByDocAndType?: Record<string, string>;
}

export const THROTTLE_DEFAULTS = {
  minIntervalMs: 90_000,
  maxPerDocumentPerSession: 5,
  maxPerVaultPerHour: 20,
  suppressWhileTypingMs: 1_200,
  suppressAfterDismissMs: 10 * 60_000,
} as const;

export function checkInlineThrottle(
  state: InlineThrottleState,
  preferences?: MentorPreferences,
): boolean {
  const freqMultiplier = getFrequencyMultiplier(preferences?.frequency ?? 'standard');

  const maxPerDoc = Math.max(1, Math.round(THROTTLE_DEFAULTS.maxPerDocumentPerSession / freqMultiplier));
  const maxPerVault = Math.max(1, Math.round(THROTTLE_DEFAULTS.maxPerVaultPerHour / freqMultiplier));

  if (state.documentInlineCount >= maxPerDoc) return false;
  if (state.vaultInlineCountHour >= maxPerVault) return false;

  return true;
}

export function checkMinInterval(
  lastInlineAt: string | null | undefined,
  preferences?: MentorPreferences,
): boolean {
  if (!lastInlineAt) return true;

  const freqMultiplier = getFrequencyMultiplier(preferences?.frequency ?? 'standard');
  const minInterval = Math.round(THROTTLE_DEFAULTS.minIntervalMs * freqMultiplier);

  const elapsed = Date.now() - new Date(lastInlineAt).getTime();
  return elapsed >= minInterval;
}

export function checkDismissCooldown(
  dismissedAt: string | null | undefined,
  preferences?: MentorPreferences,
): boolean {
  if (!dismissedAt) return true;

  const freqMultiplier = getFrequencyMultiplier(preferences?.frequency ?? 'standard');
  const cooldown = Math.round(THROTTLE_DEFAULTS.suppressAfterDismissMs * freqMultiplier);

  const elapsed = Date.now() - new Date(dismissedAt).getTime();
  return elapsed >= cooldown;
}

export function makeDismissKey(documentPath: string, signalType: string): string {
  return `${documentPath}::${signalType}`;
}

export function isUserTyping(lastTypingAt: number | null): boolean {
  if (!lastTypingAt) return false;
  return (Date.now() - lastTypingAt) < THROTTLE_DEFAULTS.suppressWhileTypingMs;
}

/**
 * InlineThrottleTracker
 *
 * 内存中跟踪当前 session 的 inline 展示次数。
 * vault 级别每小时计数会在整点自动重置。
 */
export class InlineThrottleTracker {
  private documentInlineCounts: Map<string, number> = new Map();
  private vaultInlineTimestamps: number[] = [];
  private lastInlineAtByDoc: Map<string, string> = new Map();
  private dismissedAtByKey: Map<string, string> = new Map();

  recordInline(documentPath: string): void {
    const current = this.documentInlineCounts.get(documentPath) ?? 0;
    this.documentInlineCounts.set(documentPath, current + 1);

    const now = new Date().toISOString();
    this.lastInlineAtByDoc.set(documentPath, now);

    this.vaultInlineTimestamps.push(Date.now());
    this.cleanupVaultTimestamps();
  }

  recordDismiss(documentPath: string, signalType: string): void {
    const key = makeDismissKey(documentPath, signalType);
    this.dismissedAtByKey.set(key, new Date().toISOString());
  }

  getState(documentPath: string): InlineThrottleState {
    this.cleanupVaultTimestamps();
    return {
      documentInlineCount: this.documentInlineCounts.get(documentPath) ?? 0,
      vaultInlineCountHour: this.vaultInlineTimestamps.length,
      lastInlineAtByDoc: Object.fromEntries(this.lastInlineAtByDoc),
      dismissedAtByDocAndType: Object.fromEntries(this.dismissedAtByKey),
    };
  }

  isDismissedRecently(documentPath: string, signalType: string, preferences?: MentorPreferences): boolean {
    const key = makeDismissKey(documentPath, signalType);
    const dismissedAt = this.dismissedAtByKey.get(key);
    return !checkDismissCooldown(dismissedAt, preferences);
  }

  isMinIntervalPassed(documentPath: string, preferences?: MentorPreferences): boolean {
    const lastAt = this.lastInlineAtByDoc.get(documentPath);
    return checkMinInterval(lastAt, preferences);
  }

  canShowInline(documentPath: string, preferences?: MentorPreferences): boolean {
    const state = this.getState(documentPath);
    if (!checkInlineThrottle(state, preferences)) return false;
    if (!this.isMinIntervalPassed(documentPath, preferences)) return false;
    return true;
  }

  resetSession(): void {
    this.documentInlineCounts.clear();
    this.vaultInlineTimestamps = [];
    this.lastInlineAtByDoc.clear();
    this.dismissedAtByKey.clear();
  }

  private cleanupVaultTimestamps(): void {
    const oneHourAgo = Date.now() - 3_600_000;
    this.vaultInlineTimestamps = this.vaultInlineTimestamps.filter(t => t >= oneHourAgo);
  }
}

export const inlineThrottleTracker = new InlineThrottleTracker();
