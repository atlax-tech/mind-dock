mod commands;

use commands::{vault, fs, capture, sticky_notes, notifications};

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
