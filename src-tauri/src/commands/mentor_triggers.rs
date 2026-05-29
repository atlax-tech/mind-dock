use crate::commands::metadata::{create_tables, open_db};
use crate::commands::vault::assert_path_inside_vault;
use crate::commands::vector_index::{cosine_similarity, read_all_ready_embeddings, read_embedding, EmbeddingRow};
use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;

// ── Data Structures ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerResult {
    pub trigger_type: String,       // "semantic_repeat", "new_topic", "context_drift", "review"
    pub theme: Option<String>,
    pub reason: String,
    pub repeat_count: Option<i32>,
    pub last_seen: Option<String>,
    pub status: String,             // "suggestion", "threshold_exceeded"
    pub threshold: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerStateEntry {
    pub document_path: String,
    pub trigger_type: String,
    pub repeat_count: i32,
    pub last_seen: String,
    pub last_content_hash: Option<String>,
    pub hash_change_count: i32,
    pub last_word_count: i64,
    pub dismissed: bool,
    pub dismissed_until: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TriggerStateFile {
    entries: Vec<TriggerStateEntry>,
}

// ── Thresholds ──

const SEMANTIC_REPEAT_THRESHOLD: f32 = 0.85;
const SEMANTIC_REPEAT_TRIGGER_COUNT: i32 = 3;
const NEW_TOPIC_MAX_SIMILARITY: f32 = 0.5;
const CONTEXT_DRIFT_THRESHOLD: f32 = 0.6;
const REVIEW_WORD_COUNT_CHANGE_RATIO: f64 = 0.5;
const REVIEW_HASH_CHANGE_MIN: i32 = 3;

// ── Helpers ──

/// Get the path to .minddock/mentor-triggers.json
fn get_triggers_path(vault: &Path) -> std::path::PathBuf {
    vault.join(".minddock").join("mentor-triggers.json")
}

/// Read trigger state from JSON file
fn read_trigger_state(vault: &Path) -> Result<Vec<TriggerStateEntry>, String> {
    let minddock_dir = vault.join(".minddock");
    let triggers_path = get_triggers_path(vault);

    let triggers_path_str = triggers_path.to_string_lossy().to_string();
    assert_path_inside_vault(
        &vault.to_string_lossy().to_string(),
        &triggers_path_str,
    )?;

    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    if !triggers_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&triggers_path)
        .map_err(|e| format!("读取 mentor-triggers.json 失败: {}", e))?;

    let state: TriggerStateFile = serde_json::from_str(&content)
        .map_err(|e| format!("解析 mentor-triggers.json 失败: {}", e))?;

    Ok(state.entries)
}

/// Write trigger state to JSON file (atomic write via temp file + rename)
fn write_trigger_state(vault: &Path, entries: &[TriggerStateEntry]) -> Result<(), String> {
    let minddock_dir = vault.join(".minddock");
    let triggers_path = get_triggers_path(vault);

    let triggers_path_str = triggers_path.to_string_lossy().to_string();
    assert_path_inside_vault(
        &vault.to_string_lossy().to_string(),
        &triggers_path_str,
    )?;

    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    let state = TriggerStateFile {
        entries: entries.to_vec(),
    };

    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("序列化 trigger state 失败: {}", e))?;

    let tmp_path = minddock_dir.join("mentor-triggers.json.tmp");
    fs::write(&tmp_path, &json)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &triggers_path)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}

/// Find or create a state entry for a given document + trigger_type.
/// Returns the index of the entry in the vector.
fn find_or_create_entry_idx(
    entries: &mut Vec<TriggerStateEntry>,
    document_path: &str,
    trigger_type: &str,
) -> usize {
    let now = Utc::now().to_rfc3339();
    if let Some(idx) = entries.iter().position(|e| e.document_path == document_path && e.trigger_type == trigger_type) {
        return idx;
    }
    entries.push(TriggerStateEntry {
        document_path: document_path.to_string(),
        trigger_type: trigger_type.to_string(),
        repeat_count: 0,
        last_seen: now,
        last_content_hash: None,
        hash_change_count: 0,
        last_word_count: 0,
        dismissed: false,
        dismissed_until: None,
    });
    entries.len() - 1
}

