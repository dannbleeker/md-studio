import { describe, expect, it } from 'vitest';
import { forEachLine } from './lines';

const lines = (text: string, skipThrough?: number) => {
  const out: [string, number][] = [];
  forEachLine(text, (line, start) => out.push([line, start]), skipThrough);
  return out;
};

describe('forEachLine', () => {
  it('gives each line and its offset, with LF and CRLF endings dropped', () => {
    expect(lines('a\nbc\r\n\nd')).toEqual([
      ['a', 0],
      ['bc', 2],
      ['', 6],
      ['d', 7],
    ]);
  });

  it('gives an empty text one empty line, and a final newline one more', () => {
    expect(lines('')).toEqual([['', 0]]);
    expect(lines('a\n')).toEqual([
      ['a', 0],
      ['', 2],
    ]);
  });

  it('keeps a lone carriage return and skips lines up to an offset', () => {
    expect(lines('\r\nx')).toEqual([
      ['', 0],
      ['x', 2],
    ]);
    expect(lines('---\nt: 1\n---\nbody', 12)).toEqual([['body', 13]]);
  });
});
