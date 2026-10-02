import { describe, expect, it } from 'vitest';
import { EMPHASIS_RUN_LIMIT, NESTING_LIMIT, tooDeeplyNested } from './nesting';

const deep = (md: string) => tooDeeplyNested([md]);

describe('tooDeeplyNested', () => {
  it('passes real documents', () => {
    expect(deep('# Title\n\n> quote\n>> nested\n\n[a [b] c](u) and ![img](x)\n\n***\n')).toBe(
      false
    );
    expect(deep(`${'*'.repeat(80)}\n\n${'['.repeat(20)}x${']'.repeat(20)}`)).toBe(false);
  });

  it('catches nested brackets and images past the limit', () => {
    expect(deep(`${'['.repeat(NESTING_LIMIT + 1)}x${']'.repeat(NESTING_LIMIT + 1)}`)).toBe(true);
    expect(deep(`${'!['.repeat(NESTING_LIMIT + 1)}x`)).toBe(true);
    expect(deep(`${'['.repeat(NESTING_LIMIT)}x${']'.repeat(NESTING_LIMIT)}`)).toBe(false);
  });

  it('counts brackets per paragraph, and only open ones', () => {
    const half = '['.repeat(NESTING_LIMIT / 2 + 1);
    expect(deep(`${half}\n\n${half}`)).toBe(false);
    expect(deep(`${half}\n${half}`)).toBe(true);
    expect(deep('[a]'.repeat(NESTING_LIMIT * 4))).toBe(false);
    expect(deep('\\['.repeat(NESTING_LIMIT * 2))).toBe(false);
  });

  it('catches deep quotes and long emphasis runs', () => {
    expect(deep(`${'>'.repeat(NESTING_LIMIT + 1)} x`)).toBe(true);
    expect(deep(`${'> '.repeat(NESTING_LIMIT + 1)}x`)).toBe(true);
    expect(deep(`a ${'>'.repeat(NESTING_LIMIT + 1)}`)).toBe(false);
    expect(deep(`${'*'.repeat(EMPHASIS_RUN_LIMIT + 1)}x`)).toBe(true);
    expect(deep(`${'_'.repeat(EMPHASIS_RUN_LIMIT + 1)}x`)).toBe(true);
    expect(deep('*_'.repeat(EMPHASIS_RUN_LIMIT))).toBe(false);
  });

  it('reads the text across chunk boundaries', () => {
    const chunks = Array.from({ length: NESTING_LIMIT + 1 }, () => '[');
    expect(tooDeeplyNested(chunks)).toBe(true);
    expect(tooDeeplyNested(['[', '\n', '\n', '['])).toBe(false);
  });
});
