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

/// 创建新 Markdown 文档
#[command]
pub fn create_document(vault_path: String, file_path: String) -> Result<String, String> {
    // 校验路径在 vault 内（必须在创建目录之前校验，防止在 vault 外创建目录）
    assert_path_inside_vault(&vault_path, &file_path)?;

    let path = Path::new(&file_path);

    // 确保文件扩展名为 .md
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("只能创建 .md 文件".to_string());
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

    // 从文件名提取标题（去掉 .md 后缀）
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    // 创建文件，写入默认 frontmatter（title 填入文件名）
    let default_content = format!("---\ntitle: {}\ncreated: \ntags: []\n---\n\n", title);
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

/// 重命名文档（同时更新 frontmatter title）
#[command]
pub fn rename_document(vault_path: String, old_path: String, new_name: String) -> Result<String, String> {
    assert_path_inside_vault(&vault_path, &old_path)?;

    let old = Path::new(&old_path);
    if !old.exists() {
        return Err(format!("文件 '{}' 不存在", old_path));
    }

    // 确保新名称以 .md 结尾
    let new_name = if new_name.ends_with(".md") {
        new_name
    } else {
        format!("{}.md", new_name)
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
    let title_stem = new_name.trim_end_matches(".md");
    if let Ok(content) = fs::read_to_string(old) {
        let updated = update_frontmatter_title(&content, title_stem);
        let _ = fs::write(old, updated);
    }

    fs::rename(old, &new_path)
        .map_err(|e| format!("重命名失败: {}", e))?;

    Ok(new_path_str)
}

/// 删除文档
#[command]
pub fn delete_document(vault_path: String, file_path: String) -> Result<(), String> {
    assert_path_inside_vault(&vault_path, &file_path)?;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("文件 '{}' 不存在", file_path));
    }

    fs::remove_file(path)
        .map_err(|e| format!("删除文件失败: {}", e))
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
