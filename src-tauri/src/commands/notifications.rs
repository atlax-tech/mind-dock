use crate::commands::vault::assert_path_inside_vault;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Notification {
    pub id: String,
    pub notification_type: String,
    pub title: String,
    pub content: String,
    pub timestamp: String,
    pub read: bool,
}

#[command]
pub fn read_notifications(vault_path: String) -> Result<Vec<Notification>, String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let notifications_path = minddock_dir.join("notifications.json");

    // 校验路径在 vault 内
    let notifications_path_str = notifications_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &notifications_path_str)?;

    // 创建 .minddock 目录（兼容 Phase 1 vault）
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    if !notifications_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&notifications_path)
        .map_err(|e| format!("读取 notifications.json 失败: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("解析 notifications.json 失败: {}", e))
}

#[command]
pub fn write_notifications(vault_path: String, notifications: Vec<Notification>) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let minddock_dir = vault.join(".minddock");
    let notifications_path = minddock_dir.join("notifications.json");
    let tmp_path = minddock_dir.join("notifications.json.tmp");

    // 校验路径在 vault 内
    let notifications_path_str = notifications_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &notifications_path_str)?;

    // 创建 .minddock 目录（兼容 Phase 1 vault）
    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    let content = serde_json::to_string_pretty(&notifications)
        .map_err(|e| format!("序列化 notifications 失败: {}", e))?;

    // 安全写入：先写临时文件，再重命名
    fs::write(&tmp_path, &content)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &notifications_path)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}
