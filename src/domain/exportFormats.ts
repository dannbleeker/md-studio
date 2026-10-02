/**
 * The formats Export can write. Export never changes which file the
 * document is linked to; it writes a separate copy in another format.
 */
export type ExportFormat = 'html' | 'pdf' | 'docx' | 'txt';
export type HtmlTheme = 'light' | 'dark' | 'auto';

export type ExportFormatInfo = {
  id: ExportFormat;
  extension: string;
  mime: string;
  /** For the save dialog's file-type list. */
  description: string;
};

export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  { id: 'html', extension: '.html', mime: 'text/html', description: 'Web page' },
  { id: 'pdf', extension: '.pdf', mime: 'application/pdf', description: 'PDF document' },
  {
    id: 'docx',
    extension: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    description: 'Word document',
  },
  { id: 'txt', extension: '.txt', mime: 'text/plain', description: 'Plain text' },
];

export function formatInfo(id: ExportFormat): ExportFormatInfo {
  const info = EXPORT_FORMATS.find((f) => f.id === id);
  if (!info) throw new Error(`Unknown export format: ${id}`);
  return info;
}

/**
 * "notes.md" → "notes.pdf"; keeps dots inside the name ("v1.2 notes.md" →
 * "v1.2 notes.pdf"). An opened text file loses its ".txt" too.
 */
export function exportFileName(fileName: string, format: ExportFormat): string {
  const base = fileName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '').trim() || 'Untitled';
  return `${base}${formatInfo(format).extension}`;
}
