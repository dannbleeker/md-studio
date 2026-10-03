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

  it("widens the context back to where an indented block's construct starts", () => {
    // `  b` continues the list item: parsed alone it would be a paragraph,
    // and the region could be matched against the wrong blocks.
    const md = 'b\n\nc\n\n- a\n\n  b\n\nc';
    const r = changedRegion(md, `${md}x`)!;
    expect(r.oldText).toBe('- a\n\n  b\n\nc');
    expect(r.newText).toBe('- a\n\n  b\n\ncx');
    expect(r.leadingContext).toBe(true);
  });

  it('widens the context back to the first item of a loose list', () => {
    const md = '- b\n\nc\n\n- a\n\n- b\n\nc';
    expect(changedRegion(md, `${md}x`)!.oldText).toBe('- a\n\n- b\n\nc');
  });

  it('widens the trailing context over indented blocks that may continue it', () => {
    const md = 'p\n\nq\n\n- a\n\n  b\n\n  c\n\nz';
    const r = changedRegion(md, md.replace('q', 'Q'))!;
    expect(r.oldText).toBe('p\n\nq\n\n- a\n\n  b\n\n  c');
    expect(r.newText).toBe('p\n\nQ\n\n- a\n\n  b\n\n  c');
    expect(r.trailingContext).toBe(true);
  });

  it('widens the trailing context to the end of a loose list', () => {
    const md = 'q\n\n- a\n\n- b\n\nZ\n\nq\n\n- a';
    expect(changedRegion(md, md.replace('q', 'Q'))!.oldText).toBe('q\n\n- a\n\n- b');
  });

  it('takes a list item after a paragraph as the start of its list', () => {
    const md = 'p\n\n- a\n\nq\n\nr';
    expect(changedRegion(md, md.replace('q', 'Q'))!.oldText).toBe('- a\n\nq\n\nr');
  });

  it('keeps an HTML comment with blank lines whole as context', () => {
    const md = 'p\n\n<!--\n\nx\n\n-->\n\nbar\n\nend';
    expect(changedRegion(md, md.replace('bar', 'baz'))!.oldText).toBe(
      '<!--\n\nx\n\n-->\n\nbar\n\nend'
    );
  });
});
