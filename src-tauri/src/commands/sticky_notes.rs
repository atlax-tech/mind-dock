use crate::commands::vault::assert_path_inside_vault;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotePosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StickyNote {
    pub id: String,
    pub content: String,
    pub position: NotePosition,
    pub collapsed: bool,
    #[serde(default)]
    pub pinned: bool,
    pub bound_document_path: Option<String>,
    #[serde(default)]
    pub captured_content: Option<String>,
    #[serde(default)]
    pub captured_entry_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[command]
pub fn read_sticky_notes(vault_path: String) -> Result<Vec<StickyNote>, String> {
    let vault = Path::new(&vault_path);
    let notes_dir = vault.join("notes");
    let notes_path = notes_dir.join("sticky-notes.json");

    // 校验路径在 vault 内
    let notes_path_str = notes_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &notes_path_str)?;

    // 创建 notes 目录（兼容 Phase 1 vault）
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("创建 notes 目录失败: {}", e))?;

    if !notes_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&notes_path)
        .map_err(|e| format!("读取 sticky-notes.json 失败: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("解析 sticky-notes.json 失败: {}", e))
}

#[command]
pub fn write_sticky_notes(vault_path: String, notes: Vec<StickyNote>) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let notes_dir = vault.join("notes");
    let notes_path = notes_dir.join("sticky-notes.json");
    let tmp_path = notes_dir.join("sticky-notes.json.tmp");

    // 校验路径在 vault 内
    let notes_path_str = notes_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &notes_path_str)?;

    // 创建 notes 目录（兼容 Phase 1 vault）
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("创建 notes 目录失败: {}", e))?;

    let content = serde_json::to_string_pretty(&notes)
        .map_err(|e| format!("序列化 sticky notes 失败: {}", e))?;

    // 安全写入：先写临时文件，再重命名
    fs::write(&tmp_path, &content)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &notes_path)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}
