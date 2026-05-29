// ── Summary / Tags Layered Generation Module ──
//
// Implements a layered approach to generating summaries and tags:
// 1. Deterministic baseline (always available, no AI needed)
// 2. Embedding signal (if embeddings exist)
// 3. Local LLM summary (if configured)

use crate::commands::ai_runtime::{ollama_chat, ChatMessage};
use crate::commands::metadata::{create_tables, open_db, DocumentRecord};
use crate::commands::vault::assert_path_inside_vault;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

// ── Data Structures ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SummaryTagsLayer {
    pub source: String,
    pub summary: Option<String>,
    pub tags: Option<Vec<String>>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SummaryTagsResult {
    pub document_path: String,
    pub layers: Vec<SummaryTagsLayer>,
}

// ── Helpers ──

/// Parse frontmatter string to extract tags
fn parse_frontmatter_tags(frontmatter: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut in_tags_array = false;

    for line in frontmatter.lines() {
        let trimmed = line.trim_end();

        // Check for tags: key
        if let Some(rest) = trimmed.strip_prefix("tags:") {
            let value = rest.trim();
            if value.starts_with('[') && value.ends_with(']') {
                // Inline array: tags: [tag1, tag2]
                let inner = &value[1..value.len() - 1];
                for item in inner.split(',') {
                    let tag = item.trim().trim_matches('"').trim_matches('\'');
                    if !tag.is_empty() {
                        tags.push(tag.to_string());
                    }
                }
                in_tags_array = false;
            } else if value.is_empty() {
                // Multi-line array starts on next lines
                in_tags_array = true;
            } else {
                // Single value: tags: tag1
                let tag = value.trim_matches('"').trim_matches('\'');
                if !tag.is_empty() {
                    tags.push(tag.to_string());
                }
                in_tags_array = false;
            }
            continue;
        }

        // Array item: "  - tag"
        if in_tags_array && trimmed.starts_with("- ") {
            let val = trimmed.strip_prefix("- ").unwrap_or("");
            let tag = val.trim_matches('"').trim_matches('\'');
            if !tag.is_empty() {
                tags.push(tag.to_string());
            }
            continue;
        }

        // If we were in tags array and hit a non-array line, exit
        if in_tags_array && !trimmed.starts_with("- ") && !trimmed.is_empty() {
            in_tags_array = false;
        }
    }

    tags
}

/// Extract directory names from file path as potential tags
fn extract_path_tags(document_path: &str) -> Vec<String> {
    let path = Path::new(document_path);
    let mut tags = Vec::new();

    // Get parent directories (exclude the file name itself and root)
    if let Some(parent) = path.parent() {
        for component in parent.components() {
            if let std::path::Component::Normal(os_str) = component {
                if let Some(name) = os_str.to_str() {
                    // Skip hidden directories (starting with .)
                    if !name.starts_with('.') && !name.is_empty() {
                        tags.push(name.to_string());
                    }
                }
            }
        }
    }

    tags
}

/// Extract heading keywords from heading_path strings
fn extract_heading_keywords(headings: &[String]) -> Vec<String> {
    let mut keywords = Vec::new();

    for heading in headings {
        // Split heading path by " > " separator
        for segment in heading.split(" > ") {
            let segment = segment.trim();
            if segment.is_empty() {
                continue;
            }
            // Split by common delimiters to extract keywords
            for word in segment.split(|c: char| c.is_whitespace() || c == '、' || c == '，' || c == ',' || c == '&' || c == '/') {
                let word = word.trim();
                if !word.is_empty() && word.len() >= 2 {
                    keywords.push(word.to_string());
                }
            }
        }
    }

    keywords
}

