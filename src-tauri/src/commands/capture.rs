use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptureEntry {
    pub id: String,
    pub content: String,
    pub timestamp: String,
    pub source: String,
}

#[command]
pub fn append_capture(vault_path: String, content: String, source: String) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let captures_dir = vault.join("captures");
    let inbox_path = captures_dir.join("inbox.jsonl");

    // 校验路径在 vault 内
    let inbox_path_str = inbox_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &inbox_path_str)?;

    // 创建 captures 目录（兼容 Phase 1 vault）
    fs::create_dir_all(&captures_dir)
        .map_err(|e| format!("创建 captures 目录失败: {}", e))?;

    let entry = CaptureEntry {
        id: Uuid::new_v4().to_string(),
        content,
        timestamp: Utc::now().to_rfc3339(),
        source,
    };

    let json_line = serde_json::to_string(&entry)
        .map_err(|e| format!("序列化 capture 条目失败: {}", e))?;

    // 追加写入
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&inbox_path)
        .map_err(|e| format!("打开 inbox.jsonl 失败: {}", e))?;
    writeln!(file, "{}", json_line)
        .map_err(|e| format!("写入 inbox.jsonl 失败: {}", e))?;

    Ok(())
}

#[command]
pub fn read_captures(vault_path: String) -> Result<Vec<CaptureEntry>, String> {
    let vault = Path::new(&vault_path);
    let captures_dir = vault.join("captures");
    let inbox_path = captures_dir.join("inbox.jsonl");

    // 校验路径在 vault 内
    let inbox_path_str = inbox_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &inbox_path_str)?;

    // 创建 captures 目录（兼容 Phase 1 vault）
    fs::create_dir_all(&captures_dir)
        .map_err(|e| format!("创建 captures 目录失败: {}", e))?;

    if !inbox_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&inbox_path)
        .map_err(|e| format!("读取 inbox.jsonl 失败: {}", e))?;

    let mut entries = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<CaptureEntry>(line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                // 跳过无法解析的行，记录警告
                log::warn!("跳过无法解析的 capture 行: {}", e);
            }
        }
    }

    Ok(entries)
}

#[command]
pub fn write_captures(vault_path: String, entries: Vec<CaptureEntry>) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let captures_dir = vault.join("captures");
    let inbox_path = captures_dir.join("inbox.jsonl");

    // 校验路径在 vault 内
    let inbox_path_str = inbox_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &inbox_path_str)?;

    // 创建 captures 目录（兼容 Phase 1 vault）
    fs::create_dir_all(&captures_dir)
        .map_err(|e| format!("创建 captures 目录失败: {}", e))?;

    // 安全写入：先写临时文件再 rename
    let tmp_path = captures_dir.join("inbox.jsonl.tmp");
    let mut lines = String::new();
    for entry in &entries {
        let json_line = serde_json::to_string(entry)
            .map_err(|e| format!("序列化 capture 条目失败: {}", e))?;
        lines.push_str(&json_line);
        lines.push('\n');
    }
    fs::write(&tmp_path, &lines)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &inbox_path)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}
