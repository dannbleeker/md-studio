import { render, screen, waitFor } from '@testing-library/react';
import { lazy } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStaleBuildForTest } from '@/pwa/staleBuild';
import { useUiStore } from '@/store/ui';
import { LazyBoundary } from './LazyBoundary';

describe('LazyBoundary', () => {
  beforeEach(() => {
    resetStaleBuildForTest();
    useUiStore.setState({ toasts: [] });
  });

  it('keeps the app up and offers a reload when a lazy chunk is gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Missing = lazy(() =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module'))
    );
    render(
      <div>
        <p>editor</p>
        <LazyBoundary>
          <Missing />
        </LazyBoundary>
      </div>
    );
    await waitFor(() => expect(useUiStore.getState().toasts).toHaveLength(1));
    expect(screen.getByText('editor')).toBeTruthy();
    expect(useUiStore.getState().toasts[0]?.action?.label).toBe('Reload');
    vi.restoreAllMocks();
  });
});
