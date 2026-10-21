import type { EditorState } from '@milkdown/kit/prose/state';
import type { DecorationSet, EditorProps } from '@milkdown/kit/prose/view';
import { readClicks } from './readClicks';
import { readDecorationSet } from './readDecorations';
import type { Folds } from './readFolds';
import { readHover } from './readHover';

/** The loaded half of Read view; see readHost. */
export const impl: {
  decorations: (state: EditorState, folded: Folds) => DecorationSet;
  handlers: NonNullable<EditorProps['handleDOMEvents']>;
} = {
  decorations: readDecorationSet,
  handlers: {
    ...readClicks.props.handleDOMEvents,
    ...readHover.props.handleDOMEvents,
  },
};
