use crate::commands::metadata::{create_tables, open_db};
use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::command;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MentorSignal {
    pub id: String,
    pub event_id: String,
    pub vault_id: String,
    pub signal_type: String,
    pub target_id: String,
    pub target_type: String,
    pub confidence: f64,
    pub evidence_ids_json: String,
    pub detector: String,
    pub created_at: String,
}

#[command]
pub fn create_mentor_signal(
    vault_path: String,
    event_id: String,
    vault_id: String,
    signal_type: String,
    target_id: String,
    target_type: String,
    confidence: f64,
    evidence_ids_json: String,
    detector: String,
) -> Result<MentorSignal, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    serde_json::from_str::<serde_json::Value>(&evidence_ids_json)
        .map_err(|e| format!("evidence_ids_json 不是合法 JSON: {}", e))?;

    let signal = MentorSignal {
        id: id.clone(),
        event_id: event_id.clone(),
        vault_id: vault_id.clone(),
        signal_type: signal_type.clone(),
        target_id: target_id.clone(),
        target_type: target_type.clone(),
        confidence,
        evidence_ids_json: evidence_ids_json.clone(),
        detector: detector.clone(),
        created_at: now.clone(),
    };

    conn.execute(
        "INSERT INTO mentor_signals (id, event_id, vault_id, type, target_id, target_type, confidence, evidence_ids_json, detector, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, event_id, vault_id, signal_type, target_id, target_type, confidence, evidence_ids_json, detector, now],
    )
    .map_err(|e| format!("插入 mentor_signal 失败: {}", e))?;

    Ok(signal)
}

#[command]
pub fn list_mentor_signals(
    vault_path: String,
    vault_id: String,
    signal_type: Option<String>,
    target_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<MentorSignal>, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let limit = limit.unwrap_or(100) as i64;

    let mut sql = String::from(
        "SELECT id, event_id, vault_id, type, target_id, target_type, confidence, evidence_ids_json, detector, created_at
         FROM mentor_signals WHERE vault_id = ?1",
    );
    let mut param_idx = 2u32;

    if signal_type.is_some() {
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

    let mut rows = if signal_type.is_some() && target_id.is_some() {
        stmt.query(params![
            vault_id,
            signal_type.as_ref().unwrap(),
            target_id.as_ref().unwrap(),
            limit,
        ])
    } else if signal_type.is_some() {
        stmt.query(params![vault_id, signal_type.as_ref().unwrap(), limit,])
    } else if target_id.is_some() {
        stmt.query(params![vault_id, target_id.as_ref().unwrap(), limit,])
    } else {
        stmt.query(params![vault_id, limit,])
    }
    .map_err(|e| format!("查询 mentor_signals 失败: {}", e))?;

    let mut signals = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("读取行失败: {}", e))? {
        signals.push(MentorSignal {
            id: row.get::<_, String>(0).map_err(|e| format!("读取 id 失败: {}", e))?,
            event_id: row.get::<_, String>(1).map_err(|e| format!("读取 event_id 失败: {}", e))?,
            vault_id: row.get::<_, String>(2).map_err(|e| format!("读取 vault_id 失败: {}", e))?,
            signal_type: row.get::<_, String>(3).map_err(|e| format!("读取 signal_type 失败: {}", e))?,
            target_id: row.get::<_, String>(4).map_err(|e| format!("读取 target_id 失败: {}", e))?,
            target_type: row.get::<_, String>(5).map_err(|e| format!("读取 target_type 失败: {}", e))?,
            confidence: row.get::<_, f64>(6).map_err(|e| format!("读取 confidence 失败: {}", e))?,
            evidence_ids_json: row.get::<_, String>(7).map_err(|e| format!("读取 evidence_ids_json 失败: {}", e))?,
            detector: row.get::<_, String>(8).map_err(|e| format!("读取 detector 失败: {}", e))?,
            created_at: row.get::<_, String>(9).map_err(|e| format!("读取 created_at 失败: {}", e))?,
        });
    }

    Ok(signals)
}
