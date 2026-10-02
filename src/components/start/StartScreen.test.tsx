import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@/domain/document';
import { pushRecent } from '@/services/storage';
import { resetStoreForTest, useStore } from '@/store';
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
    fireEvent.click(screen.getByRole('button', { name: /old\.md/ }));
    await screen.findByText('old.md');
    expect(useStore.getState().doc).toMatchObject({ fileName: 'old.md', markdown: '# Old' });
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
});
