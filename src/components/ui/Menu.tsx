import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

export type MenuItem =
  | {
      kind?: 'action';
      label: string;
      /** A shortcut hint shown at the end of the row. */
      hint?: string;
      /** A radio-like choice (the editing layout): shown checked when true. */
      checked?: boolean;
      onSelect: () => void;
    }
  | { kind: 'separator' };

/** The items of an open menu, in order. */
const entriesOf = (list: HTMLElement | null): HTMLElement[] =>
  Array.from(list?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

type Props = {
  /** Accessible name of the button, and its tooltip. */
  label: string;
  /** What the button shows. */
  children: ReactNode;
  items: readonly MenuItem[];
  className?: string;
};

/**
 * A button that opens a list of commands. Arrow keys, Home and End move
 * between them, Escape closes and gives focus back to the button, and a
 * click outside or Tab closes it. The list follows the ARIA menu pattern.
 */
export function Menu({ label, children, items, className }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    entriesOf(list.current)[0]?.focus();
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!list.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const all = entriesOf(list.current);
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => all[(to + all.length) % all.length]?.focus();
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(all.length - 1);
    else if (e.key === 'Escape') close(true);
    else if (e.key === 'Tab') return close(false);
    else return;
    e.preventDefault();
    // The app's own Escape handlers (focus mode, find bar) must not also act.
    e.stopPropagation();
  };

  return (
    <div className={`menu ${className ?? ''}`}>
      <button
        ref={button}
        type="button"
        className="btn btn-ghost menu-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open ? (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className="menu-list"
          onKeyDown={onKeyDown}
        >
          {items.map((item, i) => {
            if (item.kind === 'separator') {
              // biome-ignore lint/suspicious/noArrayIndexKey: separators have nothing else to key on.
              return <hr key={`sep-${i}`} className="menu-separator" />;
            }
            const select = () => {
              close(true);
              item.onSelect();
            };
            const content = (
              <>
                <span className="menu-check" aria-hidden="true">
                  {item.checked ? '✓' : ''}
                </span>
                <span className="menu-label">{item.label}</span>
                {item.hint ? <span className="menu-hint">{item.hint}</span> : null}
              </>
            );
            return item.checked === undefined ? (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="menu-item"
                onClick={select}
              >
                {content}
              </button>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitemradio"
                aria-checked={item.checked}
                tabIndex={-1}
                className="menu-item"
                onClick={select}
              >
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
