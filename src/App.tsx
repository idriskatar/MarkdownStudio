import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  FileText,
  FolderOpen,
  Save,
  Settings,
  Columns,
  Eye,
  Edit3,
  FileDown,
  Printer,
  X,
  CheckCircle2,
} from "lucide-react";
import { markdownToDocxBytes } from "./utils/docxExporter";

type ViewMode = "split" | "editor" | "preview";
type ThemeMode = "system" | "light" | "dark" | "sepia" | "nord";

const APP_TITLE = "Markdown Studio";

const DEFAULT_MD = `# Markdown Studio'ya Hoş Geldiniz

Windows, macOS ve Linux destekli hızlı Markdown görüntüleyici ve düzenleyiciniz.

## Öne Çıkan Özellikler
- **Canlı Önizleme:** Yazdığınız anda biçimlendirilmiş çıktıyı görün.
- **Tema Desteği:** Ayarlar menüsünden Sistem, Açık, Koyu, Sepia veya Nord temalarını seçin.
- **Dosya İlişkilendirme:** \`.md\` dosyalarına çift tıkladığınızda doğrudan bu uygulamada açın.
- **PDF & DOCX Dışa Aktarma:** Ekstra program kurmadan belge çıktısı alın.

\`\`\`rust
fn main() {
    println!("Merhaba Markdown Studio!");
}
\`\`\`

| Özellik | Durum |
| :--- | :--- |
| Windows / macOS / Linux | Aktif |
| DOCX & PDF Dışa Aktarım | Aktif |
`;

marked.setOptions({
  breaks: true,
  gfm: true,
});

async function showError(text: string) {
  try {
    await message(text, { title: APP_TITLE, kind: "error" });
  } catch {
    console.error(text);
  }
}

