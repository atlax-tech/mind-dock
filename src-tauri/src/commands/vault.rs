use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultInfo {
    pub path: String,
    pub name: String,
    pub document_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub last_vault_path: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            last_vault_path: None,
        }
    }
}

/// 获取 app config 目录和文件路径
fn get_app_config_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "无法获取系统配置目录".to_string())?;
    let app_dir = config_dir.join("mind-dock");
    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("创建配置目录失败: {}", e))?;
    Ok(app_dir.join(".minddock-app-config.json"))
}

/// 读取 app config
fn read_app_config() -> Result<AppConfig, String> {
    let config_path = get_app_config_path()?;
    if !config_path.exists() {
        return Ok(AppConfig::default());
    }
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))
}

/// 写入 app config
fn write_app_config(config: &AppConfig) -> Result<(), String> {
    let config_path = get_app_config_path()?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(&config_path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))
}

/// 校验路径是否在 vault root 内
/// 支持不存在的路径：对不存在的路径，逐级向上查找已存在的父目录进行 canonicalize，
/// 然后拼接剩余部分进行前缀比较
pub fn assert_path_inside_vault(vault_root: &str, target_path: &str) -> Result<(), String> {
    let vault = Path::new(vault_root)
        .canonicalize()
        .map_err(|e| format!("Vault 路径规范化失败: {}", e))?;

    let target = Path::new(target_path);
    let canonical_target = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // 路径不存在，逐级向上查找可 canonicalize 的祖先
            let mut existing_ancestor = None;
            let mut remaining_parts: Vec<std::ffi::OsString> = Vec::new();
            let mut current = target;

            loop {
                if current.exists() {
                    existing_ancestor = Some(current.to_path_buf());
                    break;
                }
                if let Some(name) = current.file_name() {
                    remaining_parts.push(name.to_os_string());
                }
                match current.parent() {
                    Some(parent) => {
                        if parent == current {
                            // 到达根目录
                            break;
                        }
                        current = parent;
                    }
                    None => break,
                }
            }

            let canonical_ancestor = existing_ancestor
                .ok_or_else(|| "无法规范化目标路径的任何祖先目录".to_string())?
                .canonicalize()
                .map_err(|e| format!("祖先路径规范化失败: {}", e))?;

            // 反转 remaining_parts（因为是从底向上收集的）
            remaining_parts.reverse();
            let full_path = remaining_parts.iter().fold(canonical_ancestor, |acc, part| acc.join(part));
            full_path
        }
    };

    if !canonical_target.starts_with(&vault) {
        return Err(format!(
            "路径 '{}' 不在 vault '{}' 内",
            target_path, vault_root
        ));
    }
    Ok(())
}

/// 校验 vault 路径是否有效（目录存在且包含 .minddock/ 和 documents/ 子目录）
/// 返回校验结果和具体错误信息（如有）
#[derive(Debug, Serialize)]
pub struct VaultValidationResult {
    pub valid: bool,
    pub error: Option<String>,
}

#[command]
pub fn validate_vault(path: String) -> Result<VaultValidationResult, String> {
    let vault_path = Path::new(&path);

    if !vault_path.exists() {
        // 路径不存在，清除配置
        write_app_config(&AppConfig::default())?;
        return Ok(VaultValidationResult {
            valid: false,
            error: Some(format!("目录 '{}' 不存在", path)),
        });
    }

    if !vault_path.is_dir() {
        return Ok(VaultValidationResult {
            valid: false,
            error: Some(format!("'{}' 不是目录", path)),
        });
    }

    if !vault_path.join(".minddock").exists() {
        return Ok(VaultValidationResult {
            valid: false,
            error: Some(format!("目录 '{}' 不是有效的 Vault（缺少 .minddock/ 子目录）", path)),
        });
    }

    if !vault_path.join("documents").exists() {
        return Ok(VaultValidationResult {
            valid: false,
            error: Some(format!("目录 '{}' 不是有效的 Vault（缺少 documents/ 子目录）", path)),
        });
    }

    // 检查写入权限
    let test_file = vault_path.join(".minddock").join(".write_test");
    match fs::write(&test_file, b"test") {
        Ok(_) => {
            let _ = fs::remove_file(&test_file);
        }
        Err(_) => {
            return Ok(VaultValidationResult {
                valid: false,
                error: Some(format!("目录 '{}' 没有写入权限", path)),
            });
        }
    }

    Ok(VaultValidationResult {
        valid: true,
        error: None,
    })
}

#[command]
pub fn create_vault(path: String) -> Result<VaultInfo, String> {
    let vault_path = Path::new(&path);

    // 创建 vault 目录结构
    fs::create_dir_all(vault_path)
        .map_err(|e| format!("创建 vault 目录失败: {}", e))?;
    fs::create_dir_all(vault_path.join("documents"))
        .map_err(|e| format!("创建 documents 目录失败: {}", e))?;
    fs::create_dir_all(vault_path.join(".minddock"))
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;
    fs::create_dir_all(vault_path.join("captures"))
        .map_err(|e| format!("创建 captures 目录失败: {}", e))?;
    fs::create_dir_all(vault_path.join("notes"))
        .map_err(|e| format!("创建 notes 目录失败: {}", e))?;

    // 保存为当前 vault
    let config = AppConfig {
        last_vault_path: Some(path.clone()),
    };
    write_app_config(&config)?;

    let name = vault_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("vault")
        .to_string();

    Ok(VaultInfo {
        path,
        name,
        document_count: 0,
    })
}

