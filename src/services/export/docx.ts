import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  type ParagraphChild,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { decodeHTML } from 'entities';
import { marked, type Token, type Tokens } from 'marked';
import type { ExportImages } from './exportImages';

/**
 * Markdown → Word (.docx) with real Word structure: Heading 1–6 styles,
 * bulleted and numbered lists (nested), tables, monospace code blocks,
 * indented quotes and live hyperlinks, so the result is editable in Word
 * rather than a picture of the document.
 */

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const MONO = 'Consolas';
const ACCENT = '3D5170';
const CODE_FILL = 'F1F4F8';

type Style = { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean };

/** marked leaves named entities (&copy;, &nbsp;, &mdash;…) encoded in its tokens. */
const decode = (s: string) => decodeHTML(s);

/** A raw tab inside a text run is not a reliable tab in Word; it needs its own element. */
const withTabs = (text: string): (string | Tab)[] =>
  text.split('\t').flatMap((part, i) => (i === 0 ? [part] : [new Tab(), part]));

function run(text: string, style: Style): TextRun {
  return new TextRun({
    children: withTabs(text),
    bold: style.bold ?? false,
    italics: style.italics ?? false,
    strike: style.strike ?? false,
    ...(style.code
      ? { font: MONO, shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' } }
      : {}),
  });
}

function inline(tokens: Token[] | undefined, style: Style = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'strong':
        out.push(...inline((t as Tokens.Strong).tokens, { ...style, bold: true }));
        break;
      case 'em':
        out.push(...inline((t as Tokens.Em).tokens, { ...style, italics: true }));
        break;
      case 'del':
        out.push(...inline((t as Tokens.Del).tokens, { ...style, strike: true }));
        break;
      case 'codespan':
        out.push(run(decode((t as Tokens.Codespan).text), { ...style, code: true }));
        break;
      case 'link': {
        const link = t as Tokens.Link;
        const text = plain(link.tokens) || link.href;
        if (/^(https?:|mailto:)/i.test(link.href)) {
          out.push(
            new ExternalHyperlink({
              link: link.href,
              children: [new TextRun({ text, style: 'Hyperlink' })],
            })
          );
        } else {
          out.push(run(text, style));
        }
        break;
      }
      case 'image': {
        const image = t as Tokens.Image;
        const loaded = images.get(image.href);
        if (loaded) {
          // Pixel sizes; fit to the text width (about 6.3 in at 96 dpi).
          const scale = Math.min(1, MAX_IMAGE_PX / loaded.width);
          out.push(
            new ImageRun({
              type: loaded.type,
              data: loaded.bytes,
              transformation: {
                width: Math.round(loaded.width * scale),
                height: Math.round(loaded.height * scale),
              },
              altText: { name: image.text || 'image', description: image.text, title: image.text },
            })
          );
        } else {
          out.push(run(`[${image.text}]`, { ...style, italics: true }));
        }
        break;
      }
      case 'br':
        out.push(new TextRun({ break: 1 }));
        break;
      default:
        if ('tokens' in t && t.tokens) out.push(...inline(t.tokens, style));
        else if ('text' in t) out.push(run(decode(String(t.text)), style));
    }
  }
  return out;
}

function plain(tokens: Token[] | undefined): string {
  return (tokens ?? [])
    .map((t) =>
      'tokens' in t && t.tokens ? plain(t.tokens) : 'text' in t ? decode(String(t.text)) : ''
    )
    .join('');
}

