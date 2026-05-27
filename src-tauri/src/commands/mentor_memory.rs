use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MentorMemory {
    pub id: String,
    pub memory_type: String,
    pub content: String,
    pub source: String,
    pub confidence: f64,
    pub status: String,
    pub created_at: String,
    pub related_documents: Vec<String>,
}

/// 获取 mentor-memory.json 文件路径
fn get_memory_path(vault: &Path) -> std::path::PathBuf {
    vault.join(".minddock").join("mentor-memory.json")
}

/// 读取所有 mentor memories
fn read_all_memories(vault: &Path) -> Result<Vec<MentorMemory>, String> {
    let minddock_dir = vault.join(".minddock");
    let memory_path = get_memory_path(vault);

    let memory_path_str = memory_path.to_string_lossy().to_string();
    assert_path_inside_vault(
        &vault.to_string_lossy().to_string(),
        &memory_path_str,
    )?;

    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    if !memory_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&memory_path)
        .map_err(|e| format!("读取 mentor-memory.json 失败: {}", e))?;

    let memories: Vec<MentorMemory> = serde_json::from_str(&content)
        .map_err(|e| format!("解析 mentor-memory.json 失败: {}", e))?;

    Ok(memories)
}

/// 安全写入所有 mentor memories（先写临时文件再 rename）
fn write_all_memories(vault: &Path, memories: &[MentorMemory]) -> Result<(), String> {
    let minddock_dir = vault.join(".minddock");
    let memory_path = get_memory_path(vault);

    let memory_path_str = memory_path.to_string_lossy().to_string();
    assert_path_inside_vault(
        &vault.to_string_lossy().to_string(),
        &memory_path_str,
    )?;

    fs::create_dir_all(&minddock_dir)
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    let json = serde_json::to_string_pretty(memories)
        .map_err(|e| format!("序列化 mentor memories 失败: {}", e))?;

    let tmp_path = minddock_dir.join("mentor-memory.json.tmp");
    fs::write(&tmp_path, &json)
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, &memory_path)
        .map_err(|e| format!("重命名临时文件失败: {}", e))?;

    Ok(())
}

#[command]
pub fn create_mentor_memory(
    vault_path: String,
    memory_type: String,
    content: String,
    source: String,
    confidence: f64,
    related_documents: Vec<String>,
) -> Result<MentorMemory, String> {
    let vault = Path::new(&vault_path);
    let mut memories = read_all_memories(vault)?;

    let now = Utc::now().to_rfc3339();
    let memory = MentorMemory {
        id: Uuid::new_v4().to_string(),
        memory_type,
        content,
        source,
        confidence,
        status: "active".to_string(),
        created_at: now,
        related_documents,
    };

    memories.push(memory.clone());
    write_all_memories(vault, &memories)?;

    Ok(memory)
}

#[command]
pub fn list_mentor_memories(
    vault_path: String,
    status: Option<String>,
) -> Result<Vec<MentorMemory>, String> {
    let vault = Path::new(&vault_path);
    let memories = read_all_memories(vault)?;

    let result = match status {
        Some(s) => memories.into_iter().filter(|m| m.status == s).collect(),
        None => memories,
    };

    Ok(result)
}

#[command]
pub fn update_mentor_memory_status(
    vault_path: String,
    memory_id: String,
    status: String,
) -> Result<(), String> {
    // 校验 status 值
    if !["active", "superseded", "dismissed"].contains(&status.as_str()) {
        return Err(format!(
            "无效的 status: '{}'，必须是 active/superseded/dismissed",
            status
        ));
    }

    let vault = Path::new(&vault_path);
    let mut memories = read_all_memories(vault)?;

    let memory = memories
        .iter_mut()
        .find(|m| m.id == memory_id)
        .ok_or_else(|| format!("未找到 id 为 '{}' 的 mentor memory", memory_id))?;

    memory.status = status;
    write_all_memories(vault, &memories)?;

    Ok(())
}

#[command]
pub fn delete_mentor_memory(
    vault_path: String,
    memory_id: String,
) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let mut memories = read_all_memories(vault)?;

    let original_len = memories.len();
    memories.retain(|m| m.id != memory_id);

    if memories.len() == original_len {
        return Err(format!("未找到 id 为 '{}' 的 mentor memory", memory_id));
    }

    write_all_memories(vault, &memories)?;

    Ok(())
}

#[command]
pub fn find_relevant_memories(
    vault_path: String,
    query_text: String,
    limit: Option<u32>,
) -> Result<Vec<MentorMemory>, String> {
    let vault = Path::new(&vault_path);
    let memories = read_all_memories(vault)?;

    let limit = limit.unwrap_or(10) as usize;

    // 简单关键词匹配：将查询文本拆分为关键词，在 content 中匹配
    let query_lower = query_text.to_lowercase();
    let keywords: Vec<&str> = query_lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .collect();

    let mut scored: Vec<(MentorMemory, usize)> = memories
        .into_iter()
        .filter(|m| m.status == "active")
        .map(|m| {
            let content_lower = m.content.to_lowercase();
            let score = keywords
                .iter()
                .filter(|kw| content_lower.contains(*kw))
                .count();
            (m, score)
        })
        .filter(|(_, score)| *score > 0)
        .collect();

    // 按匹配分数降序排列
    scored.sort_by(|a, b| b.1.cmp(&a.1));

    let result = scored
        .into_iter()
        .take(limit)
        .map(|(m, _)| m)
        .collect();

    Ok(result)
}

#[command]
pub fn record_reasoning_result(
    vault_path: String,
    memory_type: String,
    content: String,
    source: String,
    confidence: f64,
    related_documents: Vec<String>,
) -> Result<MentorMemory, String> {
    // record_reasoning_result 本质上是 create_mentor_memory 的语义化封装
    create_mentor_memory(vault_path, memory_type, content, source, confidence, related_documents)
}