fn is_trigger_cooled_down(entry: &mut TriggerStateEntry, now: &DateTime<Utc>) -> bool {
    if !entry.dismissed {
        return false;
    }

    if let Some(until) = &entry.dismissed_until {
        if let Ok(parsed) = DateTime::parse_from_rfc3339(until) {
            if parsed.with_timezone(&Utc) > *now {
                return true;
            }
        }
    } else {
        return true;
    }

    entry.dismissed = false;
    entry.dismissed_until = None;
    false
}

/// Get document metadata from the database
fn get_document_meta(conn: &Connection, document_path: &str) -> Result<Option<(Option<String>, i64)>, String> {
    let result = conn
        .query_row(
            "SELECT content_hash, word_count FROM documents WHERE path = ?1",
            params![document_path],
            |row| {
                let content_hash: Option<String> = row.get(0)?;
                let word_count: i64 = row.get(1)?;
                Ok((content_hash, word_count))
            },
        )
        .ok();
    Ok(result)
}

/// Compute average embedding from a list of embeddings
fn average_embeddings(embeddings: &[Vec<f32>]) -> Option<Vec<f32>> {
    if embeddings.is_empty() {
        return None;
    }
    let dim = embeddings[0].len();
    let mut avg = vec![0.0f32; dim];
    let mut count = 0usize;
    for emb in embeddings {
        if emb.len() != dim {
            continue;
        }
        for (i, v) in emb.iter().enumerate() {
            avg[i] += v;
        }
        count += 1;
    }
    if count == 0 {
        return None;
    }
    let count_f = count as f32;
    for v in avg.iter_mut() {
        *v /= count_f;
    }
    Some(avg)
}

// ── Trigger A: Semantic Repeat ──

/// Check if a chunk is semantically repeated across other documents.
/// Only triggers deeper mentor when repeat_count >= 3 or user clicks.
/// Does NOT auto-call reasoning on every detection.
fn check_semantic_repeat(
    vault_path: &str,
    document_path: &str,
    chunk_id: i64,
) -> Result<Option<TriggerResult>, String> {
    let conn = open_db(vault_path)?;
    create_tables(&conn)?;

    let source_embedding = match read_embedding(&conn, chunk_id)? {
        Some(emb) => emb,
        None => return Ok(None),
    };

    let all_embeddings = read_all_ready_embeddings(&conn)?;

    // Find similar chunks in OTHER documents
    let mut similar_in_other_docs: Vec<&EmbeddingRow> = Vec::new();
    let mut theme: Option<String> = None;

    for row in &all_embeddings {
        if row.document_path == document_path {
            continue;
        }
        let score = cosine_similarity(&source_embedding, &row.embedding);
        if score > SEMANTIC_REPEAT_THRESHOLD {
            similar_in_other_docs.push(row);
            if theme.is_none() && row.heading_path.is_some() {
                theme = row.heading_path.clone();
            }
        }
    }

    if similar_in_other_docs.is_empty() {
        return Ok(None);
    }

    let repeat_count = similar_in_other_docs.len() as i32;
    let last_seen_doc = similar_in_other_docs
        .iter()
        .find(|r| r.heading_path.is_some())
        .map(|r| r.heading_path.clone().unwrap_or_else(|| r.document_path.clone()))
        .unwrap_or_else(|| similar_in_other_docs[0].document_path.clone());

    let status = if repeat_count >= SEMANTIC_REPEAT_TRIGGER_COUNT {
        "threshold_exceeded"
    } else {
        "suggestion"
    };

    Ok(Some(TriggerResult {
        trigger_type: "semantic_repeat".to_string(),
        theme,
        reason: format!(
            "在 {} 个其他文档中发现相似内容（相似度 > {:.2}）",
            repeat_count, SEMANTIC_REPEAT_THRESHOLD
        ),
        repeat_count: Some(repeat_count),
        last_seen: Some(last_seen_doc),
        status: status.to_string(),
        threshold: Some(SEMANTIC_REPEAT_THRESHOLD as f64),
    }))
}

