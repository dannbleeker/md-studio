import { describe, expect, it } from 'vitest';
import { dropEmptyLineMarkers } from './emptyLines';

describe('dropEmptyLineMarkers', () => {
  it('drops empty paragraphs the visual pane wrote as <br />', () => {
    expect(dropEmptyLineMarkers('a\n\n<br />\n\nX\n\nb\n')).toBe('a\n\nX\n\nb\n');
    expect(dropEmptyLineMarkers('a\n\n<br />\n\n<br />\n\nb\n')).toBe('a\n\nb\n');
    expect(dropEmptyLineMarkers('a\n\n<br />\n')).toBe('a\n');
  });

  it('leaves empty list items empty', () => {
    expect(dropEmptyLineMarkers('* a\n* <br />\n* b\n')).toBe('* a\n*\n* b\n');
    expect(dropEmptyLineMarkers('1. <br />\n   * c\n')).toBe('1.\n   * c\n');
  });

  it('keeps <br /> the user wrote inside text or code', () => {
    expect(dropEmptyLineMarkers('line<br />\nnext\n')).toBe('line<br />\nnext\n');
    expect(dropEmptyLineMarkers('```html\n\n<br />\n\n```\n')).toBe('```html\n\n<br />\n\n```\n');
  });
});
