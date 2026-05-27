import { invoke } from '@tauri-apps/api/core';

/** Mentor Memory 类型 */
export type MentorMemoryType =
  | 'mentor_principle'
  | 'writing_preference'
  | 'review_conclusion'
  | 'long_term_suggestion';

/** Mentor Memory 来源 */
export type MentorMemorySource =
  | 'reasoning_review'
  | 'user_accepted';

/** Mentor Memory 状态 */
export type MentorMemoryStatus = 'active' | 'superseded' | 'dismissed';

/** Mentor Memory（对应 Rust MentorMemory） */
export interface MentorMemory {
  id: string;
  memory_type: MentorMemoryType;
  content: string;
  source: MentorMemorySource;
  confidence: number;
  status: MentorMemoryStatus;
  created_at: string;
  related_documents: string[];
}

export const mentorMemoryService = {
  /** 创建 Mentor Memory */
  async createMentorMemory(params: {
    vaultPath: string;
    memoryType: string;
    content: string;
    source: string;
    confidence: number;
    relatedDocuments: string[];
  }): Promise<MentorMemory> {
    return invoke<MentorMemory>('create_mentor_memory', {
      vaultPath: params.vaultPath,
      memoryType: params.memoryType,
      content: params.content,
      source: params.source,
      confidence: params.confidence,
      relatedDocuments: params.relatedDocuments,
    });
  },

  /** 列出 Mentor Memories */
  async listMentorMemories(
    vaultPath: string,
    status?: string,
  ): Promise<MentorMemory[]> {
    return invoke<MentorMemory[]>('list_mentor_memories', {
      vaultPath,
      status: status ?? null,
    });
  },

  /** 更新 Mentor Memory 状态 */
  async updateMentorMemoryStatus(
    vaultPath: string,
    memoryId: string,
    status: string,
  ): Promise<void> {
    return invoke('update_mentor_memory_status', {
      vaultPath,
      memoryId,
      status,
    });
  },

  /** 删除 Mentor Memory */
  async deleteMentorMemory(
    vaultPath: string,
    memoryId: string,
  ): Promise<void> {
    return invoke('delete_mentor_memory', {
      vaultPath,
      memoryId,
    });
  },

  /** 查找相关 Memories（关键词匹配） */
  async findRelevantMemories(
    vaultPath: string,
    queryText: string,
    limit?: number,
  ): Promise<MentorMemory[]> {
    return invoke<MentorMemory[]>('find_relevant_memories', {
      vaultPath,
      queryText,
      limit: limit ?? null,
    });
  },

  /** 记录推理结果（语义化封装 create_mentor_memory） */
  async recordReasoningResult(params: {
    vaultPath: string;
    memoryType: string;
    content: string;
    source: string;
    confidence: number;
    relatedDocuments: string[];
  }): Promise<MentorMemory> {
    return invoke<MentorMemory>('record_reasoning_result', {
      vaultPath: params.vaultPath,
      memoryType: params.memoryType,
      content: params.content,
      source: params.source,
      confidence: params.confidence,
      relatedDocuments: params.relatedDocuments,
    });
  },
};
