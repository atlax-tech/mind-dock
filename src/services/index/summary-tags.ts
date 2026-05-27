import { invoke } from '@tauri-apps/api/core';

/** 单层 summary/tags 结果 */
export interface SummaryTagsLayer {
  source: string;
  summary: string | null;
  tags: string[] | null;
  error: string | null;
}

/** 分层 summary/tags 生成结果 */
export interface SummaryTagsResult {
  document_path: string;
  layers: SummaryTagsLayer[];
}

export const summaryTagsService = {
  /** 生成分层 summary/tags（编排所有层） */
  async generateSummaryTags(vaultPath: string, documentPath: string): Promise<SummaryTagsResult> {
    return invoke<SummaryTagsResult>('generate_summary_tags', { vaultPath, documentPath });
  },

  /** 更新文档的 summary 和 tags（数据库 + frontmatter） */
  async updateDocumentSummaryTags(
    vaultPath: string,
    documentPath: string,
    summary: string,
    tags: string[],
    source: string,
  ): Promise<void> {
    const tagsJson = JSON.stringify(tags);
    return invoke('update_document_summary_tags', {
      vaultPath,
      documentPath,
      summary,
      tags: tagsJson,
      source,
    });
  },
};
