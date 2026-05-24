use crate::commands::vault::assert_path_inside_vault;
use std::fs;
use std::path::Path;
use tauri::command;

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

    // 创建文件，写入默认 frontmatter
    let default_content = "---\ntitle: \ncreated: \ntags: []\n---\n\n";
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

/// 重命名文档
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
