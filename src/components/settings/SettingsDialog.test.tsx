import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { DEFAULT_SETTINGS } from '@/store/settings';
import { useUiStore } from '@/store/ui';
import { SettingsDialog } from './SettingsDialog';

describe('SettingsDialog', () => {
  beforeEach(() => {
    resetStoreForTest();
    useUiStore.getState().setSettingsOpen(true);
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
    expect(useUiStore.getState().settingsOpen).toBe(false);
  });

  it('updates the link style and the attachment location', () => {
    render(<SettingsDialog />);
    expect(screen.getByRole('radio', { name: /Auto \(follow the vault\)/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Follow vault settings/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Markdown links/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Images folder next to the note/ }));
    expect(useStore.getState().settings.linkStyle).toBe('markdown');
    expect(useStore.getState().settings.attachmentRules).toBe('images');
    fireEvent.click(screen.getByRole('radio', { name: /Wikilinks/ }));
    expect(useStore.getState().settings.linkStyle).toBe('wikilink');
    expect(screen.getByText(/\.obsidian\/app\.json/)).toBeInTheDocument();
  });
});
