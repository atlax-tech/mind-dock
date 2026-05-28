use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentRecord {
    pub id: i64,
    pub path: String,
    pub title: Option<String>,
    pub frontmatter: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub content_hash: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<String>,
    pub index_status: String,
    pub embedding_status: String,
    pub word_count: i64,
}

/// 获取 metadata.db 的路径，并确保 .minddock 目录存在
fn get_db_path(vault_path: &str) -> Result<std::path::PathBuf, String> {
    let vault = Path::new(vault_path);
    let minddock_dir = vault.join(".minddock");

    // 确保 .minddock 目录存在
    fs::create_dir_all(&minddock_dir).map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    Ok(minddock_dir.join("metadata.db"))
}

/// 打开数据库连接并确保表已创建
pub fn open_db(vault_path: &str) -> Result<Connection, String> {
    let db_path = get_db_path(vault_path)?;

    // 校验数据库文件路径在 vault 内
    let db_path_str = db_path.to_string_lossy().to_string();
    assert_path_inside_vault(vault_path, &db_path_str)?;

    let conn = Connection::open(&db_path).map_err(|e| format!("打开数据库失败: {}", e))?;

    // 启用外键约束
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("启用外键约束失败: {}", e))?;

    Ok(conn)
}

/// 创建所有表（如果不存在）
pub fn create_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            title TEXT,
            frontmatter TEXT,
            created_at TEXT,
            updated_at TEXT,
            content_hash TEXT,
            summary TEXT,
            tags TEXT,
            index_status TEXT DEFAULT 'pending',
            embedding_status TEXT DEFAULT 'pending',
            word_count INTEGER DEFAULT 0
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_path ON documents(path);

        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_path TEXT NOT NULL,
            heading_path TEXT,
            start_line INTEGER,
            end_line INTEGER,
            content TEXT,
            content_hash TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_document_path ON chunks(document_path);

        CREATE TABLE IF NOT EXISTS chunk_embeddings (
            chunk_id INTEGER PRIMARY KEY,
            embedding BLOB,
            embedding_model TEXT,
            embedding_dimension INTEGER,
            embedding_provider TEXT,
            embedding_created_at TEXT,
            embedding_content_hash TEXT,
            embedding_status TEXT DEFAULT 'pending',
            usage_score REAL DEFAULT 0.0,
            FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_embeddings_chunk_id ON chunk_embeddings(chunk_id);

        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, heading_path, document_path, tokenize='unicode61');
        ",
    )
    .map_err(|e| format!("创建表失败: {}", e))?;

    Ok(())
}

/// 初始化 metadata 数据库
#[command]
pub fn init_metadata_db(vault_path: String) -> Result<(), String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;
    Ok(())
}

/// 插入或更新文档元数据
#[command]
pub fn upsert_document_metadata(
    vault_path: String,
    document_path: String,
    title: Option<String>,
    frontmatter: Option<String>,
    content_hash: Option<String>,
    word_count: Option<i64>,
) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();
    let word_count = word_count.unwrap_or(0);

    // 检查是否已存在该文档
    let existing: Option<(Option<String>, String)> = conn
        .query_row(
            "SELECT content_hash, created_at FROM documents WHERE path = ?1",
            params![document_path],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?)),
        )
        .ok();

    if let Some((old_hash, created_at)) = existing {
        // 文档已存在，执行更新
        let should_reset_index = match (&old_hash, &content_hash) {
            (Some(old), Some(new)) => old != new,
            _ => false,
        };

        let index_status = if should_reset_index {
            "pending".to_string()
        } else {
            // 保留当前状态
            let current: String = conn
                .query_row(
                    "SELECT index_status FROM documents WHERE path = ?1",
                    params![document_path],
                    |row| row.get(0),
                )
                .map_err(|e| format!("查询 index_status 失败: {}", e))?;
            current
        };

        conn.execute(
            "UPDATE documents SET title = ?1, frontmatter = ?2, content_hash = ?3, word_count = ?4, updated_at = ?5, created_at = ?6, index_status = ?7 WHERE path = ?8",
            params![title, frontmatter, content_hash, word_count, now, created_at, index_status, document_path],
        )
        .map_err(|e| format!("更新文档元数据失败: {}", e))?;
    } else {
        // 新文档，执行插入
        conn.execute(
            "INSERT INTO documents (path, title, frontmatter, content_hash, word_count, created_at, updated_at, index_status, embedding_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', 'pending')",
            params![document_path, title, frontmatter, content_hash, word_count, now, now],
        )
        .map_err(|e| format!("插入文档元数据失败: {}", e))?;
    }

    Ok(())
}

