import React, { useEffect, useState, useMemo } from "react";
import { marked } from "marked";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
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

const DEFAULT_MD = `# Markdown Studio'ya Hoş Geldiniz

Windows, macOS ve Linux destekli hızlı Markdown görüntüleyici ve düzenleyiciniz.

## Öne Çıkan Özellikler
- **Canlı Önizleme:** Yazdığınız anda biçimlendirilmiş çıktıyı görün.
- **Tema Desteği:** Ayarlar menüsünden Sistem, Açık, Koyu, Sepia veya Nord temalarını seçin.
- **Dosya İlişkilendirme:** \`.md\` dosyalarına çift tıkladığınızda doğrudan bu uygulamada açın.
- **PDF & DOCX Dışa Aktarma:** Ekstra program kurmadan tek tıkla belge çıktısı alın.

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

  // Tema uygulama
  useEffect(() => {
    localStorage.setItem("md-theme", theme);
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  // Çift tıklanan veya CLI ile gönderilen dosyayı açma
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
    try {
      const text = await readTextFile(path);
      setContent(text);
      setFilePath(path);
      setIsDirty(false);
    } catch (err) {
      alert("Dosya okunamadı: " + String(err));
    }
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
      alert("Kaydetme hatası: " + String(err));
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
      alert("DOCX dosyası başarıyla kaydedildi!");
    } catch (err) {
      alert("DOCX dönüştürme hatası: " + String(err));
    }
  };

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

  const renderedHtml = useMemo(() => {
    const rawHtml = marked.parse(content) as string;
    const container = document.createElement("div");
    container.innerHTML = rawHtml;
    container.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
    return container.innerHTML;
  }, [content]);

  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [content]);

  return (
    <div className="app-container">
      {/* Üst Araç Çubuğu */}
      <header className="toolbar">
        <div className="toolbar-group">
          <button
            className="btn"
            onClick={() => {
              setContent("");
              setFilePath(null);
              setIsDirty(false);
            }}
            title="Yeni Dosya"
          >
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
          <button className="btn" onClick={handleExportPdf} title="PDF Olarak Kaydet / Yazdır">
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
        {(viewMode === "split" || viewMode === "editor") && (
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

        {(viewMode === "split" || viewMode === "preview") && (
          <section className="preview-pane">
            <article
              className="markdown-body"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </section>
        )}
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
                <code>.mkd</code> uzantılı dosyaları çift tıkladığınızda otomatik olarak
                Markdown Studio ile açar.
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
