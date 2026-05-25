use crate::commands::vault::assert_path_inside_vault;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri::command;
// ── Data Structures ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaModel {
    pub name: String,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaConnectionResult {
    pub connected: bool,
    pub models: Vec<OllamaModel>,
    pub error: Option<String>,
    pub is_remote: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaChatResult {
    pub content: String,
    pub model: String,
    pub latency_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaEmbedResult {
    pub embeddings: Vec<Vec<f64>>,
    pub model: String,
    pub latency_ms: u64,
    pub used_deprecated_endpoint: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIConfig {
    pub endpoint: String,
    pub default_model: Option<String>,
    pub embedding_model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OnboardingStatus {
    pub status: String,
    pub completed_at: Option<String>,
    pub skipped_at: Option<String>,
}

impl Default for OnboardingStatus {
    fn default() -> Self {
        Self {
            status: "pending".to_string(),
            completed_at: None,
            skipped_at: None,
        }
    }
}

// ── Helpers ──

fn validate_endpoint_url(endpoint: &str) -> Result<(), String> {
    if !endpoint.starts_with("http://") && !endpoint.starts_with("https://") {
        return Err(format!(
            "Endpoint URL 格式无效: '{}'，必须以 http:// 或 https:// 开头",
            endpoint
        ));
    }
    Ok(())
}

fn is_remote_endpoint(endpoint: &str) -> bool {
    // 去掉 scheme 后检查 host 是否为 localhost 或 127.0.0.1
    let without_scheme = endpoint
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let host = without_scheme.split(':').next().unwrap_or("");
    host != "localhost" && host != "127.0.0.1"
}

fn ensure_minddock_dir(vault_path: &str) -> Result<(), String> {
    let vault = Path::new(vault_path);
    let minddock_dir = vault.join(".minddock");
    if !minddock_dir.exists() {
        fs::create_dir_all(&minddock_dir)
            .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;
    }
    Ok(())
}

fn safe_write_json(path: &Path, data: &str) -> Result<(), String> {
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, data).map_err(|e| format!("写入临时文件失败: {}", e))?;
    fs::rename(&tmp_path, path).map_err(|e| format!("重命名临时文件失败: {}", e))?;
    Ok(())
}

// ── Ollama Commands ──

#[command]
pub fn ollama_check_connection(endpoint: String) -> OllamaConnectionResult {
    // 校验 endpoint URL 格式
    if let Err(e) = validate_endpoint_url(&endpoint) {
        return OllamaConnectionResult {
            connected: false,
            models: vec![],
            error: Some(e),
            is_remote: false,
        };
    }

    let url = format!("{}/api/tags", endpoint.trim_end_matches('/'));
    let remote = is_remote_endpoint(&endpoint);

    match reqwest::blocking::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
    {
        Ok(resp) => {
            if !resp.status().is_success() {
                return OllamaConnectionResult {
                    connected: false,
                    models: vec![],
                    error: Some(format!("Ollama 返回非成功状态码: {}", resp.status())),
                    is_remote: remote,
                };
            }

            // 解析响应 JSON
            #[derive(Deserialize)]
            struct TagsResponse {
                models: Option<Vec<OllamaModelRaw>>,
            }

            #[derive(Deserialize)]
            struct OllamaModelRaw {
                name: Option<String>,
                size: Option<u64>,
                modified_at: Option<String>,
            }

            match resp.json::<TagsResponse>() {
                Ok(tags) => {
                    let models = tags
                        .models
                        .unwrap_or_default()
                        .into_iter()
                        .map(|m| OllamaModel {
                            name: m.name.unwrap_or_default(),
                            size: m.size,
                            modified_at: m.modified_at,
                        })
                        .collect();

                    OllamaConnectionResult {
                        connected: true,
                        models,
                        error: None,
                        is_remote: remote,
                    }
                }
                Err(e) => OllamaConnectionResult {
                    connected: false,
                    models: vec![],
                    error: Some(format!("解析 Ollama 响应失败: {}", e)),
                    is_remote: remote,
                },
            }
        }
        Err(e) => OllamaConnectionResult {
            connected: false,
            models: vec![],
            error: Some(format!("连接 Ollama 失败: {}", e)),
            is_remote: remote,
        },
    }
}

#[command]
pub fn ollama_chat(
    endpoint: String,
    model: String,
    messages: Vec<ChatMessage>,
    prompt_type: String,
) -> Result<OllamaChatResult, String> {
    validate_endpoint_url(&endpoint)?;

    let url = format!("{}/api/chat", endpoint.trim_end_matches('/'));

    let messages_json: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content,
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": model,
        "messages": messages_json,
        "stream": false,
    });

    let start = Instant::now();

    let resp = reqwest::blocking::Client::new()
        .post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .map_err(|e| format!("请求 Ollama chat 失败: {}", e))?;

    let latency_ms = start.elapsed().as_millis() as u64;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().unwrap_or_default();
        return Err(format!(
            "Ollama chat 请求失败，状态码: {}，响应: {}",
            status, body_text
        ));
    }

    #[derive(Deserialize)]
    struct ChatResponse {
        message: Option<ChatMessageResponse>,
        model: Option<String>,
    }

    #[derive(Deserialize)]
    struct ChatMessageResponse {
        content: Option<String>,
    }

    let chat_resp: ChatResponse = resp
        .json()
        .map_err(|e| format!("解析 Ollama chat 响应失败: {}", e))?;

    let content = chat_resp
        .message
        .and_then(|m| m.content)
        .ok_or_else(|| "Ollama chat 响应中缺少 message.content".to_string())?;

    let resp_model = chat_resp.model.unwrap_or(model);

    // prompt_type 用于日志记录，此处不使用但保留参数签名
    let _ = prompt_type;

    Ok(OllamaChatResult {
        content,
        model: resp_model,
        latency_ms,
    })
}

