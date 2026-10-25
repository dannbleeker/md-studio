import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDialogsForTest, useUiStore } from '@/store/ui';
import { useFocusModeEscape } from './useFocusModeEscape';

const escape = (target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('useFocusModeEscape', () => {
  beforeEach(() => {
    resetDialogsForTest();
    useUiStore.getState().setFocusMode(true);
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves focus mode on Escape', () => {
    renderHook(() => useFocusModeEscape());
    escape();
    expect(useUiStore.getState().focusMode).toBe(false);
  });

  it('ignores other keys, and Escape outside focus mode', () => {
    renderHook(() => useFocusModeEscape());
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(useUiStore.getState().focusMode).toBe(true);
    useUiStore.getState().setFocusMode(false);
    escape();
    expect(useUiStore.getState().focusMode).toBe(false);
  });

  it('lets an open dialog have the Escape', () => {
    renderHook(() => useFocusModeEscape());
    document.body.innerHTML = '<dialog open></dialog>';
    escape();
    expect(useUiStore.getState().focusMode).toBe(true);
  });

  it('lets an Escape that closed something else (the find bar) end there', () => {
    renderHook(() => useFocusModeEscape());
    document.body.innerHTML = '<div id="bar"></div>';
    const bar = document.getElementById('bar') as HTMLElement;
    bar.addEventListener('keydown', (e) => e.preventDefault());
    escape(bar);
    expect(useUiStore.getState().focusMode).toBe(true);
    escape();
    expect(useUiStore.getState().focusMode).toBe(false);
  });
});
