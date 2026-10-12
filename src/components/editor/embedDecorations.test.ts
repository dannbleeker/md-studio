import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { embedDecorations } from './embedDecorations';
import { markdownWithFrontMatter } from './frontMatterLanguage';

const views: EditorView[] = [];
const lang = new Compartment();
const plain: Extension = [];
const md = markdownWithFrontMatter(markdown());

function make(doc: string, language: Extension = md) {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      extensions: [lang.of(language), embedDecorations((s) => lang.get(s) === plain)],
    }),
  });
  views.push(view);
  return view;
}
const has = (view: EditorView, cls: string) => view.dom.querySelector(`.${cls}`) !== null;
const text = (view: EditorView, cls: string) =>
  Array.from(view.dom.querySelectorAll(`.${cls}`)).map((e) => e.textContent);

afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

describe('embedDecorations', () => {
  it('marks the pieces of an image embed', () => {
    const view = make('![[a.png|300]]');
    expect(has(view, 'cm-embed-image')).toBe(true);
    expect(text(view, 'cm-embed-target')).toEqual(['a.png']);
    expect(text(view, 'cm-embed-opts')).toEqual(['|300']);
    expect(text(view, 'cm-embed-mark')).toEqual(['![[', ']]']);
  });

  it('marks a fragment and the pdf kind', () => {
    const view = make('![[x.pdf#page=2]]');
    expect(has(view, 'cm-embed-pdf')).toBe(true);
    expect(text(view, 'cm-embed-frag')).toEqual(['#page=2']);
  });

  it('marks a plain wikilink as a link', () => {
    const view = make('see [[link]] here');
    expect(has(view, 'cm-embed-link')).toBe(true);
    expect(text(view, 'cm-embed-target')).toEqual(['link']);
  });

  it('keeps an escaped pipe in a table cell with the options', () => {
    const view = make('| a |\n| - |\n| ![[a.png\\|300]] |');
    expect(text(view, 'cm-embed-target')).toEqual(['a.png']);
    expect(text(view, 'cm-embed-opts')).toEqual(['\\|300']);
  });

  it('draws nothing inside code or front matter', () => {
    for (const doc of [
      '```\n![[a.png]]\n```',
      'x `![[a.png]]` y',
      '    ![[a.png]]',
      '---\ntitle: ![[a.png]]\n---\n\nbody',
    ]) {
      expect([doc, has(make(doc), 'cm-embed-image')]).toEqual([doc, false]);
    }
  });

  it('draws nothing in plain text mode', () => {
    expect(has(make('![[a.png]]', plain), 'cm-embed-image')).toBe(false);
  });

  it('rebuilds after an edit and when the language changes', () => {
    const view = make('hello');
    expect(has(view, 'cm-embed-image')).toBe(false);
    view.dispatch({ changes: { from: 5, insert: ' ![[b.png]]' } });
    expect(text(view, 'cm-embed-target')).toEqual(['b.png']);
    view.dispatch({ effects: lang.reconfigure(plain) });
    expect(has(view, 'cm-embed-image')).toBe(false);
    view.dispatch({ effects: lang.reconfigure(md) });
    expect(has(view, 'cm-embed-image')).toBe(true);
  });
});
