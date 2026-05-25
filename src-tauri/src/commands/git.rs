use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;
use crate::commands::vault::assert_path_inside_vault;

fn relative_path_in_vault(vault_path: &str, file_path: &str) -> Result<String, String> {
    assert_path_inside_vault(vault_path, file_path)?;
    let vault = Path::new(vault_path)
        .canonicalize()
        .map_err(|e| format!("Vault 路径规范化失败: {}", e))?;
    let file = Path::new(file_path)
        .canonicalize()
        .map_err(|e| format!("文件路径规范化失败: {}", e))?;
    file.strip_prefix(&vault)
        .map_err(|e| format!("文件路径不在 vault 内: {}", e))
        .map(|p| p.to_string_lossy().to_string())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitDiffEntry {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
    pub patch_preview: String,
}

fn git_commit_from_hash(vault: &Path, hash: &str) -> Result<GitCommit, String> {
    let output = std::process::Command::new("git")
        .args(["show", "-s", "--format=%H|%h|%s|%an|%at", hash])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git show 失败: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git show 失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().splitn(5, '|').collect();
    if parts.len() < 5 {
        return Err("无法解析 git commit 信息".to_string());
    }

    Ok(GitCommit {
        hash: parts[0].to_string(),
        short_hash: parts[1].to_string(),
        subject: parts[2].to_string(),
        author: parts[3].to_string(),
        timestamp: parts[4].parse().unwrap_or(0),
    })
}

#[command]
pub fn git_log(vault_path: String, file_path: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    let vault = Path::new(&vault_path);
    let file_relative = relative_path_in_vault(&vault_path, &file_path)?;

    let mut command = std::process::Command::new("git");
    command.arg("log");
    if let Some(l) = limit {
        command.arg(format!("-n{}", l));
    }
    command
        .arg("--format=%H|%h|%s|%an|%at")
        .arg("--follow")
        .arg("--")
        .arg(&file_relative)
        .current_dir(vault);

    let output = command
        .output()
        .map_err(|e| format!("执行 git log 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("not a git repository") || stderr.contains("does not exist") {
            return Ok(vec![]);
        }
        return Err(format!("git log 失败: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits: Vec<GitCommit> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() >= 5 {
                Some(GitCommit {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    subject: parts[2].to_string(),
                    author: parts[3].to_string(),
                    timestamp: parts[4].parse().unwrap_or(0),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(commits)
}

#[command]
pub fn git_snapshot_document(
    vault_path: String,
    file_path: String,
    message: Option<String>,
) -> Result<Option<GitCommit>, String> {
    let vault = Path::new(&vault_path);
    let file_relative = relative_path_in_vault(&vault_path, &file_path)?;

    let inside_work_tree = std::process::Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(vault)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if !inside_work_tree {
        let init_output = std::process::Command::new("git")
            .arg("init")
            .current_dir(vault)
            .output()
            .map_err(|e| format!("执行 git init 失败: {}", e))?;
        if !init_output.status.success() {
            return Err(format!(
                "git init 失败: {}",
                String::from_utf8_lossy(&init_output.stderr)
            ));
        }
    }

    let status_output = std::process::Command::new("git")
        .args(["status", "--porcelain", "--", &file_relative])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git status 失败: {}", e))?;

    if !status_output.status.success() {
        return Err(format!(
            "git status 失败: {}",
            String::from_utf8_lossy(&status_output.stderr)
        ));
    }

    if String::from_utf8_lossy(&status_output.stdout).trim().is_empty() {
        return Ok(None);
    }

    let add_output = std::process::Command::new("git")
        .args(["add", "--", &file_relative])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git add 失败: {}", e))?;

    if !add_output.status.success() {
        return Err(format!(
            "git add 失败: {}",
            String::from_utf8_lossy(&add_output.stderr)
        ));
    }

    let commit_message = message.unwrap_or_else(|| format!("minddock: snapshot {}", file_relative));
    let commit_output = std::process::Command::new("git")
        .args([
            "-c",
            "user.name=MindDock",
            "-c",
            "user.email=minddock@local",
            "commit",
            "-m",
            &commit_message,
            "--",
            &file_relative,
        ])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git commit 失败: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        if stderr.contains("nothing to commit") || stderr.contains("no changes added") {
            return Ok(None);
        }
        return Err(format!("git commit 失败: {}", stderr));
    }

    let head_output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git rev-parse 失败: {}", e))?;

    if !head_output.status.success() {
        return Err(format!(
            "git rev-parse 失败: {}",
            String::from_utf8_lossy(&head_output.stderr)
        ));
    }

    let hash = String::from_utf8_lossy(&head_output.stdout).trim().to_string();
    git_commit_from_hash(vault, &hash).map(Some)
}

#[command]
pub fn git_diff(
    vault_path: String,
    file_path: String,
    commit_hash: Option<String>,
) -> Result<GitDiffEntry, String> {
    let vault = Path::new(&vault_path);
    let file_relative = relative_path_in_vault(&vault_path, &file_path)?;

    let target = match &commit_hash {
        Some(hash) => format!("{}^!", hash),
        None => "HEAD".to_string(),
    };

    // 获取 diff stat
    let stat_output = std::process::Command::new("git")
        .args(["diff", "--numstat", &target, "--", &file_relative])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git diff --numstat 失败: {}", e))?;

    let (additions, deletions) = if stat_output.status.success() {
        let stat_line = String::from_utf8_lossy(&stat_output.stdout)
            .lines()
            .next()
            .map(|l| l.to_string())
            .unwrap_or_default();
        let parts: Vec<&str> = stat_line.split_whitespace().collect();
        (
            parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(0),
            parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0),
        )
    } else {
        (0, 0)
    };

    // 获取 diff status
    let status_output = std::process::Command::new("git")
        .args(["diff", "--name-status", &target, "--", &file_relative])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git diff --name-status 失败: {}", e))?;

    let status = if status_output.status.success() {
        String::from_utf8_lossy(&status_output.stdout)
            .lines()
            .next()
            .map(|l| l.split_whitespace().next().unwrap_or("M"))
            .unwrap_or("M")
            .to_string()
    } else {
        "M".to_string()
    };

    // 获取 diff patch（限制行数避免过大）
    let patch_args = if commit_hash.is_some() {
        vec![
            "diff".to_string(),
            "--no-color".to_string(),
            "-U5".to_string(),
            target,
            "--".to_string(),
            file_relative,
        ]
    } else {
        // 对比工作区和 HEAD
        vec![
            "diff".to_string(),
            "--no-color".to_string(),
            "-U5".to_string(),
            "--".to_string(),
            file_relative,
        ]
    };

    let patch_output = std::process::Command::new("git")
        .args(&patch_args)
        .current_dir(vault)
        .output()
        .map_err(|e| format!("执行 git diff patch 失败: {}", e))?;

    let mut patch_preview = String::from_utf8_lossy(&patch_output.stdout).to_string();
    if patch_preview.len() > 2000 {
        patch_preview.truncate(2000);
        patch_preview.push_str("\n... (截断)");
    }

    Ok(GitDiffEntry {
        path: file_path,
        status,
        additions,
        deletions,
        patch_preview,
    })
}
