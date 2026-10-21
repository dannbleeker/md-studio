import { describe, expect, it } from 'vitest';
import { parsePositions, rememberPosition } from './readPositions';

describe('readPositions', () => {
  it('remembers a position and replaces an older one', () => {
    const first = rememberPosition({}, 'a', { section: 2, fraction: 0.5 }, 10);
    expect(first).toEqual({ a: { section: 2, fraction: 0.5, at: 10 } });
    expect(rememberPosition(first, 'a', { section: 3, fraction: 0.1 }, 20).a).toEqual({
      section: 3,
      fraction: 0.1,
      at: 20,
    });
  });

  it('forgets a file that is back at the top', () => {
    const all = rememberPosition({}, 'a', { section: 2, fraction: 0.5 }, 1);
    expect(rememberPosition(all, 'a', { section: 0, fraction: 0.01 }, 2)).toEqual({});
    expect(rememberPosition(all, 'a', null, 2)).toEqual({});
    expect(rememberPosition(all, 'a', { section: 0, fraction: 0.5 }, 2).a).toBeDefined();
  });

  it('keeps the newest hundred entries', () => {
    let all = {};
    for (let i = 0; i < 130; i++)
      all = rememberPosition(all, `k${i}`, { section: 1, fraction: 0.5 }, i);
    expect(Object.keys(all)).toHaveLength(100);
    expect(all).toHaveProperty('k129');
    expect(all).not.toHaveProperty('k0');
  });

  it('parses only well-formed entries from storage', () => {
    expect(
      parsePositions({
        ok: { section: 1, fraction: 0.2, at: 5 },
        negative: { section: -1, fraction: 0.2, at: 5 },
        big: { section: 1, fraction: 7, at: 5 },
        junk: 'x',
        fractional: { section: 1.5, fraction: 0.2, at: 5 },
      })
    ).toEqual({ ok: { section: 1, fraction: 0.2, at: 5 } });
    expect(parsePositions(null)).toEqual({});
    expect(parsePositions([1, 2])).toEqual({});
  });
});
