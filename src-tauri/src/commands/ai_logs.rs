use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIRuntimeLog {
    pub id: String,
    pub provider: String,
    pub model: String,
    pub latency_ms: u64,
    pub prompt_type: String,
    pub request_type: String,
    pub fallback_status: String,
    pub success: bool,
    pub error_message: Option<String>,
    pub timestamp: String,
}

#[command]
pub fn append_ai_log(
    vault_path: String,
    provider: String,
    model: String,
    latency_ms: u64,
    prompt_type: String,
    request_type: String,
    fallback_status: String,
    success: bool,
    error_message: Option<String>,
) -> Result<AIRuntimeLog, String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let log_path = minddock_dir.join("ai-runtime-logs.jsonl");

    // 路径校验
    let log_path_str = log_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &log_path_str)?;

    // 按需创建 .minddock 目录
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    let log_entry = AIRuntimeLog {
        id: Uuid::new_v4().to_string(),
        provider,
        model,
        latency_ms,
        prompt_type: prompt_type.clone(),
        request_type: if request_type.is_empty() { prompt_type } else { request_type },
        fallback_status,
        success,
        error_message,
        timestamp: Utc::now().to_rfc3339(),
    };

    let json_line = serde_json::to_string(&log_entry)
        .map_err(|e| format!("序列化 AI 运行日志失败: {}", e))?;

    // 追加写入
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("打开 ai-runtime-logs.jsonl 失败: {}", e))?;
    writeln!(file, "{}", json_line)
        .map_err(|e| format!("写入 ai-runtime-logs.jsonl 失败: {}", e))?;

    Ok(log_entry)
}

#[command]
pub fn read_ai_logs(vault_path: String, limit: Option<u32>) -> Result<Vec<AIRuntimeLog>, String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let log_path = minddock_dir.join("ai-runtime-logs.jsonl");

    // 路径校验
    let log_path_str = log_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &log_path_str)?;

    // 按需创建 .minddock 目录
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    if !log_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&log_path)
        .map_err(|e| format!("读取 ai-runtime-logs.jsonl 失败: {}", e))?;

    let limit = limit.unwrap_or(100) as usize;

    let mut entries: Vec<AIRuntimeLog> = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<AIRuntimeLog>(line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                log::warn!("跳过无法解析的 AI 日志行: {}", e);
            }
        }
    }

    // 按时间倒序排列
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // 应用 limit
    entries.truncate(limit);

    Ok(entries)
}
