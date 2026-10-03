import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { markdownWithFrontMatter } from './frontMatterLanguage';

const language = markdownWithFrontMatter(markdown());

/** The node names from the innermost node at `pos` up to the root. */
function path(doc: string, pos: number): string {
  const state = EditorState.create({ doc, extensions: [language] });
  const tree = ensureSyntaxTree(state, doc.length, 5000);
  const names: string[] = [];
  for (let node = tree?.resolveInner(pos, 1) ?? null; node; node = node.parent) {
    names.push(node.name);
  }
  return names.join('<');
}

const at = (doc: string, text: string) => path(doc, doc.indexOf(text) + 1);

describe('the text pane’s language', () => {
  it('parses front matter as YAML and the body as Markdown', () => {
    const doc = '---\ntitle: x\n---\n\n# H\n';
    expect(at(doc, 'title')).toMatch(/^Literal<Key<Pair</);
    expect(at(doc, '# H')).toMatch(/ATXHeading1<Document</);
  });

  it('follows the app’s rules: `...` closes it, trailing spaces are fine', () => {
    const dots = '---\ntitle: x\n...\n\n# H\n\nText\n';
    expect(at(dots, 'title')).toMatch(/Pair/);
    expect(at(dots, '# H')).toMatch(/ATXHeading1<Document</);
    const spaces = '--- \ntitle: x\n---\n\n# H\n';
    expect(at(spaces, 'title')).toMatch(/Pair/);
    expect(at(spaces, 'title')).not.toMatch(/SetextHeading/);
  });

  it('leaves documents without front matter to Markdown', () => {
    expect(at('# H\n\nText\n', '# H')).toMatch(/ATXHeading1<Document</);
    // An opening fence followed by a blank line is a rule.
    const rule = '---\n\nIntro\n\n---\n\n# H\n';
    expect(path(rule, 1)).toMatch(/^HorizontalRule</);
    expect(at(rule, '# H')).toMatch(/ATXHeading1/);
  });

  it('still parses code fences in the body', () => {
    const doc = '---\na: 1\n---\n\n```\ncode\n```\n';
    expect(at(doc, 'code')).toMatch(/FencedCode/);
  });
});
