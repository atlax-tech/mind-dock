use crate::commands::metadata::{create_tables, open_db};
use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MentorEvent {
    pub id: String,
    pub vault_id: String,
    pub event_type: String,
    pub target_id: Option<String>,
    pub target_type: Option<String>,
    pub payload_json: String,
    pub created_at: String,
}

#[command]
pub fn create_mentor_event(
    vault_path: String,
    vault_id: String,
    event_type: String,
    target_id: Option<String>,
    target_type: Option<String>,
    payload_json: String,
) -> Result<MentorEvent, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    let event = MentorEvent {
        id: id.clone(),
        vault_id: vault_id.clone(),
        event_type: event_type.clone(),
        target_id: target_id.clone(),
        target_type: target_type.clone(),
        payload_json: payload_json.clone(),
        created_at: now.clone(),
    };

    serde_json::from_str::<serde_json::Value>(&payload_json)
        .map_err(|e| format!("payload_json 不是合法 JSON: {}", e))?;

    conn.execute(
        "INSERT INTO mentor_events (id, vault_id, type, target_id, target_type, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, vault_id, event_type, target_id, target_type, payload_json, now],
    )
    .map_err(|e| format!("插入 mentor_event 失败: {}", e))?;

    Ok(event)
}

#[command]
pub fn list_mentor_events(
    vault_path: String,
    vault_id: String,
    event_type: Option<String>,
    target_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<MentorEvent>, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let limit = limit.unwrap_or(100) as i64;

    let mut sql = String::from(
        "SELECT id, vault_id, type, target_id, target_type, payload_json, created_at
         FROM mentor_events WHERE vault_id = ?1",
    );
    let mut param_idx = 2u32;

    if event_type.is_some() {
        sql.push_str(&format!(" AND type = ?{}", param_idx));
        param_idx += 1;
    }
    if target_id.is_some() {
        sql.push_str(&format!(" AND target_id = ?{}", param_idx));
        param_idx += 1;
    }

    sql.push_str(&format!(
        " ORDER BY created_at DESC LIMIT ?{}",
        param_idx
    ));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("准备查询失败: {}", e))?;

    let mut rows = if event_type.is_some() && target_id.is_some() {
        stmt.query(params![
            vault_id,
            event_type.as_ref().unwrap(),
            target_id.as_ref().unwrap(),
            limit,
        ])
    } else if event_type.is_some() {
        stmt.query(params![vault_id, event_type.as_ref().unwrap(), limit,])
    } else if target_id.is_some() {
        stmt.query(params![vault_id, target_id.as_ref().unwrap(), limit,])
    } else {
        stmt.query(params![vault_id, limit,])
    }
    .map_err(|e| format!("查询 mentor_events 失败: {}", e))?;

    let mut events = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("读取行失败: {}", e))? {
        events.push(MentorEvent {
            id: row.get::<_, String>(0).map_err(|e| format!("读取 id 失败: {}", e))?,
            vault_id: row.get::<_, String>(1).map_err(|e| format!("读取 vault_id 失败: {}", e))?,
            event_type: row.get::<_, String>(2).map_err(|e| format!("读取 event_type 失败: {}", e))?,
            target_id: row.get::<_, Option<String>>(3).map_err(|e| format!("读取 target_id 失败: {}", e))?,
            target_type: row.get::<_, Option<String>>(4).map_err(|e| format!("读取 target_type 失败: {}", e))?,
            payload_json: row.get::<_, String>(5).map_err(|e| format!("读取 payload_json 失败: {}", e))?,
            created_at: row.get::<_, String>(6).map_err(|e| format!("读取 created_at 失败: {}", e))?,
        });
    }

    Ok(events)
}
