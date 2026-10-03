import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStoreForTest } from '@/store';
import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  beforeEach(() => resetStoreForTest());
  afterEach(() => vi.restoreAllMocks());

  it('shows PC shortcut hints off a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute(
      'title',
      'Ctrl+Shift+O'
    );
    expect(screen.getByRole('button', { name: 'Commands' })).toHaveAttribute('title', 'Ctrl+K');
  });

  it('shows Mac shortcut hints on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: 'Outline' })).toHaveAttribute('title', '⌘⇧O');
    expect(screen.getByRole('button', { name: 'Commands' })).toHaveAttribute('title', '⌘K');
  });
});
