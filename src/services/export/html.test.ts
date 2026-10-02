import { describe, expect, it } from 'vitest';
import { markdownToHtml } from './html';

describe('markdownToHtml', () => {
  it('renders Markdown into a standalone themed page', () => {
    const html = markdownToHtml('# Hi\n\n| a |\n| - |\n| 1 |', 'Notes <1>', 'dark');
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Notes &lt;1&gt;</title>');
    expect(html).toContain('<h1>Hi</h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('color-scheme:dark');
    expect(html).not.toContain('prefers-color-scheme');
  });

  it('follows the reader’s system theme in auto mode', () => {
    expect(markdownToHtml('x', 't', 'auto')).toContain('@media (prefers-color-scheme:dark)');
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
});
