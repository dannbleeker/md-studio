import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

function setup() {
  const first = vi.fn();
  const second = vi.fn();
  render(
    <Menu
      label="Menu"
      items={[
        { label: 'First', hint: 'Ctrl+1', onSelect: first },
        { kind: 'separator' },
        { label: 'Second', checked: true, onSelect: second },
      ]}
    >
      ☰
    </Menu>
  );
  return { first, second, button: screen.getByRole('button', { name: 'Menu' }) };
}

describe('Menu', () => {
  it('opens on click with the first item focused, and runs an item', () => {
    const { first, button } = setup();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const item = screen.getByRole('menuitem', { name: /First/ });
    expect(item).toHaveFocus();
    fireEvent.click(item);
    expect(first).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('moves with the arrow keys, Home and End, wrapping, and shows a checked choice', () => {
    const { button } = setup();
    fireEvent.click(button);
    const menu = screen.getByRole('menu');
    const second = screen.getByRole('menuitemradio', { name: /Second/ });
    expect(second).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: /First/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: /First/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(second).toHaveFocus();
  });

  it('closes on Escape (back to the button), on Tab and on a click outside', () => {
    const { button } = setup();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();

    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps a click inside the list from closing it before the item runs', () => {
    const { button } = setup();
    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: /First/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
