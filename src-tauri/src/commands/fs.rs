use crate::commands::vault::assert_path_inside_vault;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub size: u64,
    pub modified_at: String,
}

/// 创建目录（递归创建，类似 mkdir -p）
#[command]
pub fn create_directory(vault_path: String, dir_path: String) -> Result<String, String> {
    // 校验路径在 vault 内
    assert_path_inside_vault(&vault_path, &dir_path)?;

    let path = Path::new(&dir_path);

    // 检查是否已存在且是目录
    if path.exists() {
        if path.is_dir() {
            return Ok(dir_path);
        }
        return Err(format!("路径 '{}' 已存在但不是目录", dir_path));
    }

    fs::create_dir_all(path)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    Ok(dir_path)
}

/// 创建新 Markdown 文档
#[command]
pub fn create_document(vault_path: String, file_path: String) -> Result<String, String> {
    // 校验路径在 vault 内（必须在创建目录之前校验，防止在 vault 外创建目录）
    assert_path_inside_vault(&vault_path, &file_path)?;

    let path = Path::new(&file_path);

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !matches!(ext.as_str(), "md" | "markdown" | "txt" | "html" | "htm" | "json") {
        return Err("只能创建 .md、.markdown、.txt、.html 或 .json 文件".to_string());
    }

    // 检查文件是否已存在
    if path.exists() {
        return Err(format!("文件 '{}' 已存在", file_path));
    }

    // 确保父目录存在
    let parent = path
        .parent()
        .ok_or_else(|| "无法获取父目录".to_string())?;
    if !parent.exists() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建父目录失败: {}", e))?;
    }

    // 从文件名提取标题（去掉扩展名）
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    // Markdown 创建默认 frontmatter；其他文本类型创建空文件。
    let default_content = if matches!(ext.as_str(), "md" | "markdown") {
        format!("---\ntitle: {}\ncreated: \ntags: []\n---\n\n", title)
    } else {
        String::new()
    };
    fs::write(path, default_content)
        .map_err(|e| format!("创建文件失败: {}", e))?;

    Ok(file_path)
}

/// 读取文档内容
#[command]
pub fn read_document(vault_path: String, file_path: String) -> Result<String, String> {
    assert_path_inside_vault(&vault_path, &file_path)?;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件 '{}' 不存在", file_path));
    }

    fs::read_to_string(path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入文档内容
#[command]
pub fn write_document(vault_path: String, file_path: String, content: String) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &file_path)?;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件 '{}' 不存在", file_path));
    }

    fs::write(path, content)
        .map_err(|e| format!("写入文件失败: {}", e))
}

/// 导出文本文件到用户通过系统保存对话框选择的位置。
#[command]
pub fn export_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !matches!(ext.as_str(), "md" | "markdown" | "txt") {
        return Err("只能导出 .md、.markdown 或 .txt 文件".to_string());
    }

    let parent = path
        .parent()
        .ok_or_else(|| "无法获取导出文件的父目录".to_string())?;
    if !parent.exists() {
        return Err("导出目录不存在".to_string());
    }

    fs::write(path, content)
        .map_err(|e| format!("导出文件失败: {}", e))
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase()),
        Some(ext) if matches!(ext.as_str(), "md" | "markdown")
    )
}

/// 重命名文档（Markdown 同时更新 frontmatter title）
#[command]
pub fn rename_document(vault_path: String, old_path: String, new_name: String) -> Result<String, String> {
    assert_path_inside_vault(&vault_path, &old_path)?;

    let old = Path::new(&old_path);
    if !old.exists() {
        return Err(format!("文件 '{}' 不存在", old_path));
    }

    let old_ext = old
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("md");
    let new_name = if Path::new(&new_name).extension().is_some() {
        new_name
    } else {
        format!("{}.{}", new_name, old_ext)
    };

    let new_path = old.parent()
        .ok_or_else(|| "无法获取父目录".to_string())?
        .join(&new_name);

    // 校验新路径也在 vault 内
    let new_path_str = new_path.to_string_lossy().to_string();
    assert_path_inside_vault(&vault_path, &new_path_str)?;

    // 检查新文件名是否已存在
    if new_path.exists() {
        return Err(format!("文件 '{}' 已存在", new_name));
    }

    // 先更新文件内容中的 frontmatter title
    let title_stem = Path::new(&new_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&new_name);
    if is_markdown_path(old) && is_markdown_path(&new_path) {
        if let Ok(content) = fs::read_to_string(old) {
            let updated = update_frontmatter_title(&content, title_stem);
            let _ = fs::write(old, updated);
        }
    }

    fs::rename(old, &new_path)
        .map_err(|e| format!("重命名失败: {}", e))?;

    Ok(new_path_str)
}

/// 删除文档或文件夹
#[command]
pub fn delete_document(vault_path: String, file_path: String) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &file_path)?;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("路径 '{}' 不存在", file_path));
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("删除文件夹失败: {}", e))
    } else {
        fs::remove_file(path)
            .map_err(|e| format!("删除文件失败: {}", e))
    }
}

/// 获取文档元数据（文件大小和最后修改时间）
#[command]
pub fn get_document_metadata(vault_path: String, document_path: String) -> Result<DocumentMetadata, String> {
    assert_path_inside_vault(&vault_path, &document_path)?;

    let path = Path::new(&document_path);
    if !path.exists() {
        return Err(format!("文件 '{}' 不存在", document_path));
    }

    let metadata = fs::metadata(path)
        .map_err(|e| format!("获取文件元数据失败: {}", e))?;

    let size = metadata.len();

    let modified_at = metadata.modified()
        .map_err(|e| format!("获取修改时间失败: {}", e))?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("修改时间转换失败: {}", e))?;

    let datetime = chrono::DateTime::from_timestamp(modified_at.as_secs() as i64, modified_at.subsec_nanos())
        .ok_or_else(|| "修改时间转换失败".to_string())?;

    Ok(DocumentMetadata {
        size,
        modified_at: datetime.to_rfc3339(),
    })
}

/// 更新 Markdown 内容中 frontmatter 的 title 字段
fn update_frontmatter_title(content: &str, new_title: &str) -> String {
    // 查找 frontmatter 中的 title 行并替换
    let mut found_title = false;
    let mut in_frontmatter = false;
    let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

    for i in 0..lines.len() {
        let line = &lines[i];
        if i == 0 && line.trim() == "---" {
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter && line.trim() == "---" {
            break;
        }
        if in_frontmatter && line.starts_with("title:") {
            lines[i] = format!("title: {}", new_title);
            found_title = true;
            break;
        }
    }

    if found_title {
        // 保留原始换行符风格
        let has_trailing_newline = content.ends_with('\n');
        let mut result = lines.join("\n");
        if has_trailing_newline {
            result.push('\n');
        }
        result
    } else if content.starts_with("---") {
        // 有 frontmatter 但没有 title 行，在第一个 --- 后插入
        let mut result = String::from("---\n");
        result.push_str(&format!("title: {}\n", new_title));
        // 跳过第一行 "---"
        result.push_str(&content[3..]);
        result
    } else {
        // 没有 frontmatter，添加一个
        format!("---\ntitle: {}\n---\n\n{}", new_title, content)
    }
}
