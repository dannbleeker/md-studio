import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getLocale } from '@/i18n';
import { resetStoreForTest } from '@/store';
import { useLocale } from './useLocale';

describe('useLocale', () => {
  afterEach(() => resetStoreForTest());

  it('resolves English with no other locale registered', () => {
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe('en');
    expect(getLocale()).toBe('en');
  });
});
