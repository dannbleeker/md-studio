import { describe, expect, it } from 'vitest';
import { inlineFootnotes } from './footnotes';

describe('inlineFootnotes', () => {
  it('leaves documents without footnotes untouched', () => {
    const md = '# Title\n\nNo notes [here](x).\n';
    expect(inlineFootnotes(md)).toBe(md);
  });

  it('numbers references by first use and lists the notes at the end', () => {
    const md =
      'A claim.[^b] Another.[^a] Again.[^b]\n\n[^a]: First defined.\n[^b]: Second defined.\n';
    expect(inlineFootnotes(md)).toBe(
      'A claim.\\[1\\] Another.\\[2\\] Again.\\[1\\]\n\n---\n\n1. Second defined.\n2. First defined.\n'
    );
  });

  it('keeps multi-paragraph notes together', () => {
    const md =
      'Text.[^n]\n\n[^n]: Line one\n    still the note.\n\n    Second paragraph.\n\nAfter.\n';
    expect(inlineFootnotes(md)).toBe(
      'Text.\\[1\\]\n\n\nAfter.\n\n---\n\n1. Line one\n   still the note.\n\n   Second paragraph.\n'
    );
  });

  it('ignores code, unknown references and unused definitions', () => {
    const md = [
      'Use `[^x]` literally, see [^missing] and this.[^x]',
      '',
      '```',
      '[^x]: not a definition inside code',
      '```',
      '',
      '[^x]: Real note.',
      '[^unused]: Never referenced.',
    ].join('\n');
    expect(inlineFootnotes(md)).toBe(
      [
        'Use `[^x]` literally, see [^missing] and this.\\[1\\]',
        '',
        '```',
        '[^x]: not a definition inside code',
        '```',
        '',
        '---',
        '',
        '1. Real note.',
        '',
      ].join('\n')
    );
  });
});
