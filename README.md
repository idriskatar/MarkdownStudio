# Markdown Studio (Windows, macOS, Linux)

Hızlı, hafif ve çok platformlu masaüstü Markdown görüntüleyici ve düzenleyici (Tauri v2 + Rust + React).

## Özellikler
- **Anında Açılış & Düzenleme:** Bölünmüş görünüm (Split), Sadece Editör ve Sadece Önizleme modları.
- **Tema Desteği:** Sistem Varsayılanı (işletim sistemi temasını canlı takip eder), Açık, Koyu, Sepia ve Nord temaları. Kod renklendirme her temada okunaklıdır.
- **Güvenli Önizleme:** Markdown içindeki HTML, DOMPurify ile temizlenir; önizlemedeki bağlantılar sistem tarayıcısında açılır.
- **Kaydedilmemiş Değişiklik Koruması:** Yeni / Aç / pencereyi kapatma sırasında uyarı verir; pencere başlığında `●` göstergesi bulunur.
- **Dosya Türü İlişkilendirme:** Kurulumda `.md`, `.markdown`, `.mdown`, `.mkd` ilişkilendirmesi; uygulama zaten açıkken başka bir `.md` dosyasına çift tıklanırsa dosya aynı pencerede açılır.
- **DOCX Dışa Aktarma:** Harici program (Pandoc vb.) gerektirmeden `.docx` olarak kaydetme. Başlıklar, kalın/italik/üstü çizili, bağlantılar, gerçek Word listeleri (iç içe, sıralı, görev listesi), alıntılar, kod blokları ve hizalı tablolar desteklenir. Görseller gömülmez, yerine alternatif metin yazılır.
- **PDF:** Sistemin yazdırma penceresini açar; oradan "PDF olarak kaydet" seçilir. Çıktı her zaman açık renklerle alınır.

## Yerel Geliştirme
```bash
npm install
npm run tauri dev
```
Gereksinimler: Node.js 20+, Rust (stable) ve işletim sisteminize uygun [Tauri v2 ön koşulları](https://v2.tauri.app/start/prerequisites/).

## İkonlar
İkonlar `src-tauri/icons/` altında depoya dahildir. Kaynak görseli değiştirirseniz hepsini yeniden üretmek için:
```bash
npx tauri icon src-tauri/icons/icon.png
```
(Kaynak görsel kare ve tercihen 1024×1024 PNG olmalıdır.)

## GitHub Üzerinden Otomatik Build Alma
1. Bu projeyi yeni bir GitHub deposuna (repository) yükleyin.
2. Paket oluşturmak için bir sürüm etiketi (tag) gönderin veya GitHub Actions sekmesinden **Build & Release Cross-Platform App** iş akışını (`.github/workflows/main.yml`) manuel tetikleyin:
```bash
git tag v1.0.0
git push origin v1.0.0
```
Derleme tamamlandığında **Releases** sekmesinde (taslak olarak) Windows (`.msi`/`.exe`), macOS (`.dmg`) ve Linux (`.deb`/`.AppImage`) kurulum dosyaları hazır olacaktır.

## Notlar
- **Windows varsayılan uygulama:** Windows 10/11, kullanıcının seçtiği varsayılan uygulamayı programların sessizce değiştirmesine izin vermez. Ayarlar'daki düğme kayıt defterini hazırlar ve *Varsayılan uygulamalar* sayfasını açar; son seçimi orada yapmanız gerekir.
- **Linux AppImage:** AppImage kendini sisteme kaydetmediği için dosya ilişkilendirmesi `.deb` kurulumunda çalışır.
- **Dosya erişimi:** Bir editör, dosyanın bulunduğu yere kaydedebilmelidir; bu nedenle `src-tauri/capabilities/default.json` içinde okuma/yazma kapsamı geniştir. Önizleme HTML'i temizlendiği ve bir CSP uygulandığı için kötü amaçlı bir `.md` dosyası bu izinleri kullanamaz.
