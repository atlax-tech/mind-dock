import { mentorEventBus } from '@/modules/ai/MentorEventBus';
import { mentorSignalsService } from '@/services/mentor/mentor-signals';
import { mentorSuggestionsService } from '@/services/mentor/mentor-suggestions';
import { metadataService } from '@/services/index/metadata';
import { personalizationService } from '@/services/index/personalization';
import { chunkingService } from '@/services/index/chunking';

import {
  detectSemanticType,
  detectQuestionIntent,
  detectDecisionPrinciple,
  detectActionIntent,
  detectMissingConclusion,
} from './signal-detectors';
import type { DetectorInput } from './signal-detectors/types';
import { classifyAll } from './fast-classifier';
import { buildSuggestionParams, generateSuggestionId } from './suggestion-factory';
import { chooseSurface, type DeliveryPolicyInput } from './delivery-policy';
import { inlineThrottleTracker } from './inline-throttle';
import { getMentorPreferences } from './mentor-preferences';
import { findBestMatch } from './cosine-similarity';
import { getAllPrototypes, type SemanticType } from './semantic-prototypes';

type EmbedFn = (input: string) => Promise<{ embeddings: number[][] }>;

function getCurrentParagraph(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  let paragraph: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === '') {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.unshift(line);
  }
  return paragraph.join('\n').slice(0, 2000);
}

function checkConclusionFromChunks(chunks: import('@/services/index/chunking').ChunkResult[]): boolean {
  if (!chunks || chunks.length === 0) return false;
  const patterns = [
    /^#{2,4}\s*(结论|总结|下一步|决策|行动|产出|输出)/,
    /^#{2,4}\s*(Conclusion|Decision|Action|Next\s*Steps|Output)/i,
  ];
  return chunks.some(chunk => {
    if (!chunk.heading_path) return false;
    return patterns.some(p => p.test(chunk.heading_path ?? ''));
  });
}

let isRunning = false;
let prototypeEmbeddingCache: Promise<{ type: SemanticType; embedding: number[]; threshold: number }[]> | null = null;

async function getPrototypeEmbeddings(embed: EmbedFn) {
  if (!prototypeEmbeddingCache) {
    prototypeEmbeddingCache = Promise.all(
      getAllPrototypes().map(async proto => {
        const result = await embed(proto.examples.join('\n'));
        const embedding = result.embeddings?.[0];
        if (!embedding || embedding.length === 0) {
          throw new Error(`prototype embedding 为空: ${proto.type}`);
        }
        return {
          type: proto.type,
          embedding,
          threshold: proto.threshold,
        };
      }),
    ).catch(err => {
      prototypeEmbeddingCache = null;
      throw err;
    });
  }
  return prototypeEmbeddingCache;
}

async function computePrototypeMatches(text: string, embed?: EmbedFn): Promise<{ type: string; score: number }[] | undefined> {
  if (!embed || !text.trim()) return undefined;
  try {
    const [textEmbeddingResult, prototypes] = await Promise.all([
      embed(text),
      getPrototypeEmbeddings(embed),
    ]);
    const textEmbedding = textEmbeddingResult.embeddings?.[0];
    if (!textEmbedding || textEmbedding.length === 0) return undefined;

    const matches = prototypes
      .map(proto => {
        const match = findBestMatch(textEmbedding, [proto]);
        return match ? { type: proto.type, score: match.score, threshold: proto.threshold } : null;
      })
      .filter((m): m is { type: SemanticType; score: number; threshold: number } => m !== null)
      .sort((a, b) => b.score - a.score);

    return matches
      .filter(m => m.score >= Math.min(0.58, m.threshold - 0.04))
      .map(m => ({ type: m.type, score: m.score }));
  } catch (err) {
    console.warn('[DetectorRunner] prototype embedding 匹配失败，降级到规则/soft type:', err);
    return undefined;
  }
}

