# Markdown Studio (Windows, macOS, Linux)

Hızlı, hafif ve çok platformlu masaüstü Markdown görüntüleyici ve düzenleyici (Tauri v2 + Rust + React).

## Özellikler
- **Anında Açılış & Düzenleme:** Bölünmüş görünüm (Split), Sadece Editör ve Sadece Önizleme modları.
- **Tema Desteği:** Sistem Varsayılanı, Açık (Light), Koyu (Dark), Sepia ve Nord temaları.
- **Dosya Türü İlişkilendirme:** Kurulumda otomatik `.md`, `.markdown`, `.mdown`, `.mkd` ilişkilendirmesi ve uygulama içi Ayarlar menüsünden tek tıkla varsayılan uygulama atama.
- **PDF & DOCX Dışa Aktarma:** Harici bir program (Pandoc vb.) gerektirmeden doğrudan `.docx` ve `.pdf` olarak kaydetme.
- **Otomatik GitHub Build:** `.github/workflows/release.yml` ile Windows (`.msi`/`.exe`), macOS (`.dmg`) ve Linux (`.deb`/`.AppImage`) paketleri otomatik derlenir.

## Yerel Geliştirme
```bash
npm install
npm run tauri dev
```

## GitHub Üzerinden Otomatik Build Alma
1. Bu projeyi yeni bir GitHub deposuna (repository) yükleyin.
2. Paket oluşturmak için bir sürüm etiketi (tag) gönderin veya GitHub Actions sekmesinden **Build & Release** iş akışını manuel tetikleyin:
```bash
git tag v1.0.0
git push origin v1.0.0
```
Derleme tamamlandığında **Releases** sekmesinde Windows, macOS ve Linux kurulum dosyaları hazır olacaktır.
