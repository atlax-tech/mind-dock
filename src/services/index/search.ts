import { invoke } from '@tauri-apps/api/core';

/** FTS 全文搜索结果（对应 Rust SearchResult） */
export interface SearchResult {
  chunk_id: number;
  document_path: string;
  heading_path: string | null;
  start_line: number;
  end_line: number;
  content: string;
  snippet: string;
  rank: number;
}

/** 混合搜索结果（对应 Rust SearchDocumentResult） */
export interface SearchDocumentResult {
  chunk_id: number;
  document_title: string | null;
  document_path: string;
  heading_path: string | null;
  start_line: number;
  end_line: number;
  content: string;
  snippet: string;
  source: string; // "fts" or "semantic"
  rank: number;
}

export const searchService = {
  /** FTS 全文搜索 */
  async ftsSearch(
    vaultPath: string,
    query: string,
    limit?: number,
  ): Promise<SearchResult[]> {
    return invoke<SearchResult[]>('fts_search', {
      vaultPath,
      query,
      limit: limit ?? null,
    });
  },

  /** 混合搜索（FTS + 语义） */
  async searchDocuments(
    vaultPath: string,
    query: string,
    limit?: number,
  ): Promise<SearchDocumentResult[]> {
    return invoke<SearchDocumentResult[]>('search_documents', {
      vaultPath,
      query,
      limit: limit ?? null,
    });
  },
};
