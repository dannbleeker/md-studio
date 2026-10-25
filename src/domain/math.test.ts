import { describe, expect, it } from 'vitest';
import { findMath, parseMathToken } from './math';

const raws = (text: string) => findMath(text).map((s) => s.raw);

describe('findMath', () => {
  it('finds inline and display math', () => {
    expect(findMath('Let $x^2 + y$ be, and\n\n$$\n\\int_0^1 f\n$$\n\ndone.')).toMatchObject([
      { raw: '$x^2 + y$', display: false, tex: 'x^2 + y' },
      { raw: '$$\n\\int_0^1 f\n$$', display: true, tex: '\\int_0^1 f' },
    ]);
  });

  it('keeps prices and other lone dollar signs as text', () => {
    for (const text of [
      'It costs $5 and $10 in total.',
      'Between $5, $10 and $20.',
      'US$ 5 or 5$ only',
      'a $ b $ c',
      'trailing $',
      '$',
      '$$',
      '$ x$',
      '$x $',
      '$x$5',
    ])
      expect(raws(text), text).toEqual([]);
  });

  it('lets a backslash make a dollar literal', () => {
    expect(raws('\\$x$ and $y\\$ z$')).toEqual(['$y\\$ z$']);
    expect(raws('cost \\$5 and \\$10')).toEqual([]);
  });

  it('keeps asterisks, underscores and backslashes inside the span as written', () => {
    expect(raws('$a*b*c$ and $x_1 + y_2$ and $\\{a\\}$ and $a \\\\ b$')).toEqual([
      '$a*b*c$',
      '$x_1 + y_2$',
      '$\\{a\\}$',
      '$a \\\\ b$',
    ]);
  });

  it('does not cross a blank line with inline math, but does with display math', () => {
    expect(raws('$a\n\nb$')).toEqual([]);
    expect(raws('$$a\n\nb$$')).toEqual(['$$a\n\nb$$']);
    expect(raws('$a\nb$')).toEqual(['$a\nb$']);
  });

  it('leaves code and front matter alone', () => {
    const md = '---\ntitle: $a$\n---\n`$b$` and\n```\n$c$ and $$d$$\n```\n    $e$\n\nreal $f$';
    expect(raws(md)).toEqual(['$f$']);
  });

  it('limits the length of a span', () => {
    expect(raws(`$${'a'.repeat(1100)}$`)).toEqual([]);
    expect(raws(`$$${'a'.repeat(21_000)}$$`)).toEqual([]);
  });

  it('is empty for an empty span and for text without dollars', () => {
    expect(raws('$$ $$ and $$$$')).toEqual([]);
    expect(raws('plain text')).toEqual([]);
  });

  it('stays linear on long runs of dollar signs', { tags: ['stress'] }, () => {
    const time = (text: string) => {
      const start = performance.now();
      findMath(text);
      return performance.now() - start;
    };
    for (const unit of ['$a ', '$a$ ', '$$', '$\\', '$a\n']) {
      time(unit.repeat(2000));
      const small = Math.max(time(unit.repeat(40_000)), 1);
      expect(time(unit.repeat(80_000)), unit).toBeLessThan(small * 6);
    }
  });
});

describe('parseMathToken', () => {
  it('accepts exactly one span', () => {
    expect(parseMathToken('$x$')).toEqual({ display: false, tex: 'x' });
    expect(parseMathToken('$$\ny\n$$')).toEqual({ display: true, tex: 'y' });
    expect(parseMathToken('$x$ and $y$')).toBeNull();
    expect(parseMathToken(' $x$')).toBeNull();
    expect(parseMathToken('x')).toBeNull();
  });
});
