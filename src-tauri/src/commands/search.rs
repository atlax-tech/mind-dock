use crate::commands::metadata::{create_tables, open_db};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FtsSearchResult {
    pub chunk_id: i64,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub content: String,
    pub snippet: String,
    pub rank: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentSearchResult {
    pub chunk_id: i64,
    pub document_title: Option<String>,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub content: String,
    pub snippet: String,
    pub source: String,
    pub rank: f64,
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
            c.id,
            fts.document_path,
            fts.heading_path,
            c.start_line,
            c.end_line,
            c.content,
            snippet(chunks_fts, 0, '>>>', '<<<', '...', 32) AS snippet,
            bm25(chunks_fts) AS rank
        FROM chunks_fts fts
        JOIN chunks c
            ON fts.document_path = c.document_path
            AND fts.heading_path IS c.heading_path
        WHERE chunks_fts MATCH ?1
        ORDER BY rank
        LIMIT ?2
    "#;

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("准备 FTS 查询失败: {}", e))?;

    let rows = stmt
        .query_map(params![query, limit], |row| {
            Ok(FtsSearchResult {
                chunk_id: row.get(0)?,
                document_path: row.get(1)?,
                heading_path: row.get(2)?,
                start_line: row.get(3)?,
                end_line: row.get(4)?,
                content: row.get(5)?,
                snippet: row.get(6)?,
                rank: row.get(7)?,
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
    let mut results = Vec::new();
    let like_query = format!("%{}%", query);

    let title_sql = r#"
        SELECT
            c.id,
            d.title,
            d.path,
            c.heading_path,
            c.start_line,
            c.end_line,
            c.content,
            c.content AS snippet,
            CASE
                WHEN d.title = ?1 THEN -100.0
                WHEN d.title LIKE ?2 THEN -50.0
                WHEN d.path LIKE ?2 THEN -25.0
                ELSE -10.0
            END AS rank
        FROM documents d
        JOIN chunks c
            ON c.id = (
                SELECT c2.id
                FROM chunks c2
                WHERE c2.document_path = d.path
                ORDER BY c2.start_line
                LIMIT 1
            )
        WHERE d.title LIKE ?2 OR d.path LIKE ?2
        ORDER BY rank, d.path
        LIMIT ?3
    "#;

    let mut title_stmt = conn
        .prepare(title_sql)
        .map_err(|e| format!("准备标题搜索查询失败: {}", e))?;

    let title_rows = title_stmt
        .query_map(params![query, like_query, limit], |row| {
            Ok(DocumentSearchResult {
                chunk_id: row.get(0)?,
                document_title: row.get(1)?,
                document_path: row.get(2)?,
                heading_path: row.get(3)?,
                start_line: row.get(4)?,
                end_line: row.get(5)?,
                content: row.get(6)?,
                snippet: row.get(7)?,
                source: "title".to_string(),
                rank: row.get(8)?,
            })
        })
        .map_err(|e| format!("执行标题搜索查询失败: {}", e))?;

    for row in title_rows {
        results.push(row.map_err(|e| format!("读取标题搜索结果失败: {}", e))?);
    }

    let sql = r#"
        SELECT
            c.id,
            d.title,
            fts.document_path,
            fts.heading_path,
            c.start_line,
            c.end_line,
            c.content,
            snippet(chunks_fts, 0, '>>>', '<<<', '...', 32) AS snippet,
            bm25(chunks_fts) AS rank
        FROM chunks_fts fts
        JOIN chunks c
            ON fts.document_path = c.document_path
            AND fts.heading_path IS c.heading_path
        LEFT JOIN documents d
            ON fts.document_path = d.path
        WHERE chunks_fts MATCH ?1
        ORDER BY rank
        LIMIT ?2
    "#;

    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("准备文档搜索查询失败: {}", e))?;

    let rows = stmt
        .query_map(params![query, limit], |row| {
            Ok(DocumentSearchResult {
                chunk_id: row.get(0)?,
                document_title: row.get(1)?,
                document_path: row.get(2)?,
                heading_path: row.get(3)?,
                start_line: row.get(4)?,
                end_line: row.get(5)?,
                content: row.get(6)?,
                snippet: row.get(7)?,
                source: "fts".to_string(),
                rank: row.get(8)?,
            })
        })
        .map_err(|e| format!("执行文档搜索查询失败: {}", e))?;

    let mut seen = std::collections::HashSet::new();
    for result in &results {
        seen.insert(format!("{}:{}", result.document_path, result.start_line));
    }

    for row in rows {
        let result = row.map_err(|e| format!("读取文档搜索结果失败: {}", e))?;
        let key = format!("{}:{}", result.document_path, result.start_line);
        if seen.insert(key) {
            results.push(result);
        }
    }
    results.truncate(limit as usize);

    Ok(results)
}
