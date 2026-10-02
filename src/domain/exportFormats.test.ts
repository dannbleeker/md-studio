import { describe, expect, it } from 'vitest';
import { EXPORT_FORMATS, exportFileName, formatInfo } from './exportFormats';

describe('exportFormats', () => {
  it('derives the export name from the document name', () => {
    expect(exportFileName('notes.md', 'pdf')).toBe('notes.pdf');
    expect(exportFileName('notes.txt', 'txt')).toBe('notes.txt');
    expect(exportFileName('notes.txt', 'html')).toBe('notes.html');
    expect(exportFileName('README.markdown', 'docx')).toBe('README.docx');
    expect(exportFileName('v1.2 plan.md', 'html')).toBe('v1.2 plan.html');
    expect(exportFileName('.md', 'txt')).toBe('Untitled.txt');
  });

  it('describes every format', () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(['html', 'pdf', 'docx', 'txt']);
    expect(formatInfo('docx').extension).toBe('.docx');
    expect(() => formatInfo('rtf' as never)).toThrow();
  });
});
