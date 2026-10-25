import { Schema } from '@milkdown/kit/prose/model';
import { EditorState } from '@milkdown/kit/prose/state';
import { EditorView } from '@milkdown/kit/prose/view';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { editors } from './editorRegistry';
import { expandAllFolds } from './readFolds';
import { loadReadExtras, readHost } from './readHost';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      toDOM: (n) => [`h${n.attrs.level}`, 0],
    },
    text: { group: 'inline' },
    embed: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { raw: {} },
      toDOM: () => ['span', { class: 'md-wikilink' }, 'Shown'],
    },
  },
  marks: {
    link: { attrs: { href: {} }, toDOM: (m) => ['a', { href: m.attrs.href }, 0] },
  },
});
const h = (text: string) => schema.node('heading', { level: 1 }, schema.text(text));
const p = (text: string) => schema.node('paragraph', null, schema.text(text));
const doc = (...blocks: ReturnType<typeof h>[]) => schema.node('doc', null, blocks);

function mount(content = doc(h('A'), p('a'), h('B'), p('b'))) {
  const host = document.createElement('div');
  document.body.append(host);
  const view = new EditorView(host, {
    state: EditorState.create({ doc: content, plugins: [readHost] }),
    editable: () => false,
  });
  editors.visual = view;
  return view;
}

const foldButtons = (view: EditorView) => [
  ...view.dom.querySelectorAll<HTMLButtonElement>('.read-fold'),
];
const hidden = (view: EditorView) =>
  [...view.dom.querySelectorAll('.read-folded')].map((el) => el.textContent);

/** What a load or a text-pane edit does to the visual pane: blocks replaced in the same editor. */
function replace(view: EditorView, from: number, to: number, ...blocks: ReturnType<typeof h>[]) {
  view.dispatch(view.state.tr.replaceWith(from, to, blocks).setMeta('addToHistory', false));
}

describe('Read view folds', () => {
  let view: EditorView;

  beforeEach(async () => {
    resetStoreForTest();
    useStore.setState({ screen: 'editor', viewMode: 'read' });
    await loadReadExtras();
  });
  afterEach(() => {
    view.destroy();
    editors.visual = null;
    document.body.innerHTML = '';
  });

  it('hide a section and show it again', () => {
    view = mount();
    foldButtons(view)[1]?.click();
    expect(hidden(view)).toEqual(['b']);
    foldButtons(view)[1]?.click();
    expect(hidden(view)).toEqual([]);
  });

  it('do not carry over to another document', () => {
    view = mount();
    foldButtons(view)[1]?.click();
    // Another tab or note shows in the same editor.
    useStore.setState({ loadId: useStore.getState().loadId + 1 });
    replace(view, 0, view.state.doc.content.size, h('X'), p('x'), h('Y'), p('y is not folded'));
    expect(hidden(view)).toEqual([]);
  });

  it('stay with their heading when a heading is added above it', () => {
    view = mount();
    foldButtons(view)[1]?.click();
    expect(hidden(view)).toEqual(['b']);
    // A heading typed in the text pane before "A".
    replace(view, 0, 0, h('New'), p('new'));
    expect(hidden(view)).toEqual(['b']);
  });

  it('keep keyboard focus on the fold button', () => {
    view = mount();
    const button = foldButtons(view)[0];
    button?.focus();
    button?.click();
    expect(hidden(view)).toEqual(['a']);
    expect(document.activeElement?.classList.contains('read-fold')).toBe(true);
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false');
  });

  it('all open again for a jump', () => {
    view = mount();
    foldButtons(view)[0]?.click();
    foldButtons(view)[1]?.click();
    expandAllFolds(view);
    expect(hidden(view)).toEqual([]);
  });

  it('open for a #link to a heading inside a fold', () => {
    const link = schema.text('to B', [schema.marks.link.create({ href: '#b' })]);
    const sub = schema.node('heading', { level: 2 }, schema.text('B'));
    view = mount(doc(schema.node('paragraph', null, link), h('A'), sub, p('b')));
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.textContent ?? '');
    };
    // Folding A hides its subsection B, the link's target.
    foldButtons(view)[0]?.click();
    expect(hidden(view)).toEqual([expect.stringContaining('B'), 'b']);
    view.dom.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(hidden(view)).toEqual([]);
    expect(scrolled.at(-1)).toContain('B');
  });

  it('leave the fold and link buttons out of the heading names', () => {
    view = mount();
    const headings = within(view.dom as HTMLElement).getAllByRole('heading');
    expect(headings.map((el) => el.getAttribute('aria-label'))).toEqual(['A', 'B']);
    expect(within(view.dom as HTMLElement).getByRole('heading', { name: 'B' })).toBeTruthy();
    // The buttons are still there, each with its own name.
    expect(foldButtons(view)).toHaveLength(2);
  });

  it('name a heading with a [[link]] as its chip reads', () => {
    const chip = schema.node('embed', { raw: '[[Note|Shown]]' });
    view = mount(doc(schema.node('heading', { level: 1 }, [schema.text('See '), chip])));
    expect(
      within(view.dom as HTMLElement)
        .getByRole('heading')
        .getAttribute('aria-label')
    ).toBe('See Shown');
  });
});
