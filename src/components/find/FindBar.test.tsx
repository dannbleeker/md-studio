import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStoreForTest } from '@/store';
import { FindBar } from './FindBar';

const engine = vi.hoisted(() => {
  const info = { total: 2, current: 1, valid: true };
  return {
    apply: vi.fn(() => info),
    info: vi.fn(() => info),
    next: vi.fn(),
    prev: vi.fn(),
    replace: vi.fn(),
    replaceAll: vi.fn(),
    clear: vi.fn(),
    focus: vi.fn(),
  };
});

vi.mock('./findEngine', () => ({
  findTarget: () => 'text',
  engineFor: () => engine,
}));

describe('FindBar', () => {
  beforeEach(() => {
    resetStoreForTest();
    vi.clearAllMocks();
  });

  it('names the previous and next buttons for assistive technology', () => {
    render(<FindBar />);
    fireEvent.click(screen.getByRole('button', { name: /Previous match/ }));
    expect(engine.prev).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Next match/ }));
    expect(engine.next).toHaveBeenCalledOnce();
  });

  it('moves to the next match on Enter, but not while an IME is composing', () => {
    render(<FindBar />);
    const input = screen.getByRole('searchbox', { name: 'Find' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(engine.next).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(engine.next).toHaveBeenCalledOnce();
  });
});
