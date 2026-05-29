import { invoke } from '@tauri-apps/api/core';

/** 文档分块结果（对应 Rust ChunkResult） */
export interface ChunkResult {
  id: number;
  document_path: string;
  heading_path: string | null;
  start_line: number;
  end_line: number;
  content: string;
  content_hash: string;
}

export interface ReindexDocumentResult {
  chunk_count: number;
  changed_chunks: ChunkResult[];
}

export const chunkingService = {
  /** 对文档进行分块，返回分块数量 */
  async chunkDocument(vaultPath: string, documentPath: string): Promise<number> {
    return invoke<number>('chunk_document', { vaultPath, documentPath });
  },

  /** 重新索引文档（分块 + 更新索引），返回分块数量 */
  async reindexDocument(vaultPath: string, documentPath: string): Promise<ReindexDocumentResult> {
    return invoke<ReindexDocumentResult>('reindex_document', { vaultPath, documentPath });
  },

  /** 获取文档的所有分块 */
  async getDocumentChunks(
    vaultPath: string,
    documentPath: string,
  ): Promise<ChunkResult[]> {
    return invoke<ChunkResult[]>('get_document_chunks', { vaultPath, documentPath });
  },
};
