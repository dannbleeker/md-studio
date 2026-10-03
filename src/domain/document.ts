import { frontMatterEnd, frontMatterTitle } from './frontMatter';
import { PLAIN_TEXT, type TextFormat } from './textFormat';

/**
 * The one document both editors edit. `markdown` is the single source of
 * truth; the visual pane's ProseMirror tree and the text pane's CodeMirror
 * buffer are both projections of it.
 */
export type MdDocument = {
  markdown: string;
  /** Display name, e.g. "notes.md". */
  fileName: string;
  /** Markdown as last written to (or read from) disk; drives the dirty flag. */
  savedMarkdown: string;
  updatedAt: number;
  /** The file's line endings, BOM and encoding, to write it back the same way (absent: UTF-8, LF, no BOM). */
  format?: TextFormat;
};

export const UNTITLED = 'Untitled.md';

export function createDocument(
  markdown = '',
  fileName = UNTITLED,
  format?: TextFormat
): MdDocument {
  const doc: MdDocument = { markdown, fileName, savedMarkdown: markdown, updatedAt: Date.now() };
  return !format || isPlainText(format) ? doc : { ...doc, format };
}

/** The document saved in `format` from now on; plain text (UTF-8, LF, no BOM) leaves the field out. */
export function withFormat(doc: MdDocument, format: TextFormat): MdDocument {
  const { format: _previous, ...rest } = doc;
  return isPlainText(format) ? rest : { ...rest, format };
}

function isPlainText(format: TextFormat): boolean {
  return (
    format === PLAIN_TEXT ||
    (!format.bom && format.lineEnding === '\n' && format.encoding === undefined)
  );
}

export function isDirty(doc: MdDocument): boolean {
  return doc.markdown !== doc.savedMarkdown;
}

/**
 * Ensures a Markdown extension, and strips characters Windows rejects in
 * file names. An opened text file is saved as Markdown: "notes.txt" →
 * "notes.md", not "notes.txt.md".
 */
export function normalizeFileName(name: string): string {
  const cleaned =
    name
      .replace(/[<>:"/\\|?*]/g, '')
      .trim()
      .replace(/\.txt$/i, '') || UNTITLED;
  return /\.(md|markdown|mdown|mkd)$/i.test(cleaned) ? cleaned : `${cleaned}.md`;
}

/** First heading, else first non-empty line, used as a recent-list subtitle. */
export function documentTitle(markdown: string): string {
  const fromFrontMatter = frontMatterTitle(markdown);
  if (fromFrontMatter) return clip(fromFrontMatter);
  // Front matter without a title isn't the document's first line either.
  const end = frontMatterEnd(markdown);
  const body = end < 0 ? markdown : markdown.slice(end + 1);
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/^ {0,3}#{1,6}\s+/, '').trim();
    if (line) return clip(line);
  }
  return '';
}

const clip = (title: string) => (title.length > 80 ? `${title.slice(0, 79)}…` : title);
