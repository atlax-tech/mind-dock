export interface VaultInfo {
  path: string;
  name: string;
  document_count: number;
}

export interface DocEntry {
  name: string;
  title: string | null; // frontmatter 中的 title（如有）
  path: string;
  absolute_path: string;
  is_dir: boolean;
  children: DocEntry[];
}
