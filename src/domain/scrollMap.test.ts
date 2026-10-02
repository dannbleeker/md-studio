import { describe, expect, it } from 'vitest';
import { buildAnchors, fromAnchorPosition, toAnchorPosition } from './scrollMap';

describe('scrollMap', () => {
  const text = buildAnchors([100, 300], 400);
  const visual = buildAnchors([50, 1000], 2000);

  it('wraps heading offsets with start and end', () => {
    expect(text).toEqual([0, 100, 300, 400]);
  });

  it('maps a position inside a section proportionally', () => {
    const pos = toAnchorPosition(text, 200);
    expect(pos).toEqual({ section: 1, fraction: 0.5 });
    expect(fromAnchorPosition(visual, pos)).toBe(525);
  });

  it('lands exactly on the matching heading', () => {
    expect(fromAnchorPosition(visual, toAnchorPosition(text, 300))).toBe(1000);
  });

  it('round-trips', () => {
    for (const offset of [0, 37, 100, 299, 350, 400]) {
      const there = fromAnchorPosition(visual, toAnchorPosition(text, offset));
      expect(fromAnchorPosition(text, toAnchorPosition(visual, there))).toBeCloseTo(offset);
    }
  });

  it('clamps offsets beyond the content', () => {
    expect(toAnchorPosition(text, 9999)).toEqual({ section: 2, fraction: 1 });
    expect(toAnchorPosition(text, -5)).toEqual({ section: 0, fraction: 0 });
  });

  it('degrades when the panes disagree on heading count', () => {
    const pos = toAnchorPosition(buildAnchors([10, 20, 30, 40], 50), 45);
    expect(fromAnchorPosition(buildAnchors([10], 100), pos)).toBe(100);
  });

  it('keeps anchors ascending even with out-of-order input', () => {
    expect(buildAnchors([50, 20, 500], 100)).toEqual([0, 50, 50, 100, 100]);
  });

  it('handles empty documents', () => {
    expect(toAnchorPosition([0], 10)).toEqual({ section: 0, fraction: 0 });
    expect(fromAnchorPosition([], { section: 0, fraction: 1 })).toBe(0);
  });
});