/// 删除文档元数据及其所有关联数据
#[command]
pub fn delete_document_metadata(vault_path: String, document_path: String) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    // 先删除 FTS 记录
    conn.execute(
        "DELETE FROM chunks_fts WHERE document_path = ?1",
        params![document_path],
    )
    .map_err(|e| format!("删除 FTS 记录失败: {}", e))?;

    // 删除 chunk_embeddings（通过子查询找到关联的 chunk_id）
    conn.execute(
        "DELETE FROM chunk_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE document_path = ?1)",
        params![document_path],
    )
    .map_err(|e| format!("删除 chunk embeddings 失败: {}", e))?;

    // 删除 chunks
    conn.execute(
        "DELETE FROM chunks WHERE document_path = ?1",
        params![document_path],
    )
    .map_err(|e| format!("删除 chunks 失败: {}", e))?;

    // 删除 documents
    conn.execute(
        "DELETE FROM documents WHERE path = ?1",
        params![document_path],
    )
    .map_err(|e| format!("删除文档元数据失败: {}", e))?;

    Ok(())
}

/// 重命名文档元数据路径
#[command]
pub fn rename_document_metadata(
    vault_path: String,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &old_path)?;
    assert_path_inside_vault(&vault_path, &new_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    // 更新 documents.path
    conn.execute(
        "UPDATE documents SET path = ?1 WHERE path = ?2",
        params![new_path, old_path],
    )
    .map_err(|e| format!("更新文档路径失败: {}", e))?;

    // 更新 chunks.document_path
    conn.execute(
        "UPDATE chunks SET document_path = ?1 WHERE document_path = ?2",
        params![new_path, old_path],
    )
    .map_err(|e| format!("更新 chunks 路径失败: {}", e))?;

    // FTS5 不支持直接 UPDATE，需要删除旧记录再插入新记录
    // 先读取旧的 FTS 记录
    let fts_records: Vec<(String, Option<String>)> = {
        let mut stmt = conn
            .prepare("SELECT content, heading_path FROM chunks_fts WHERE document_path = ?1")
            .map_err(|e| format!("查询 FTS 记录失败: {}", e))?;
        let rows = stmt
            .query_map(params![old_path], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|e| format!("读取 FTS 行失败: {}", e))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("收集 FTS 记录失败: {}", e))?
    };

    // 删除旧的 FTS 记录
    conn.execute(
        "DELETE FROM chunks_fts WHERE document_path = ?1",
        params![old_path],
    )
    .map_err(|e| format!("删除旧 FTS 记录失败: {}", e))?;

    // 插入新的 FTS 记录
    for (content, heading_path) in &fts_records {
        conn.execute(
            "INSERT INTO chunks_fts (content, heading_path, document_path) VALUES (?1, ?2, ?3)",
            params![content, heading_path, new_path],
        )
        .map_err(|e| format!("插入新 FTS 记录失败: {}", e))?;
    }

    Ok(())
}

/// 获取单个文档元数据（数据库记录）
#[command]
pub fn get_document_db_metadata(
    vault_path: String,
    document_path: String,
) -> Result<Option<DocumentRecord>, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let result = conn
        .query_row(
            "SELECT id, path, title, frontmatter, created_at, updated_at, content_hash, summary, tags, index_status, embedding_status, word_count FROM documents WHERE path = ?1",
            params![document_path],
            |row| {
                Ok(DocumentRecord {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    frontmatter: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    content_hash: row.get(6)?,
                    summary: row.get(7)?,
                    tags: row.get(8)?,
                    index_status: row.get(9)?,
                    embedding_status: row.get(10)?,
                    word_count: row.get(11)?,
                })
            },
        )
        .ok();

    Ok(result)
}

/// 列出所有文档元数据
#[command]
pub fn list_documents_metadata(vault_path: String) -> Result<Vec<DocumentRecord>, String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, path, title, frontmatter, created_at, updated_at, content_hash, summary, tags, index_status, embedding_status, word_count FROM documents ORDER BY path",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DocumentRecord {
                id: row.get(0)?,
                path: row.get(1)?,
                title: row.get(2)?,
                frontmatter: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                content_hash: row.get(6)?,
                summary: row.get(7)?,
                tags: row.get(8)?,
                index_status: row.get(9)?,
                embedding_status: row.get(10)?,
                word_count: row.get(11)?,
            })
        })
        .map_err(|e| format!("查询文档列表失败: {}", e))?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row.map_err(|e| format!("读取行失败: {}", e))?);
    }

    Ok(records)
}

/// 运行 verify-index.sh 脚本验证索引完整性
#[command]
pub fn run_verify_index(vault_path: String) -> Result<String, String> {
    let current_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let candidates = [
        current_dir.join("scripts/verify-index.sh"),
        current_dir.join("../scripts/verify-index.sh"),
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/verify-index.sh"),
    ];
    let script_path = candidates
        .iter()
        .find(|path| path.exists())
        .cloned()
        .ok_or_else(|| {
            format!(
                "未找到 verify-index.sh，已检查路径: {}",
                candidates
                    .iter()
                    .map(|path| path.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;

    let output = std::process::Command::new("bash")
        .arg(&script_path)
        .arg(&vault_path)
        .output()
        .map_err(|e| format!("执行验证脚本失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("{}\n{}", stdout, stderr))
    }
}
