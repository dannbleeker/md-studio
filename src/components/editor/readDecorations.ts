import type { EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { headingLink } from '@/domain/linkTarget';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import { calloutDecorations } from './readCallouts';
import { type FoldMeta, type Folds, READ_FOLDS_KEY } from './readFolds';
import { frontMatterDecorations } from './readFrontMatter';
import { mermaidDecorations } from './readMermaid';

const button = (className: string, label: string, text: string): HTMLButtonElement => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.contentEditable = 'false';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.textContent = text;
  return b;
};

async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(done);
  } catch {
    showToast(t('toast.copyFailed'));
  }
}

/**
 * What only Read view adds to the page: a fold button and a "copy link"
 * button on every heading, a copy button on every code block, callouts and
 * a card for the front matter. Both are decorations, never part of the
 * document, and exist only while reading.
 */
export function readDecorationSet(state: EditorState, folded: Folds): DecorationSet {
  const decorations: Decoration[] = [];
  let index = -1;
  /** While set, blocks are hidden until a heading of this level or higher. */
  let hiddenUnder: number | null = null;
  state.doc.forEach((node, offset) => {
    if (node.type.name === 'front_matter') {
      decorations.push(...frontMatterDecorations(node, offset));
      return;
    }
    const hide = () =>
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'read-folded' }));
    if (node.type.name !== 'heading') {
      if (hiddenUnder !== null) hide();
      return;
    }
    index++;
    const level = Number(node.attrs.level) || 1;
    if (hiddenUnder !== null && level > hiddenUnder) {
      hide();
      return;
    }
    hiddenUnder = null;
    const at = index;
    const isFolded = folded.has(at);
    if (isFolded) hiddenUnder = level;
    decorations.push(
      Decoration.widget(
        offset + 1,
        (view) => {
          const b = button('read-fold', t('read.fold'), isFolded ? '▸' : '▾');
          b.setAttribute('aria-expanded', String(!isFolded));
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', () =>
            view.dispatch(view.state.tr.setMeta(READ_FOLDS_KEY, { toggle: at } satisfies FoldMeta))
          );
          return b;
        },
        { side: -1, key: `fold-${at}-${isFolded}`, ignoreSelection: true }
      )
    );
    decorations.push(
      Decoration.widget(
        offset + node.nodeSize - 1,
        (view, getPos) => {
          const b = button('read-link', t('read.copyLink'), '#');
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', () => {
            const at = getPos();
            const heading = at === undefined ? null : view.state.doc.resolve(at).parent;
            if (!heading) return;
            void copyText(
              headingLink(useStore.getState().doc.fileName, heading.textContent),
              t('read.linkCopied')
            );
          });
          return b;
        },
        { side: 1, key: `link-${at}`, ignoreSelection: true }
      )
    );
  });
  decorations.push(...calloutDecorations(state.doc), ...mermaidDecorations(state.doc));
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;
    decorations.push(
      Decoration.widget(
        pos + 1,
        (view, getPos) => {
          const b = button('read-copy', t('read.copy'), t('read.copy'));
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', () => {
            const at = getPos();
            const block = at === undefined ? null : view.state.doc.nodeAt(at - 1);
            if (block) void copyText(block.textContent, t('toast.codeCopied'));
          });
          return b;
        },
        { side: -1, key: `copy-${pos}`, ignoreSelection: true }
      )
    );
    return false;
  });
  return DecorationSet.create(state.doc, decorations);
}
