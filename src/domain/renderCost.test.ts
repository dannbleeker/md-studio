import { describe, expect, it } from 'vitest';
import { tooCostlyToRender } from './renderCost';

describe('tooCostlyToRender', () => {
  it('accepts ordinary notes', () => {
    const note = [
      '# Title',
      '',
      'Some *emphasis*, **strong**, ~~gone~~ and snake_case words.',
      '',
      '- one **a**',
      '  - nested _b_',
      '    - deeper',
      '',
      '| a | b | c |',
      '| - | - | - |',
      '| 1 | 2 | 3 |',
    ].join('\n');
    expect(tooCostlyToRender(note)).toBe(false);
  });

  it('accepts a long tight list whose items each use emphasis', () => {
    expect(tooCostlyToRender('- **bold** and *it*\n'.repeat(2000))).toBe(false);
    expect(tooCostlyToRender('1. **bold** and *it*\n'.repeat(2000))).toBe(false);
    // Separate paragraphs add up to nothing, however many.
    expect(tooCostlyToRender('word *a* b\n\n'.repeat(5000))).toBe(false);
  });

  it('refuses a paragraph with thousands of emphasis delimiters', () => {
    for (const unit of ['*a', '_a', '~a']) {
      expect(tooCostlyToRender(unit.repeat(5000))).toBe(true);
      // Split over lines it is still one paragraph.
      expect(tooCostlyToRender(`${unit}\n`.repeat(5000))).toBe(true);
    }
    expect(tooCostlyToRender('*a'.repeat(400))).toBe(false);
  });

  it('refuses lists nested far past real documents, and keeps deep but plausible ones', () => {
    const nested = (depth: number) =>
      Array.from({ length: depth }, (_, i) => `${'  '.repeat(i)}- a`).join('\n');
    expect(tooCostlyToRender(nested(300))).toBe(true);
    expect(tooCostlyToRender(nested(20))).toBe(false);
    expect(tooCostlyToRender(`${'\t'.repeat(40)}1. a`)).toBe(true);
  });

  it('refuses a table row with hundreds of cells', () => {
    expect(tooCostlyToRender(`|${' a |'.repeat(3300)}\n|${' - |'.repeat(3300)}`)).toBe(true);
    expect(tooCostlyToRender(`|${' a |'.repeat(40)}\n|${' - |'.repeat(40)}`)).toBe(false);
  });

  it('refuses a long run of the structures the parser takes quadratic time on', () => {
    // Each of these is slow only when it goes on for thousands of lines: 50,000 characters
    // took 5 to 35 seconds to parse.
    for (const unit of [
      'a\n---\n',
      'a\n===\n',
      '- > a\n',
      '- a\n  - b\n',
      '> a\nb\n',
      '1. a\n   1. b\n',
    ]) {
      expect(tooCostlyToRender(unit.repeat(Math.ceil(50_000 / unit.length)))).toBe(true);
    }
  });

  it('refuses one line of list markers nested far past real documents', () => {
    for (const unit of ['1. ', '2020. ', '- ', '> ', '- > ']) {
      expect(tooCostlyToRender(unit.repeat(2000))).toBe(true);
    }
    expect(tooCostlyToRender('- '.repeat(10))).toBe(false);
  });

  it('accepts structure that stays shallow, or that blank lines keep apart', () => {
    // A long outline, one separate quote or setext heading after another: nothing builds up.
    expect(tooCostlyToRender('- a\n  - b\n'.repeat(500))).toBe(false);
    expect(tooCostlyToRender('> quote\n\n'.repeat(3000))).toBe(false);
    expect(tooCostlyToRender('Heading\n-------\n\ntext\n\n'.repeat(3000))).toBe(false);
    expect(tooCostlyToRender('> a\nb\n\nc\n\n'.repeat(3000))).toBe(false);
  });
});
