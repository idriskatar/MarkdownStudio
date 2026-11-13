#[cfg(target_os = "windows")]
pub fn register() -> Result<String, String> {
    use std::env;
    use winreg::enums::*;
    use winreg::RegKey;

    let exe_path = env::current_exe()
        .map_err(|e| format!("Uygulama yolu alınamadı: {}", e))?;
    let exe_str = exe_path.to_string_lossy();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu
        .open_subkey_with_flags("Software\\Classes", KEY_WRITE)
        .map_err(|e| format!("Kayıt defteri açılamadı: {}", e))?;

    let prog_id = "MarkdownStudio.Document";
    let (prog_key, _) = classes
        .create_subkey(prog_id)
        .map_err(|e| format!("ProgID oluşturulamadı: {}", e))?;
    prog_key
        .set_value("", &"Markdown Belgesi")
        .map_err(|e| e.to_string())?;

    let (cmd_key, _) = prog_key
        .create_subkey("shell\\open\\command")
        .map_err(|e| e.to_string())?;
    cmd_key
        .set_value("", &format!("\"{}\" \"%1\"", exe_str))
        .map_err(|e| e.to_string())?;

    for ext in [".md", ".markdown", ".mdown", ".mkd"] {
        let (ext_key, _) = classes
            .create_subkey(ext)
            .map_err(|e| format!("{} anahtarı oluşturulamadı: {}", ext, e))?;
        ext_key
            .set_value("", &prog_id)
            .map_err(|e| e.to_string())?;
    }

    Ok("Windows üzerinde .md, .markdown, .mdown ve .mkd uzantıları başarıyla ilişkilendirildi.".to_string())
}

#[cfg(target_os = "linux")]
pub fn register() -> Result<String, String> {
    use std::process::Command;

    let status = Command::new("xdg-mime")
        .args(["default", "markdown-studio.desktop", "text/markdown"])
        .status()
        .map_err(|e| format!("xdg-mime çalıştırılamadı: {}", e))?;

    if status.success() {
        Ok("Linux üzerinde text/markdown MIME türü Markdown Studio ile ilişkilendirildi.".to_string())
    } else {
        Err("xdg-mime komutu başarısız oldu. Uygulamanın .deb veya .AppImage ile kurulduğundan emin olun.".to_string())
    }
}

#[cfg(target_os = "macos")]
pub fn register() -> Result<String, String> {
    Ok("macOS üzerinde dosya ilişkilendirme Info.plist üzerinden otomatik tanımlıdır. Finder'da bir .md dosyasına sağ tıklayıp 'Bilgi Ver -> Birlikte Aç -> Tümünü Değiştir' adımını kullanabilirsiniz.".to_string())
}
