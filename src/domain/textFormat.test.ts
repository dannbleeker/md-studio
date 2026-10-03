import { describe, expect, it } from 'vitest';
import { decodeText, encodeText, PLAIN_TEXT, readText, writeText } from './textFormat';

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

describe('text encoding', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  const utf16le = (s: string) => {
    const out = [0xff, 0xfe];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff, s.charCodeAt(i) >> 8);
    return new Uint8Array(out);
  };

  it('reads UTF-8, keeping its BOM, and writes it back byte for byte', () => {
    const file = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Æble\r\n')]);
    const { markdown, format } = decodeText(file);
    expect(markdown).toBe('Æble\n');
    expect(format).toEqual({ lineEnding: '\r\n', bom: true });
    const saved = encodeText(markdown, format);
    expect(saved.format).toEqual(format);
    expect([...saved.bytes]).toEqual([...file]);
  });

  it('reads bytes that are not UTF-8 as Windows-1252 and writes them back the same', () => {
    // "Æble på – €" in Windows-1252.
    const file = bytes(0xc6, 0x62, 0x6c, 0x65, 0x20, 0x70, 0xe5, 0x20, 0x96, 0x20, 0x80, 0x0a);
    const { markdown, format } = decodeText(file);
    expect(markdown).toBe('Æble på – €\n');
    expect(format.encoding).toBe('windows-1252');
    expect(encodeText(markdown, format).bytes).toEqual(file);
    // Bytes Windows-1252 leaves undefined still round-trip.
    expect(encodeText(decodeText(bytes(0x81, 0x9d, 0xff)).markdown, format).bytes).toEqual(
      bytes(0x81, 0x9d, 0xff)
    );
  });

  it('falls back to UTF-8 when the text has a character Windows-1252 lacks', () => {
    const { format } = decodeText(bytes(0xe6, 0x0d, 0x0a));
    expect(format).toEqual({ lineEnding: '\r\n', bom: false, encoding: 'windows-1252' });
    const saved = encodeText('æ ✓\n', format);
    expect(saved.format).toEqual({ lineEnding: '\r\n', bom: false });
    expect(new TextDecoder().decode(saved.bytes)).toBe('æ ✓\r\n');
  });

  it('reads UTF-16 by its BOM, both byte orders, and writes it back with the BOM', () => {
    const le = utf16le('# Æble\r\n😀');
    const read = decodeText(le);
    expect(read.markdown).toBe('# Æble\n😀');
    expect(read.format).toEqual({ lineEnding: '\r\n', bom: true, encoding: 'utf-16le' });
    expect(encodeText(read.markdown, read.format).bytes).toEqual(le);

    const be = new Uint8Array(le.length);
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1] as number;
      be[i + 1] = le[i] as number;
    }
    const readBe = decodeText(be);
    expect(readBe.markdown).toBe('# Æble\n😀');
    expect(readBe.format.encoding).toBe('utf-16be');
    expect(encodeText(readBe.markdown, readBe.format).bytes).toEqual(be);
  });
});
