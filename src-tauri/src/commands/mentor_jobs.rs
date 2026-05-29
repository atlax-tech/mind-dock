use crate::commands::metadata::{create_tables, open_db};
use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::command;
use uuid::Uuid;

const VALID_JOB_STATUSES: &[&str] = &[
    "queued",
    "running",
    "done",
    "failed",
    "cancelled",
    "timeout",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MentorJob {
    pub id: String,
    pub vault_id: String,
    pub job_type: String,
    pub target_ids_json: String,
    pub priority: String,
    pub status: String,
    pub input_hash: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub prompt_type: Option<String>,
    pub latency_ms: Option<i64>,
    pub fallback_status: Option<String>,
    pub result_suggestion_ids_json: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub cancelled_at: Option<String>,
}

fn validate_job_status(status: &str) -> Result<(), String> {
    if VALID_JOB_STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(format!(
            "无效的 job status: '{}'，必须是 {}",
            status,
            VALID_JOB_STATUSES.join("/")
        ))
    }
}

fn row_to_job(row: &rusqlite::Row) -> Result<MentorJob, rusqlite::Error> {
    Ok(MentorJob {
        id: row.get(0)?,
        vault_id: row.get(1)?,
        job_type: row.get(2)?,
        target_ids_json: row.get(3)?,
        priority: row.get(4)?,
        status: row.get(5)?,
        input_hash: row.get(6)?,
        provider: row.get(7)?,
        model: row.get(8)?,
        prompt_type: row.get(9)?,
        latency_ms: row.get(10)?,
        fallback_status: row.get(11)?,
        result_suggestion_ids_json: row.get(12)?,
        error_message: row.get(13)?,
        created_at: row.get(14)?,
        started_at: row.get(15)?,
        finished_at: row.get(16)?,
        cancelled_at: row.get(17)?,
    })
}

#[command]
pub fn create_mentor_job(
    vault_path: String,
    vault_id: String,
    job_type: String,
    target_ids_json: String,
    priority: String,
    input_hash: String,
    provider: Option<String>,
    model: Option<String>,
    prompt_type: Option<String>,
) -> Result<MentorJob, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    serde_json::from_str::<serde_json::Value>(&target_ids_json)
        .map_err(|e| format!("target_ids_json 不是合法 JSON: {}", e))?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let existing_active: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM mentor_jobs WHERE vault_id = ?1 AND type = ?2 AND input_hash = ?3 AND status IN ('queued', 'running')",
            params![vault_id, job_type, input_hash],
            |row| {
                let count: i64 = row.get(0)?;
                Ok(count > 0)
            },
        )
        .unwrap_or(false);

    if existing_active {
        return Err(format!(
            "已存在相同 input_hash 的 queued/running job (type={}, hash={})",
            job_type, input_hash
        ));
    }

    let existing_done: Option<String> = conn
        .query_row(
            "SELECT id FROM mentor_jobs WHERE vault_id = ?1 AND type = ?2 AND input_hash = ?3 AND status = 'done' ORDER BY finished_at DESC LIMIT 1",
            params![vault_id, job_type, input_hash],
            |row| row.get(0),
        )
        .ok();

    if let Some(_done_id) = existing_done {
        // done job exists, caller can reuse result_suggestion_ids
    }

    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    let job = MentorJob {
        id: id.clone(),
        vault_id: vault_id.clone(),
        job_type: job_type.clone(),
        target_ids_json: target_ids_json.clone(),
        priority: priority.clone(),
        status: "queued".to_string(),
        input_hash: input_hash.clone(),
        provider: provider.clone(),
        model: model.clone(),
        prompt_type: prompt_type.clone(),
        latency_ms: None,
        fallback_status: None,
        result_suggestion_ids_json: "[]".to_string(),
        error_message: None,
        created_at: now.clone(),
        started_at: None,
        finished_at: None,
        cancelled_at: None,
    };

    conn.execute(
        "INSERT INTO mentor_jobs
         (id, vault_id, type, target_ids_json, priority, status, input_hash,
          provider, model, prompt_type, latency_ms, fallback_status,
          result_suggestion_ids_json, error_message, created_at, started_at, finished_at, cancelled_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, NULL, '[]', NULL, ?11, NULL, NULL, NULL)",
        params![
            id, vault_id, job_type, target_ids_json, priority, "queued", input_hash,
            provider, model, prompt_type, now,
        ],
    )
    .map_err(|e| format!("插入 mentor_job 失败: {}", e))?;

    Ok(job)
}

