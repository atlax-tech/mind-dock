/**
 * Mentor Preferences
 *
 * 读取用户偏好：Inline Bubble 开/关、频率、Background Mentor 开/关。
 * 当前使用 localStorage 存储；后续 Step 9 可迁移到 Settings UI。
 *
 * policy 不调用 detector，不调用 AI，只做选择。
 */

export type MentorFrequency = 'low' | 'standard' | 'high';

export interface MentorPreferences {
  inlineBubbleEnabled: boolean;
  backgroundMentorEnabled: boolean;
  frequency: MentorFrequency;
}

const STORAGE_KEY = 'minddock-mentor-preferences';

const DEFAULT_PREFERENCES: MentorPreferences = {
  inlineBubbleEnabled: true,
  backgroundMentorEnabled: true,
  frequency: 'standard',
};

function parsePreferences(raw: string | null): MentorPreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(raw);
    return {
      inlineBubbleEnabled: typeof parsed.inlineBubbleEnabled === 'boolean'
        ? parsed.inlineBubbleEnabled
        : DEFAULT_PREFERENCES.inlineBubbleEnabled,
      backgroundMentorEnabled: typeof parsed.backgroundMentorEnabled === 'boolean'
        ? parsed.backgroundMentorEnabled
        : DEFAULT_PREFERENCES.backgroundMentorEnabled,
      frequency: ['low', 'standard', 'high'].includes(parsed.frequency)
        ? parsed.frequency
        : DEFAULT_PREFERENCES.frequency,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function getMentorPreferences(): MentorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parsePreferences(raw);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function setMentorPreferences(prefs: Partial<MentorPreferences>): void {
  const current = getMentorPreferences();
  const merged = { ...current, ...prefs };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // localStorage 不可用时静默降级
  }
}

/**
 * 根据频率偏好返回节流倍率
 * low → 更严格（倍率更大），high → 更宽松（倍率更小）
 */
export function getFrequencyMultiplier(frequency: MentorFrequency): number {
  switch (frequency) {
    case 'low': return 2.0;
    case 'high': return 0.5;
    case 'standard': default: return 1.0;
  }
}
