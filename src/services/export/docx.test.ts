import { Packer } from 'docx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { markdownToDocxDocument } from './docx';

async function documentXml(markdown: string): Promise<string> {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(markdownToDocxDocument(markdown, 'T')));
  return (await zip.file('word/document.xml')?.async('string')) ?? '';
}

describe('markdownToDocx', () => {
  it('maps headings to Word heading styles', async () => {
    const xml = await documentXml('# Title\n\n### Small');
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading3"');
    expect(xml).toContain('Title');
  });

  it('keeps bold, italic, code and links as Word formatting', async () => {
    const xml = await documentXml('A **b** _i_ `c` [x](https://x.dk)');
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(xml).toContain('Consolas');
    expect(xml).toContain('w:hyperlink');
  });

  it('writes lists, tables and code blocks', async () => {
    const xml = await documentXml(
      '- one\n  - nested\n\n1. first\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```\nline1\nline2\n```'
    );
    expect(xml).toContain('w:numPr');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('line1');
    expect(xml).toContain('line2');
  });
});
