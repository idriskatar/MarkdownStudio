import { marked } from "marked";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

function parseInlineTokens(tokens: any[]): TextRun[] {
  const runs: TextRun[] = [];
  if (!tokens) return runs;

  for (const t of tokens) {
    if (t.type === "text" || t.type === "escape") {
      runs.push(new TextRun({ text: t.text }));
    } else if (t.type === "strong") {
      runs.push(new TextRun({ text: t.text, bold: true }));
    } else if (t.type === "em") {
      runs.push(new TextRun({ text: t.text, italics: true }));
    } else if (t.type === "codespan") {
      runs.push(
        new TextRun({
          text: t.text,
          font: "Consolas",
          shading: { fill: "F0F0F0" },
        })
      );
    } else if (t.type === "link") {
      runs.push(
        new TextRun({
          text: t.text,
          color: "0969DA",
          underline: {},
        })
      );
    } else if (t.tokens) {
      runs.push(...parseInlineTokens(t.tokens));
    } else if (t.raw) {
      runs.push(new TextRun({ text: t.raw }));
    }
  }
  return runs;
}

export async function markdownToDocxBytes(markdown: string): Promise<Uint8Array> {
  const tokens = marked.lexer(markdown);
  const children: (Paragraph | Table)[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const levels: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          1: HeadingLevel.HEADING_1,
          2: HeadingLevel.HEADING_2,
          3: HeadingLevel.HEADING_3,
          4: HeadingLevel.HEADING_4,
          5: HeadingLevel.HEADING_5,
          6: HeadingLevel.HEADING_6,
        };
        children.push(
          new Paragraph({
            heading: levels[token.depth] || HeadingLevel.HEADING_1,
            children: token.tokens
              ? parseInlineTokens(token.tokens)
              : [new TextRun({ text: token.text, bold: true })],
            spacing: { before: 240, after: 120 },
          })
        );
        break;
      }

      case "paragraph": {
        children.push(
          new Paragraph({
            children: token.tokens
              ? parseInlineTokens(token.tokens)
              : [new TextRun({ text: token.text })],
            spacing: { after: 140 },
          })
        );
        break;
      }

      case "code": {
        const lines = token.text.split("\n");
        lines.forEach((line: string) => {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line || " ",
                  font: "Consolas",
                  size: 20,
                }),
              ],
              shading: { fill: "F6F8FA" },
              spacing: { before: 20, after: 20 },
            })
          );
        });
        break;
      }

      case "blockquote": {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: token.text,
                italics: true,
                color: "57606A",
              }),
            ],
            indent: { left: 480 },
            border: {
              left: {
                color: "D0D7DE",
                space: 10,
                style: BorderStyle.SINGLE,
                size: 18,
              },
            },
            spacing: { before: 120, after: 120 },
          })
        );
        break;
      }

      case "list": {
        token.items.forEach((item: any, idx: number) => {
          const prefix = token.ordered ? `${idx + 1}. ` : "• ";
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: prefix, bold: true }),
                ...(item.tokens
                  ? parseInlineTokens(item.tokens)
                  : [new TextRun({ text: item.text })]),
              ],
              indent: { left: 360 },
              spacing: { after: 80 },
            })
          );
        });
        break;
      }

      case "table": {
        const rows: TableRow[] = [];
        // Header row
        rows.push(
          new TableRow({
            children: token.header.map(
              (cell: any) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cell.text, bold: true })],
                    }),
                  ],
                  shading: { fill: "EAECEF" },
                })
            ),
          })
        );
        // Body rows
        for (const row of token.rows) {
          rows.push(
            new TableRow({
              children: row.map(
                (cell: any) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: cell.text })],
                      }),
                    ],
                  })
              ),
            })
          );
        }
        children.push(
          new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
        break;
      }

      default:
        break;
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
