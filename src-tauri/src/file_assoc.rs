#[cfg(target_os = "windows")]
pub fn register() -> Result<String, String> {
    use std::env;
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use winreg::enums::*;
    use winreg::RegKey;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let exe_path = env::current_exe().map_err(|e| format!("Uygulama yolu alınamadı: {}", e))?;
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

    let (icon_key, _) = prog_key
        .create_subkey("DefaultIcon")
        .map_err(|e| e.to_string())?;
    icon_key
        .set_value("", &format!("\"{}\",0", exe_str))
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
        ext_key.set_value("", &prog_id).map_err(|e| e.to_string())?;

        // "Birlikte aç" listesinde de görünsün
        let (owp_key, _) = classes
            .create_subkey(format!("{}\\OpenWithProgids", ext))
            .map_err(|e| e.to_string())?;
        owp_key.set_value(prog_id, &"").map_err(|e| e.to_string())?;
    }

    // Windows 10/11, kullanıcının seçtiği varsayılan uygulamayı (UserChoice) korur ve
    // programlar bunu sessizce değiştiremez. Bu yüzden Varsayılan uygulamalar
    // sayfasını açıyoruz; kullanıcı orada Markdown Studio'yu seçebilir.
    let _ = Command::new("cmd")
        .args(["/C", "start", "", "ms-settings:defaultapps"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();

    Ok("Uzantılar kayıt defterine eklendi (.md, .markdown, .mdown, .mkd). \
Windows varsayılan uygulama seçimini kullanıcıya bıraktığı için Ayarlar > Varsayılan uygulamalar \
sayfası açıldı; orada Markdown Studio'yu seçin."
        .to_string())
}

#[cfg(target_os = "linux")]
pub fn register() -> Result<String, String> {
    use std::process::Command;

    let mut last_err = None;
    for mime in ["text/markdown", "text/x-markdown"] {
        match Command::new("xdg-mime")
            .args(["default", "markdown-studio.desktop", mime])
            .status()
        {
            Ok(s) if s.success() => {}
            Ok(_) => last_err = Some("xdg-mime komutu başarısız oldu.".to_string()),
            Err(e) => last_err = Some(format!("xdg-mime çalıştırılamadı: {}", e)),
        }
    }

    match last_err {
        None => Ok("Linux üzerinde Markdown dosyaları Markdown Studio ile ilişkilendirildi.".to_string()),
        Some(e) => Err(format!(
            "{} Uygulamanın .deb paketiyle kurulduğundan emin olun (AppImage kendini sisteme kaydetmez).",
            e
        )),
    }
}

#[cfg(target_os = "macos")]
pub fn register() -> Result<String, String> {
    Ok("macOS'ta dosya ilişkilendirme uygulama paketinin Info.plist dosyasında tanımlıdır. \
Finder'da bir .md dosyasına sağ tıklayıp 'Bilgi Ver > Birlikte Aç' bölümünden Markdown Studio'yu seçin \
ve 'Tümünü Değiştir'e basın."
        .to_string())
}