function blocks(tokens: Token[], level = 0, quote = false): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const quoteBorder = {
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
  };
  // Everything inside a quote carries its bar and indent, lists and code included.
  const quoteProps = quote ? { indent: { left: QUOTE_INDENT }, ...quoteBorder } : {};
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const h = t as Tokens.Heading;
        out.push(
          new Paragraph({
            heading: HEADINGS[h.depth - 1] ?? HeadingLevel.HEADING_6,
            children: inline(h.tokens),
            ...quoteProps,
          })
        );
        break;
      }
      case 'paragraph':
        out.push(
          new Paragraph({
            children: inline((t as Tokens.Paragraph).tokens, quote ? { italics: true } : {}),
            ...quoteProps,
          })
        );
        break;
      case 'text':
        out.push(
          new Paragraph({
            children: inline('tokens' in t ? t.tokens : undefined, quote ? { italics: true } : {}),
            ...quoteProps,
          })
        );
        break;
      case 'list': {
        const list = t as Tokens.List;
        // Each ordered list, nested ones included, numbers on its own from
        // its own start (a later list restarts instead of continuing).
        const instance = list.ordered
          ? nextListInstance(typeof list.start === 'number' ? list.start : 1)
          : 0;
        for (const item of list.items) {
          // marked puts a task item's box first, as its own token.
          const [first, ...rest] = item.tokens.filter((tok) => tok.type !== 'checkbox');
          const children = first && 'tokens' in first ? inline(first.tokens) : [];
          if (item.task) children.unshift(new TextRun({ text: item.checked ? '☑ ' : '☐ ' }));
          out.push(
            new Paragraph({
              children,
              // A paragraph indent replaces the numbering's own, so in a
              // quote the list's indent is restated on top of the quote's.
              ...(quote
                ? {
                    ...quoteBorder,
                    indent: { left: QUOTE_INDENT + 720 * (level + 1), hanging: 360 },
                  }
                : {}),
              ...(list.ordered
                ? {
                    numbering: {
                      reference: numberingReference(instance),
                      level: Math.min(level, 8),
                      instance,
                    },
                  }
                : { bullet: { level: Math.min(level, 8) } }),
            })
          );
          out.push(...blocks(rest, level + 1, quote));
        }
        break;
      }
      case 'code':
        for (const line of (t as Tokens.Code).text.split('\n')) {
          out.push(
            new Paragraph({
              children: [new TextRun({ children: withTabs(line || ' '), font: MONO, size: 19 })],
              shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' },
              spacing: { after: 0 },
              ...quoteProps,
            })
          );
        }
        out.push(new Paragraph({ children: [] }));
        break;
      case 'blockquote':
        out.push(...blocks((t as Tokens.Blockquote).tokens, level, true));
        break;
      case 'table': {
        const table = t as Tokens.Table;
        // The column's alignment from the delimiter row (`:-:`, `--:`).
        const alignment = (i: number) =>
          table.align[i] === 'center'
            ? { alignment: AlignmentType.CENTER }
            : table.align[i] === 'right'
              ? { alignment: AlignmentType.END }
              : {};
        const row = (cells: Tokens.TableCell[], header: boolean) =>
          new TableRow({
            tableHeader: header,
            children: cells.map(
              (c, i) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: inline(c.tokens, header ? { bold: true } : {}),
                      ...alignment(i),
                    }),
                  ],
                  ...(header
                    ? { shading: { type: ShadingType.CLEAR, fill: CODE_FILL, color: 'auto' } }
                    : {}),
                })
            ),
          });
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [row(table.header, true), ...table.rows.map((r) => row(r, false))],
          })
        );
        out.push(new Paragraph({ children: [] }));
        break;
      }
      case 'hr':
        out.push(
          new Paragraph({
            children: [],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C8D0DC', space: 1 } },
          })
        );
        break;
      case 'html':
        out.push(
          new Paragraph({ children: [run((t as Tokens.HTML).text.trim(), { code: true })] })
        );
        break;
      default:
        break;
    }
  }
  return out;
}

const MAX_IMAGE_PX = 600;
/** A quote's left indent, in twips. */
const QUOTE_INDENT = 567;

/** Ordered-list numbering for the current conversion: instance -> start number. */
let listStarts = new Map<number, number>();
const nextListInstance = (start: number) => {
  const instance = listStarts.size + 1;
  listStarts.set(instance, start);
  return instance;
};
/** One numbering definition per start number; instances restart within it. */
const numberingReference = (instance: number) => `ordered-${listStarts.get(instance) ?? 1}`;
/** The current conversion's images; set per call (conversions run synchronously). */
let images: ExportImages = new Map();

export function markdownToDocxDocument(
  markdown: string,
  title: string,
  embedded: ExportImages = new Map()
): Document {
  images = embedded;
  listStarts = new Map();
  const children = blocks(marked.lexer(markdown));
  const starts = new Set([1, ...listStarts.values()]);
  return new Document({
    title,
    creator: 'MD Studio',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    numbering: {
      config: [...starts].map((start) => ({
        reference: `ordered-${start}`,
        levels: Array.from({ length: 9 }, (_, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          start,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      })),
    },
    sections: [{ children }],
  });
}

export function markdownToDocx(
  markdown: string,
  title: string,
  embedded: ExportImages = new Map()
): Promise<Blob> {
  return Packer.toBlob(markdownToDocxDocument(markdown, title, embedded));
}
