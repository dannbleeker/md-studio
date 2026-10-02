import { describe, expect, it } from 'vitest';
import { changedRegion } from './changedRegion';

describe('changedRegion', () => {
  const doc = '# A\n\none\n\ntwo\n\nthree\n\n# B\n';

  it('returns the edited block with one neighbour each side', () => {
    const r = changedRegion(doc, doc.replace('two', 'TWO'))!;
    expect(r.oldText).toBe('one\n\ntwo\n\nthree');
    expect(r.newText).toBe('one\n\nTWO\n\nthree');
    expect(r.leadingContext).toBe(true);
    expect(r.trailingContext).toBe(true);
    expect(r.position).toBeCloseTo(1 / 5);
  });

  it('handles edits at the very start and end', () => {
    const start = changedRegion(doc, doc.replace('# A', '# A!'))!;
    expect(start.leadingContext).toBe(false);
    expect(start.oldText).toBe('# A\n\none');
    const end = changedRegion(doc, `${doc}\nnew\n`)!;
    expect(end.trailingContext).toBe(false);
    expect(end.oldText).toBe('# B');
    expect(end.newText).toBe('# B\n\nnew');
  });

  it('is null when no block changed', () => {
    expect(changedRegion(doc, doc)).toBeNull();
    expect(changedRegion(doc, doc.replace('\n\none', '\n\n\none'))).toBeNull();
  });

  it('reports how much of the document the region covers', () => {
    expect(changedRegion('a', 'b')!.share).toBe(1);
    expect(changedRegion(doc, doc.replace('two', 'TWO'))!.share).toBeLessThan(0.7);
  });
});
