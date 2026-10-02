import { describe, expect, it } from 'vitest';
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
});
