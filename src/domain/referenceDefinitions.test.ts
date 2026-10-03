import { describe, expect, it } from 'vitest';
import {
  actsAtDistance,
  hasReferenceDefinition,
  placeDefinitions,
  splitDefinitions,
} from './referenceDefinitions';

describe('reference definitions', () => {
  it('recognises definitions, indented up to three spaces', () => {
    expect(hasReferenceDefinition('text\n\n[id]: https://x.dk')).toBe(true);
    expect(hasReferenceDefinition('   [id]: u')).toBe(true);
    expect(hasReferenceDefinition('    [id]: u')).toBe(false);
    expect(hasReferenceDefinition('a [link](u) and [ref] here')).toBe(false);
  });

  it('counts footnotes as acting at a distance too', () => {
    expect(actsAtDistance('see[^1]')).toBe(true);
    expect(actsAtDistance('[id]: u')).toBe(true);
    expect(actsAtDistance('plain [text]')).toBe(false);
  });

  it('leaves a document without definitions alone', () => {
    const md = '# A\n\n[b][x] text\n';
    expect(splitDefinitions(md)).toEqual({ body: md, definitions: '', placed: [] });
  });

  it('splits out definition blocks, wherever they are, noting where they stood', () => {
    const md = '# A\n\n[x]: https://x.dk\n[y]: https://y.dk\n\nUse [x].\n\n[z]: /z\n';
    expect(splitDefinitions(md)).toEqual({
      body: '# A\n\nUse [x].\n',
      definitions: '[x]: https://x.dk\n[y]: https://y.dk\n\n[z]: /z',
      placed: [
        { text: '[x]: https://x.dk\n[y]: https://y.dk', before: 1 },
        { text: '[z]: /z', before: 2 },
      ],
    });
  });

  describe('placeDefinitions', () => {
    const body = 'one\n\ntwo\n\nthree\n';
    // Blocks of `body`, as preserveUnchangedBlocks reports kept ones.
    const ranges = [
      { start: 0, end: 3 },
      { start: 5, end: 8 },
      { start: 10, end: 15 },
    ];
    const all = (i: number) => ranges[i] ?? null;

    it('puts each definition back in front of the block that followed it', () => {
      const placed = [
        { text: '[a]: /a', before: 0 },
        { text: '[b]: /b', before: 2 },
        { text: '[c]: /c', before: 2 },
      ];
      expect(placeDefinitions(body, placed, all)).toBe(
        '[a]: /a\n\none\n\ntwo\n\n[b]: /b\n\n[c]: /c\n\nthree\n'
      );
    });

    it('puts a definition after the block before it when the next was rewritten', () => {
      const kept = (i: number) => (i === 2 ? null : all(i));
      expect(placeDefinitions(body, [{ text: '[b]: /b', before: 2 }], kept)).toBe(
        'one\n\ntwo\n\n[b]: /b\n\nthree\n'
      );
      expect(placeDefinitions(body, [{ text: '[z]: /z', before: 3 }], all)).toBe(
        'one\n\ntwo\n\nthree\n\n[z]: /z\n'
      );
    });

    it('appends a definition with no kept neighbour', () => {
      const kept = (i: number) => (i === 0 ? all(i) : null);
      expect(placeDefinitions(body, [{ text: '[b]: /b', before: 2 }], kept)).toBe(
        'one\n\ntwo\n\nthree\n\n[b]: /b\n'
      );
    });
  });

  it('keeps a definition’s indented continuation line with it', () => {
    const md = 'Text\n\n[x]: https://x.dk\n  "Title"\n';
    expect(splitDefinitions(md).definitions).toBe('[x]: https://x.dk\n  "Title"');
    expect(splitDefinitions(md).body).toBe('Text\n');
  });

  it('does not take a paragraph that merely starts with a definition-like line', () => {
    const md = '[x]: https://x.dk\nand then prose\n';
    expect(splitDefinitions(md).definitions).toBe('');
  });
});
