import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { DEFAULT_SETTINGS } from '@/store/settings';
import { SettingsDialog } from './SettingsDialog';

describe('SettingsDialog', () => {
  beforeEach(() => {
    resetStoreForTest();
    useStore.getState().setSettingsOpen(true);
  });

  it('updates theme, default view and linked scroll', () => {
    render(<SettingsDialog />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Visual' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Link scrolling/ }));
    expect(useStore.getState().settings).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      defaultViewMode: 'visual',
      linkedScroll: false,
      showOutline: false,
      language: 'system',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useStore.getState().settingsOpen).toBe(false);
  });
});
