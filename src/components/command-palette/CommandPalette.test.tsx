import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  beforeEach(() => {
    resetStoreForTest();
    useStore.getState().setPaletteOpen(true);
  });

  it('filters commands and runs the active one on Enter', () => {
    render(<CommandPalette />);
    const input = screen.getByRole('combobox', { name: 'Commands' });
    fireEvent.change(input, { target: { value: 'visual only' } });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('View: visual only');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().viewMode).toBe('visual');
    expect(useStore.getState().paletteOpen).toBe(false);
  });

  it('moves the selection with arrow keys', () => {
    render(<CommandPalette />);
    const input = screen.getByRole('combobox', { name: 'Commands' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('says so when nothing matches', () => {
    render(<CommandPalette />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Commands' }), {
      target: { value: 'zzzz' },
    });
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });
});