export async function runDetectors(params: {
  vaultPath: string;
  vaultId: string;
  documentPath: string;
  documentContent: string;
  currentParagraph?: string;
  cursorPos?: number;
  lineNumber?: number;
  idleDurationMs: number;
  sourceEventId?: string;
  embeddingAvailable?: boolean;
  userIsTyping?: boolean;
  hasSelection?: boolean;
  editorFocused?: boolean;
  platterOpen?: boolean;
  modelBusy?: boolean;
  embed?: EmbedFn;
}): Promise<string[]> {
  const {
    vaultPath, vaultId, documentPath, documentContent, idleDurationMs,
    sourceEventId, userIsTyping = false, hasSelection = false,
    editorFocused = true, platterOpen = false, modelBusy = false,
    currentParagraph, cursorPos, lineNumber, embed,
  } = params;

  if (isRunning) return [];
  isRunning = true;

  try {
    const currentText = (currentParagraph?.trim() || getCurrentParagraph(documentContent)).slice(0, 2000);
    if (!currentText) return [];

    console.log('[DetectorRunner] 运行检测:', {
      documentPath,
      cursorPos,
      lineNumber,
      textLen: currentText.length,
      textPreview: currentText.slice(0, 60),
    });

    const [docMeta, typeCandidates, weights, chunks] = await Promise.all([
      metadataService.getDocumentDbMetadata(vaultPath, documentPath).catch(() => null),
      metadataService.suggestKnowledgeTypeCandidates(vaultPath, documentPath, 20).catch(() => []),
      personalizationService.getWeights(vaultPath).catch(() => undefined),
      chunkingService.getDocumentChunks(vaultPath, documentPath).catch(() => []),
    ]);

    const wordCount = docMeta?.word_count ?? documentContent.length;
    const frontmatterStr = docMeta?.frontmatter;
    let frontmatter: Record<string, unknown> | null = null;
    if (frontmatterStr) {
      try { frontmatter = JSON.parse(frontmatterStr); } catch { /* skip */ }
    }

    const hasConclusionByHeading = checkConclusionFromChunks(chunks);

    let prototypeMatches = await computePrototypeMatches(currentText, embed);
    const hasEmbeddingPrototypeMatches = !!prototypeMatches && prototypeMatches.length > 0;

    if (!prototypeMatches && typeCandidates.length > 0) {
      const matchedTypes: { type: string; score: number }[] = [];
      const ktToSemantic: Record<string, string> = {
        constraint: 'principle',
        decision: 'decision',
        question: 'question',
        task: 'action',
        requirement: 'requirement',
        risk: 'risk',
      };
      for (const c of typeCandidates) {
        const semType = ktToSemantic[c.knowledge_type];
        if (semType && c.document_path === documentPath) {
          matchedTypes.push({ type: semType, score: c.confidence });
        }
      }
      if (matchedTypes.length > 0) {
        prototypeMatches = matchedTypes.sort((a, b) => b.score - a.score);
      }
    }

    const input: DetectorInput = {
      currentText,
      documentPath,
      documentWordCount: wordCount,
      hasConclusion: hasConclusionByHeading,
      idleDurationMs,
      knowledgeTypeCandidates: typeCandidates,
      personalizationWeights: weights,
      documentChunks: chunks,
      frontmatter,
      documentSummary: docMeta?.summary ?? null,
      documentTags: docMeta?.tags ?? null,
      prototypeMatches,
      textEmbedding: hasEmbeddingPrototypeMatches ? [] : undefined,
    };

    const detectorResults = [
      detectSemanticType(input),
      detectQuestionIntent(input),
      detectDecisionPrinciple(input),
      detectActionIntent(input),
      detectMissingConclusion(input),
    ].filter((r): r is NonNullable<typeof r> => r !== null);

    if (detectorResults.length === 0) {
      console.log('[DetectorRunner] 无检测结果');
      return [];
    }

    console.log('[DetectorRunner] 检测结果:', detectorResults.map(r => ({
      type: r.signalType,
      conf: r.confidence.toFixed(2),
      intent: r.suggestedIntent,
      level: r.level,
      detector: r.detector,
    })));

    const classified = classifyAll(detectorResults, {
      documentPath,
      documentWordCount: wordCount,
      userIsTyping,
      knowledgeTypeCandidates: typeCandidates,
      personalizationWeights: weights,
      documentChunks: chunks,
    });

    const prefs = getMentorPreferences();
    const throttleState = inlineThrottleTracker.getState(documentPath);

    const createdIds: string[] = [];
    for (const cr of classified) {
      let signalId = '';
      try {
        const signal = await mentorSignalsService.createSignal(
          vaultPath,
          sourceEventId ?? generateSuggestionId(),
          vaultId,
          cr.detectorResult.signalType,
          cr.detectorResult.targetId,
          cr.detectorResult.targetType,
          cr.detectorResult.confidence,
          cr.detectorResult.evidenceIds,
          cr.detectorResult.detector,
        );
        signalId = signal.id;
      } catch (err) {
        console.error(`[DetectorRunner] 创建 signal 失败:`, err);
        continue;
      }

      // ── Delivery Policy 决定最终 surface ──
      const dismissedRecently = inlineThrottleTracker.isDismissedRecently(
        documentPath, cr.detectorResult.signalType, prefs,
      );
      const policyInput: DeliveryPolicyInput = {
        intent: cr.detectorResult.suggestedIntent,
        priority: cr.score >= 0.78 ? 'high' : cr.score >= 0.68 ? 'medium' : 'low',
        confidence: cr.score,
        allowInline: cr.allowInline,
        targetId: cr.detectorResult.targetId,
        signalType: cr.detectorResult.signalType,
        userIsTyping,
        hasSelection,
        editorFocused,
        platterOpen,
        modelBusy,
        dismissedRecently,
        preferences: prefs,
        throttleState,
      };
      const policyResult = chooseSurface(policyInput);

      console.log('[DetectorRunner] Delivery Policy:', {
        signalType: cr.detectorResult.signalType,
        score: cr.score.toFixed(2),
        allowInline: cr.allowInline,
        intent: cr.detectorResult.suggestedIntent,
        surface: policyResult.surface,
        reason: policyResult.reason,
      });

      // 覆盖 classifier 的 surface 为 policy 决定的 surface
      const sparams = buildSuggestionParams({
        classifierResult: cr,
        vaultPath,
        vaultId,
        sourceEventId: sourceEventId ?? undefined,
        sourceSignalIds: [signalId],
      });

      if (sparams.confidence < 0.45) continue;

      // policy 覆盖 surface
      sparams.surface = policyResult.surface;

      try {
        const suggestion = await mentorSuggestionsService.createSuggestion(sparams);
        createdIds.push(suggestion.id);

        // 如果 surface=inline，记录到 throttle tracker 并更新 last_shown_at
        if (policyResult.surface === 'inline') {
          inlineThrottleTracker.recordInline(documentPath);
          mentorSuggestionsService.updateSuggestionLastShown(vaultPath, suggestion.id).catch(() => {});
        }

        // 发出 mentor_suggestion_created 事件，通知 UI 层
        mentorEventBus.emit('mentor_suggestion_created', {
          suggestionId: suggestion.id,
          eventId: sourceEventId ?? null,
          surface: policyResult.surface,
          targetId: cr.detectorResult.targetId,
          intent: cr.detectorResult.suggestedIntent,
          priority: policyInput.priority,
          shortMessage: suggestion.short_message,
          message: suggestion.message,
          confidence: suggestion.confidence,
          signalIds: [signalId],
          actions: JSON.parse(suggestion.actions_json),
          evidenceIds: JSON.parse(suggestion.evidence_ids_json),
        });
      } catch (err) {
        console.error(`[DetectorRunner] 创建 suggestion 失败:`, err);
      }
    }

    console.log('[DetectorRunner] summary:', {
      detectorResults: detectorResults.length,
      classified: classified.length,
      created: createdIds.length,
    });

    return createdIds;
  } catch (err) {
    console.error('[DetectorRunner] 运行失败:', err);
    return [];
  } finally {
    isRunning = false;
  }
}

