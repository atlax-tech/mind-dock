use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextPackItem {
    pub id: String,
    // 来源文档（所有粒度都有）
    pub document_path: String,
    // 文档级字段
    pub title: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<String>,
    // 细粒度可选字段（段落/选区时才有值）
    pub content: Option<String>,
    pub heading: Option<String>,
    pub start_line: Option<i64>,
    pub end_line: Option<i64>,
    // M4: chunk 关联字段
    pub chunk_id: Option<i64>,
    pub source_type: Option<String>,
    pub score: Option<f64>,
    pub reasoning_note: Option<String>,
    // 通用字段
    pub selected_reason: String,
    pub is_suggestion: bool,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextPack {
    pub id: String,
    pub name: String,
    pub items: Vec<ContextPackItem>,
    pub created_at: String,
    pub updated_at: String,
}

/// 获取 context-packs.json 文件路径
fn get_packs_path(vault: &Path) -> std::path::PathBuf {
    vault.join(".minddock").join("context-packs.json")
}

/// 读取所有 context packs
fn read_all_packs(vault: &Path) -> Result<Vec<ContextPack>, String> {
    let minddock_dir = vault.join(".minddock");
    let packs_path = get_packs_path(vault);

    // 路径校验
    let packs_path_str = packs_path.to_string_lossy().to_string();
    assert_path_inside_vault(
        &vault.to_string_lossy().to_string(),
        &packs_path_str,
    )?;

    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    if !packs_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&packs_path)
        .map_err(|e| format!("读取 context-packs.json 失败: {}", e))?;

    let packs: Vec<ContextPack> = serde_json::from_str(&content)
        .map_err(|e| format!("解析 context-packs.json 失败: {}", e))?;

    Ok(packs)
}

/// 安全写入所有 context packs（先写临时文件再 rename）
fn write_all_packs(vault: &Path, packs: &[ContextPack]) -> Result<(), String> {
    let minddock_dir = vault.join(".minddock");
    let packs_path = get_packs_path(vault);

    // 路径校验
    let packs_path_str = packs_path.to_string_lossy().to_string();
    assert_path_inside_vault(
        &vault.to_string_lossy().to_string(),
        &packs_path_str,
    )?;

    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    let json = serde_json::to_string_pretty(packs)
        .map_err(|e| format!("序列化 context packs 失败: {}", e))?;

    let tmp_path = minddock_dir.join("context-packs.json.tmp");
    fs::write(&tmp_path, &json)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &packs_path)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}

#[command]
pub fn create_context_pack(
    vault_path: String,
    name: String,
) -> Result<ContextPack, String> {
    let vault = Path::new(&vault_path);
    let mut packs = read_all_packs(vault)?;

    let now = Utc::now().to_rfc3339();
    let pack = ContextPack {
        id: Uuid::new_v4().to_string(),
        name,
        items: Vec::new(),
        created_at: now.clone(),
        updated_at: now,
    };

    packs.push(pack.clone());
    write_all_packs(vault, &packs)?;

    Ok(pack)
}

#[command]
pub fn update_context_pack(
    vault_path: String,
    pack_id: String,
    name: Option<String>,
    items: Option<Vec<ContextPackItem>>,
) -> Result<ContextPack, String> {
    let vault = Path::new(&vault_path);
    let mut packs = read_all_packs(vault)?;

    let pack = packs
        .iter_mut()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| format!("未找到 id 为 '{}' 的 context pack", pack_id))?;

    if let Some(n) = name {
        pack.name = n;
    }
    if let Some(i) = items {
        pack.items = i;
    }
    pack.updated_at = Utc::now().to_rfc3339();

    let updated = pack.clone();
    write_all_packs(vault, &packs)?;

    Ok(updated)
}

#[command]
pub fn delete_context_pack(
    vault_path: String,
    pack_id: String,
) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let mut packs = read_all_packs(vault)?;

    let original_len = packs.len();
    packs.retain(|p| p.id != pack_id);

    if packs.len() == original_len {
        return Err(format!("未找到 id 为 '{}' 的 context pack", pack_id));
    }

    write_all_packs(vault, &packs)?;

    Ok(())
}

#[command]
pub fn list_context_packs(
    vault_path: String,
) -> Result<Vec<ContextPack>, String> {
    let vault = Path::new(&vault_path);
    read_all_packs(vault)
}

#[command]
pub fn get_context_pack(
    vault_path: String,
    pack_id: String,
) -> Result<Option<ContextPack>, String> {
    let vault = Path::new(&vault_path);
    let packs = read_all_packs(vault)?;

    Ok(packs.into_iter().find(|p| p.id == pack_id))
}

#[command]
pub fn export_context_pack_markdown(
    vault_path: String,
    pack_id: String,
) -> Result<String, String> {
    let vault = Path::new(&vault_path);
    let packs = read_all_packs(vault)?;

    let pack = packs
        .into_iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| format!("未找到 id 为 '{}' 的 context pack", pack_id))?;

    let mut md = String::new();
    md.push_str(&format!("# {}\n\n", pack.name));

    for item in &pack.items {
        md.push_str(&format!("> 来源: {}\n", item.document_path));
        if let Some(ref title) = item.title {
            md.push_str(&format!("> 标题: {}\n", title));
        }
        if let Some(ref heading) = item.heading {
            md.push_str(&format!("> 章节: {}\n", heading));
        }
        if let (Some(start), Some(end)) = (item.start_line, item.end_line) {
            md.push_str(&format!("> 位置: L{}–L{}\n", start, end));
        }
        if let Some(ref summary) = item.summary {
            md.push_str(&format!("> 摘要: {}\n", summary));
        }
        if let Some(ref tags) = item.tags {
            md.push_str(&format!("> 标签: {}\n", tags));
        }
        md.push_str(&format!("> 加入时间: {}\n", item.timestamp));
        md.push_str(&format!("> 加入原因: {}\n\n", item.selected_reason));
        if let Some(ref content) = item.content {
            md.push_str(content);
            md.push_str("\n---\n\n");
        } else {
            md.push_str("---\n\n");
        }
    }

    Ok(md)
}
