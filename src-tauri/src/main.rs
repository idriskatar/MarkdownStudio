#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_assoc;

use std::sync::Mutex;
use tauri::{Emitter, Listener, State};

struct OpenedFile(Mutex<Option<String>>);

#[tauri::command]
fn get_opened_file(state: State<OpenedFile>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn register_file_associations() -> Result<String, String> {
    file_assoc::register()
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let initial_file = if args.len() > 1 {
        Some(args[1].clone())
    } else {
        None
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(OpenedFile(Mutex::new(initial_file)))
        .invoke_handler(tauri::generate_handler![
            get_opened_file,
            register_file_associations
        ])
        .setup(|app| {
            // macOS Finder'dan "Birlikte Aç" ile gelen dosyaları yakalama
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                app.listen("tauri://file-drop", move |event| {
                    let _ = handle.emit("open-file", event.payload());
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılırken hata oluştu");
}