use crate::commands::metadata::{create_tables, open_db};
use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;
use uuid::Uuid;

const VALID_STATUSES: &[&str] = &[
    "pending",
    "accepted",
    "dismissed",
    "snoozed",
    "expired",
    "executed",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MentorSuggestion {
    pub id: String,
    pub vault_id: String,
    pub source_event_id: Option<String>,
    pub source_signal_ids_json: String,
    pub source_job_id: Option<String>,
    pub target_id: String,
    pub target_type: String,
    pub intent: String,
    pub priority: String,
    pub surface: String,
    pub message: String,
    pub short_message: String,
    pub evidence_ids_json: String,
    pub actions_json: String,
    pub status: String,
    pub confidence: f64,
    pub model_trace_id: Option<String>,
    pub expires_at: Option<String>,
    pub last_shown_at: Option<String>,
    pub snoozed_until: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn validate_status(status: &str) -> Result<(), String> {
    if VALID_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(format!(
            "无效的 status: '{}'，必须是 {}",
            status,
            VALID_STATUSES.join("/")
        ))
    }
}

fn validate_json_field(value: &str, field_name: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(value)
        .map_err(|e| format!("{} 不是合法 JSON: {}", field_name, e))?;
    Ok(())
}

fn row_to_suggestion(row: &rusqlite::Row) -> Result<MentorSuggestion, rusqlite::Error> {
    Ok(MentorSuggestion {
        id: row.get(0)?,
        vault_id: row.get(1)?,
        source_event_id: row.get(2)?,
        source_signal_ids_json: row.get(3)?,
        source_job_id: row.get(4)?,
        target_id: row.get(5)?,
        target_type: row.get(6)?,
        intent: row.get(7)?,
        priority: row.get(8)?,
        surface: row.get(9)?,
        message: row.get(10)?,
        short_message: row.get(11)?,
        evidence_ids_json: row.get(12)?,
        actions_json: row.get(13)?,
        status: row.get(14)?,
        confidence: row.get(15)?,
        model_trace_id: row.get(16)?,
        expires_at: row.get(17)?,
        last_shown_at: row.get(18)?,
        snoozed_until: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

#[command]
pub fn create_mentor_suggestion(
    vault_path: String,
    vault_id: String,
    source_event_id: Option<String>,
    source_signal_ids_json: String,
    source_job_id: Option<String>,
    target_id: String,
    target_type: String,
    intent: String,
    priority: String,
    surface: String,
    message: String,
    short_message: String,
    evidence_ids_json: String,
    actions_json: String,
    status: String,
    confidence: f64,
    model_trace_id: Option<String>,
    expires_at: Option<String>,
) -> Result<MentorSuggestion, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    validate_status(&status)?;
    validate_json_field(&source_signal_ids_json, "source_signal_ids_json")?;
    validate_json_field(&evidence_ids_json, "evidence_ids_json")?;
    validate_json_field(&actions_json, "actions_json")?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    let suggestion = MentorSuggestion {
        id: id.clone(),
        vault_id: vault_id.clone(),
        source_event_id: source_event_id.clone(),
        source_signal_ids_json: source_signal_ids_json.clone(),
        source_job_id: source_job_id.clone(),
        target_id: target_id.clone(),
        target_type: target_type.clone(),
        intent: intent.clone(),
        priority: priority.clone(),
        surface: surface.clone(),
        message: message.clone(),
        short_message: short_message.clone(),
        evidence_ids_json: evidence_ids_json.clone(),
        actions_json: actions_json.clone(),
        status: status.clone(),
        confidence,
        model_trace_id: model_trace_id.clone(),
        expires_at: expires_at.clone(),
        last_shown_at: None,
        snoozed_until: None,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    conn.execute(
        "INSERT INTO mentor_suggestions
         (id, vault_id, source_event_id, source_signal_ids_json, source_job_id,
          target_id, target_type, intent, priority, surface, message, short_message,
          evidence_ids_json, actions_json, status, confidence, model_trace_id,
          expires_at, last_shown_at, snoozed_until, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            id, vault_id, source_event_id, source_signal_ids_json, source_job_id,
            target_id, target_type, intent, priority, surface, message, short_message,
            evidence_ids_json, actions_json, status, confidence, model_trace_id,
            expires_at, Option::<String>::None, Option::<String>::None, now, now,
        ],
    )
    .map_err(|e| format!("插入 mentor_suggestion 失败: {}", e))?;

    Ok(suggestion)
}

#[command]
pub fn list_mentor_suggestions(
    vault_path: String,
    vault_id: String,
    status: Option<String>,
    surface: Option<String>,
    target_id: Option<String>,
    intent: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<MentorSuggestion>, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let limit = limit.unwrap_or(100) as i64;

    let mut sql = String::from(
        "SELECT id, vault_id, source_event_id, source_signal_ids_json, source_job_id,
                target_id, target_type, intent, priority, surface, message, short_message,
                evidence_ids_json, actions_json, status, confidence, model_trace_id,
                expires_at, last_shown_at, snoozed_until, created_at, updated_at
         FROM mentor_suggestions WHERE vault_id = ?1",
    );
    let mut param_idx = 2u32;

    if status.is_some() {
        sql.push_str(&format!(" AND status = ?{}", param_idx));
        param_idx += 1;
    }
    if surface.is_some() {
        sql.push_str(&format!(" AND surface = ?{}", param_idx));
        param_idx += 1;
    }
    if target_id.is_some() {
        sql.push_str(&format!(" AND target_id = ?{}", param_idx));
        param_idx += 1;
    }
    if intent.is_some() {
        sql.push_str(&format!(" AND intent = ?{}", param_idx));
        param_idx += 1;
    }

    sql.push_str(&format!(
        " ORDER BY created_at DESC LIMIT ?{}",
        param_idx
    ));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("准备查询失败: {}", e))?;

    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    param_values.push(Box::new(vault_id.clone()));
    if let Some(ref v) = status {
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = surface {
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = target_id {
        param_values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = intent {
        param_values.push(Box::new(v.clone()));
    }
    param_values.push(Box::new(limit));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let mut rows = stmt
        .query(param_refs.as_slice())
        .map_err(|e| format!("查询 mentor_suggestions 失败: {}", e))?;

    let mut suggestions = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("读取行失败: {}", e))? {
        suggestions.push(row_to_suggestion(row).map_err(|e| format!("读取 suggestion 行失败: {}", e))?);
    }

    Ok(suggestions)
}

#[command]
pub fn get_mentor_suggestion(
    vault_path: String,
    suggestion_id: String,
) -> Result<Option<MentorSuggestion>, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let result = conn
        .query_row(
            "SELECT id, vault_id, source_event_id, source_signal_ids_json, source_job_id,
                    target_id, target_type, intent, priority, surface, message, short_message,
                    evidence_ids_json, actions_json, status, confidence, model_trace_id,
                    expires_at, last_shown_at, snoozed_until, created_at, updated_at
             FROM mentor_suggestions WHERE id = ?1",
            params![suggestion_id],
            |row| row_to_suggestion(row),
        )
        .ok();

    Ok(result)
}

#[command]
pub fn update_mentor_suggestion_status(
    vault_path: String,
    suggestion_id: String,
    status: String,
) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;
    validate_status(&status)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();

    let affected = conn
        .execute(
            "UPDATE mentor_suggestions SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, suggestion_id],
        )
        .map_err(|e| format!("更新 mentor_suggestion status 失败: {}", e))?;

    if affected == 0 {
        return Err(format!(
            "未找到 id 为 '{}' 的 mentor_suggestion",
            suggestion_id
        ));
    }

    Ok(())
}

#[command]
pub fn snooze_mentor_suggestion(
    vault_path: String,
    suggestion_id: String,
    snoozed_until: String,
) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();

    let affected = conn
        .execute(
            "UPDATE mentor_suggestions SET status = 'snoozed', snoozed_until = ?1, updated_at = ?2 WHERE id = ?3",
            params![snoozed_until, now, suggestion_id],
        )
        .map_err(|e| format!("snooze mentor_suggestion 失败: {}", e))?;

    if affected == 0 {
        return Err(format!(
            "未找到 id 为 '{}' 的 mentor_suggestion",
            suggestion_id
        ));
    }

    Ok(())
}

#[command]
pub fn delete_mentor_suggestion(
    vault_path: String,
    suggestion_id: String,
) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let affected = conn
        .execute(
            "DELETE FROM mentor_suggestions WHERE id = ?1",
            params![suggestion_id],
        )
        .map_err(|e| format!("删除 mentor_suggestion 失败: {}", e))?;

    if affected == 0 {
        return Err(format!(
            "未找到 id 为 '{}' 的 mentor_suggestion",
            suggestion_id
        ));
    }

    Ok(())
}

#[command]
pub fn cleanup_mentor_suggestions(
    vault_path: String,
    vault_id: String,
    older_than_days: Option<u32>,
    statuses_json: Option<String>,
) -> Result<u64, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let older_than_days = older_than_days.unwrap_or(7);
    let statuses: Vec<String> = match &statuses_json {
        Some(json) => serde_json::from_str(json)
            .map_err(|e| format!("statuses_json 不是合法 JSON 数组: {}", e))?,
        None => vec!["dismissed".to_string(), "expired".to_string()],
    };

    if statuses.is_empty() {
        return Ok(0);
    }

    let cutoff = Utc::now() - chrono::Duration::days(older_than_days as i64);
    let cutoff_str = cutoff.to_rfc3339();

    let protected_statuses = vec!["accepted".to_string(), "executed".to_string()];
    let protected_cutoff =
        Utc::now() - chrono::Duration::days(older_than_days as i64);
    let protected_cutoff_str = protected_cutoff.to_rfc3339();

    let mut where_clauses = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(vault_id.clone()), Box::new(cutoff_str.clone())];

    let mut idx = 3u32;
    for status in &statuses {
        if protected_statuses.contains(status) {
            where_clauses.push(format!(
                "(status = ?{idx} AND created_at < ?{})",
                idx + 1
            ));
            param_values.push(Box::new(status.clone()));
            param_values.push(Box::new(protected_cutoff_str.clone()));
            idx += 2;
        } else {
            where_clauses.push(format!("(status = ?{idx} AND created_at < ?2)"));
            param_values.push(Box::new(status.clone()));
            idx += 1;
        }
    }

    let where_sql = where_clauses.join(" OR ");

    let sql = format!(
        "DELETE FROM mentor_suggestions WHERE vault_id = ?1 AND ({})",
        where_sql
    );

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let affected = conn
        .execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("cleanup mentor_suggestions 失败: {}", e))?;

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE mentor_suggestions SET status = 'expired', updated_at = ?1
         WHERE vault_id = ?2 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?1",
        params![now, vault_id],
    )
    .map_err(|e| format!("过期 pending suggestions 标记失败: {}", e))?;

    Ok(affected as u64)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LegacyAISuggestion {
    id: String,
    suggestion_type: String,
    source_provider: String,
    source_model: String,
    content: String,
    status: String,
    edited_content: Option<String>,
    related_object_id: Option<String>,
    related_object_type: Option<String>,
    created_at: String,
}

