export interface VaultInfo {
  path: string;
  name: string;
  document_count: number;
}

export interface DocEntry {
  name: string;
  path: string;
  absolute_path: string;
  is_dir: boolean;
  children: DocEntry[];
}
