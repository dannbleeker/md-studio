import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { FirstRunTip } from './FirstRunTip';
import { Toolbar } from './Toolbar';

describe('FirstRunTip', () => {
  beforeEach(() => {
    resetStoreForTest();
    useStore.getState().setViewMode('read');
  });

  it('shows in Read view until dismissed, for good', () => {
    const { unmount } = render(<FirstRunTip />);
    expect(screen.getByRole('note')).toHaveTextContent(/Press Edit/);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this tip' }));
    expect(screen.queryByRole('note')).toBeNull();
    unmount();
    resetStoreForTest();
    useStore.getState().setViewMode('read');
    render(<FirstRunTip />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('is not shown while editing, and goes once Edit is used', () => {
    render(
      <>
        <Toolbar />
        <FirstRunTip />
      </>
    );
    expect(screen.getByRole('note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(screen.queryByRole('note')).toBeNull();
  });
});