/// Get headings from chunks for a document
fn get_document_headings(conn: &Connection, document_path: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT heading_path FROM chunks WHERE document_path = ?1 AND heading_path IS NOT NULL ORDER BY start_line",
        )
        .map_err(|e| format!("查询 headings 失败: {}", e))?;

    let rows = stmt
        .query_map(params![document_path], |row| {
            let hp: Option<String> = row.get(0)?;
            Ok(hp)
        })
        .map_err(|e| format!("读取 headings 失败: {}", e))?;

    let mut headings = Vec::new();
    for row in rows {
        if let Some(hp) = row.map_err(|e| format!("解析 heading 行失败: {}", e))? {
            if !hp.is_empty() {
                headings.push(hp);
            }
        }
    }

    Ok(headings)
}

/// Read document content from filesystem
fn read_document_content(document_path: &str) -> Result<String, String> {
    let path = Path::new(document_path);
    if !path.exists() {
        return Err(format!("文件 '{}' 不存在", document_path));
    }
    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

/// Update frontmatter in document content to include summary and tags
fn update_frontmatter_summary_tags(content: &str, summary: &str, tags: &[String]) -> String {
    // 对 summary 值加引号保护，避免 YAML 中的特殊字符（冒号、引号、# 等）导致格式错误
    let summary_escaped = if summary.contains(':') || summary.contains('#') || summary.contains('"') || summary.contains('\'') || summary.contains('\n') {
        format!("\"{}\"", summary.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        summary.to_string()
    };

    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
    let mut in_frontmatter = false;
    let mut frontmatter_start = None;
    let mut frontmatter_end = None;
    let mut found_summary = false;
    let mut found_tags = false;

    // Find frontmatter boundaries
    for i in 0..lines.len() {
        let line = lines[i].trim();
        if i == 0 && line == "---" {
            in_frontmatter = true;
            frontmatter_start = Some(i);
            continue;
        }
        if in_frontmatter && line == "---" {
            frontmatter_end = Some(i);
            break;
        }
    }

    let (start, end) = match (frontmatter_start, frontmatter_end) {
        (Some(s), Some(e)) => (s, e),
        _ => {
            // No frontmatter, create one
            let tags_yaml = if tags.is_empty() {
                "tags: []".to_string()
            } else {
                format!("tags:\n{}", tags.iter().map(|t| format!("  - {}", t)).collect::<Vec<_>>().join("\n"))
            };
            let mut new_content = format!("---\nsummary: {}\n{}\n---\n", summary_escaped, tags_yaml);
            new_content.push_str(content);
            return new_content;
        }
    };

    // Update existing frontmatter
    for i in (start + 1)..end {
        let line = lines[i].trim_start();
        if line.starts_with("summary:") {
            lines[i] = format!("summary: {}", summary_escaped);
            found_summary = true;
        } else if line.starts_with("tags:") {
            // Replace tags line and any following array items
            let tags_yaml = if tags.is_empty() {
                "tags: []".to_string()
            } else {
                format!("tags:\n{}", tags.iter().map(|t| format!("  - {}", t)).collect::<Vec<_>>().join("\n"))
            };
            // Remove this line and subsequent array items
            let remove_from = i;
            let mut remove_to = i + 1;
            for j in (i + 1)..end {
                let next_line = lines[j].trim_start();
                if next_line.starts_with("- ") {
                    remove_to = j + 1;
                } else {
                    break;
                }
            }
            let tag_lines: Vec<String> = tags_yaml.lines().map(|l| l.to_string()).collect();
            // Replace range with new tag lines
            let _ = lines.splice(remove_from..remove_to, tag_lines);
            found_tags = true;
            break; // frontmatter indices changed, stop this pass
        }
    }

    // If we didn't find summary or tags, insert them before the closing ---
    // Recalculate end since lines may have changed
    let end = lines.iter().position(|l| {
        let trimmed = l.trim();
        trimmed == "---"
    }).unwrap_or(lines.len()).max(frontmatter_start.unwrap_or(0) + 1);

    if !found_summary {
        lines.insert(end, format!("summary: {}", summary_escaped));
    }
    if !found_tags {
        let end = lines.iter().rposition(|l| {
            let trimmed = l.trim();
            trimmed == "---"
        }).unwrap_or(lines.len());
        if tags.is_empty() {
            lines.insert(end, "tags: []".to_string());
        } else {
            lines.insert(end, "tags:".to_string());
            for tag in tags.iter().rev() {
                lines.insert(end + 1, format!("  - {}", tag));
            }
        }
    }

    // Preserve trailing newline
    let has_trailing_newline = content.ends_with('\n');
    let mut result = lines.join("\n");
    if has_trailing_newline {
        result.push('\n');
    }
    result
}

/// Compute average embedding from chunk embeddings for a document
fn get_avg_embedding(conn: &Connection, document_path: &str) -> Result<Option<Vec<f32>>, String> {
    // Read all ready embeddings for this document's chunks
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
        // Deserialize bytes to Vec<f32>
        if embedding_bytes.len() % 4 != 0 {
            continue;
        }
        let count = embedding_bytes.len() / 4;
        let mut embedding = Vec::with_capacity(count);
        for i in 0..count {
            let offset = i * 4;
            let slice: [u8; 4] = match embedding_bytes[offset..offset + 4].try_into() {
                Ok(s) => s,
                Err(_) => continue,
            };
            embedding.push(f32::from_le_bytes(slice));
        }
        embeddings.push(embedding);
    }

    if embeddings.is_empty() {
        return Ok(None);
    }

    // Compute average
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

    Ok(Some(avg))
}

/// Compute cosine similarity between two vectors
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

/// Deserialize bytes to Vec<f32>
fn bytes_to_embedding(bytes: &[u8]) -> Result<Vec<f32>, String> {
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

// ── Command Implementations ──

/// 13.2: Deterministic baseline generation
///
/// Generates summary and tags from document metadata without any AI model.
/// Summary format: "[title] - [word_count]字, 包含 [heading_count] 个章节: [heading_list]"
/// Tags: from file path directories, frontmatter tags, heading keywords.
#[command]
pub fn generate_deterministic_summary_tags(
    vault_path: String,
    document_path: String,
) -> Result<SummaryTagsLayer, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    // Read document metadata
    let doc: DocumentRecord = conn
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
        .map_err(|e| format!("查询文档元数据失败: {}，文档路径: {}", e, document_path))?;

    // Get headings from chunks
    let headings = get_document_headings(&conn, &document_path)?;

    // Generate deterministic summary
    let title = doc.title.as_deref().unwrap_or("无标题");
    let word_count = doc.word_count;
    let heading_count = headings.len();

    let heading_list = if headings.is_empty() {
        "无".to_string()
    } else {
        headings
            .iter()
            .map(|h| {
                // Take the last segment of heading path
                h.split(" > ").last().unwrap_or(h).to_string()
            })
            .collect::<Vec<_>>()
            .join(", ")
    };

    let summary = format!(
        "{} - {}字, 包含 {} 个章节: {}",
        title, word_count, heading_count, heading_list
    );

    // Generate deterministic tags
    let mut tags = Vec::new();

    // Tags from file path directory names
    let path_tags = extract_path_tags(&document_path);
    tags.extend(path_tags);

    // Tags from frontmatter
    if let Some(ref frontmatter) = doc.frontmatter {
        let fm_tags = parse_frontmatter_tags(frontmatter);
        tags.extend(fm_tags);
    }

    // Tags from heading keywords
    let heading_keywords = extract_heading_keywords(&headings);
    tags.extend(heading_keywords);

    // Deduplicate tags while preserving order
    let mut seen = std::collections::HashSet::new();
    tags.retain(|t| seen.insert(t.clone()));

    Ok(SummaryTagsLayer {
        source: "deterministic".to_string(),
        summary: Some(summary),
        tags: Some(tags),
        error: None,
    })
}

/// 13.3: Embedding signal tag suggestions
///
/// Gets document embedding (average of chunk embeddings), finds similar documents,
/// and suggests tags that similar documents share.
#[command]
pub fn generate_embedding_signal_tags(
    vault_path: String,
    document_path: String,
) -> Result<SummaryTagsLayer, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    // Get average embedding for the document
    let source_embedding = get_avg_embedding(&conn, &document_path)?
        .ok_or_else(|| "文档没有可用的 embedding，无法生成 embedding signal 标签".to_string())?;

    // Read all ready embeddings with chunk info
    let mut stmt = conn
        .prepare(
            "SELECT ce.chunk_id, c.document_path, c.heading_path, ce.embedding \
             FROM chunk_embeddings ce \
             JOIN chunks c ON ce.chunk_id = c.id \
             WHERE ce.embedding_status = 'ready'",
        )
        .map_err(|e| format!("准备查询 embeddings 失败: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let chunk_id: i64 = row.get(0)?;
            let doc_path: String = row.get(1)?;
            let heading_path: Option<String> = row.get(2)?;
            let embedding_bytes: Vec<u8> = row.get(3)?;
            Ok((chunk_id, doc_path, heading_path, embedding_bytes))
        })
        .map_err(|e| format!("查询 embeddings 失败: {}", e))?;

    // Collect similar documents (by document_path, not individual chunks)
    let mut doc_scores: std::collections::HashMap<String, f32> = std::collections::HashMap::new();

    for row in rows {
        let (chunk_id, doc_path, _heading_path, embedding_bytes) =
            row.map_err(|e| format!("读取 embedding 行失败: {}", e))?;

        if embedding_bytes.is_empty() {
            continue;
        }

        let embedding = match bytes_to_embedding(&embedding_bytes) {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Skip chunks from the same document
        if doc_path == document_path {
            continue;
        }

        let score = cosine_similarity(&source_embedding, &embedding);

        // Keep the max score per document
        let entry = doc_scores.entry(doc_path).or_insert(0.0f32);
        if score > *entry {
            *entry = score;
        }

        let _ = chunk_id; // suppress unused warning
    }

    // Sort by similarity and take top 5
    let mut scored_docs: Vec<(String, f32)> = doc_scores.into_iter().collect();
    scored_docs.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored_docs.truncate(5);

    // Collect tags from similar documents
    let mut suggested_tags: Vec<String> = Vec::new();

    for (doc_path, _score) in &scored_docs {
        // Get document metadata for tags
        let doc_tags: Option<String> = conn
            .query_row(
                "SELECT tags FROM documents WHERE path = ?1",
                params![doc_path],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        if let Some(tags_str) = doc_tags {
            // Parse JSON array of tags
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_str) {
                suggested_tags.extend(tags);
            }
        }

        // Also get frontmatter tags
        let frontmatter: Option<String> = conn
            .query_row(
                "SELECT frontmatter FROM documents WHERE path = ?1",
                params![doc_path],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        if let Some(fm) = frontmatter {
            let fm_tags = parse_frontmatter_tags(&fm);
            suggested_tags.extend(fm_tags);
        }

        // Also extract path tags
        let path_tags = extract_path_tags(doc_path);
        suggested_tags.extend(path_tags);
    }

    // Deduplicate and limit
    let mut seen = std::collections::HashSet::new();
    suggested_tags.retain(|t| seen.insert(t.clone()));
    suggested_tags.truncate(10);

    if suggested_tags.is_empty() {
        return Ok(SummaryTagsLayer {
            source: "embedding_signal".to_string(),
            summary: None,
            tags: None,
            error: Some("未找到相似文档的标签".to_string()),
        });
    }

    Ok(SummaryTagsLayer {
        source: "embedding_signal".to_string(),
        summary: None,
        tags: Some(suggested_tags),
        error: None,
    })
}

/// 13.4: Lightweight LLM summary generation
///
/// Uses ollama_chat to generate a short summary.
/// If LLM is not available, returns error (no silent fallback).
#[command]
pub async fn generate_llm_summary(
    vault_path: String,
    document_path: String,
) -> Result<SummaryTagsLayer, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    // Read AI config
    let vault = Path::new(&vault_path);
    let config_path = vault.join(".minddock").join("ai-config.json");

    if !config_path.exists() {
        return Err("AI 配置不存在，无法使用 LLM 生成摘要".to_string());
    }

    let config_content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取 ai-config.json 失败: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&config_content)
        .map_err(|e| format!("解析 ai-config.json 失败: {}", e))?;

    let endpoint = config["endpoint"].as_str().unwrap_or("").to_string();
    let model = config["default_model"]
        .as_str()
        .ok_or_else(|| "AI 配置中未设置默认模型，无法使用 LLM 生成摘要".to_string())?
        .to_string();

    if endpoint.is_empty() {
        return Err("AI 配置中 endpoint 为空，无法使用 LLM 生成摘要".to_string());
    }

    // Read document content (first 2000 chars)
    let content = read_document_content(&document_path)?;
    let truncated: String = content.chars().take(2000).collect();

    let prompt = format!(
        "请用1-2句话总结以下文档的核心内容：\n\n{}",
        truncated
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    // Call ollama_chat directly (it's a Rust function, not a Tauri command here)
    let result = ollama_chat(endpoint, model, messages, "summary_generation".to_string()).await?;

    Ok(SummaryTagsLayer {
        source: "local_llm".to_string(),
        summary: Some(result.content),
        tags: None,
        error: None,
    })
}

/// 13.5: Orchestrate layered summary/tags generation
///
/// First generates deterministic baseline (always available),
/// then tries embedding signals (if embeddings exist),
/// then tries LLM summary (if configured).
/// Reasoning model is NOT called by default.
#[command]
pub async fn generate_summary_tags(
    vault_path: String,
    document_path: String,
) -> Result<SummaryTagsResult, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let mut layers = Vec::new();

    // Layer 1: Deterministic baseline (always available)
    let deterministic = generate_deterministic_summary_tags(vault_path.clone(), document_path.clone())?;
    layers.push(deterministic);

    // Layer 2: Embedding signal (if embeddings exist)
    match generate_embedding_signal_tags(vault_path.clone(), document_path.clone()) {
        Ok(embedding_layer) => layers.push(embedding_layer),
        Err(_) => {
            // Embeddings not available, skip this layer
            layers.push(SummaryTagsLayer {
                source: "embedding_signal".to_string(),
                summary: None,
                tags: None,
                error: Some("文档没有可用的 embedding".to_string()),
            });
        }
    }

    // Layer 3: LLM summary (if configured)
    match generate_llm_summary(vault_path.clone(), document_path.clone()).await {
        Ok(llm_layer) => layers.push(llm_layer),
        Err(e) => {
            // LLM not available, record error
            layers.push(SummaryTagsLayer {
                source: "local_llm".to_string(),
                summary: None,
                tags: None,
                error: Some(e),
            });
        }
    }

    Ok(SummaryTagsResult {
        document_path,
        layers,
    })
}

/// 13.6: Update document summary and tags
///
/// Updates the documents table summary and tags fields,
/// and also updates the document's frontmatter with summary and tags.
#[command]
pub fn update_document_summary_tags(
    vault_path: String,
    document_path: String,
    summary: String,
    tags: String,
    source: String,
) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    // Update documents table
    conn.execute(
        "UPDATE documents SET summary = ?1, tags = ?2 WHERE path = ?3",
        params![summary, tags, document_path],
    )
    .map_err(|e| format!("更新文档 summary/tags 失败: {}", e))?;

    // Update frontmatter in the document file
    let content = read_document_content(&document_path)?;
    let tags_vec: Vec<String> = serde_json::from_str(&tags)
        .map_err(|e| format!("解析 tags JSON 数组失败: {}", e))?;

    let updated_content = update_frontmatter_summary_tags(&content, &summary, &tags_vec);

    fs::write(document_path, updated_content)
        .map_err(|e| format!("写入文档 frontmatter 失败: {}", e))?;

    let _ = source; // source is recorded for provenance but not stored separately

    Ok(())
}
