import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isMobileNow, MOBILE_QUERY, useIsMobile } from './useIsMobile';

/** A matchMedia stand-in whose answer the test flips, telling its listeners. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  window.matchMedia = ((query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
  }) as unknown as typeof window.matchMedia;
  return {
    queries,
    listeners,
    set(next: boolean) {
      matches = next;
      for (const fn of listeners) fn();
    },
  };
}

const original = window.matchMedia;

describe('useIsMobile', () => {
  afterEach(() => {
    window.matchMedia = original;
  });

  it('answers the 720px query', () => {
    const media = stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(media.queries.every((q) => q === MOBILE_QUERY)).toBe(true);
  });

  it('follows the window across the breakpoint', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('stops listening when unmounted', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('is false where matchMedia is missing', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    expect(isMobileNow()).toBe(false);
  });

  it('reads the same query once for event handlers', () => {
    const media = stubMatchMedia(true);
    expect(isMobileNow()).toBe(true);
    media.set(false);
    expect(isMobileNow()).toBe(false);
  });
});
