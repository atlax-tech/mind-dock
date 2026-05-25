use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AISuggestion {
    pub id: String,
    pub suggestion_type: String,
    pub source_provider: String,
    pub source_model: String,
    pub content: String,
    pub status: String,
    pub edited_content: Option<String>,
    pub related_object_id: Option<String>,
    pub related_object_type: Option<String>,
    pub created_at: String,
}

#[command]
pub fn append_ai_suggestion(
    vault_path: String,
    suggestion_type: String,
    source_provider: String,
    source_model: String,
    content: String,
    related_object_id: Option<String>,
    related_object_type: Option<String>,
) -> Result<AISuggestion, String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let suggestions_path = minddock_dir.join("ai-suggestions.jsonl");

    // 路径校验
    let suggestions_path_str = suggestions_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &suggestions_path_str)?;

    // 按需创建 .minddock 目录
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    let suggestion = AISuggestion {
        id: Uuid::new_v4().to_string(),
        suggestion_type,
        source_provider,
        source_model,
        content,
        status: "pending".to_string(),
        edited_content: None,
        related_object_id,
        related_object_type,
        created_at: Utc::now().to_rfc3339(),
    };

    let json_line = serde_json::to_string(&suggestion)
        .map_err(|e| format!("序列化 AI suggestion 失败: {}", e))?;

    // 追加写入
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&suggestions_path)
        .map_err(|e| format!("打开 ai-suggestions.jsonl 失败: {}", e))?;
    writeln!(file, "{}", json_line)
        .map_err(|e| format!("写入 ai-suggestions.jsonl 失败: {}", e))?;

    Ok(suggestion)
}

#[command]
pub fn read_ai_suggestions(
    vault_path: String,
    limit: Option<u32>,
) -> Result<Vec<AISuggestion>, String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let suggestions_path = minddock_dir.join("ai-suggestions.jsonl");

    // 路径校验
    let suggestions_path_str = suggestions_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &suggestions_path_str)?;

    // 按需创建 .minddock 目录
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    if !suggestions_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&suggestions_path)
        .map_err(|e| format!("读取 ai-suggestions.jsonl 失败: {}", e))?;

    let limit = limit.unwrap_or(100) as usize;

    let mut entries: Vec<AISuggestion> = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<AISuggestion>(line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                log::warn!("跳过无法解析的 AI suggestion 行: {}", e);
            }
        }
    }

    // 应用 limit（返回最新的 limit 条）
    let start = if entries.len() > limit {
        entries.len() - limit
    } else {
        0
    };
    let result = entries[start..].to_vec();

    Ok(result)
}

#[command]
pub fn update_ai_suggestion_status(
    vault_path: String,
    suggestion_id: String,
    status: String,
    edited_content: Option<String>,
) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let suggestions_path = minddock_dir.join("ai-suggestions.jsonl");

    // 路径校验
    let suggestions_path_str = suggestions_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &suggestions_path_str)?;

    // 按需创建 .minddock 目录
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    if !suggestions_path.exists() {
        return Err(format!("未找到 suggestion 文件，id '{}' 不存在", suggestion_id));
    }

    let content = fs::read_to_string(&suggestions_path)
        .map_err(|e| format!("读取 ai-suggestions.jsonl 失败: {}", e))?;

    let mut entries: Vec<AISuggestion> = Vec::new();
    let mut found = false;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<AISuggestion>(line) {
            Ok(mut entry) => {
                if entry.id == suggestion_id {
                    entry.status = status.clone();
                    entry.edited_content = edited_content.clone();
                    found = true;
                }
                entries.push(entry);
            }
            Err(e) => {
                log::warn!("跳过无法解析的 AI suggestion 行: {}", e);
            }
        }
    }

    if !found {
        return Err(format!("未找到 id 为 '{}' 的 suggestion", suggestion_id));
    }

    // 安全写入：先写临时文件再 rename
    let tmp_path = minddock_dir.join("ai-suggestions.jsonl.tmp");
    let mut lines = String::new();
    for entry in &entries {
        let json_line = serde_json::to_string(entry)
            .map_err(|e| format!("序列化 AI suggestion 失败: {}", e))?;
        lines.push_str(&json_line);
        lines.push('\n');
    }
    fs::write(&tmp_path, &lines)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &suggestions_path)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}