fn map_legacy_status(legacy_status: &str) -> String {
    match legacy_status {
        "rejected" => "dismissed".to_string(),
        "edited" => "accepted".to_string(),
        s if VALID_STATUSES.contains(&s) => s.to_string(),
        _ => "pending".to_string(),
    }
}

#[command]
pub fn import_legacy_ai_suggestions(
    vault_path: String,
    vault_id: String,
) -> Result<u64, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let vault = Path::new(&vault_path);
    let suggestions_path = vault.join(".minddock").join("ai-suggestions.jsonl");

    let suggestions_path_str = suggestions_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &suggestions_path_str)?;

    if !suggestions_path.exists() {
        return Ok(0);
    }

    let content = fs::read_to_string(&suggestions_path)
        .map_err(|e| format!("读取 ai-suggestions.jsonl 失败: {}", e))?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let mut imported = 0u64;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let legacy: LegacyAISuggestion = match serde_json::from_str(line) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("跳过无法解析的 legacy AI suggestion 行: {}", e);
                continue;
            }
        };

        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM mentor_suggestions WHERE id = ?1",
                params![legacy.id],
                |row| {
                    let count: i64 = row.get(0)?;
                    Ok(count > 0)
                },
            )
            .unwrap_or(false);

        if exists {
            continue;
        }

        let new_status = map_legacy_status(&legacy.status);
        let now = Utc::now().to_rfc3339();

        let target_id = legacy
            .related_object_id
            .clone()
            .unwrap_or_else(|| "unknown".to_string());
        let target_type = legacy
            .related_object_type
            .clone()
            .unwrap_or_else(|| "document".to_string());

        let message = if let Some(ref edited) = legacy.edited_content {
            edited.clone()
        } else {
            legacy.content.clone()
        };

        conn.execute(
            "INSERT INTO mentor_suggestions
             (id, vault_id, source_event_id, source_signal_ids_json, source_job_id,
              target_id, target_type, intent, priority, surface, message, short_message,
              evidence_ids_json, actions_json, status, confidence, model_trace_id,
              expires_at, last_shown_at, snoozed_until, created_at, updated_at)
             VALUES (?1, ?2, NULL, '[]', NULL, ?3, ?4, ?5, 'low', 'platter', ?6, ?7, '[]', '[]', ?8, 0.5, NULL, NULL, NULL, NULL, ?9, ?10)",
            params![
                legacy.id,
                vault_id,
                target_id,
                target_type,
                legacy.suggestion_type,
                message,
                short_message_from_content(&message),
                new_status,
                legacy.created_at,
                now,
            ],
        )
        .map_err(|e| format!("导入 legacy suggestion 失败: {}", e))?;

        imported += 1;
    }

    Ok(imported)
}

fn short_message_from_content(content: &str) -> String {
    let chars: Vec<char> = content.chars().collect();
    if chars.len() <= 28 {
        content.to_string()
    } else {
        let truncated: String = chars[..25].iter().collect();
        format!("{}...", truncated)
    }
}
