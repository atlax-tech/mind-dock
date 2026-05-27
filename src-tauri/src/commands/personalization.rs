use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersonalizationSignal {
    pub action_type: String,
    pub document_path: Option<String>,
    pub chunk_id: Option<i64>,
    pub search_query: Option<String>,
    pub timestamp: String,
}

#[command]
pub fn record_signal(
    vault_path: String,
    signal: PersonalizationSignal,
) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let log_path = minddock_dir.join("personalization-signals.jsonl");

    // 路径校验
    let log_path_str = log_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &log_path_str)?;

    // 按需创建 .minddock 目录
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    let mut entry = signal;
    if entry.timestamp.is_empty() {
        entry.timestamp = Utc::now().to_rfc3339();
    }

    let json_line = serde_json::to_string(&entry)
        .map_err(|e| format!("序列化个性化信号失败: {}", e))?;

    // 追加写入
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("打开 personalization-signals.jsonl 失败: {}", e))?;
    writeln!(file, "{}", json_line)
        .map_err(|e| format!("写入 personalization-signals.jsonl 失败: {}", e))?;

    Ok(())
}

#[command]
pub fn read_signals(
    vault_path: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<PersonalizationSignal>, String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let log_path = minddock_dir.join("personalization-signals.jsonl");

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
        .map_err(|e| format!("读取 personalization-signals.jsonl 失败: {}", e))?;

    let mut entries: Vec<PersonalizationSignal> = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<PersonalizationSignal>(line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                log::warn!("跳过无法解析的个性化信号行: {}", e);
            }
        }
    }

    // 按时间倒序排列
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // 应用 offset 和 limit
    let offset = offset.unwrap_or(0) as usize;
    let limit = limit.unwrap_or(100) as usize;

    let entries = entries
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();

    Ok(entries)
}

#[command]
pub fn count_signals(vault_path: String) -> Result<i64, String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let log_path = minddock_dir.join("personalization-signals.jsonl");

    // 路径校验
    let log_path_str = log_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &log_path_str)?;

    if !log_path.exists() {
        return Ok(0);
    }

    let content = fs::read_to_string(&log_path)
        .map_err(|e| format!("读取 personalization-signals.jsonl 失败: {}", e))?;

    let count = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as i64;

    Ok(count)
}
