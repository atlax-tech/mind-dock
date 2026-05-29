/**
 * Cosine Similarity utility
 *
 * 用于比较文本 embedding 向量与 prototype embedding 之间的相似度。
 * 纯数学计算，不调用任何外部服务。
 */

/**
 * 计算两个向量的余弦相似度
 * 返回 0-1 之间的值，1 表示完全相同
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量维度不匹配: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * 比较文本 embedding 与一组 prototype embeddings，
 * 返回最佳匹配及其分数
 */
export function findBestMatch(
  textEmbedding: number[],
  prototypes: { type: string; embedding: number[]; threshold: number }[],
): { type: string; score: number; aboveThreshold: boolean } | null {
  if (!textEmbedding || textEmbedding.length === 0) return null;
  if (prototypes.length === 0) return null;

  let bestType = '';
  let bestScore = -1;

  for (const proto of prototypes) {
    if (!proto.embedding || proto.embedding.length === 0) continue;
    try {
      const similarity = cosineSimilarity(textEmbedding, proto.embedding);
      if (similarity > bestScore) {
        bestScore = similarity;
        bestType = proto.type;
      }
    } catch {
      continue;
    }
  }

  if (bestScore < 0) return null;

  const matchedProto = prototypes.find(p => p.type === bestType);
  const threshold = matchedProto?.threshold ?? 0.65;

  return {
    type: bestType,
    score: bestScore,
    aboveThreshold: bestScore >= threshold,
  };
}
