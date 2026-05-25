mod commands;

use commands::{vault, fs, capture, sticky_notes, notifications, ai_runtime, ai_logs, ai_suggestions, git};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::create_vault,
            vault::select_vault,
            vault::get_last_vault_path,
            vault::set_last_vault_path,
            vault::scan_vault_files,
            vault::validate_vault,
            fs::create_document,
            fs::read_document,
            fs::write_document,
            fs::rename_document,
            fs::delete_document,
            fs::get_document_metadata,
            capture::append_capture,
            capture::read_captures,
            capture::write_captures,
            sticky_notes::read_sticky_notes,
            sticky_notes::write_sticky_notes,
            notifications::read_notifications,
            notifications::write_notifications,
            ai_runtime::ollama_check_connection,
            ai_runtime::ollama_chat,
            ai_runtime::ollama_embed,
            ai_runtime::read_ai_config,
            ai_runtime::write_ai_config,
            ai_runtime::read_onboarding_status,
            ai_runtime::write_onboarding_status,
            ai_logs::append_ai_log,
            ai_logs::read_ai_logs,
            ai_suggestions::append_ai_suggestion,
            ai_suggestions::read_ai_suggestions,
            ai_suggestions::update_ai_suggestion_status,
            git::git_log,
            git::git_diff,
            git::git_snapshot_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