export function startDetectorRunner(getActiveDocument: () => {
  vaultPath: string;
  vaultId: string;
  documentPath: string;
  documentContent: string;
} | null, getContext?: () => {
  userIsTyping?: boolean;
  hasSelection?: boolean;
  editorFocused?: boolean;
  platterOpen?: boolean;
  modelBusy?: boolean;
}, embed?: EmbedFn): () => void {
  return mentorEventBus.on('document_idle', (event) => {
    const doc = getActiveDocument();
    console.log('[DetectorRunner] 收到 document_idle 事件:', { hasDoc: !!doc, docPath: doc?.documentPath, contentLen: doc?.documentContent?.length });
    if (!doc) return;

    const ctx = getContext?.() ?? {};
    const idleDurationMs = (event.payload?.idleDurationMs as number) ?? 5000;
    const targetType = event.payload?.targetType as string | undefined;
    const currentParagraph = typeof event.payload?.currentParagraph === 'string'
      ? event.payload.currentParagraph
      : undefined;

    runDetectors({
      vaultPath: doc.vaultPath,
      vaultId: doc.vaultId,
      documentPath: doc.documentPath,
      documentContent: doc.documentContent,
      currentParagraph,
      cursorPos: typeof event.payload?.cursorPos === 'number' ? event.payload.cursorPos : undefined,
      lineNumber: typeof event.payload?.lineNumber === 'number' ? event.payload.lineNumber : undefined,
      idleDurationMs,
      sourceEventId: event.payload?.eventId as string | undefined,
      embeddingAvailable: !!embed,
      userIsTyping: ctx.userIsTyping ?? false,
      hasSelection: targetType === 'selection' || (ctx.hasSelection ?? false),
      editorFocused: ctx.editorFocused ?? true,
      platterOpen: ctx.platterOpen ?? false,
      modelBusy: ctx.modelBusy ?? false,
      embed,
    }).catch(err => {
      console.error('[DetectorRunner] document_idle 处理失败:', err);
    });
  });
}

/**
 * 通知 throttle tracker 用户 dismiss 了某条建议
 */
export function notifySuggestionDismissed(documentPath: string, signalType: string): void {
  inlineThrottleTracker.recordDismiss(documentPath, signalType);
}

/**
 * 重置 session 级别的 throttle 计数（如 app 重启时）
 */
export function resetThrottleSession(): void {
  inlineThrottleTracker.resetSession();
}
