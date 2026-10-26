import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { resetDialogsForTest, useUiStore } from '@/store/ui';
import { Toolbar } from './Toolbar';

const menuItem = (name: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  return screen.getByRole('menuitem', { name });
};

describe('Toolbar', () => {
  beforeEach(() => {
    resetStoreForTest();
    resetDialogsForTest();
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows PC shortcut hints off a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute(
      'title',
      'Outline (Ctrl+Shift+O)'
    );
    expect(menuItem(/Commands/)).toHaveTextContent('Ctrl+K');
  });

  it('shows Mac shortcut hints on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute(
      'title',
      'Outline (⌘⇧O)'
    );
    expect(menuItem(/Commands/)).toHaveTextContent('⌘K');
  });

  it('offers Edit in Read view, back to the layout last used', () => {
    useStore.getState().setViewMode('visual');
    useStore.getState().setViewMode('read');
    render(<Toolbar />);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Editing layout' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(useStore.getState().viewMode).toBe('visual');
  });

  it('offers Save, the layouts and Read while editing', () => {
    useStore.getState().setViewMode('split');
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(useStore.getState().viewMode).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(useStore.getState().viewMode).toBe('read');
  });

  it('opens the dialogs from the menu', () => {
    render(<Toolbar />);
    fireEvent.click(menuItem(/Settings/));
    expect(useUiStore.getState().settingsOpen).toBe(true);
    fireEvent.click(menuItem(/Export/));
    expect(useUiStore.getState().exportOpen).toBe(true);
    fireEvent.click(menuItem(/Keyboard shortcuts/));
    expect(useUiStore.getState().shortcutsOpen).toBe(true);
  });

  it('moves the layout and the panels into the menu on a phone', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    onTestFinished(() => {
      window.matchMedia = original;
    });
    useStore.getState().setViewMode('split');
    render(<Toolbar />);
    expect(screen.queryByRole('button', { name: 'Outline' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Markdown/ }));
    expect(useStore.getState().viewMode).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Outline/ }));
    expect(useStore.getState().settings.showOutline).toBe(true);
  });
});
