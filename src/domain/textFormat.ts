/**
 * How a file on disk spells its text, so a save writes it back the same
 * way. The editors work in LF only (CodeMirror joins lines with "\n"), so a
 * Windows file would otherwise come back with every line ending changed,
 * or, after a visual edit that keeps untouched blocks verbatim, with LF and
 * CRLF mixed in one file. A UTF-8 byte-order mark is kept the same way,
 * and so is the character encoding: an older Windows file or a UTF-16 one
 * read as UTF-8 would show replacement characters, and saving would write
 * those over the real letters.
 */
export type TextFormat = {
  lineEnding: '\n' | '\r\n';
  bom: boolean;
  /** Absent: UTF-8 (documents stored before encodings were tracked have none). */
  encoding?: TextEncodingName;
};

/** The non-UTF-8 encodings a file is read in and written back as. */
export type TextEncodingName = 'utf-16le' | 'utf-16be' | 'windows-1252';

export const TEXT_ENCODINGS: readonly TextEncodingName[] = ['utf-16le', 'utf-16be', 'windows-1252'];

export const PLAIN_TEXT: TextFormat = { lineEnding: '\n', bom: false };

const BOM = '﻿';

/**
 * The editor's text and the file's format. Line endings are whichever the
 * file uses most (a file that mixes them is saved with that one).
 */
export function readText(raw: string): { markdown: string; format: TextFormat } {
  const bom = raw.startsWith(BOM);
  const text = bom ? raw.slice(1) : raw;
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
  return {
    markdown: text.replace(/\r\n?/g, '\n'),
    format: { lineEnding: crlf > lf ? '\r\n' : '\n', bom },
  };
}

/** The text as the file should hold it. */
export function writeText(markdown: string, format: TextFormat = PLAIN_TEXT): string {
  const body = format.lineEnding === '\r\n' ? markdown.replace(/\r?\n/g, '\r\n') : markdown;
  return format.bom ? BOM + body : body;
}

/**
 * Bytes 0x80–0x9F in Windows-1252. The five bytes it leaves undefined map
 * to the C1 control of the same number (as browsers decode them), so they
 * survive a round trip too.
 */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
const CP1252_BYTE = new Map(CP1252_HIGH.map((code, i) => [code, 0x80 + i]));

/** Builds a string from char codes in slices, so a large file can't overflow the call stack. */
function fromCodes(codes: Uint16Array): string {
  let out = '';
  for (let i = 0; i < codes.length; i += 8192) {
    out += String.fromCharCode(...codes.subarray(i, i + 8192));
  }
  return out;
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const units = new Uint16Array(bytes.length >> 1);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < units.length; i++) units[i] = view.getUint16(i * 2, littleEndian);
  // An odd trailing byte is not a character; show that something is there.
  return fromCodes(units) + (bytes.length % 2 ? '�' : '');
}

function decodeCp1252(bytes: Uint8Array): string {
  const codes = new Uint16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    codes[i] = b >= 0x80 && b < 0xa0 ? (CP1252_HIGH[b - 0x80] as number) : b;
  }
  return fromCodes(codes);
}

/** Null when the text has a character Windows-1252 can't hold. */
function encodeCp1252(text: string): Uint8Array<ArrayBuffer> | null {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const byte = code < 0x80 || (code >= 0xa0 && code <= 0xff) ? code : CP1252_BYTE.get(code);
    if (byte === undefined) return null;
    out[i] = byte;
  }
  return out;
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), littleEndian);
  return out;
}

/**
 * A file's bytes as the editors' text, and its format. A UTF-16 BOM names
 * that encoding; otherwise the bytes are UTF-8 if they are valid UTF-8 and
 * Windows-1252 (what older Windows editors write) if not, which is never
 * wrong for a single byte: every byte is a character there.
 */
export function decodeText(bytes: Uint8Array): { markdown: string; format: TextFormat } {
  const utf16: TextEncodingName | null =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : null;
  if (utf16) {
    // The BOM stays in the decoded text, so readText records it.
    const read = readText(decodeUtf16(bytes, utf16 === 'utf-16le'));
    return { markdown: read.markdown, format: { ...read.format, encoding: utf16 } };
  }
  try {
    // ignoreBOM keeps a UTF-8 BOM in the text (rather than dropping it) so it is written back.
    return readText(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    const read = readText(decodeCp1252(bytes));
    return { markdown: read.markdown, format: { ...read.format, encoding: 'windows-1252' } };
  }
}

/**
 * The bytes to write, and the format they are in: the file's own unless the
 * text has a character its encoding can't hold, in which case it is UTF-8
 * (without a BOM) rather than losing that character.
 */
export function encodeText(
  markdown: string,
  format: TextFormat = PLAIN_TEXT
): { bytes: Uint8Array<ArrayBuffer>; format: TextFormat } {
  const { encoding } = format;
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    // UTF-16 can't be told apart from other bytes without its BOM.
    const withBom = { ...format, bom: true };
    return {
      bytes: encodeUtf16(writeText(markdown, withBom), encoding === 'utf-16le'),
      format: withBom,
    };
  }
  if (encoding === 'windows-1252') {
    const bytes = encodeCp1252(writeText(markdown, format));
    if (bytes) return { bytes, format };
  }
  const utf8: TextFormat =
    encoding === undefined ? format : { lineEnding: format.lineEnding, bom: false };
  return { bytes: new TextEncoder().encode(writeText(markdown, utf8)), format: utf8 };
}
