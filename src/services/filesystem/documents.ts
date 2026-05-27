import { invoke } from '@tauri-apps/api/core';
import { injectFrontmatter, parseFrontMatter, extractTitle } from '@/services/markdown/frontmatter';
import { metadataService } from '@/services/index/metadata';
import { chunkingService } from '@/services/index/chunking';

/** 计算内容的 SHA-256 哈希值，用于检测文档内容是否变化 */
async function computeContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Post-reindex 钩子：在 reindex 完成后执行 embedding 和 trigger 检查 */
type PostReindexHook = (vaultPath: string, documentPath: string) => Promise<void>;

let _postReindexHook: PostReindexHook | null = null;

/** 注册 post-reindex 钩子（由 AppShell 在初始化时调用） */
export function setPostReindexHook(hook: PostReindexHook | null): void {
  _postReindexHook = hook;
}

/** 执行 post-reindex 流程：embedding + check_triggers */
async function runPostReindexFlow(vaultPath: string, documentPath: string): Promise<void> {
  if (_postReindexHook) {
    try {
      await _postReindexHook(vaultPath, documentPath);
    } catch (err) {
      console.error('Post-reindex 钩子执行失败:', err);
    }
  }
}

export interface DocumentMetadata {
  size: number;
  modified_at: string;
}

export interface CreateDocumentWithMetadataOptions {
  vaultPath: string;
  filePath: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

export interface CreateDocumentResult {
  filePath: string;
}

export const documentService = {
  async createDocument(vaultPath: string, filePath: string): Promise<string> {
    return invoke<string>('create_document', { vaultPath, filePath });
  },

  async createDirectory(vaultPath: string, dirPath: string): Promise<string> {
    return invoke<string>('create_directory', { vaultPath, dirPath });
  },

  /**
   * 统一新建文档入口：创建文件 → 写入内容（含 frontmatter）→ 占位 metadata/index 更新
   * 所有新建文档的入口（Sidebar、Command Palette、Clarity Interview）都应走此流程
   */
  async createDocumentWithMetadata(options: CreateDocumentWithMetadataOptions): Promise<CreateDocumentResult> {
    const { vaultPath, filePath, content, frontmatter } = options;

    // 1. 创建文档文件
    await invoke<string>('create_document', { vaultPath, filePath });

    // 2. 如果有内容或 frontmatter，写入文档
    if (content || frontmatter) {
      let finalContent = content || '';
      if (frontmatter) {
        finalContent = injectFrontmatter(finalContent, frontmatter);
      }
      if (finalContent.trim()) {
        await invoke('write_document', { vaultPath, filePath, content: finalContent });
      }
    }

    // 3. 同步 metadata 到数据库
    const finalContent = content || '';
    const title = extractTitle(frontmatter ? injectFrontmatter(finalContent, frontmatter) : finalContent) || null;
    const frontmatterStr = frontmatter ? JSON.stringify(frontmatter) : null;
    const wordCount = finalContent.trim() ? finalContent.trim().split(/\s+/).length : 0;
    const contentHash = finalContent.trim() ? await computeContentHash(finalContent) : null;
    await metadataService.upsertDocumentMetadata({
      vaultPath,
      documentPath: filePath,
      title,
      frontmatter: frontmatterStr,
      contentHash,
      wordCount,
    });

    // 4. 新文档自动触发索引，完成后执行 post-reindex 流程（异步，不阻塞 UI）
    chunkingService.reindexDocument(vaultPath, filePath)
      .then(() => runPostReindexFlow(vaultPath, filePath))
      .catch(err => {
        console.error('新文档索引失败:', err);
      });

    return { filePath };
  },

  async readDocument(vaultPath: string, filePath: string): Promise<string> {
    return invoke<string>('read_document', { vaultPath, filePath });
  },

  async writeDocument(vaultPath: string, filePath: string, content: string): Promise<void> {
    await invoke('write_document', { vaultPath, filePath, content });
    // 同步 metadata：提取标题、frontmatter、字数
    try {
      const { data: fmData } = parseFrontMatter(content);
      const title = extractTitle(content) || null;
      const frontmatterStr = Object.keys(fmData).length > 0 ? JSON.stringify(fmData) : null;
      const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
      const contentHash = await computeContentHash(content);

      // 检查内容是否变化
      const oldMeta = await metadataService.getDocumentDbMetadata(vaultPath, filePath);
      const contentChanged = !oldMeta || oldMeta.content_hash !== contentHash;

      await metadataService.upsertDocumentMetadata({
        vaultPath,
        documentPath: filePath,
        title,
        frontmatter: frontmatterStr,
        contentHash,
        wordCount,
      });

      // 内容变化时自动触发重新索引，完成后执行 post-reindex 流程（异步，不阻塞 UI）
      if (contentChanged) {
        chunkingService.reindexDocument(vaultPath, filePath)
          .then(() => runPostReindexFlow(vaultPath, filePath))
          .catch(err => {
            console.error('文档重新索引失败:', err);
          });
      }
    } catch {
      // metadata 同步失败不影响文档写入
    }
  },

  async renameDocument(vaultPath: string, oldPath: string, newName: string): Promise<string> {
    const newPath = await invoke<string>('rename_document', { vaultPath, oldPath, newName });
    // 同步 metadata 路径
    try {
      await metadataService.renameDocumentMetadata(vaultPath, oldPath, newPath);
    } catch {
      // metadata 同步失败不影响重命名操作
    }
    return newPath;
  },

  async deleteDocument(vaultPath: string, filePath: string): Promise<void> {
    await invoke('delete_document', { vaultPath, filePath });
    // 同步删除 metadata
    try {
      await metadataService.deleteDocumentMetadata(vaultPath, filePath);
    } catch {
      // metadata 同步失败不影响删除操作
    }
  },

  async getDocumentMetadata(vaultPath: string, documentPath: string): Promise<DocumentMetadata | null> {
    try {
      return await invoke<DocumentMetadata>('get_document_metadata', { vaultPath, documentPath });
    } catch {
      return null;
    }
  },
};
