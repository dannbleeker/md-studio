import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@/domain/document';
import { pushRecent } from '@/services/storage';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { StartScreen } from './StartScreen';

describe('StartScreen', () => {
  beforeEach(() => resetStoreForTest());

  it('offers new and open, and an empty recent list', () => {
    render(<StartScreen />);
    expect(screen.getByRole('button', { name: 'New document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open file…' })).toBeInTheDocument();
    expect(screen.getByText('Files you open or save appear here.')).toBeInTheDocument();
    expect(screen.queryByText('Continue editing')).not.toBeInTheDocument();
  });

  it('continues the current document', () => {
    useStore.getState().loadDocument(createDocument('# Draft', 'draft.md'), null);
    useStore.getState().setScreen('start');
    render(<StartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Continue editing/ }));
    expect(useStore.getState().screen).toBe('editor');
  });

  it('reopens a recent document', async () => {
    pushRecent({ fileName: 'old.md', title: 'Old', markdown: '# Old', openedAt: 0 });
    resetStoreForTest();
    render(<StartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /^old\.md/ }));
    await waitFor(() =>
      expect(useStore.getState().doc).toMatchObject({ fileName: 'old.md', markdown: '# Old' })
    );
    expect(useStore.getState().screen).toBe('editor');
  });

  it('links the book and the project dashboard', () => {
    render(<StartScreen />);
    expect(screen.getByRole('link', { name: 'Read the book (PDF)' })).toHaveAttribute(
      'href',
      '/Writing-in-Plain-Text.pdf'
    );
    expect(screen.getByRole('link', { name: 'Download the book (EPUB)' })).toHaveAttribute(
      'href',
      '/Writing-in-Plain-Text.epub'
    );
    expect(screen.getByRole('link', { name: 'Project dashboard' })).toHaveAttribute(
      'href',
      '/dashboard.html'
    );
  });

  it('removes one recent entry, or clears the list after asking', async () => {
    pushRecent({ fileName: 'a.md', title: 'A', markdown: 'a', openedAt: 0 });
    pushRecent({ fileName: 'b.md', title: 'B', markdown: 'b', openedAt: 0 });
    resetStoreForTest();
    render(<StartScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.md from the list' }));
    expect(useStore.getState().recents.map((r) => r.fileName)).toEqual(['b.md']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear list' }));
    await waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(true);
    await waitFor(() => expect(useStore.getState().recents).toEqual([]));
    expect(screen.getByText('Files you open or save appear here.')).toBeInTheDocument();
  });

  it('opens the sample document as an unsaved tab', async () => {
    render(<StartScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Try the sample document' }));
    await waitFor(() => expect(useStore.getState().doc.fileName).toBe('Welcome.md'));
    expect(useStore.getState().doc.markdown).toMatch(/^# Welcome to MD Studio/);
    expect(useStore.getState().screen).toBe('editor');
  });

  it('offers to continue a tab with work when the active tab is a blank new one', async () => {
    useStore.getState().loadDocument(createDocument('# Draft', 'draft.md'), null);
    useStore.getState().setMarkdown('# Draft, unsaved', 'text');
    useStore.getState().loadDocument(createDocument(), null);
    useStore.getState().setScreen('start');
    render(<StartScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Continue editing/ }));
    await waitFor(() => expect(useStore.getState().doc.fileName).toBe('draft.md'));
    expect(useStore.getState().screen).toBe('editor');
  });
});
