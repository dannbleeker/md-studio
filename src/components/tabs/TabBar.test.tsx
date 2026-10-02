import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '@/domain/document';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { TabBar } from './TabBar';

const open = (md: string, name: string) =>
  useStore.getState().loadDocument(createDocument(md, name), null);

describe('TabBar', () => {
  beforeEach(() => {
    resetStoreForTest();
    open('a', 'a.md');
    open('b', 'b.md');
  });

  it('lists the open documents and marks the active one', () => {
    render(<TabBar />);
    expect(screen.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches on click and with the arrow keys', async () => {
    render(<TabBar />);
    fireEvent.click(screen.getByRole('tab', { name: 'a.md' }));
    await waitFor(() => expect(useStore.getState().doc.fileName).toBe('a.md'));
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    await waitFor(() => expect(useStore.getState().doc.fileName).toBe('b.md'));
  });

  it('shows unsaved changes and asks before closing such a tab', async () => {
    useStore.getState().setMarkdown('b changed', 'text');
    render(<TabBar />);
    expect(screen.getByRole('tab', { name: /b\.md/ })).toContainElement(
      screen.getByRole('img', { name: 'Unsaved changes' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close b.md' }));
    await waitFor(() => expect(useUiStore.getState().confirm).not.toBeNull());
    useUiStore.getState().confirm?.resolve(true);
    await waitFor(() => expect(useStore.getState().tabs).toHaveLength(1));
    expect(useStore.getState().doc.fileName).toBe('a.md');
  });

  it('closes a clean tab straight away', async () => {
    render(<TabBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Close a.md' }));
    await waitFor(() => expect(useStore.getState().tabs).toHaveLength(1));
    expect(useUiStore.getState().confirm).toBeNull();
  });
});
