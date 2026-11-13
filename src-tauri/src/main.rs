#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod file_assoc;

use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

/// Uygulama açılırken (çift tık / "Birlikte Aç" / komut satırı) gelen dosya yolu.
struct OpenedFile(Mutex<Option<String>>);

/// Argümanlardan, diskte gerçekten var olan ilk dosya yolunu bulur.
/// Göreli yollar `cwd`'ye göre çözülür (ikinci örnekten gelen çağrılar için).
fn resolve_file_arg(arg: &str, cwd: &str) -> Option<String> {
    if arg.starts_with('-') {
        return None;
    }
    let p = Path::new(arg);
    let full = if p.is_absolute() {
        p.to_path_buf()
    } else {
        Path::new(cwd).join(p)
    };
    if full.is_file() {
        Some(full.to_string_lossy().into_owned())
    } else {
        None
    }
}

#[tauri::command]
fn get_opened_file(state: State<OpenedFile>) -> Option<String> {
    // take(): dosya yalnızca bir kez teslim edilir (yeniden yüklemede tekrar açılmaz)
    state.0.lock().unwrap().take()
}

#[tauri::command]
fn register_file_associations() -> Result<String, String> {
    file_assoc::register()
}

fn main() {
    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let initial_file = std::env::args()
        .skip(1)
        .find_map(|a| resolve_file_arg(&a, &cwd));

    let builder = tauri::Builder::default();

    // Tek örnek: uygulama zaten açıkken başka bir .md dosyasına çift tıklanırsa
    // yeni pencere açmak yerine dosya mevcut pencerede açılır.
    // (Bu eklenti diğerlerinden ÖNCE kaydedilmelidir.)
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        if let Some(path) = args.iter().skip(1).find_map(|a| resolve_file_arg(a, &cwd)) {
            let _ = app.emit("open-file", path);
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(OpenedFile(Mutex::new(initial_file)))
        .invoke_handler(tauri::generate_handler![
            get_opened_file,
            register_file_associations
        ])
        .build(tauri::generate_context!())
        .expect("Tauri uygulaması oluşturulurken hata oluştu");

    app.run(|app_handle, event| {
        // macOS: Finder'dan "Birlikte Aç" / çift tık, komut satırı argümanı olarak
        // değil RunEvent::Opened olarak gelir.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            if let Some(path) = urls.iter().find_map(|u| u.to_file_path().ok()) {
                let path = path.to_string_lossy().into_owned();
                // Arayüz henüz hazır değilse get_opened_file ile alınır,
                // hazırsa olay ile iletilir.
                *app_handle.state::<OpenedFile>().0.lock().unwrap() = Some(path.clone());
                let _ = app_handle.emit("open-file", path);
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (&app_handle, &event);
    });
}
