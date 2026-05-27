import { invoke } from '@tauri-apps/api/core';

/** 语义搜索结果（对应 Rust SemanticSearchResult） */
export interface SemanticSearchResult {
  document_path: string;
  heading_path: string | null;
  start_line: number;
  end_line: number;
  similarity_score: number;
}

/** 相似分块结果（对应 Rust SimilarChunkResult） */
export interface SimilarChunkResult {
  chunk_id: number;
  document_path: string;
  heading_path: string | null;
  start_line: number;
  end_line: number;
  similarity_score: number;
}

/** 上下文包候选结果（对应 Rust ContextPackCandidate） */
export interface CandidateResult {
  chunk_id: number;
  document_path: string;
  heading_path: string | null;
  start_line: number;
  end_line: number;
  similarity_score: number;
  selected_reason: string;
}

/** 文档 embedding 结果（对应 Rust DocumentEmbeddingResult） */
export interface DocumentEmbeddingResult {
  document_path: string;
  embedding: number[];
  embedding_model: string | null;
  embedding_dimension: number | null;
  chunk_count: number;
}

export const vectorIndexService = {
  /** 存储分块 embedding */
  async storeChunkEmbedding(params: {
    vaultPath: string;
    chunkId: number;
    embedding: number[];
    embeddingModel: string;
    embeddingDimension: number;
    embeddingProvider: string;
    embeddingContentHash: string;
  }): Promise<void> {
    return invoke('store_chunk_embedding', {
      vaultPath: params.vaultPath,
      chunkId: params.chunkId,
      embedding: params.embedding,
      embeddingModel: params.embeddingModel,
      embeddingDimension: params.embeddingDimension,
      embeddingProvider: params.embeddingProvider,
      embeddingContentHash: params.embeddingContentHash,
    });
  },

  /** 语义搜索 */
  async semanticSearch(
    vaultPath: string,
    queryEmbedding: number[],
    limit?: number,
  ): Promise<SemanticSearchResult[]> {
    return invoke<SemanticSearchResult[]>('semantic_search', {
      vaultPath,
      queryEmbedding,
      limit: limit ?? null,
    });
  },

  /** 查找相似分块 */
  async findSimilarChunks(
    vaultPath: string,
    chunkId: number,
    limit?: number,
  ): Promise<SimilarChunkResult[]> {
    return invoke<SimilarChunkResult[]>('find_similar_chunks', {
      vaultPath,
      chunkId,
      limit: limit ?? null,
    });
  },

  /** 建议上下文包候选 */
  async suggestContextPackCandidates(
    vaultPath: string,
    chunkIds: number[],
    limit?: number,
  ): Promise<CandidateResult[]> {
    return invoke<CandidateResult[]>('suggest_context_pack_candidates', {
      vaultPath,
      chunkIds,
      limit: limit ?? null,
    });
  },

  /** 标记 embedding 为 stale */
  async markEmbeddingStale(vaultPath: string, chunkId: number): Promise<void> {
    return invoke('mark_embedding_stale', { vaultPath, chunkId });
  },

  /** 标记所有 pending embedding 为 unavailable */
  async markEmbeddingsUnavailable(vaultPath: string): Promise<number> {
    return invoke<number>('mark_embeddings_unavailable', { vaultPath });
  },

  /** 标记 embedding 为 error */
  async markEmbeddingError(vaultPath: string, chunkId: number): Promise<void> {
    return invoke('mark_embedding_error', { vaultPath, chunkId });
  },

  /** 获取文档 embedding */
  async getDocumentEmbedding(
    vaultPath: string,
    documentPath: string,
  ): Promise<DocumentEmbeddingResult | null> {
    try {
      return await invoke<DocumentEmbeddingResult | null>('get_document_embedding', {
        vaultPath,
        documentPath,
      });
    } catch {
      return null;
    }
  },

  /** 检测 stale embeddings，返回 stale chunk id 列表 */
  async detectStaleEmbeddings(
    vaultPath: string,
    documentPath: string,
  ): Promise<number[]> {
    return invoke<number[]>('detect_stale_embeddings', { vaultPath, documentPath });
  },
};
