use crate::commands::metadata::{open_db, create_tables};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FtsSearchResult {
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub snippet: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentSearchResult {
    pub document_title: Option<String>,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub snippet: String,
    pub source: String,
}

/// FTS5 全文搜索
#[command]
pub fn fts_search(
    vault_path: String,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<FtsSearchResult>, String> {
    let limit = limit.unwrap_or(20);
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let sql = r#"
        SELECT
            fts.document_path,
            fts.heading_path,
            c.start_line,
            c.end_line,
            snippet(chunks_fts, 0, '>>>', '<<<', '...', 32) AS snippet
        FROM chunks_fts fts
        JOIN chunks c
            ON fts.document_path = c.document_path
            AND fts.heading_path IS c.heading_path
        WHERE chunks_fts MATCH ?1
        ORDER BY bm25(chunks_fts)
        LIMIT ?2
    "#;

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("准备 FTS 查询失败: {}", e))?;

    let rows = stmt
        .query_map(params![query, limit], |row| {
            Ok(FtsSearchResult {
                document_path: row.get(0)?,
                heading_path: row.get(1)?,
                start_line: row.get(2)?,
                end_line: row.get(3)?,
                snippet: row.get(4)?,
            })
        })
        .map_err(|e| format!("执行 FTS 查询失败: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("读取 FTS 搜索结果失败: {}", e))?);
    }

    Ok(results)
}

/// 搜索文档（结合 FTS 搜索与文档元数据）
#[command]
pub fn search_documents(
    vault_path: String,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<DocumentSearchResult>, String> {
    let limit = limit.unwrap_or(20);
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let sql = r#"
        SELECT
            d.title,
            fts.document_path,
            fts.heading_path,
            c.start_line,
            c.end_line,
            snippet(chunks_fts, 0, '>>>', '<<<', '...', 32) AS snippet
        FROM chunks_fts fts
        JOIN chunks c
            ON fts.document_path = c.document_path
            AND fts.heading_path IS c.heading_path
        LEFT JOIN documents d
            ON fts.document_path = d.path
        WHERE chunks_fts MATCH ?1
        ORDER BY bm25(chunks_fts)
        LIMIT ?2
    "#;

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("准备文档搜索查询失败: {}", e))?;

    let rows = stmt
        .query_map(params![query, limit], |row| {
            Ok(DocumentSearchResult {
                document_title: row.get(0)?,
                document_path: row.get(1)?,
                heading_path: row.get(2)?,
                start_line: row.get(3)?,
                end_line: row.get(4)?,
                snippet: row.get(5)?,
                source: "fts".to_string(),
            })
        })
        .map_err(|e| format!("执行文档搜索查询失败: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| format!("读取文档搜索结果失败: {}", e))?);
    }

    Ok(results)
}
