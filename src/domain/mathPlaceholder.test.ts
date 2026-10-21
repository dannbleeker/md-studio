import { describe, expect, it } from 'vitest';
import { restorePlaceholders, splitPlaceholders, withMathPlaceholders } from './mathPlaceholder';

describe('math placeholders', () => {
  it('leaves text without math as it is, the same string', () => {
    const md = 'Plain $5 and $10, **bold** and `$x$`.';
    expect(withMathPlaceholders(md)).toBe(md);
    expect(withMathPlaceholders('no dollars')).toBe('no dollars');
  });

  it('turns every span into a word with no Markdown in it, and back', () => {
    const md = 'Let $a*b*c$ and $$\n\\int_0^1\n\n\\\\\n$$ hold, as in $x_1$.';
    const out = withMathPlaceholders(md);
    // Nothing the Markdown parser reads is left outside the words.
    expect(out).not.toMatch(/[$*\\_\n]/);
    const pieces = splitPlaceholders(out);
    expect(pieces.filter((p) => 'math' in p).map((p) => ('math' in p ? p.math : ''))).toEqual([
      '$a*b*c$',
      '$$\n\\int_0^1\n\n\\\\\n$$',
      '$x_1$',
    ]);
    expect(restorePlaceholders(out)).toBe(md);
  });

  it('carries unicode and astral characters exactly', () => {
    const md = 'Greek $α + 𝔛$ ok';
    expect(restorePlaceholders(withMathPlaceholders(md))).toBe(md);
  });

  it('does nothing to a document that already uses the marks', () => {
    const md = 'has  mark and $x$';
    expect(withMathPlaceholders(md)).toBe(md);
  });

  it('leaves a damaged placeholder as text', () => {
    expect(splitPlaceholders('a i00 b')).toEqual([{ text: 'a i00 b' }]);
    expect(restorePlaceholders('a iZZZZ')).toBe('a iZZZZ');
  });
});