#[command]
pub fn ollama_embed(
    endpoint: String,
    model: String,
    input: String,
) -> Result<OllamaEmbedResult, String> {
    validate_endpoint_url(&endpoint)?;

    let base_url = endpoint.trim_end_matches('/');

    // 优先调用 /api/embed（当前主 endpoint）
    let embed_url = format!("{}/api/embed", base_url);
    let embed_body = serde_json::json!({
        "model": model,
        "input": input,
    });

    let start = Instant::now();

    let resp = reqwest::blocking::Client::new()
        .post(&embed_url)
        .json(&embed_body)
        .timeout(std::time::Duration::from_secs(60))
        .send();

    let latency_ms = start.elapsed().as_millis() as u64;

    match resp {
        Ok(response) => {
            if response.status().is_success() {
                #[derive(Deserialize)]
                struct EmbedResponse {
                    embeddings: Option<Vec<Vec<f64>>>,
                    model: Option<String>,
                }

                match response.json::<EmbedResponse>() {
                    Ok(embed_resp) => {
                        let embeddings = embed_resp
                            .embeddings
                            .ok_or_else(|| "Ollama embed 响应中缺少 embeddings 字段".to_string())?;
                        let resp_model = embed_resp.model.unwrap_or(model);

                        return Ok(OllamaEmbedResult {
                            embeddings,
                            model: resp_model,
                            latency_ms,
                            used_deprecated_endpoint: false,
                        });
                    }
                    Err(e) => {
                        // /api/embed 解析失败，尝试 fallback 到 /api/embeddings
                        log::warn!("解析 /api/embed 响应失败: {}，尝试 fallback 到 /api/embeddings", e);
                    }
                }
            } else {
                // /api/embed 请求失败，尝试 fallback 到 /api/embeddings
                log::warn!(
                    "/api/embed 请求失败，状态码: {}，尝试 fallback 到 /api/embeddings",
                    response.status()
                );
            }
        }
        Err(e) => {
            // /api/embed 请求失败，尝试 fallback 到 /api/embeddings
            log::warn!("/api/embed 请求失败: {}，尝试 fallback 到 /api/embeddings", e);
        }
    }

    // Fallback: /api/embeddings（deprecated）
    let deprecated_url = format!("{}/api/embeddings", base_url);
    let deprecated_body = serde_json::json!({
        "model": model,
        "prompt": input,
    });

    let start_fallback = Instant::now();

    let resp_deprecated = reqwest::blocking::Client::new()
        .post(&deprecated_url)
        .json(&deprecated_body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .map_err(|e| format!("请求 Ollama embeddings (deprecated) 失败: {}", e))?;

    let latency_ms = start_fallback.elapsed().as_millis() as u64;

    if !resp_deprecated.status().is_success() {
        let status = resp_deprecated.status();
        let body_text = resp_deprecated.text().unwrap_or_default();
        return Err(format!(
            "Ollama embeddings (deprecated) 请求失败，状态码: {}，响应: {}",
            status, body_text
        ));
    }

    #[derive(Deserialize)]
    struct EmbeddingsResponse {
        embedding: Option<Vec<f64>>,
        model: Option<String>,
    }

    let embeddings_resp: EmbeddingsResponse = resp_deprecated
        .json()
        .map_err(|e| format!("解析 Ollama embeddings (deprecated) 响应失败: {}", e))?;

    let embedding = embeddings_resp
        .embedding
        .ok_or_else(|| "Ollama embeddings (deprecated) 响应中缺少 embedding 字段".to_string())?;

    let resp_model = embeddings_resp.model.unwrap_or(model);

    Ok(OllamaEmbedResult {
        embeddings: vec![embedding],
        model: resp_model,
        latency_ms,
        used_deprecated_endpoint: true,
    })
}

// ── AI Config Commands ──

#[command]
pub fn read_ai_config(vault_path: String) -> Result<AIConfig, String> {
    let vault = Path::new(&vault_path);
    let config_path = vault.join(".minddock").join("ai-config.json");

    // 路径校验
    let config_path_str = config_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &config_path_str)?;

    // 按需创建 .minddock 目录
    ensure_minddock_dir(&vault_path)?;

    if !config_path.exists() {
        // 返回默认配置
        return Ok(AIConfig {
            endpoint: "http://localhost:11434".to_string(),
            default_model: None,
            embedding_model: None,
        });
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取 ai-config.json 失败: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("解析 ai-config.json 失败: {}", e))
}

