import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollReader } from '@/components/editor/readNavigation';
import { resetStoreForTest, useStore } from '@/store';
import { resetDialogsForTest, useUiStore } from '@/store/ui';
import { useReadKeys } from './useReadKeys';

vi.mock('@/components/editor/readNavigation', () => ({ scrollReader: vi.fn(() => true) }));

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('useReadKeys', () => {
  beforeEach(() => {
    resetStoreForTest();
    resetDialogsForTest();
    vi.mocked(scrollReader).mockClear();
    vi.mocked(scrollReader).mockReturnValue(true);
    useStore.getState().setScreen('editor');
    useStore.getState().setViewMode('read');
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('scrolls with the reading keys and claims them', () => {
    renderHook(() => useReadKeys());
    const keys: [string, KeyboardEventInit, string][] = [
      ['j', {}, 'down'],
      ['k', {}, 'up'],
      [' ', {}, 'pageDown'],
      [' ', { shiftKey: true }, 'pageUp'],
      ['g', {}, 'top'],
      ['G', { shiftKey: true }, 'bottom'],
      ['[', {}, 'prevHeading'],
      [']', {}, 'nextHeading'],
    ];
    for (const [key, init, action] of keys) {
      vi.mocked(scrollReader).mockClear();
      expect(press(key, init).defaultPrevented, key).toBe(true);
      expect(scrollReader).toHaveBeenCalledWith(action);
    }
  });

  it('leaves a key to the browser when there is nothing to scroll', () => {
    vi.mocked(scrollReader).mockReturnValue(false);
    renderHook(() => useReadKeys());
    expect(press(' ').defaultPrevented).toBe(false);
  });

  it('opens the help, the find bar and focus mode', () => {
    renderHook(() => useReadKeys());
    expect(press('?').defaultPrevented).toBe(true);
    expect(useUiStore.getState().readKeysOpen).toBe(true);
    press('/');
    expect(useUiStore.getState().findOpen).toBe(true);
    press('f');
    expect(useUiStore.getState().focusMode).toBe(true);
    press('f');
    expect(useUiStore.getState().focusMode).toBe(false);
    expect(scrollReader).not.toHaveBeenCalled();
  });

  it('does nothing outside Read view or the editor', () => {
    renderHook(() => useReadKeys());
    useStore.getState().setViewMode('split');
    expect(press('j').defaultPrevented).toBe(false);
    useStore.getState().setViewMode('read');
    useStore.getState().setScreen('start');
    expect(press('j').defaultPrevented).toBe(false);
    expect(scrollReader).not.toHaveBeenCalled();
  });

  it('leaves keys typed into a field or an editor', () => {
    renderHook(() => useReadKeys());
    document.body.innerHTML =
      '<input id="i"><textarea id="t"></textarea><div class="cm-editor"><span id="cm"></span></div><div contenteditable="true"><b id="ce"></b></div>';
    for (const id of ['i', 't', 'cm', 'ce']) {
      const target = document.getElementById(id) as HTMLElement;
      expect(press('j', {}, target).defaultPrevented, id).toBe(false);
    }
    expect(scrollReader).not.toHaveBeenCalled();
  });

  it('lets Space press a focused button (fold, copy) instead of scrolling', () => {
    renderHook(() => useReadKeys());
    document.body.innerHTML =
      '<button id="b">fold</button><details><summary id="s">more</summary></details><span role="button" tabindex="0" id="r">x</span>';
    for (const id of ['b', 's', 'r']) {
      const target = document.getElementById(id) as HTMLElement;
      expect(press(' ', {}, target).defaultPrevented, id).toBe(false);
      expect(press(' ', { shiftKey: true }, target).defaultPrevented, id).toBe(false);
    }
    expect(scrollReader).not.toHaveBeenCalled();
    // The other reading keys still work with a button focused.
    expect(press('j', {}, document.getElementById('b') as HTMLElement).defaultPrevented).toBe(true);
  });

  it('stays out of the way of an open dialog, a handled key, IME and modifiers', () => {
    renderHook(() => useReadKeys());
    document.body.innerHTML = '<dialog open></dialog>';
    expect(press('j').defaultPrevented).toBe(false);
    document.body.innerHTML = '';
    expect(press('j', { isComposing: true }).defaultPrevented).toBe(false);
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(press('j', { [mod]: true }).defaultPrevented, mod).toBe(false);
    }
    const handled = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
    expect(scrollReader).not.toHaveBeenCalled();
  });

  it('ignores unmapped keys and stops listening when unmounted', () => {
    const { unmount } = renderHook(() => useReadKeys());
    expect(press('x').defaultPrevented).toBe(false);
    unmount();
    expect(press('j').defaultPrevented).toBe(false);
    expect(scrollReader).not.toHaveBeenCalled();
  });

  it('stays out of the way of the image lightbox (a modal that is no <dialog>)', () => {
    renderHook(() => useReadKeys());
    document.body.innerHTML = '<div class="lightbox" role="dialog" aria-modal="true"></div>';
    for (const key of ['j', ' ', '?', 'f']) expect(press(key).defaultPrevented, key).toBe(false);
    expect(scrollReader).not.toHaveBeenCalled();
    expect(useUiStore.getState().readKeysOpen).toBe(false);
    expect(useUiStore.getState().focusMode).toBe(false);
  });
});
