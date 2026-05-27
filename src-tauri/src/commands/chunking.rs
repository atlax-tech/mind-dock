use crate::commands::metadata::{open_db, create_tables};
use crate::commands::vault::assert_path_inside_vault;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChunkRecord {
    pub id: i64,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub content: String,
    pub content_hash: Option<String>,
}

/// 表示一个 Markdown 文档的分块
struct RawChunk {
    heading_path: String,
    start_line: usize,
    end_line: usize,
    content: String,
}

/// 解析 Markdown 标题行，返回标题级别（# 的数量）和标题文本
fn parse_heading(line: &str) -> Option<(usize, String)> {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('#') {
        return None;
    }
    let level = trimmed.chars().take_while(|c| *c == '#').count();
    if level == 0 || level > 6 {
        return None;
    }
    let rest = &trimmed[level..];
    // 标题后面必须跟空格或行尾
    if !rest.is_empty() && !rest.starts_with(' ') {
        return None;
    }
    let title = rest.trim().to_string();
    if title.is_empty() {
        return None;
    }
    Some((level, title))
}

/// 将 Markdown 内容按标题层级分块
fn chunk_markdown(content: &str) -> Vec<RawChunk> {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Vec::new();
    }

    let mut chunks: Vec<RawChunk> = Vec::new();
    let mut heading_stack: Vec<(usize, String)> = Vec::new(); // (level, title)
    let mut current_start: usize = 1; // 1-based
    let mut current_lines: Vec<&str> = Vec::new();

    for (i, line) in lines.iter().enumerate() {
        let line_num = i + 1; // 1-based

        if let Some((level, title)) = parse_heading(line) {
            // 遇到标题行，先保存之前的 chunk
            if !current_lines.is_empty() {
                let heading_path = build_heading_path(&heading_stack);
                chunks.push(RawChunk {
                    heading_path,
                    start_line: current_start,
                    end_line: line_num - 1,
                    content: current_lines.join("\n"),
                });
                current_lines.clear();
            }

            // 更新标题栈
            // 弹出所有 >= level 的标题
            while !heading_stack.is_empty() && heading_stack.last().unwrap().0 >= level {
                heading_stack.pop();
            }
            heading_stack.push((level, title));

            current_start = line_num;
            current_lines.push(*line);
        } else {
            if current_lines.is_empty() && chunks.is_empty() {
                // 第一个标题之前的内容
                current_start = line_num;
            }
            current_lines.push(*line);
        }
    }

    // 处理最后一个 chunk
    if !current_lines.is_empty() {
        let heading_path = build_heading_path(&heading_stack);
        chunks.push(RawChunk {
            heading_path,
            start_line: current_start,
            end_line: lines.len(),
            content: current_lines.join("\n"),
        });
    }

    // 如果第一个 chunk 的 heading_path 为空，说明是第一个标题之前的内容
    // 已经通过 heading_stack 为空时 build_heading_path 返回空字符串处理

    chunks
}

/// 根据标题栈构建 heading_path
fn build_heading_path(stack: &[(usize, String)]) -> String {
    stack
        .iter()
        .map(|(_, title)| title.as_str())
        .collect::<Vec<&str>>()
        .join(" > ")
}

/// 计算 SHA-256 哈希
fn compute_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// 读取文档内容
fn read_document_content(vault_path: &str, document_path: &str) -> Result<String, String> {
    assert_path_inside_vault(vault_path, document_path)?;

    let path = Path::new(document_path);
    if !path.exists() {
        return Err(format!("文件 '{}' 不存在", document_path));
    }

    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 将分块写入数据库
fn write_chunks_to_db(
    conn: &Connection,
    document_path: &str,
    chunks: &[RawChunk],
) -> Result<usize, String> {
    // 删除旧的 FTS 记录
    conn.execute(
        "DELETE FROM chunks_fts WHERE document_path = ?1",
        params![document_path],
    )
    .map_err(|e| format!("删除旧 FTS 记录失败: {}", e))?;

    // 删除旧的 chunk_embeddings（通过子查询找到关联的 chunk_id）
    conn.execute(
        "DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE document_path = ?1)",
        params![document_path],
    )
    .map_err(|e| format!("删除旧 chunk embeddings 失败: {}", e))?;

    // 删除旧的 chunks
    conn.execute(
        "DELETE FROM chunks WHERE document_path = ?1",
        params![document_path],
    )
    .map_err(|e| format!("删除旧 chunks 失败: {}", e))?;

    // 插入新的 chunks
    for chunk in chunks {
        let content_hash = compute_hash(&chunk.content);
        let heading_path = if chunk.heading_path.is_empty() {
            None
        } else {
            Some(chunk.heading_path.clone())
        };

        conn.execute(
            "INSERT INTO chunks (document_path, heading_path, start_line, end_line, content, content_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                document_path,
                heading_path,
                chunk.start_line as i64,
                chunk.end_line as i64,
                chunk.content,
                content_hash,
            ],
        )
        .map_err(|e| format!("插入 chunk 失败: {}", e))?;

        // 插入 FTS 记录
        conn.execute(
            "INSERT INTO chunks_fts (content, heading_path, document_path) VALUES (?1, ?2, ?3)",
            params![chunk.content, heading_path, document_path],
        )
        .map_err(|e| format!("插入 FTS 记录失败: {}", e))?;
    }

    // 更新 documents.index_status
    conn.execute(
        "UPDATE documents SET index_status = 'indexed' WHERE path = ?1",
        params![document_path],
    )
    .map_err(|e| format!("更新 index_status 失败: {}", e))?;

    Ok(chunks.len())
}

/// 对文档进行分块索引
#[command]
pub fn chunk_document(vault_path: String, document_path: String) -> Result<usize, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let content = read_document_content(&vault_path, &document_path)?;
    let chunks = chunk_markdown(&content);

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let count = write_chunks_to_db(&conn, &document_path, &chunks)?;

    Ok(count)
}

/// 重新索引文档（与 chunk_document 相同逻辑，显式命名用于重索引流程）
#[command]
pub fn reindex_document(vault_path: String, document_path: String) -> Result<usize, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let content = read_document_content(&vault_path, &document_path)?;
    let chunks = chunk_markdown(&content);

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let count = write_chunks_to_db(&conn, &document_path, &chunks)?;

    Ok(count)
}

/// 获取文档的所有分块
#[command]
pub fn get_document_chunks(
    vault_path: String,
    document_path: String,
) -> Result<Vec<ChunkRecord>, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, document_path, heading_path, start_line, end_line, content, content_hash FROM chunks WHERE document_path = ?1 ORDER BY start_line",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let rows = stmt
        .query_map(params![document_path], |row| {
            Ok(ChunkRecord {
                id: row.get(0)?,
                document_path: row.get(1)?,
                heading_path: row.get(2)?,
                start_line: row.get(3)?,
                end_line: row.get(4)?,
                content: row.get(5)?,
                content_hash: row.get(6)?,
            })
        })
        .map_err(|e| format!("查询 chunks 失败: {}", e))?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| format!("读取行失败: {}", e))?);
    }

    Ok(records)
}