#[command]
pub fn write_ai_config(vault_path: String, config: AIConfig) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let config_path = vault.join(".minddock").join("ai-config.json");

    // 路径校验
    let config_path_str = config_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &config_path_str)?;

    // 按需创建 .minddock 目录
    ensure_minddock_dir(&vault_path)?;

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化 AIConfig 失败: {}", e))?;

    safe_write_json(&config_path, &content)
}

// ── Onboarding Commands ──

#[command]
pub fn read_onboarding_status(vault_path: String) -> Result<OnboardingStatus, String> {
    let vault = Path::new(&vault_path);
    let status_path = vault.join(".minddock").join("onboarding-status.json");

    // 路径校验
    let status_path_str = status_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &status_path_str)?;

    // 按需创建 .minddock 目录
    ensure_minddock_dir(&vault_path)?;

    if !status_path.exists() {
        return Ok(OnboardingStatus::default());
    }

    let content = fs::read_to_string(&status_path)
        .map_err(|e| format!("读取 onboarding-status.json 失败: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("解析 onboarding-status.json 失败: {}", e))
}

#[command]
pub fn write_onboarding_status(vault_path: String, status: String) -> Result<(), String> {
    let vault = Path::new(&vault_path);
    let status_path = vault.join(".minddock").join("onboarding-status.json");

    // 路径校验
    let status_path_str = status_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &status_path_str)?;

    // 按需创建 .minddock 目录
    ensure_minddock_dir(&vault_path)?;

    let now = Utc::now().to_rfc3339();

    let onboarding_status = match status.as_str() {
        "completed" => OnboardingStatus {
            status: "completed".to_string(),
            completed_at: Some(now),
            skipped_at: None,
        },
        "skipped" => OnboardingStatus {
            status: "skipped".to_string(),
            completed_at: None,
            skipped_at: Some(now),
        },
        "pending" => OnboardingStatus {
            status: "pending".to_string(),
            completed_at: None,
            skipped_at: None,
        },
        _ => {
            return Err(format!(
                "无效的 onboarding status: '{}'，必须是 pending/completed/skipped",
                status
            ))
        }
    };

    let content = serde_json::to_string_pretty(&onboarding_status)
        .map_err(|e| format!("序列化 OnboardingStatus 失败: {}", e))?;

    safe_write_json(&status_path, &content)
}
