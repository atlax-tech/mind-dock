import { invoke } from '@tauri-apps/api/core';

/** 数据库中的文档元数据记录（对应 Rust DocumentRecord） */
export interface DocumentRecord {
  id: number;
  path: string;
  title: string | null;
  frontmatter: string | null;
  created_at: string | null;
  updated_at: string | null;
  content_hash: string | null;
  summary: string | null;
  tags: string | null;
  index_status: string;
  embedding_status: string;
  word_count: number;
}

export type KnowledgeType = 'constraint' | 'task' | 'question' | 'decision' | 'risk' | 'requirement';

export interface KnowledgeTypeCandidate {
  knowledge_type: KnowledgeType;
  label: string;
  scope: 'document' | 'chunk';
  document_path: string;
  chunk_id: number | null;
  heading_path: string | null;
  start_line: number | null;
  end_line: number | null;
  snippet: string;
  confidence: number;
  reason: string;
}

export const metadataService = {
  /** 初始化 metadata 数据库（vault 打开时调用） */
  async initMetadataDb(vaultPath: string): Promise<void> {
    return invoke('init_metadata_db', { vaultPath });
  },

  /** 插入或更新文档元数据 */
  async upsertDocumentMetadata(params: {
    vaultPath: string;
    documentPath: string;
    title?: string | null;
    frontmatter?: string | null;
    contentHash?: string | null;
    wordCount?: number | null;
  }): Promise<void> {
    return invoke('upsert_document_metadata', {
      vaultPath: params.vaultPath,
      documentPath: params.documentPath,
      title: params.title ?? null,
      frontmatter: params.frontmatter ?? null,
      contentHash: params.contentHash ?? null,
      wordCount: params.wordCount ?? null,
    });
  },

  /** 删除文档元数据及其关联数据 */
  async deleteDocumentMetadata(vaultPath: string, documentPath: string): Promise<void> {
    return invoke('delete_document_metadata', { vaultPath, documentPath });
  },

  /** 重命名文档元数据路径 */
  async renameDocumentMetadata(vaultPath: string, oldPath: string, newPath: string): Promise<void> {
    return invoke('rename_document_metadata', { vaultPath, oldPath, newPath });
  },

  /** 获取单个文档元数据（数据库记录） */
  async getDocumentDbMetadata(vaultPath: string, documentPath: string): Promise<DocumentRecord | null> {
    try {
      return await invoke<DocumentRecord | null>('get_document_db_metadata', { vaultPath, documentPath });
    } catch {
      return null;
    }
  },

  /** 列出所有文档元数据 */
  async listDocumentsMetadata(vaultPath: string): Promise<DocumentRecord[]> {
    return invoke<DocumentRecord[]>('list_documents_metadata', { vaultPath });
  },

  async suggestKnowledgeTypeCandidates(
    vaultPath: string,
    documentPath?: string | null,
    limit?: number,
  ): Promise<KnowledgeTypeCandidate[]> {
    return invoke<KnowledgeTypeCandidate[]>('suggest_knowledge_type_candidates', {
      vaultPath,
      documentPath: documentPath ?? null,
      limit: limit ?? null,
    });
  },
};
