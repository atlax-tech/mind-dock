// ── Vector Index Module ──
//
// Architecture Choice: Option B — Frontend obtains embeddings via existing AI Runtime,
// then passes vectors to Rust for persistence/search.
//
// Rationale:
// - Phase 3 already provides `ollama_embed` in Rust (ai_runtime.rs) which the frontend
//   calls via Tauri invoke (AIRuntimeProvider.embed → aiRuntimeService.embed).
// - The vector_index commands focus on storage and similarity search, receiving
//   pre-computed embeddings as parameters. This keeps concerns separated:
//   embedding computation (AI Runtime) vs. vector persistence/search (Vector Index).
// - The frontend orchestrates the flow: call embed → get Vec<f32> → call store_chunk_embedding.
// - This avoids duplicating the embedding client and keeps the AI Runtime as the single
//   source of truth for model/endpoint configuration.

use crate::commands::metadata::{create_tables, open_db};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::command;

// ── Data Structures ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SemanticSearchResult {
    pub chunk_id: i64,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub content: String,
    pub similarity_score: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SimilarChunkResult {
    pub chunk_id: i64,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub similarity_score: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextPackCandidate {
    pub chunk_id: i64,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub content: String,
    pub similarity_score: f32,
    pub selected_reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentEmbeddingResult {
    pub document_path: String,
    pub embedding: Vec<f32>,
    pub embedding_model: Option<String>,
    pub embedding_dimension: Option<i64>,
    pub chunk_count: i64,
}

// ── Helpers ──

/// Compute cosine similarity between two vectors
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

/// Serialize Vec<f32> to bytes (little-endian) for BLOB storage
fn embedding_to_bytes(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Deserialize bytes to Vec<f32> from BLOB storage
pub fn bytes_to_embedding(bytes: &[u8]) -> Result<Vec<f32>, String> {
    if bytes.len() % 4 != 0 {
        return Err(format!(
            "BLOB 长度 {} 不是 4 的倍数，无法解析为 f32 向量",
            bytes.len()
        ));
    }
    let count = bytes.len() / 4;
    let mut result = Vec::with_capacity(count);
    for i in 0..count {
        let offset = i * 4;
        let slice: [u8; 4] = bytes[offset..offset + 4]
            .try_into()
            .map_err(|e| format!("解析 BLOB 字节失败: {}", e))?;
        result.push(f32::from_le_bytes(slice));
    }
    Ok(result)
}

/// Read embedding from chunk_embeddings table for a given chunk_id
pub fn read_embedding(conn: &Connection, chunk_id: i64) -> Result<Option<Vec<f32>>, String> {
    let result: Option<Vec<u8>> = conn
        .query_row(
            "SELECT embedding FROM chunk_embeddings WHERE chunk_id = ?1 AND embedding_status = 'ready'",
            params![chunk_id],
            |row| row.get(0),
        )
        .ok();

    match result {
        Some(bytes) => {
            if bytes.is_empty() {
                Ok(None)
            } else {
                Ok(Some(bytes_to_embedding(&bytes)?))
            }
        }
        None => Ok(None),
    }
}

/// Read all ready embeddings with chunk info
pub struct EmbeddingRow {
    pub chunk_id: i64,
    pub document_path: String,
    pub heading_path: Option<String>,
    pub start_line: i64,
    pub end_line: i64,
    pub content: String,
    pub embedding: Vec<f32>,
}

pub fn read_all_ready_embeddings(conn: &Connection) -> Result<Vec<EmbeddingRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ce.chunk_id, c.document_path, c.heading_path, c.start_line, c.end_line, c.content, ce.embedding \
             FROM chunk_embeddings ce \
             JOIN chunks c ON ce.chunk_id = c.id \
             WHERE ce.embedding_status = 'ready'",
        )
        .map_err(|e| format!("准备查询 embeddings 失败: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let chunk_id: i64 = row.get(0)?;
            let document_path: String = row.get(1)?;
            let heading_path: Option<String> = row.get(2)?;
            let start_line: i64 = row.get(3)?;
            let end_line: i64 = row.get(4)?;
            let content: String = row.get(5)?;
            let embedding_bytes: Vec<u8> = row.get(6)?;
            Ok((
                chunk_id,
                document_path,
                heading_path,
                start_line,
                end_line,
                content,
                embedding_bytes,
            ))
        })
        .map_err(|e| format!("查询 embeddings 失败: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        let (chunk_id, document_path, heading_path, start_line, end_line, content, embedding_bytes) =
            row.map_err(|e| format!("读取 embedding 行失败: {}", e))?;

        if embedding_bytes.is_empty() {
            continue;
        }

        let embedding = bytes_to_embedding(&embedding_bytes)?;
        results.push(EmbeddingRow {
            chunk_id,
            document_path,
            heading_path,
            start_line,
            end_line,
            content,
            embedding,
        });
    }

    Ok(results)
}

fn refresh_document_embedding_status(conn: &Connection, chunk_id: i64) -> Result<(), String> {
    let (document_path, total_chunks, ready_chunks, error_chunks, stale_chunks, unavailable_chunks): (String, i64, i64, i64, i64, i64) = conn
        .query_row(
            "SELECT
                c.document_path,
                COUNT(*) as total_chunks,
                SUM(CASE WHEN ce.embedding_status = 'ready' THEN 1 ELSE 0 END) as ready_chunks,
                SUM(CASE WHEN ce.embedding_status = 'error' THEN 1 ELSE 0 END) as error_chunks,
                SUM(CASE WHEN ce.embedding_status = 'stale' THEN 1 ELSE 0 END) as stale_chunks,
                SUM(CASE WHEN ce.embedding_status = 'unavailable' THEN 1 ELSE 0 END) as unavailable_chunks
             FROM chunks c
             LEFT JOIN chunk_embeddings ce ON c.id = ce.chunk_id
             WHERE c.id = ?1
             GROUP BY c.document_path",
            params![chunk_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .map_err(|e| format!("查询文档 embedding 状态统计失败: {}", e))?;

    let status = if total_chunks > 0 && ready_chunks == total_chunks {
        "ready"
    } else if error_chunks > 0 {
        "error"
    } else if stale_chunks > 0 {
        "stale"
    } else if unavailable_chunks > 0 {
        "unavailable"
    } else {
        "pending"
    };

    conn.execute(
        "UPDATE documents SET embedding_status = ?1 WHERE path = ?2",
        params![status, document_path],
    )
    .map_err(|e| format!("更新文档 embedding_status 失败: {}", e))?;

    Ok(())
}

// ── Commands ──

/// Store or replace a chunk embedding
///
/// Sets embedding_status to 'ready' and embedding_created_at to current time.
/// If the chunk already has an embedding, it is replaced.
#[command]
pub fn store_chunk_embedding(
    vault_path: String,
    chunk_id: i64,
    embedding: Vec<f32>,
    embedding_model: String,
    embedding_dimension: i64,
    embedding_provider: String,
    embedding_content_hash: String,
) -> Result<(), String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();
    let embedding_bytes = embedding_to_bytes(&embedding);

    // Verify chunk exists
    let chunk_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM chunks WHERE id = ?1",
            params![chunk_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .map_err(|e| format!("查询 chunk 失败: {}", e))?;

    if !chunk_exists {
        return Err(format!("chunk_id {} 不存在", chunk_id));
    }

    // Insert or replace
    conn.execute(
        "INSERT OR REPLACE INTO chunk_embeddings \
         (chunk_id, embedding, embedding_model, embedding_dimension, embedding_provider, embedding_content_hash, embedding_status, embedding_created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ready', ?7)",
        params![
            chunk_id,
            embedding_bytes,
            embedding_model,
            embedding_dimension,
            embedding_provider,
            embedding_content_hash,
            now,
        ],
    )
    .map_err(|e| format!("存储 chunk embedding 失败: {}", e))?;

    refresh_document_embedding_status(&conn, chunk_id)?;

    Ok(())
}

/// Semantic search using cosine similarity
///
/// Takes a pre-computed query embedding and returns top-k results
/// ranked by cosine similarity against all ready chunk embeddings.
#[command]
pub fn semantic_search(
    vault_path: String,
    query_embedding: Vec<f32>,
    limit: Option<i64>,
) -> Result<Vec<SemanticSearchResult>, String> {
    let limit = limit.unwrap_or(10);
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let all_embeddings = read_all_ready_embeddings(&conn)?;

    let mut scored: Vec<SemanticSearchResult> = all_embeddings
        .into_iter()
        .map(|row| {
            let score = cosine_similarity(&query_embedding, &row.embedding);
            SemanticSearchResult {
                chunk_id: row.chunk_id,
                document_path: row.document_path,
                heading_path: row.heading_path,
                start_line: row.start_line,
                end_line: row.end_line,
                content: row.content,
                similarity_score: score,
            }
        })
        .collect();

    // Sort by similarity descending
    scored.sort_by(|a, b| {
        b.similarity_score
            .partial_cmp(&a.similarity_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(limit as usize);

    Ok(scored)
}

/// Find similar chunks to a given chunk by its embedding
///
/// Gets the embedding for the given chunk_id and computes cosine similarity
/// with all other chunk embeddings, returning top-k results.
#[command]
pub fn find_similar_chunks(
    vault_path: String,
    chunk_id: i64,
    limit: Option<i64>,
) -> Result<Vec<SimilarChunkResult>, String> {
    let limit = limit.unwrap_or(5);
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let source_embedding = read_embedding(&conn, chunk_id)?
        .ok_or_else(|| format!("chunk_id {} 没有 ready 状态的 embedding", chunk_id))?;

    let all_embeddings = read_all_ready_embeddings(&conn)?;

    let mut scored: Vec<SimilarChunkResult> = all_embeddings
        .into_iter()
        .filter(|row| row.chunk_id != chunk_id)
        .map(|row| {
            let score = cosine_similarity(&source_embedding, &row.embedding);
            SimilarChunkResult {
                chunk_id: row.chunk_id,
                document_path: row.document_path,
                heading_path: row.heading_path,
                start_line: row.start_line,
                end_line: row.end_line,
                similarity_score: score,
            }
        })
        .collect();

    scored.sort_by(|a, b| {
        b.similarity_score
            .partial_cmp(&a.similarity_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(limit as usize);

    Ok(scored)
}

/// Suggest context pack candidates based on semantic similarity
///
/// Takes a set of chunk_ids, computes their average embedding,
/// and finds other chunks with similar embeddings.
/// Results are marked as suggestions, not auto-selected.
#[command]
pub fn suggest_context_pack_candidates(
    vault_path: String,
    chunk_ids: Vec<i64>,
    limit: Option<i64>,
) -> Result<Vec<ContextPackCandidate>, String> {
    let limit = limit.unwrap_or(5);
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    if chunk_ids.is_empty() {
        return Ok(Vec::new());
    }

    // Collect embeddings for the given chunk_ids
    let mut source_embeddings: Vec<Vec<f32>> = Vec::new();
    for &cid in &chunk_ids {
        match read_embedding(&conn, cid)? {
            Some(emb) => source_embeddings.push(emb),
            None => continue,
        }
    }

    if source_embeddings.is_empty() {
        return Ok(Vec::new());
    }

    // Compute average embedding
    let dim = source_embeddings[0].len();
    let mut avg_embedding = vec![0.0f32; dim];
    for emb in &source_embeddings {
        if emb.len() != dim {
            continue;
        }
        for (i, v) in emb.iter().enumerate() {
            avg_embedding[i] += v;
        }
    }
    let count = source_embeddings.len() as f32;
    for v in avg_embedding.iter_mut() {
        *v /= count;
    }

    let all_embeddings = read_all_ready_embeddings(&conn)?;

    let chunk_id_set: std::collections::HashSet<i64> = chunk_ids.into_iter().collect();

    let mut scored: Vec<ContextPackCandidate> = all_embeddings
        .into_iter()
        .filter(|row| !chunk_id_set.contains(&row.chunk_id))
        .map(|row| {
            let score = cosine_similarity(&avg_embedding, &row.embedding);
            ContextPackCandidate {
                chunk_id: row.chunk_id,
                document_path: row.document_path,
                heading_path: row.heading_path,
                start_line: row.start_line,
                end_line: row.end_line,
                content: row.content,
                similarity_score: score,
                selected_reason: "semantic_similarity".to_string(),
            }
        })
        .collect();

    scored.sort_by(|a, b| {
        b.similarity_score
            .partial_cmp(&a.similarity_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(limit as usize);

    Ok(scored)
}

/// Mark a chunk's embedding as stale
///
/// This should be called when the chunk content has changed but the
/// embedding has not yet been recomputed.
#[command]
pub fn mark_embedding_stale(vault_path: String, chunk_id: i64) -> Result<(), String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let affected = conn
        .execute(
            "UPDATE chunk_embeddings SET embedding_status = 'stale' WHERE chunk_id = ?1",
            params![chunk_id],
        )
        .map_err(|e| format!("标记 embedding 为 stale 失败: {}", e))?;

    if affected == 0 {
        return Err(format!(
            "chunk_id {} 在 chunk_embeddings 表中不存在",
            chunk_id
        ));
    }

    refresh_document_embedding_status(&conn, chunk_id)?;

    Ok(())
}

/// Mark all pending embeddings as unavailable
///
/// Called when the embedding service is not available (e.g., Ollama disconnected).
/// Metadata, chunking, FTS, and baseline search still work without embeddings.
#[command]
pub fn mark_embeddings_unavailable(vault_path: String) -> Result<i64, String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let affected = conn
        .execute(
            "UPDATE chunk_embeddings SET embedding_status = 'unavailable' WHERE embedding_status = 'pending'",
            params![],
        )
        .map_err(|e| format!("标记 embeddings 为 unavailable 失败: {}", e))?;

    Ok(affected as i64)
}

/// Mark a chunk's embedding as error
///
/// Called when embedding computation fails. No silent fallback —
/// the error status is explicitly recorded so the system can retry later.
#[command]
pub fn mark_embedding_error(vault_path: String, chunk_id: i64) -> Result<(), String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let affected = conn
        .execute(
            "UPDATE chunk_embeddings SET embedding_status = 'error' WHERE chunk_id = ?1",
            params![chunk_id],
        )
        .map_err(|e| format!("标记 embedding 为 error 失败: {}", e))?;

    if affected == 0 {
        return Err(format!(
            "chunk_id {} 在 chunk_embeddings 表中不存在",
            chunk_id
        ));
    }

    refresh_document_embedding_status(&conn, chunk_id)?;

    Ok(())
}

/// Get document-level embedding by averaging all chunk embeddings
///
/// Returns the average of all ready chunk embeddings for a given document.
/// Useful for document-level semantic search.
#[command]
pub fn get_document_embedding(
    vault_path: String,
    document_path: String,
) -> Result<Option<DocumentEmbeddingResult>, String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    // Get all ready embeddings for chunks belonging to this document
    let mut stmt = conn
        .prepare(
            "SELECT ce.embedding, ce.embedding_model, ce.embedding_dimension \
             FROM chunk_embeddings ce \
             JOIN chunks c ON ce.chunk_id = c.id \
             WHERE c.document_path = ?1 AND ce.embedding_status = 'ready'",
        )
        .map_err(|e| format!("准备查询文档 embedding 失败: {}", e))?;

    let rows = stmt
        .query_map(params![document_path], |row| {
            let embedding_bytes: Vec<u8> = row.get(0)?;
            let embedding_model: Option<String> = row.get(1)?;
            let embedding_dimension: Option<i64> = row.get(2)?;
            Ok((embedding_bytes, embedding_model, embedding_dimension))
        })
        .map_err(|e| format!("查询文档 embedding 失败: {}", e))?;

    let mut embeddings: Vec<Vec<f32>> = Vec::new();
    let mut last_model: Option<String> = None;
    let mut last_dimension: Option<i64> = None;

    for row in rows {
        let (embedding_bytes, model, dimension) =
            row.map_err(|e| format!("读取文档 embedding 行失败: {}", e))?;

        if embedding_bytes.is_empty() {
            continue;
        }

        let embedding = bytes_to_embedding(&embedding_bytes)?;
        embeddings.push(embedding);
        last_model = model;
        last_dimension = dimension;
    }

    if embeddings.is_empty() {
        return Ok(None);
    }

    // Compute average embedding
    let dim = embeddings[0].len();
    let mut avg = vec![0.0f32; dim];
    let mut count = 0i64;

    for emb in &embeddings {
        if emb.len() != dim {
            continue;
        }
        for (i, v) in emb.iter().enumerate() {
            avg[i] += v;
        }
        count += 1;
    }

    if count == 0 {
        return Ok(None);
    }

    let count_f = count as f32;
    for v in avg.iter_mut() {
        *v /= count_f;
    }

    Ok(Some(DocumentEmbeddingResult {
        document_path,
        embedding: avg,
        embedding_model: last_model,
        embedding_dimension: last_dimension,
        chunk_count: count,
    }))
}

/// Detect stale embeddings for a document
///
/// Compares chunk content_hash with embedding_content_hash to find
/// chunks whose embeddings are stale (content changed after embedding was computed).
#[command]
pub fn detect_stale_embeddings(
    vault_path: String,
    document_path: String,
) -> Result<Vec<i64>, String> {
    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT c.id \
             FROM chunks c \
             JOIN chunk_embeddings ce ON c.id = ce.chunk_id \
             WHERE c.document_path = ?1 \
             AND ce.embedding_status = 'ready' \
             AND c.content_hash != ce.embedding_content_hash",
        )
        .map_err(|e| format!("准备检测 stale embeddings 失败: {}", e))?;

    let rows = stmt
        .query_map(params![document_path], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("检测 stale embeddings 失败: {}", e))?;

    let mut stale_ids = Vec::new();
    for row in rows {
        stale_ids.push(row.map_err(|e| format!("读取 stale chunk_id 失败: {}", e))?);
    }

    Ok(stale_ids)
}
