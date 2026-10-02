import { describe, expect, it } from 'vitest';
import { actsAtDistance, hasReferenceDefinition, splitDefinitions } from './referenceDefinitions';

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
    expect(splitDefinitions(md)).toEqual({ body: md, definitions: '' });
  });

  it('splits out definition blocks, wherever they are', () => {
    const md = '# A\n\n[x]: https://x.dk\n[y]: https://y.dk\n\nUse [x].\n\n[z]: /z\n';
    expect(splitDefinitions(md)).toEqual({
      body: '# A\n\nUse [x].\n',
      definitions: '[x]: https://x.dk\n[y]: https://y.dk\n\n[z]: /z',
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