// ── Trigger B: New Topic Detection ──

/// Check if a document is likely a new topic (low similarity with all other documents).
/// Returns suggestion but doesn't auto-classify.
fn check_new_topic(
    vault_path: &str,
    document_path: &str,
) -> Result<Option<TriggerResult>, String> {
    let conn = open_db(vault_path)?;
    create_tables(&conn)?;

    // Get document embedding (average of chunk embeddings)
    let doc_embedding = {
        let mut stmt = conn
            .prepare(
                "SELECT ce.embedding \
                 FROM chunk_embeddings ce \
                 JOIN chunks c ON ce.chunk_id = c.id \
                 WHERE c.document_path = ?1 AND ce.embedding_status = 'ready'",
            )
            .map_err(|e| format!("准备查询文档 embedding 失败: {}", e))?;

        let rows = stmt
            .query_map(params![document_path], |row| {
                let embedding_bytes: Vec<u8> = row.get(0)?;
                Ok(embedding_bytes)
            })
            .map_err(|e| format!("查询文档 embedding 失败: {}", e))?;

        let mut embeddings: Vec<Vec<f32>> = Vec::new();
        for row in rows {
            let embedding_bytes = row.map_err(|e| format!("读取 embedding 行失败: {}", e))?;
            if embedding_bytes.is_empty() {
                continue;
            }
            let embedding = crate::commands::vector_index::bytes_to_embedding(&embedding_bytes)?;
            embeddings.push(embedding);
        }

        match average_embeddings(&embeddings) {
            Some(emb) => emb,
            None => return Ok(None),
        }
    };

    // Get all other document embeddings
    let all_embeddings = read_all_ready_embeddings(&conn)?;

    // Group embeddings by document
    let mut doc_embeddings: HashMap<String, Vec<Vec<f32>>> = HashMap::new();
    for row in &all_embeddings {
        if row.document_path == document_path {
            continue;
        }
        doc_embeddings
            .entry(row.document_path.clone())
            .or_default()
            .push(row.embedding.clone());
    }

    if doc_embeddings.is_empty() {
        // No other documents to compare — this could be a new topic
        return Ok(Some(TriggerResult {
            trigger_type: "new_topic".to_string(),
            theme: None,
            reason: "知识库中没有其他文档可供比较，这可能是新方向".to_string(),
            repeat_count: None,
            last_seen: None,
            status: "suggestion".to_string(),
            threshold: Some(NEW_TOPIC_MAX_SIMILARITY as f64),
        }));
    }

    // Compute max similarity with any other document
    let mut max_similarity: f32 = 0.0;
    for (_, embs) in &doc_embeddings {
        if let Some(other_avg) = average_embeddings(embs) {
            let score = cosine_similarity(&doc_embedding, &other_avg);
            if score > max_similarity {
                max_similarity = score;
            }
        }
    }

    if max_similarity < NEW_TOPIC_MAX_SIMILARITY {
        return Ok(Some(TriggerResult {
            trigger_type: "new_topic".to_string(),
            theme: None,
            reason: format!(
                "与其他文档最大相似度仅 {:.2}（阈值 {:.2}），这可能是新方向",
                max_similarity, NEW_TOPIC_MAX_SIMILARITY
            ),
            repeat_count: None,
            last_seen: None,
            status: "suggestion".to_string(),
            threshold: Some(NEW_TOPIC_MAX_SIMILARITY as f64),
        }));
    }

    Ok(None)
}

// ── Trigger C: Context Drift ──

