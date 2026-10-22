import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorProps } from '@milkdown/kit/prose/view';
import { useStore } from '@/store';
import { editors } from './editorRegistry';
import { applyFoldMeta, type FoldMeta, type Folds, folds } from './readFolds';

/**
 * Read view's place in the visual pane, from the first moment: the fold
 * state, and decoration and event hooks that hand over to the rest of Read
 * view (link clicks, hover cards, folds, callouts, diagrams, the front matter
 * card) once that has loaded. That is a lazy chunk, fetched a moment after the
 * page is up or at once when Read view opens, so none of it weighs on typing.
 * The hooks are inert until it arrives, except that a click on a link in Read
 * view is never left to the browser, which would navigate away from the app.
 */
type Handlers = NonNullable<EditorProps['handleDOMEvents']>;
type Impl = typeof import('./readImpl').impl;

let impl: Impl | null = null;
let loading: Promise<void> | null = null;

export function loadReadExtras(): Promise<void> {
  loading ??= import('./readImpl').then(
    (m) => {
      impl = m.impl;
      // Decorations are read when the view's props are set.
      editors.visual?.setProps({});
    },
    (error) => {
      loading = null;
      throw error;
    }
  );
  return loading;
}

const reading = () => useStore.getState().viewMode === 'read';
const EMPTY: Folds = new Set();

const delegate = (name: keyof Handlers): NonNullable<Handlers[typeof name]> =>
  // biome-ignore lint/suspicious/noExplicitAny: one forwarding shape for several event types.
  ((view: any, event: any) => {
    if (impl)
      return (
        (impl.handlers[name] as ((v: unknown, e: unknown) => boolean) | undefined)?.(view, event) ??
        false
      );
    if (name === 'click' && reading() && event.target instanceof Element) {
      if (event.target.closest('a[href]')) {
        event.preventDefault();
        void loadReadExtras().catch(() => {});
        return true;
      }
    }
    return false;
  }) as NonNullable<Handlers[typeof name]>;

export const readHost = new Plugin<Folds>({
  key: folds,
  state: {
    init: () => EMPTY,
    apply: (tr, value) => applyFoldMeta(value, tr.getMeta(folds) as FoldMeta | undefined),
  },
  props: {
    decorations(state) {
      return impl && reading() ? impl.decorations(state, folds.getState(state) ?? EMPTY) : null;
    },
    handleDOMEvents: {
      click: delegate('click'),
      mouseover: delegate('mouseover'),
      mouseout: delegate('mouseout'),
      focusin: delegate('focusin'),
      focusout: delegate('focusout'),
    },
  },
});
