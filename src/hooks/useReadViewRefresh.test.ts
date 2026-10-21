import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkDiskChanges } from '@/services/documentActions';
import { resetStoreForTest, useStore } from '@/store';
import { useReadViewRefresh } from './useReadViewRefresh';

vi.mock('@/services/documentActions', () => ({ checkDiskChanges: vi.fn() }));

const handle = {} as FileSystemFileHandle;

describe('useReadViewRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStoreForTest();
    vi.mocked(checkDiskChanges).mockClear();
    useStore.getState().setScreen('editor');
  });
  afterEach(() => vi.useRealTimers());

  it('checks the file on disk while a saved file is in Read view', () => {
    useStore.setState({ fileHandle: handle, viewMode: 'read' });
    renderHook(() => useReadViewRefresh());
    vi.advanceTimersByTime(6100);
    expect(checkDiskChanges).toHaveBeenCalledTimes(2);
  });

  it('stays idle in other views and for a document without a file', () => {
    useStore.setState({ fileHandle: handle, viewMode: 'visual' });
    const { rerender } = renderHook(() => useReadViewRefresh());
    useStore.setState({ fileHandle: null, viewMode: 'read' });
    rerender();
    vi.advanceTimersByTime(10_000);
    expect(checkDiskChanges).not.toHaveBeenCalled();
  });

  it('stops when the view changes', () => {
    useStore.setState({ fileHandle: handle, viewMode: 'read' });
    const { rerender } = renderHook(() => useReadViewRefresh());
    useStore.setState({ viewMode: 'split' });
    rerender();
    vi.advanceTimersByTime(10_000);
    expect(checkDiskChanges).not.toHaveBeenCalled();
  });
});
