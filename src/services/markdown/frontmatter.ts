// 纯浏览器兼容的 frontmatter 解析，不依赖 gray-matter（避免 Node.js Buffer 问题）

export interface FrontMatterData {
  title?: string;
  created?: string;
  tags?: string[];
  [key: string]: unknown;
}

/** 从 Markdown 内容中解析 YAML frontmatter */
export function parseFrontMatter(content: string): { data: FrontMatterData; content: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { data: {}, content };
  }

  const yamlStr = match[1];
  const body = content.slice(match[0].length);
  const data = parseSimpleYaml(yamlStr);

  return { data, content: body };
}

/** 将 frontmatter 数据和正文序列化为完整 Markdown */
export function stringifyFrontMatter(data: FrontMatterData, content: string): string {
  const keys = Object.keys(data);
  if (keys.length === 0) return content;

  const yaml = keys.map(key => {
    const val = data[key];
    if (Array.isArray(val)) {
      return `${key}:\n${val.map(v => `  - ${v}`).join('\n')}`;
    }
    return `${key}: ${val ?? ''}`;
  }).join('\n');

  return `---\n${yaml}\n---\n${content}`;
}

/** 从文档内容提取标题
 * 优先级：frontmatter title → # 标题 → ## 标题 → ### 标题 → 正文首句
 */
export function extractTitle(content: string): string {
  const { data, content: body } = parseFrontMatter(content);
  if (data.title && String(data.title).trim()) return String(data.title).trim();

  // 从正文中按级别查找标题：# → ## → ###
  for (const level of [1, 2, 3]) {
    const prefix = '#'.repeat(level);
    const regex = new RegExp(`^${prefix}\\s+(.+)$`, 'm');
    const match = body.match(regex);
    if (match) return match[1].trim();
  }

  // fallback：正文首句（取第一个非空行，截取到句号或前 50 字符）
  const firstLine = body.split('\n').map(l => l.trim()).find(l => l.length > 0);
  if (firstLine) {
    const sentenceEnd = firstLine.search(/[。！？.!?]/);
    if (sentenceEnd > 0) {
      return firstLine.slice(0, sentenceEnd + 1);
    }
    return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine;
  }

  return '';
}

/** 简易 YAML 解析器（仅支持 frontmatter 常见格式） */
function parseSimpleYaml(yaml: string): FrontMatterData {
  const data: FrontMatterData = {};
  const lines = yaml.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // 数组项: "  - value"
    if (/^\s+-\s+/.test(trimmed) && currentKey) {
      const val = trimmed.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '');
      currentArray.push(val);
      continue;
    }

    // 保存上一个 key 的数组
    if (currentKey && currentArray.length > 0) {
      (data as Record<string, unknown>)[currentKey] = currentArray;
      currentArray = [];
    }

    // 键值对: "key: value"
    const kvMatch = trimmed.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim().replace(/^["']|["']$/g, '');
      if (val === '') {
        currentArray = [];
      } else {
        (data as Record<string, unknown>)[currentKey] = val;
        currentKey = '';
      }
    }
  }

  // 保存最后一个数组
  if (currentKey && currentArray.length > 0) {
    (data as Record<string, unknown>)[currentKey] = currentArray;
  }

  return data;
}