#[command]
pub fn select_vault(path: String) -> Result<VaultInfo, String> {
    let vault_path = Path::new(&path);
    if !vault_path.exists() {
        return Err(format!("目录 '{}' 不存在", path));
    }
    if !vault_path.is_dir() {
        return Err(format!("'{}' 不是目录", path));
    }

    // 确保 .minddock 子目录存在
    fs::create_dir_all(vault_path.join(".minddock"))
        .map_err(|e| format!("创建 .minddock 目录失败: {}", e))?;

    // 确保 documents 子目录存在
    fs::create_dir_all(vault_path.join("documents"))
        .map_err(|e| format!("创建 documents 目录失败: {}", e))?;

    // 确保 captures 子目录存在
    fs::create_dir_all(vault_path.join("captures"))
        .map_err(|e| format!("创建 captures 目录失败: {}", e))?;

    // 确保 notes 子目录存在
    fs::create_dir_all(vault_path.join("notes"))
        .map_err(|e| format!("创建 notes 目录失败: {}", e))?;

    // 保存为当前 vault
    let config = AppConfig {
        last_vault_path: Some(path.clone()),
    };
    write_app_config(&config)?;

    // 统计支持的文档文件数量
    let doc_count = count_supported_document_files(vault_path);

    let name = vault_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("vault")
        .to_string();

    Ok(VaultInfo {
        path,
        name,
        document_count: doc_count,
    })
}

#[command]
pub fn get_last_vault_path() -> Result<Option<String>, String> {
    let config = read_app_config()?;
    match config.last_vault_path {
        Some(path) => {
            if Path::new(&path).exists() {
                Ok(Some(path))
            } else {
                // 路径不存在，清除配置
                write_app_config(&AppConfig::default())?;
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

#[command]
pub fn set_last_vault_path(path: String) -> Result<(), String> {
    let config = AppConfig {
        last_vault_path: Some(path),
    };
    write_app_config(&config)
}

fn is_supported_document_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase()),
        Some(ext) if matches!(ext.as_str(), "md" | "markdown" | "txt" | "html" | "htm" | "json")
    )
}

fn count_supported_document_files(dir: &Path) -> usize {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                count += count_supported_document_files(&path);
            } else if is_supported_document_file(&path) {
                count += 1;
            }
        }
    }
    count
}

#[command]
pub fn scan_vault_files(vault_path: String) -> Result<Vec<DocEntry>, String> {
    let vault = Path::new(&vault_path);
    if !vault.exists() {
        return Err(format!("Vault 目录 '{}' 不存在", vault_path));
    }
    let mut entries = Vec::new();
    scan_dir_recursive(vault, vault, &mut entries)?;
    Ok(entries)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocEntry {
    pub name: String,         // 文件名（如 "test.md"）
    pub title: Option<String>, // frontmatter 中的 title（如有）
    pub path: String,         // 相对于 vault root 的路径
    pub absolute_path: String, // 绝对路径
    pub is_dir: bool,
    pub children: Vec<DocEntry>,
}

/// 从 .md 文件内容中提取 YAML frontmatter 的 title 字段
fn extract_frontmatter_title(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    // 找到第二个 ---
    let after_first = &trimmed[3..];
    let rest = after_first.trim_start_matches(['-', '\r', '\n']);
    if let Some(end_idx) = rest.find("---") {
        let yaml_block = &rest[..end_idx];
        for line in yaml_block.lines() {
            let line_trimmed = line.trim();
            if let Some(rest) = line_trimmed.strip_prefix("title:") {
                let title = rest.trim();
                // 去除引号
                let title = title.trim_matches('"').trim_matches('\'');
                if !title.is_empty() {
                    return Some(title.to_string());
                }
            }
        }
    }
    None
}

fn scan_dir_recursive(
    base: &Path,
    current: &Path,
    entries: &mut Vec<DocEntry>,
) -> Result<(), String> {
    let dir_entries = fs::read_dir(current)
        .map_err(|e| format!("读取目录失败: {}", e))?;

    let mut dir_entries: Vec<_> = dir_entries.flatten().collect();
    dir_entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        b_is_dir
            .cmp(&a_is_dir)
            .then(a.file_name().cmp(&b.file_name()))
    });

    for entry in dir_entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏目录和文件
        if name.starts_with('.') {
            continue;
        }

        let relative = path
            .strip_prefix(base)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        if path.is_dir() {
            let mut children = Vec::new();
            scan_dir_recursive(base, &path, &mut children)?;
            entries.push(DocEntry {
                name,
                title: None,
                path: relative,
                absolute_path: path.to_string_lossy().to_string(),
                is_dir: true,
                children,
            });
        } else if is_supported_document_file(&path) {
            // Markdown 文件读取 frontmatter title；其他文本文件使用文件名显示
            let title = if matches!(
                path.extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase()),
                Some(ext) if matches!(ext.as_str(), "md" | "markdown")
            ) {
                fs::read_to_string(&path)
                    .ok()
                    .and_then(|content| extract_frontmatter_title(&content))
            } else {
                None
            };
            entries.push(DocEntry {
                name,
                title,
                path: relative,
                absolute_path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }

    Ok(())
}