/// Check if a chunk has drifted from the document's main topic.
/// Returns suggestion but doesn't auto-modify document.
fn check_context_drift(
    vault_path: &str,
    document_path: &str,
    chunk_id: i64,
) -> Result<Option<TriggerResult>, String> {
    let conn = open_db(vault_path)?;
    create_tables(&conn)?;

    // Get the chunk embedding
    let chunk_embedding = match read_embedding(&conn, chunk_id)? {
        Some(emb) => emb,
        None => return Ok(None),
    };

    // Get the document's main embedding (average of all chunks)
    let mut stmt = conn
        .prepare(
            "SELECT ce.embedding, c.heading_path \
             FROM chunk_embeddings ce \
             JOIN chunks c ON ce.chunk_id = c.id \
             WHERE c.document_path = ?1 AND ce.embedding_status = 'ready'",
        )
        .map_err(|e| format!("准备查询文档 embedding 失败: {}", e))?;

    let rows = stmt
        .query_map(params![document_path], |row| {
            let embedding_bytes: Vec<u8> = row.get(0)?;
            let heading_path: Option<String> = row.get(1)?;
            Ok((embedding_bytes, heading_path))
        })
        .map_err(|e| format!("查询文档 embedding 失败: {}", e))?;

    let mut doc_embeddings: Vec<Vec<f32>> = Vec::new();
    let mut theme: Option<String> = None;
    for row in rows {
        let (embedding_bytes, heading_path) =
            row.map_err(|e| format!("读取 embedding 行失败: {}", e))?;
        if embedding_bytes.is_empty() {
            continue;
        }
        let embedding = crate::commands::vector_index::bytes_to_embedding(&embedding_bytes)?;
        doc_embeddings.push(embedding);
        if theme.is_none() && heading_path.is_some() {
            theme = heading_path;
        }
    }

    let doc_avg = match average_embeddings(&doc_embeddings) {
        Some(avg) => avg,
        None => return Ok(None),
    };

    let similarity = cosine_similarity(&chunk_embedding, &doc_avg);

    if similarity < CONTEXT_DRIFT_THRESHOLD {
        return Ok(Some(TriggerResult {
            trigger_type: "context_drift".to_string(),
            theme,
            reason: format!(
                "该段落与文档主旨相似度仅 {:.2}（阈值 {:.2}），可能偏离了主题",
                similarity, CONTEXT_DRIFT_THRESHOLD
            ),
            repeat_count: None,
            last_seen: None,
            status: "suggestion".to_string(),
            threshold: Some(CONTEXT_DRIFT_THRESHOLD as f64),
        }));
    }

    Ok(None)
}

// ── Trigger D: Review Trigger ──

/// Check if a document has been significantly updated and warrants review.
/// When triggered, reasoning input MUST be compressed context pack, not full knowledge base.
fn should_trigger_review(
    vault_path: &str,
    document_path: &str,
) -> Result<bool, String> {
    let conn = open_db(vault_path)?;
    create_tables(&conn)?;

    let vault = Path::new(vault_path);
    let mut entries = read_trigger_state(vault)?;

    let meta = match get_document_meta(&conn, document_path)? {
        Some(m) => m,
        None => return Ok(false),
    };

    let (content_hash, word_count) = meta;
    let now = Utc::now().to_rfc3339();

    let idx = find_or_create_entry_idx(&mut entries, document_path, "review");
    let entry = &mut entries[idx];

    // Check word count change ratio
    if entry.last_word_count > 0 {
        let ratio = ((word_count - entry.last_word_count).abs() as f64) / (entry.last_word_count as f64);
        if ratio > REVIEW_WORD_COUNT_CHANGE_RATIO {
            entry.repeat_count += 1;
            entry.last_seen = now.clone();
            entry.last_word_count = word_count;
            entry.last_content_hash = content_hash.clone();
            write_trigger_state(vault, &entries)?;
            return Ok(true);
        }
    }

    // Check content_hash changes
    if let (Some(ref current_hash), Some(ref last_hash)) = (&content_hash, &entry.last_content_hash) {
        if current_hash != last_hash {
            entry.hash_change_count += 1;
            if entry.hash_change_count >= REVIEW_HASH_CHANGE_MIN {
                entry.repeat_count += 1;
                entry.last_seen = now.clone();
                entry.last_content_hash = content_hash.clone();
                entry.hash_change_count = 0;
                write_trigger_state(vault, &entries)?;
                return Ok(true);
            }
        }
    }

    // Update tracking state
    entry.last_word_count = word_count;
    entry.last_content_hash = content_hash;
    entry.last_seen = now;
    write_trigger_state(vault, &entries)?;

    Ok(false)
}

