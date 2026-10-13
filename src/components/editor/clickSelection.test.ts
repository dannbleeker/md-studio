import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('clickSelection on focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const focus = (state: { hasFocus?: boolean; isDestroyed?: boolean } = {}) => {
    const onSelectionChange = vi.fn();
    const view = {
      domObserver: { onSelectionChange },
      hasFocus: () => state.hasFocus ?? true,
      isDestroyed: state.isDestroyed ?? false,
    } as unknown as EditorView;
    const handled = clickSelection.props.handleDOMEvents?.focus?.call(
      clickSelection,
      view,
      new FocusEvent('focus')
    );
    return { onSelectionChange, handled };
  };

  // ProseMirror's focus handler checks the selection after 20 ms and writes
  // its own over a click it hasn't adopted yet, so ours has to come first.
  it('adopts the click selection after the caret is placed, before ProseMirror checks at 20 ms', () => {
    const { onSelectionChange, handled } = focus();
    expect(handled).toBe(false);
    expect(onSelectionChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSelectionChange).toHaveBeenCalledOnce();
  });

  it('does nothing once the pane lost focus or was destroyed', () => {
    const blurred = focus({ hasFocus: false });
    const destroyed = focus({ isDestroyed: true });
    vi.runAllTimers();
    expect(blurred.onSelectionChange).not.toHaveBeenCalled();
    expect(destroyed.onSelectionChange).not.toHaveBeenCalled();
  });
});
