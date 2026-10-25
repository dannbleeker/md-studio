import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goBack, goForward } from '@/services/noteHistory';
import { resetStoreForTest, useStore } from '@/store';
import { useSwipeNav } from './useSwipeNav';

vi.mock('@/services/noteHistory', () => ({ goBack: vi.fn(), goForward: vi.fn() }));

let now = 0;

/** jsdom has no Touch constructor: an event with the fields the hook reads is enough. */
function touch(type: 'touchstart' | 'touchend', target: Element, points: [number, number][]) {
  const event = new Event(type, { bubbles: true });
  const list = points.map(([clientX, clientY]) => ({ clientX, clientY }));
  Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', {
    value: list,
  });
  if (type === 'touchend') Object.defineProperty(event, 'touches', { value: [] });
  target.dispatchEvent(event);
}

/** One finger from `from` to `to`, taking `ms`. */
function swipe(from: [number, number], to: [number, number], ms = 200, target?: Element) {
  const on = target ?? document.getElementById('text') ?? document.body;
  touch('touchstart', on, [from]);
  now += ms;
  touch('touchend', on, [to]);
}

describe('useSwipeNav', () => {
  beforeEach(() => {
    resetStoreForTest();
    useStore.getState().setScreen('editor');
    useStore.getState().setViewMode('read');
    vi.mocked(goBack).mockClear();
    vi.mocked(goForward).mockClear();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    document.body.innerHTML = '<p id="text">words</p><pre><code id="code">x</code></pre>';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it('goes back on a swipe right and forward on a swipe left', () => {
    renderHook(() => useSwipeNav());
    swipe([50, 300], [250, 310]);
    expect(goBack).toHaveBeenCalledTimes(1);
    swipe([250, 300], [50, 290]);
    expect(goForward).toHaveBeenCalledTimes(1);
  });

  it('ignores short, slow and diagonal moves', () => {
    renderHook(() => useSwipeNav());
    swipe([50, 300], [100, 300]);
    swipe([50, 300], [250, 300], 2000);
    swipe([50, 300], [250, 500]);
    expect(goBack).not.toHaveBeenCalled();
    expect(goForward).not.toHaveBeenCalled();
  });

  it('only counts in Read view in the editor', () => {
    renderHook(() => useSwipeNav());
    useStore.getState().setViewMode('visual');
    swipe([50, 300], [250, 300]);
    useStore.getState().setViewMode('read');
    useStore.getState().setScreen('start');
    swipe([50, 300], [250, 300]);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('leaves a swipe that starts on code, or uses two fingers', () => {
    renderHook(() => useSwipeNav());
    swipe([50, 300], [250, 300], 200, document.getElementById('code') as Element);
    const text = document.getElementById('text') as Element;
    touch('touchstart', text, [
      [50, 300],
      [60, 400],
    ]);
    now += 200;
    touch('touchend', text, [[250, 300]]);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('leaves a swipe that selects text', () => {
    renderHook(() => useSwipeNav());
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('text') as Element);
    window.getSelection()?.addRange(range);
    swipe([50, 300], [250, 300]);
    expect(goBack).not.toHaveBeenCalled();
  });

  it('needs a start for every end', () => {
    renderHook(() => useSwipeNav());
    swipe([50, 300], [250, 300]);
    touch('touchend', document.body, [[250, 300]]);
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('stops listening when unmounted', () => {
    const { unmount } = renderHook(() => useSwipeNav());
    unmount();
    swipe([50, 300], [250, 300]);
    expect(goBack).not.toHaveBeenCalled();
  });
});
