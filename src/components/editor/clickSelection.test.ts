import type { EditorView } from '@milkdown/kit/prose/view';
import { describe, expect, it, vi } from 'vitest';
import { clickSelection } from './clickSelection';

const keydown = (init: KeyboardEventInit, keyCode: number) => {
  const event = new KeyboardEvent('keydown', init);
  Object.defineProperty(event, 'keyCode', { value: keyCode });
  const onSelectionChange = vi.fn();
  const view = { domObserver: { onSelectionChange } } as unknown as EditorView;
  clickSelection.props.handleDOMEvents?.keydown?.call(clickSelection, view, event);
  return onSelectionChange;
};

describe('clickSelection', () => {
  it('reads the pending selection before an ordinary key', () => {
    expect(keydown({ key: 'Enter' }, 13)).toHaveBeenCalledOnce();
  });

  // Chromium's first key of an IME composition comes as keyCode 229 with
  // isComposing still false; ProseMirror skips its own flush for it too.
  it('leaves composition keys alone', () => {
    expect(keydown({ key: 'Process' }, 229)).not.toHaveBeenCalled();
    expect(keydown({ key: 'a', isComposing: true }, 65)).not.toHaveBeenCalled();
  });
});
