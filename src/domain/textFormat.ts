/**
 * How a file on disk spells its text, so a save writes it back the same
 * way. The editors work in LF only (CodeMirror joins lines with "\n"), so a
 * Windows file would otherwise come back with every line ending changed,
 * or, after a visual edit that keeps untouched blocks verbatim, with LF and
 * CRLF mixed in one file. A UTF-8 byte-order mark is kept the same way.
 */
export type TextFormat = { lineEnding: '\n' | '\r\n'; bom: boolean };

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
