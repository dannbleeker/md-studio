import { describe, expect, it } from 'vitest';
import { PLAIN_TEXT, readText, writeText } from './textFormat';

describe('text format', () => {
  it('reads Windows text as LF and remembers to write it back as CRLF', () => {
    const { markdown, format } = readText('# T\r\n\r\nline\r\n');
    expect(markdown).toBe('# T\n\nline\n');
    expect(format).toEqual({ lineEnding: '\r\n', bom: false });
    expect(writeText(`${markdown}more\n`, format)).toBe('# T\r\n\r\nline\r\nmore\r\n');
  });

  it('keeps a byte-order mark', () => {
    const { markdown, format } = readText('﻿# T\n');
    expect(markdown).toBe('# T\n');
    expect(writeText(markdown, format)).toBe('﻿# T\n');
  });

  it('leaves plain LF text alone, and saves mixed endings as the majority', () => {
    expect(readText('a\nb\n')).toEqual({ markdown: 'a\nb\n', format: PLAIN_TEXT });
    expect(readText('a\r\nb\r\nc\n').format.lineEnding).toBe('\r\n');
    expect(readText('a\nb\nc\r\n').format.lineEnding).toBe('\n');
    expect(readText('old\rmac').markdown).toBe('old\nmac');
    expect(writeText('a\nb')).toBe('a\nb');
  });
});
