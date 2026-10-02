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
  /** The file's line endings and BOM, to write it back the same way (absent: LF, no BOM). */
  format?: TextFormat;
};

export const UNTITLED = 'Untitled.md';

export function createDocument(
  markdown = '',
  fileName = UNTITLED,
  format?: TextFormat
): MdDocument {
  const doc: MdDocument = { markdown, fileName, savedMarkdown: markdown, updatedAt: Date.now() };
  return format && format !== PLAIN_TEXT && (format.bom || format.lineEnding !== '\n')
    ? { ...doc, format }
    : doc;
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
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.replace(/^ {0,3}#{1,6}\s+/, '').trim();
    if (line) return line.length > 80 ? `${line.slice(0, 79)}…` : line;
  }
  return '';
}