export default function App() {
  const [content, setContent] = useState<string>(DEFAULT_MD);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem("md-theme") as ThemeMode) || "system";
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [assocStatus, setAssocStatus] = useState<string>("");

  // Olay dinleyicilerinde (pencere kapatma vb.) bayat state kullanmamak için
  const dirtyRef = useRef(false);
  dirtyRef.current = isDirty;

  const confirmDiscard = async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    return ask("Kaydedilmemiş değişiklikler var. Devam ederseniz kaybolacaklar.", {
      title: APP_TITLE,
      kind: "warning",
      okLabel: "Değişiklikleri at",
      cancelLabel: "Vazgeç",
    });
  };

  // Tema uygulama ("Sistem" seçiliyken işletim sistemi temasını da takip eder)
  useEffect(() => {
    localStorage.setItem("md-theme", theme);
    const apply = () => {
      if (theme === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
    };
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // Pencere başlığı: dosya adı + kaydedilmemiş değişiklik göstergesi
  useEffect(() => {
    const name = filePath ? filePath.split(/[\\/]/).pop() : "Adsız.md";
    try {
      getCurrentWindow()
        .setTitle(`${isDirty ? "● " : ""}${name} — ${APP_TITLE}`)
        .catch(() => {});
    } catch {
      /* Tauri dışında (ör. tarayıcıda) çalışırken sessizce geç */
    }
  }, [filePath, isDirty]);

  // Pencere kapatılırken kaydedilmemiş değişiklik uyarısı
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    try {
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (!dirtyRef.current) return;
          const ok = await ask("Kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?", {
            title: APP_TITLE,
            kind: "warning",
            okLabel: "Kapat",
            cancelLabel: "Vazgeç",
          });
          if (!ok) event.preventDefault();
        })
        .then((fn) => {
          if (cancelled) fn();
          else unlisten = fn;
        })
        .catch(() => {});
    } catch {
      /* Tauri dışında çalışıyor */
    }
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Çift tıklanan, "Birlikte Aç" ile gelen veya CLI ile gönderilen dosyayı açma
  useEffect(() => {
    const loadInitialFile = async () => {
      try {
        const initialPath = await invoke<string | null>("get_opened_file");
        if (initialPath) {
          await openFileFromPath(initialPath);
        }
      } catch (e) {
        console.error("Başlangıç dosyası kontrol hatası:", e);
      }
    };
    loadInitialFile();

    const unlistenPromise = listen<string>("open-file", async (event) => {
      if (event.payload) {
        await openFileFromPath(event.payload);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const openFileFromPath = async (path: string) => {
    if (!(await confirmDiscard())) return;
    try {
      const text = await readTextFile(path);
      setContent(text);
      setFilePath(path);
      setIsDirty(false);
    } catch (err) {
      await showError("Dosya okunamadı: " + String(err));
    }
  };

  const handleNew = async () => {
    if (!(await confirmDiscard())) return;
    setContent("");
    setFilePath(null);
    setIsDirty(false);
  };

  const handleOpenDialog = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown", "mdown", "mkd", "txt"],
        },
      ],
    });
    if (typeof selected === "string") {
      await openFileFromPath(selected);
    }
  };

  const handleSave = async () => {
    try {
      let targetPath = filePath;
      if (!targetPath) {
        const chosen = await save({
          filters: [{ name: "Markdown", extensions: ["md"] }],
          defaultPath: "belge.md",
        });
        if (!chosen) return;
        targetPath = chosen;
      }
      await writeTextFile(targetPath, content);
      setFilePath(targetPath);
      setIsDirty(false);
    } catch (err) {
      await showError("Kaydetme hatası: " + String(err));
    }
  };

  const handleExportDocx = async () => {
    try {
      const chosen = await save({
        filters: [{ name: "Word Belgesi", extensions: ["docx"] }],
        defaultPath: "belge.docx",
      });
      if (!chosen) return;
      const bytes = await markdownToDocxBytes(content);
      await writeFile(chosen, bytes);
      await message("DOCX dosyası başarıyla kaydedildi.", { title: APP_TITLE, kind: "info" });
    } catch (err) {
      await showError("DOCX dönüştürme hatası: " + String(err));
    }
  };

  // Önizleme paneli "Sadece Editör" modunda da DOM'da tutulur (ekranda gizli, yazdırmada görünür),
  // böylece her görünüm modunda PDF/yazdırma dolu çıktı verir.
  const handleExportPdf = () => {
    window.print();
  };

  const handleRegisterFileAssociations = async () => {
    try {
      const result = await invoke<string>("register_file_associations");
      setAssocStatus(result);
    } catch (err) {
      setAssocStatus("Hata: " + String(err));
    }
  };

  // Yazarken arayüzün akıcı kalması için önizleme gecikmeli değerden üretilir
  const deferredContent = useDeferredValue(content);

  const renderedHtml = useMemo(() => {
    const rawHtml = marked.parse(deferredContent, { async: false }) as string;
    // Güvenlik: .md içindeki HTML (script, onerror vb.) temizlenir
    const cleanHtml = DOMPurify.sanitize(rawHtml);
    const container = document.createElement("div");
    container.innerHTML = cleanHtml;
    container.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
    return container.innerHTML;
  }, [deferredContent]);

  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [content]);

  // Önizlemedeki bağlantılar uygulama penceresinde gezinmesin; sistem tarayıcısında açılsın
  const handlePreviewClick = (e: MouseEvent<HTMLElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute("href") || "";
    if (/^(https?:|mailto:)/i.test(href)) {
      openUrl(href).catch((err) => console.error("Bağlantı açılamadı:", err));
    }
  };

  const showEditor = viewMode === "split" || viewMode === "editor";
  const showPreview = viewMode === "split" || viewMode === "preview";

  return (
    <div className="app-container">
      {/* Üst Araç Çubuğu */}
      <header className="toolbar">
        <div className="toolbar-group">
          <button className="btn" onClick={handleNew} title="Yeni Dosya">
            <FileText size={16} />
            Yeni
          </button>
          <button className="btn" onClick={handleOpenDialog} title="Dosya Aç">
            <FolderOpen size={16} />
            Aç
          </button>
          <button className="btn btn-primary" onClick={handleSave} title="Kaydet">
            <Save size={16} />
            Kaydet{isDirty ? "*" : ""}
          </button>
          <span className="file-title" title={filePath || "Adsız Belge"}>
            {filePath ? filePath.split(/[\\/]/).pop() : "Adsız.md"}
          </span>
        </div>

        {/* Görünüm Modları */}
        <div className="toolbar-group">
          <button
            className={`btn ${viewMode === "editor" ? "active" : ""}`}
            onClick={() => setViewMode("editor")}
          >
            <Edit3 size={15} />
            Editör
          </button>
          <button
            className={`btn ${viewMode === "split" ? "active" : ""}`}
            onClick={() => setViewMode("split")}
          >
            <Columns size={15} />
            Bölünmüş
          </button>
          <button
            className={`btn ${viewMode === "preview" ? "active" : ""}`}
            onClick={() => setViewMode("preview")}
          >
            <Eye size={15} />
            Önizleme
          </button>
        </div>

        {/* Dışa Aktarma ve Ayarlar */}
        <div className="toolbar-group">
          <button className="btn" onClick={handleExportPdf} title="Yazdır / PDF Olarak Kaydet">
            <Printer size={15} />
            PDF
          </button>
          <button className="btn" onClick={handleExportDocx} title="Word (.docx) Olarak Kaydet">
            <FileDown size={15} />
            DOCX
          </button>
          <button className="btn" onClick={() => setShowSettings(true)} title="Ayarlar">
            <Settings size={16} />
            Ayarlar
          </button>
        </div>
      </header>

      {/* Çalışma Alanı */}
      <main className="workspace">
        {showEditor && (
          <section className="editor-pane">
            <textarea
              className="editor-textarea"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Markdown içeriğinizi buraya yazın..."
              spellCheck={false}
            />
          </section>
        )}

        <section className={`preview-pane${showPreview ? "" : " print-only"}`}>
          <article
            className="markdown-body"
            onClick={handlePreviewClick}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </section>
      </main>

      {/* Alt Durum Çubuğu */}
      <footer className="statusbar">
        <span>{filePath || "Yerel Taslak"}</span>
        <span>
          {wordCount} kelime • {content.length} karakter
        </span>
      </footer>

      {/* Ayarlar Penceresi */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Uygulama Ayarları</h3>
              <button className="btn" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="setting-row">
              <label className="setting-label">Görünüm Teması</label>
              <p className="setting-desc">
                Arayüz ve Markdown önizleme renk şemasını seçin.
              </p>
              <div className="theme-grid">
                {(["system", "light", "dark", "sepia", "nord"] as ThemeMode[]).map((t) => (
                  <button
                    key={t}
                    className={`btn ${theme === t ? "active" : ""}`}
                    onClick={() => setTheme(t)}
                  >
                    {t === "system" && "Sistem"}
                    {t === "light" && "Açık (Light)"}
                    {t === "dark" && "Koyu (Dark)"}
                    {t === "sepia" && "Sepia"}
                    {t === "nord" && "Nord"}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <label className="setting-label">Dosya Türü İlişkilendirme</label>
              <p className="setting-desc">
                <code>.md</code>, <code>.markdown</code>, <code>.mdown</code> ve{" "}
                <code>.mkd</code> uzantılı dosyaları Markdown Studio ile açılacak şekilde kaydeder.
                Windows'ta son seçimi sizin yapmanız gerekebilir.
              </p>
              <button className="btn btn-primary" onClick={handleRegisterFileAssociations}>
                <CheckCircle2 size={16} />
                Varsayılan Markdown Uygulaması Yap
              </button>
              {assocStatus && <div className="status-badge">{assocStatus}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