// ── Commands ──

/// Run all trigger checks for a given document
///
/// Takes vault_path, document_path, and optional chunk_id.
/// Runs all 4 trigger checks and returns a list of triggered results.
/// Stores trigger state in .minddock/mentor-triggers.json.
#[command]
pub fn check_triggers(
    vault_path: String,
    document_path: String,
    chunk_id: Option<i64>,
) -> Result<Vec<TriggerResult>, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let vault = Path::new(&vault_path);
    let mut results: Vec<TriggerResult> = Vec::new();
    let mut entries = read_trigger_state(vault)?;
    let now_dt = Utc::now();
    let now = now_dt.to_rfc3339();

    // Trigger A: Semantic Repeat (requires chunk_id)
    if let Some(cid) = chunk_id {
        if let Ok(Some(result)) = check_semantic_repeat(&vault_path, &document_path, cid) {
            let idx = find_or_create_entry_idx(&mut entries, &document_path, "semantic_repeat");
            if !is_trigger_cooled_down(&mut entries[idx], &now_dt) {
                entries[idx].repeat_count = result.repeat_count.unwrap_or(0);
                entries[idx].last_seen = now.clone();
                entries[idx].dismissed = false;
                entries[idx].dismissed_until = None;
                results.push(result);
            }
        }
    }

    // Trigger B: New Topic
    if let Ok(Some(result)) = check_new_topic(&vault_path, &document_path) {
        let idx = find_or_create_entry_idx(&mut entries, &document_path, "new_topic");
        if !is_trigger_cooled_down(&mut entries[idx], &now_dt) {
            entries[idx].repeat_count += 1;
            entries[idx].last_seen = now.clone();
            entries[idx].dismissed = false;
            entries[idx].dismissed_until = None;
            results.push(result);
        }
    }

    // Trigger C: Context Drift (requires chunk_id)
    if let Some(cid) = chunk_id {
        if let Ok(Some(result)) = check_context_drift(&vault_path, &document_path, cid) {
            let idx = find_or_create_entry_idx(&mut entries, &document_path, "context_drift");
            if !is_trigger_cooled_down(&mut entries[idx], &now_dt) {
                entries[idx].repeat_count += 1;
                entries[idx].last_seen = now.clone();
                entries[idx].dismissed = false;
                entries[idx].dismissed_until = None;
                results.push(result);
            }
        }
    }

    // Trigger D: Review
    if should_trigger_review(&vault_path, &document_path)? {
        results.push(TriggerResult {
            trigger_type: "review".to_string(),
            theme: None,
            reason: "文档内容发生了显著变化，建议复查".to_string(),
            repeat_count: None,
            last_seen: Some(now),
            status: "threshold_exceeded".to_string(),
            threshold: None,
        });
    }

    write_trigger_state(vault, &entries)?;

    Ok(results)
}

/// Get the current trigger state for a vault
#[command]
pub fn get_trigger_state(
    vault_path: String,
) -> Result<Vec<TriggerStateEntry>, String> {
    let vault = Path::new(&vault_path);
    read_trigger_state(vault)
}

/// Update a trigger state entry (e.g., dismiss a trigger)
#[command]
pub fn update_trigger_state(
    vault_path: String,
    document_path: String,
    trigger_type: String,
    dismissed: Option<bool>,
) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let mut entries = read_trigger_state(vault)?;

    let idx = find_or_create_entry_idx(&mut entries, &document_path, &trigger_type);

    if let Some(d) = dismissed {
        entries[idx].dismissed = d;
        entries[idx].dismissed_until = if d {
            Some((Utc::now() + Duration::hours(24)).to_rfc3339())
        } else {
            None
        };
    }

    write_trigger_state(vault, &entries)?;

    Ok(())
}
