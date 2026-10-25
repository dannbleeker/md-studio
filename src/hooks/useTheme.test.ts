import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { useTheme } from './useTheme';

const theme = () => document.documentElement.getAttribute('data-theme');

describe('useTheme', () => {
  beforeEach(() => resetStoreForTest());
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('sets a chosen theme on <html>', () => {
    useStore.getState().updateSettings({ theme: 'dark' });
    renderHook(() => useTheme());
    expect(theme()).toBe('dark');
  });

  it('leaves "system" to the media query', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    useStore.getState().updateSettings({ theme: 'system' });
    renderHook(() => useTheme());
    expect(theme()).toBeNull();
  });

  it('follows a change of the setting', () => {
    useStore.getState().updateSettings({ theme: 'light' });
    const { rerender } = renderHook(() => useTheme());
    expect(theme()).toBe('light');
    useStore.getState().updateSettings({ theme: 'dark' });
    rerender();
    expect(theme()).toBe('dark');
    useStore.getState().updateSettings({ theme: 'system' });
    rerender();
    expect(theme()).toBeNull();
  });
});
