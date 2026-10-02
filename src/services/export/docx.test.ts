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

  it('embeds images it is given and keeps alt text for the rest', async () => {
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    );
    const images = new Map([
      ['dot.png', { type: 'png' as const, bytes: png, width: 1, height: 1 }],
    ]);
    const zip = await JSZip.loadAsync(
      await Packer.toBuffer(markdownToDocxDocument('![dot](dot.png) ![gone](web.png)', 'T', images))
    );
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(xml).toContain('descr="dot"');
    expect(xml).toContain('[gone]');
  });

  it('keeps task item text in its bullet', async () => {
    const xml = await documentXml('- [x] done item\n- [ ] todo item');
    expect(xml).toMatch(/☑ <\/w:t>.*?done item/s);
    // One paragraph per item: the text is not split off into its own paragraph.
    expect(xml.match(/<w:p>|<w:p /g)?.length).toBe(2);
  });

  it('numbers each ordered list on its own, from its start', async () => {
    const zip = await JSZip.loadAsync(
      await Packer.toBuffer(
        markdownToDocxDocument('1. a\n2. b\n\npara\n\n1. c\n\nmore\n\n5. five', 'T')
      )
    );
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const numIds = [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    expect(new Set(numIds).size).toBe(3);
    const numbering = (await zip.file('word/numbering.xml')?.async('string')) ?? '';
    expect(numbering).toContain('<w:start w:val="5"/>');
  });

  it('decodes named HTML entities', async () => {
    const xml = await documentXml('A &copy; B &mdash; C');
    expect(xml).toContain('A © B — C');
  });
});
