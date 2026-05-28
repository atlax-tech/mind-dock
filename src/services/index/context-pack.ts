import { invoke } from '@tauri-apps/api/core';

/** 上下文包条目 */
export interface ContextPackItem {
  id: string;
  // 来源文档（所有粒度都有）
  document_path: string;
  // 文档级字段
  title: string | null;
  summary: string | null;
  tags: string | null;
  // 细粒度可选字段（段落/选区时才有值）
  content: string | null;
  heading: string | null;
  start_line: number | null;
  end_line: number | null;
  // M4: chunk 关联字段
  chunk_id: number | null;
  source_type: string | null;
  score: number | null;
  reasoning_note: string | null;
  // 通用字段
  selected_reason: string;
  is_suggestion: boolean;
  timestamp: string;
}

/** 上下文包 */
export interface ContextPack {
  id: string;
  name: string;
  items: ContextPackItem[];
  created_at: string;
  updated_at: string;
}

export const contextPackService = {
  async listContextPacks(vaultPath: string): Promise<ContextPack[]> {
    return invoke('list_context_packs', { vaultPath });
  },

  async getContextPack(vaultPath: string, packId: string): Promise<ContextPack | null> {
    return invoke('get_context_pack', { vaultPath, packId });
  },

  async createContextPack(vaultPath: string, name: string): Promise<ContextPack> {
    return invoke('create_context_pack', { vaultPath, name });
  },

  async updateContextPack(
    vaultPath: string,
    packId: string,
    name?: string,
    items?: ContextPackItem[],
  ): Promise<ContextPack> {
    return invoke('update_context_pack', { vaultPath, packId, name: name ?? null, items: items ?? null });
  },

  async deleteContextPack(vaultPath: string, packId: string): Promise<void> {
    return invoke('delete_context_pack', { vaultPath, packId });
  },

  async exportContextPackMarkdown(vaultPath: string, packId: string): Promise<string> {
    return invoke('export_context_pack_markdown', { vaultPath, packId });
  },

  /** 前端辅助：添加条目到 pack */
  async addItem(
    vaultPath: string,
    packId: string,
    item: Omit<ContextPackItem, 'id' | 'timestamp'>,
  ): Promise<ContextPack> {
    const pack = await contextPackService.getContextPack(vaultPath, packId);
    if (!pack) throw new Error(`未找到 id 为 '${packId}' 的 context pack`);
    const newItem: ContextPackItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    pack.items.push(newItem);
    return contextPackService.updateContextPack(vaultPath, packId, undefined, pack.items);
  },

  /** 前端辅助：从 pack 移除条目 */
  async removeItem(vaultPath: string, packId: string, itemId: string): Promise<ContextPack> {
    const pack = await contextPackService.getContextPack(vaultPath, packId);
    if (!pack) throw new Error(`未找到 id 为 '${packId}' 的 context pack`);
    pack.items = pack.items.filter(i => i.id !== itemId);
    return contextPackService.updateContextPack(vaultPath, packId, undefined, pack.items);
  },

  /** 前端辅助：更新条目 */
  async updateItem(
    vaultPath: string,
    packId: string,
    itemId: string,
    updates: Partial<ContextPackItem>,
  ): Promise<ContextPack> {
    const pack = await contextPackService.getContextPack(vaultPath, packId);
    if (!pack) throw new Error(`未找到 id 为 '${packId}' 的 context pack`);
    const item = pack.items.find(i => i.id === itemId);
    if (!item) throw new Error(`未找到条目 '${itemId}'`);
    Object.assign(item, updates);
    return contextPackService.updateContextPack(vaultPath, packId, undefined, pack.items);
  },

  /** 前端辅助：重排条目 */
  async reorderItems(vaultPath: string, packId: string, itemIds: string[]): Promise<ContextPack> {
    const pack = await contextPackService.getContextPack(vaultPath, packId);
    if (!pack) throw new Error(`未找到 id 为 '${packId}' 的 context pack`);
    const reordered: ContextPackItem[] = [];
    for (const id of itemIds) {
      const item = pack.items.find(i => i.id === id);
      if (item) reordered.push(item);
    }
    pack.items = reordered;
    return contextPackService.updateContextPack(vaultPath, packId, undefined, pack.items);
  },

  /** 前端辅助：移动条目（上/下） */
  async moveItem(
    vaultPath: string,
    packId: string,
    itemId: string,
    direction: 'up' | 'down',
  ): Promise<ContextPack> {
    const pack = await contextPackService.getContextPack(vaultPath, packId);
    if (!pack) throw new Error(`未找到 id 为 '${packId}' 的 context pack`);
    const idx = pack.items.findIndex(i => i.id === itemId);
    if (idx === -1) return pack;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= pack.items.length) return pack;
    const [moved] = pack.items.splice(idx, 1);
    pack.items.splice(newIdx, 0, moved);
    return contextPackService.updateContextPack(vaultPath, packId, undefined, pack.items);
  },

  /** 前端辅助：接受建议（将 is_suggestion 设为 false） */
  async acceptSuggestion(vaultPath: string, packId: string, itemId: string): Promise<ContextPack> {
    return contextPackService.updateItem(vaultPath, packId, itemId, { is_suggestion: false });
  },

  /** 前端辅助：重命名 pack */
  async renameContextPack(vaultPath: string, packId: string, name: string): Promise<ContextPack> {
    return contextPackService.updateContextPack(vaultPath, packId, name);
  },

  /** 前端辅助：导出为 Markdown（前端生成，含 source references） */
  exportAsMarkdown(pack: ContextPack): string {
    const lines: string[] = [];
    lines.push(`# ${pack.name}`);
    lines.push('');
    lines.push(`> 创建时间: ${new Date(pack.created_at).toLocaleString('zh-CN')}`);
    lines.push(`> 更新时间: ${new Date(pack.updated_at).toLocaleString('zh-CN')}`);
    lines.push(`> 内容数: ${pack.items.filter(i => !i.is_suggestion).length}`);
    lines.push('');

    const confirmedItems = pack.items.filter(i => !i.is_suggestion);
    for (const item of confirmedItems) {
      const displayTitle = item.heading ?? item.title ?? item.document_path.split('/').pop()?.replace('.md', '') ?? '未命名';
      lines.push(`## ${displayTitle}`);
      lines.push(`> 来源: ${item.document_path}`);
      if (item.start_line != null && item.end_line != null) {
        lines.push(`> 位置: L${item.start_line}–L${item.end_line}`);
      }
      if (item.summary) {
        lines.push(`> 摘要: ${item.summary}`);
      }
      if (item.tags) {
        lines.push(`> 标签: ${item.tags}`);
      }
      lines.push(`> 加入原因: ${item.selected_reason}`);
      lines.push('');
      if (item.content) {
        lines.push(item.content);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  },
};