#[command]
pub fn list_mentor_jobs(
    vault_path: String,
    vault_id: String,
    status: Option<String>,
    job_type: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<MentorJob>, String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let limit = limit.unwrap_or(100) as i64;

    let mut sql = String::from(
        "SELECT id, vault_id, type, target_ids_json, priority, status, input_hash,
                provider, model, prompt_type, latency_ms, fallback_status,
                result_suggestion_ids_json, error_message, created_at, started_at, finished_at, cancelled_at
         FROM mentor_jobs WHERE vault_id = ?1",
    );
    let mut param_idx = 2u32;

    if status.is_some() {
        sql.push_str(&format!(" AND status = ?{}", param_idx));
        param_idx += 1;
    }
    if job_type.is_some() {
        sql.push_str(&format!(" AND type = ?{}", param_idx));
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
    if let Some(ref v) = job_type {
        param_values.push(Box::new(v.clone()));
    }
    param_values.push(Box::new(limit));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let mut rows = stmt
        .query(param_refs.as_slice())
        .map_err(|e| format!("查询 mentor_jobs 失败: {}", e))?;

    let mut jobs = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("读取行失败: {}", e))? {
        jobs.push(row_to_job(row).map_err(|e| format!("读取 job 行失败: {}", e))?);
    }

    Ok(jobs)
}

#[command]
pub fn update_mentor_job_status(
    vault_path: String,
    job_id: String,
    status: String,
    result_suggestion_ids_json: Option<String>,
    error_message: Option<String>,
    latency_ms: Option<i64>,
    fallback_status: Option<String>,
) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &vault_path)?;
    validate_job_status(&status)?;

    if let Some(ref json) = result_suggestion_ids_json {
        serde_json::from_str::<serde_json::Value>(json)
            .map_err(|e| format!("result_suggestion_ids_json 不是合法 JSON: {}", e))?;
    }

    let conn = open_db(&vault_path)?;
    create_tables(&conn)?;

    let now = Utc::now().to_rfc3339();

    let (started_at, finished_at, cancelled_at) = match status.as_str() {
        "running" => (Some(now.clone()), None, None),
        "done" => (None, Some(now.clone()), None),
        "failed" => (None, Some(now.clone()), None),
        "timeout" => (None, Some(now.clone()), None),
        "cancelled" => (None, None, Some(now.clone())),
        _ => (None, None, None),
    };

    let mut sql = String::from("UPDATE mentor_jobs SET status = ?1, updated_at = ?2");
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(status), Box::new(now)];

    let mut idx = 3u32;

    if let Some(ref json) = result_suggestion_ids_json {
        sql.push_str(&format!(", result_suggestion_ids_json = ?{idx}"));
        param_values.push(Box::new(json.clone()));
        idx += 1;
    }
    if let Some(ref msg) = error_message {
        sql.push_str(&format!(", error_message = ?{idx}"));
        param_values.push(Box::new(msg.clone()));
        idx += 1;
    }
    if let Some(ms) = latency_ms {
        sql.push_str(&format!(", latency_ms = ?{idx}"));
        param_values.push(Box::new(ms));
        idx += 1;
    }
    if let Some(ref fb) = fallback_status {
        sql.push_str(&format!(", fallback_status = ?{idx}"));
        param_values.push(Box::new(fb.clone()));
        idx += 1;
    }
    if let Some(ref sa) = started_at {
        sql.push_str(&format!(", started_at = ?{idx}"));
        param_values.push(Box::new(sa.clone()));
        idx += 1;
    }
    if let Some(ref fa) = finished_at {
        sql.push_str(&format!(", finished_at = ?{idx}"));
        param_values.push(Box::new(fa.clone()));
        idx += 1;
    }
    if let Some(ref ca) = cancelled_at {
        sql.push_str(&format!(", cancelled_at = ?{idx}"));
        param_values.push(Box::new(ca.clone()));
        idx += 1;
    }

    sql.push_str(&format!(" WHERE id = ?{idx}"));
    param_values.push(Box::new(job_id.clone()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let affected = conn
        .execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("更新 mentor_job status 失败: {}", e))?;

    if affected == 0 {
        return Err(format!("未找到 id 为 '{}' 的 mentor_job", job_id));
    }

    Ok(())
}
