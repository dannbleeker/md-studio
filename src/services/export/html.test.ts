import { describe, expect, it } from 'vitest';
import type { ExportImage } from './exportImages';
import { markdownToHtml } from './html';

describe('markdownToHtml', () => {
  it('renders Markdown into a standalone themed page', () => {
    const html = markdownToHtml('# Hi\n\n| a |\n| - |\n| 1 |', 'Notes <1>', 'dark');
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Notes &lt;1&gt;</title>');
    expect(html).toContain('<h1 id="hi">Hi</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('color-scheme:dark');
    expect(html).not.toContain('prefers-color-scheme');
  });

  it('follows the reader’s system theme in auto mode', () => {
    expect(markdownToHtml('x', 't', 'auto')).toContain('@media (prefers-color-scheme:dark)');
  });

  it('declares a policy that forbids any script in the exported page', () => {
    const html = markdownToHtml('# Hi', 'T', 'light');
    expect(html).toContain(
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'">`
    );
  });

  it('shows raw HTML as text instead of rendering it', () => {
    const html = markdownToHtml(
      '<script>alert(1)</script>\n\nok <b onclick="x()">b</b>',
      't',
      'light'
    );
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<b onclick');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops script-capable link and image targets but keeps their text', () => {
    const html = markdownToHtml(
      '[bad](javascript:alert(1)) [good](https://x.dk) [rel](notes.md) ![pic](data:image/svg+xml,x)',
      't',
      'light'
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:image');
    expect(html).toContain('bad');
    expect(html).toContain('<a href="https://x.dk">good</a>');
    expect(html).toContain('<a href="notes.md">rel</a>');
  });

  it('keeps pasted raster images and drops SVG data', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const html = markdownToHtml(
      `![dot](${png}) ![svg](data:image/svg+xml;base64,PHN2Zz4=)`,
      'T',
      'auto'
    );
    expect(html).toContain(`<img src="${png}" alt="dot">`);
    expect(html).not.toContain('svg+xml');
  });

  it('gives headings unique anchor ids so in-page links work', () => {
    const html = markdownToHtml(
      '## Get *started*\n\n[go](#get-started)\n\n## Get started\n\n## Ærø & co.',
      't',
      'light'
    );
    expect(html).toContain('<h2 id="get-started">Get <em>started</em></h2>');
    expect(html).toContain('<h2 id="get-started-1">Get started</h2>');
    expect(html).toContain('<h2 id="ærø-co">');
    expect(html).toContain('href="#get-started"');
  });

  it('honours table column alignment', () => {
    const html = markdownToHtml('| L | C | R |\n|:--|:-:|--:|\n| 1 | 2 | 3 |', 't', 'light');
    expect(html).toContain('<td align="center">2</td>');
    expect(html).toContain('[align=center]{text-align:center}');
    expect(html).not.toContain('text-align:left');
  });

  it('prints in light colours whatever the theme', () => {
    expect(markdownToHtml('x', 't', 'dark')).toMatch(/@media print\{:root\{--bg:#fafbfc/);
  });

  it('gives every heading a unique id, even against numbered ones', () => {
    const html = markdownToHtml('# a\n\n# a\n\n# a-1', 'T', 'light');
    const ids = [...html.matchAll(/<h1 id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(3);
  });

  describe('images', () => {
    const PNG = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    );
    const image = (extra: Partial<ExportImage> = {}): ExportImage => ({
      type: 'png',
      bytes: PNG,
      width: 1,
      height: 1,
      ...extra,
    });

    it('keeps web images out when the privacy setting says so', () => {
      for (const src of [
        'https://x.dk/a.png',
        '//cdn.x.dk/a.png',
        'http:/x.dk/a.png',
        'HTTP:x.dk/a.png',
      ]) {
        const off = markdownToHtml(`![shot](${src})`, 't', 'light', undefined, false);
        expect(off).not.toContain('<img');
        expect(off).not.toContain(src);
        expect(off).toContain('shot');
        const on = markdownToHtml(`![shot](${src})`, 't', 'light', undefined, true);
        expect(on).toContain(`<img src="${src}"`);
      }
    });

    it('never writes a network-share or scheme-hiding target as an image source', () => {
      for (const md of [
        '![x](\\\\\\\\evil.example/a.png)',
        '![x](<\\evil.example/a.png>)',
        '![x](ht&#9;tps://evil.example/a.png)',
      ]) {
        for (const web of [true, false]) {
          const html = markdownToHtml(md, 't', 'light', undefined, web);
          expect(html, md).not.toContain('<img');
          expect(html, md).not.toContain('evil.example');
        }
      }
    });

    it('names the file when a hidden web image has no alt', () => {
      const html = markdownToHtml(
        '![](https://x.dk/dir/a%20b.png)',
        't',
        'light',
        undefined,
        false
      );
      expect(html).toContain('a b.png');
      expect(html).not.toContain('<img');
    });

    it('embeds loaded images as data URIs with their display size', () => {
      const href = 'attachment:img/a.png#size=300x200';
      const html = markdownToHtml(
        `![a <pic>](${href})`,
        't',
        'light',
        new Map([[href, image({ displayWidth: 300, displayHeight: 200 })]])
      );
      expect(html).toMatch(
        /<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="a &lt;pic&gt;" width="300" height="200">/
      );
    });

    it('writes the width alone when only the width was asked for', () => {
      const href = 'attachment:a.png#size=300';
      const html = markdownToHtml(
        `![](${href})`,
        't',
        'light',
        new Map([[href, image({ displayWidth: 300 })]])
      );
      expect(html).toContain(' width="300">');
      expect(html).not.toContain('height="');
    });

    it('prints the alt text, never a link, for an attachment that was not loaded', () => {
      const html = markdownToHtml(
        '![a photo](attachment:img/a.png#size=300)\n\n![](attachment:img/b%20c.png)',
        't',
        'light'
      );
      expect(html).not.toContain('<img');
      expect(html).not.toContain('attachment:');
      expect(html).toContain('a photo');
      expect(html).toContain('b c.png');
    });

    it('stops embedding past the size guards', () => {
      const big = new Uint8Array(5 * 1024 * 1024 + 1);
      const hrefs = ['attachment:big.png', 'attachment:a.png', 'attachment:b.png'];
      const images = new Map(
        hrefs.map((h, i) => [h, i === 0 ? image({ bytes: big }) : image()] as const)
      );
      const html = markdownToHtml(
        hrefs.map((h) => `![x${h}](${h})`).join('\n\n'),
        't',
        'light',
        images
      );
      expect(html).not.toContain('xattachment:big.png"');
      expect(html.match(/<img /g)).toHaveLength(2);

      const mid = new Uint8Array(4 * 1024 * 1024);
      const many = Array.from({ length: 8 }, (_, i) => `attachment:m${i}.png`);
      const crowded = markdownToHtml(
        many.map((h) => `![](${h})`).join('\n\n'),
        't',
        'light',
        new Map(many.map((h) => [h, image({ bytes: mid })] as const))
      );
      // 25 MB total: six 4 MB images fit, the rest fall back to their names.
      expect(crowded.match(/<img /g)).toHaveLength(6);
    });
  });
});
