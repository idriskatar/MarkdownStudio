import { marked } from "marked";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// marked'ın token türleri bir birleşim (union) olduğundan ve eklentilerle genişlediğinden
// burada bilerek gevşek tip kullanılıyor; yapı `type` alanına göre kontrol edilir.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tok = any;

type Block = Paragraph | Table;
type Inline = TextRun | ExternalHyperlink;

/** Satır içi biçim; iç içe düğümlere (kalın > italik > kod ...) aktarılır. */
interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
  color?: string;
}

interface Ctx {
  /** Sıralı listeler her seferinde 1'den başlasın diye benzersiz numaralandırma örneği */
  orderedInstance: { n: number };
  /** Alıntı (blockquote) iç içelik düzeyi */
  quoteDepth: number;
  /** Liste öğesi içindeki ek bloklar için girinti (twip) */
  indent: number;
}

const PAGE_WIDTH = 11906; // A4, twip
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1440;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN; // 9026

const BORDER_COLOR = "D0D7DE";
const MAX_LIST_LEVEL = 5;

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/**
 * marked, satır içi `text` / `escape` / `codespan` token'larındaki metni HTML için
 * kaçışlar (&amp; &lt; &gt; &quot; &#39;). Word'e düz metin gideceği için geri çeviriyoruz.
 */
function decodeEntities(s: string): string {
  if (!s || s.indexOf("&") === -1) return s ?? "";
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00A0",
  };
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return named[ent] ?? m;
  });
}

function makeRun(text: string, style: RunStyle): TextRun {
  return new TextRun({
    text,
    bold: style.bold || undefined,
    italics: style.italics || undefined,
    strike: style.strike || undefined,
    color: style.link ? "0969DA" : style.color,
    underline: style.link ? {} : undefined,
    font: style.code ? "Consolas" : undefined,
    shading: style.code ? { type: ShadingType.CLEAR, fill: "EFF1F3", color: "auto" } : undefined,
  });
}

// ---------------------------------------------------------------------------
// Satır içi (inline) dönüştürme
// ---------------------------------------------------------------------------

function inline(tokens: Tok[] | undefined, style: RunStyle = {}): Inline[] {
  const out: Inline[] = [];
  if (!tokens) return out;

  for (const t of tokens) {
    switch (t.type) {
      case "text":
        // Liste öğeleri gibi yerlerde `text` token'ının kendi alt token'ları olabilir
        if (t.tokens && t.tokens.length) out.push(...inline(t.tokens, style));
        else out.push(makeRun(decodeEntities(t.text ?? ""), style));
        break;

      case "escape":
        out.push(makeRun(decodeEntities(t.text ?? ""), style));
        break;

      case "strong":
        out.push(...inline(t.tokens, { ...style, bold: true }));
        break;

      case "em":
        out.push(...inline(t.tokens, { ...style, italics: true }));
        break;

      case "del":
        out.push(...inline(t.tokens, { ...style, strike: true }));
        break;

      case "codespan":
        out.push(makeRun(decodeEntities(t.text ?? ""), { ...style, code: true }));
        break;

      case "br":
        out.push(new TextRun({ break: 1 }));
        break;

      case "link": {
        const kids = inline(t.tokens, { ...style, link: true }).filter(
          (k): k is TextRun => k instanceof TextRun
        );
        const children = kids.length ? kids : [makeRun(decodeEntities(t.href ?? ""), { ...style, link: true })];
        out.push(new ExternalHyperlink({ link: String(t.href ?? ""), children }));
        break;
      }

      case "image":
        // Görseller gömülmez; yerine alternatif metin yazılır
        out.push(makeRun(`[Görsel: ${decodeEntities(t.text || t.href || "")}]`, { ...style, italics: true }));
        break;

      case "checkbox": // marked >= 16
        out.push(makeRun(t.checked ? "☑ " : "☐ ", style));
        break;

      case "html": {
        // Yalnızca <br> satır sonuna çevrilir, diğer HTML atlanır
        if (/^<br\s*\/?>$/i.test(String(t.raw ?? t.text ?? "").trim())) out.push(new TextRun({ break: 1 }));
        break;
      }

      default:
        if (t.tokens && t.tokens.length) out.push(...inline(t.tokens, style));
        else if (typeof t.text === "string") out.push(makeRun(decodeEntities(t.text), style));
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blok düzeyi dönüştürme
// ---------------------------------------------------------------------------

function quoteProps(ctx: Ctx) {
  if (ctx.quoteDepth <= 0) return {};
  return {
    indent: { left: 480 * ctx.quoteDepth },
    border: {
      left: { color: BORDER_COLOR, space: 10, style: BorderStyle.SINGLE, size: 18 },
    },
  };
}

function inlineStyleFor(ctx: Ctx): RunStyle {
  return ctx.quoteDepth > 0 ? { italics: true, color: "57606A" } : {};
}

function blocks(tokens: Tok[] | undefined, ctx: Ctx): Block[] {
  const out: Block[] = [];
  if (!tokens) return out;
  for (const t of tokens) out.push(...block(t, ctx));
  return out;
}

function block(t: Tok, ctx: Ctx): Block[] {
  switch (t.type) {
    case "heading":
      return [
        new Paragraph({
          heading: HEADINGS[Math.min(Math.max(t.depth, 1), 6) - 1],
          children: inline(t.tokens ?? [{ type: "text", text: t.text }]),
          spacing: { before: 240, after: 120 },
        }),
      ];

    case "paragraph":
    case "text": // liberal listelerde / alıntılarda blok düzeyinde metin
      return [
        new Paragraph({
          children: inline(t.tokens ?? [{ type: "text", text: t.text }], inlineStyleFor(ctx)),
          spacing: { after: 140 },
          ...(ctx.indent ? { indent: { left: ctx.indent } } : {}),
          ...quoteProps(ctx),
        }),
      ];

    case "code": {
      const lines: string[] = String(t.text ?? "").split("\n");
      return lines.map(
        (line, i) =>
          new Paragraph({
            children: [new TextRun({ text: line || " ", font: "Consolas", size: 20 })],
            shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" },
            spacing: { before: i === 0 ? 80 : 0, after: i === lines.length - 1 ? 160 : 0 },
            ...(ctx.indent ? { indent: { left: ctx.indent } } : {}),
          })
      );
    }

    case "blockquote":
      return blocks(t.tokens, { ...ctx, quoteDepth: ctx.quoteDepth + 1 });

    case "list":
      return list(t, 0, ctx);

    case "table":
      return table(t);

    case "hr":
      return [
        new Paragraph({
          children: [],
          border: { bottom: { color: BORDER_COLOR, space: 1, style: BorderStyle.SINGLE, size: 6 } },
          spacing: { before: 120, after: 160 },
        }),
      ];

    case "space":
    case "html":
    case "def":
      return [];

    default:
      if (t.tokens) {
        return [new Paragraph({ children: inline(t.tokens), spacing: { after: 140 } })];
      }
      if (typeof t.text === "string" && t.text.trim()) {
        return [new Paragraph({ children: [new TextRun({ text: decodeEntities(t.text) })], spacing: { after: 140 } })];
      }
      return [];
  }
}

function list(token: Tok, level: number, ctx: Ctx): Block[] {
  const out: Block[] = [];
  const ordered = !!token.ordered;
  const reference = ordered ? "ordered" : "bullets";
  const instance = ordered ? ++ctx.orderedInstance.n : 0;
  const lvl = Math.min(level, MAX_LIST_LEVEL);
  const childIndent = 720 + lvl * 360;

  for (const item of token.items as Tok[]) {
    const children: Tok[] = item.tokens ?? [];
    let bulletDone = false;

    const pushBullet = (inlineTokens: Tok[] | undefined) => {
      const hasCheckboxToken = (inlineTokens ?? []).some((x: Tok) => x.type === "checkbox");
      const prefix: Inline[] =
        item.task && !hasCheckboxToken ? [new TextRun({ text: item.checked ? "☑ " : "☐ " })] : [];
      out.push(
        new Paragraph({
          children: [...prefix, ...inline(inlineTokens)],
          numbering: { reference, level: lvl, ...(ordered ? { instance } : {}) },
          spacing: { after: 80 },
        })
      );
      bulletDone = true;
    };

    for (const child of children) {
      if (!bulletDone && (child.type === "text" || child.type === "paragraph")) {
        pushBullet(child.tokens ?? [{ type: "text", text: child.text }]);
      } else if (child.type === "list") {
        if (!bulletDone) pushBullet([]); // öğe doğrudan alt liste ile başlıyorsa boş madde işareti
        out.push(...list(child, level + 1, ctx));
      } else if (child.type !== "space") {
        if (!bulletDone) pushBullet([]);
        out.push(...block(child, { ...ctx, indent: childIndent }));
      }
    }
    if (!bulletDone) pushBullet([]);
  }
  return out;
}

function cellAlign(a: string | null | undefined) {
  if (a === "center") return AlignmentType.CENTER;
  if (a === "right") return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function table(token: Tok): Block[] {
  const header: Tok[] = token.header ?? [];
  const cols = Math.max(header.length, 1);
  const colWidth = Math.floor(CONTENT_WIDTH / cols);
  const aligns: (string | null)[] = token.align ?? [];
  const bd = { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR };

  const makeCell = (cell: Tok, i: number, isHeader: boolean) =>
    new TableCell({
      width: { size: colWidth, type: WidthType.DXA },
      shading: isHeader ? { type: ShadingType.CLEAR, fill: "EAECEF", color: "auto" } : undefined,
      children: [
        new Paragraph({
          alignment: cellAlign(aligns[i]),
          children: inline(cell.tokens ?? [{ type: "text", text: cell.text }], isHeader ? { bold: true } : {}),
        }),
      ],
    });

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: header.map((c, i) => makeCell(c, i, true)),
    }),
    ...(token.rows as Tok[][]).map(
      (row) => new TableRow({ children: row.map((c, i) => makeCell(c, i, false)) })
    ),
  ];

  return [
    new Table({
      rows,
      width: { size: colWidth * cols, type: WidthType.DXA },
      columnWidths: Array(cols).fill(colWidth),
      borders: {
        top: bd,
        bottom: bd,
        left: bd,
        right: bd,
        insideHorizontal: bd,
        insideVertical: bd,
      },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    }),
    new Paragraph({ children: [], spacing: { after: 120 } }),
  ];
}

// ---------------------------------------------------------------------------
// Dışa aktarma
// ---------------------------------------------------------------------------

function numberingConfig() {
  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (l: number) => string) =>
    Array.from({ length: MAX_LIST_LEVEL + 1 }, (_, level) => ({
      level,
      format,
      text: text(level),
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
    }));

  return {
    config: [
      { reference: "bullets", levels: levels(LevelFormat.BULLET, (l) => ["•", "◦", "▪"][l % 3]) },
      { reference: "ordered", levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
    ],
  };
}

export async function markdownToDocxBytes(markdown: string): Promise<Uint8Array> {
  const tokens = marked.lexer(markdown);
  const ctx: Ctx = { orderedInstance: { n: 0 }, quoteDepth: 0, indent: 0 };
  const children = blocks(tokens as Tok[], ctx);

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    numbering: numberingConfig(),
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
          },
        },
        // Boş belge geçersiz olmasın diye en az bir paragraf
        children: children.length ? children : [new Paragraph({ children: [] })],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
