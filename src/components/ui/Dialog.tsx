import { type ReactNode, useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * Native `<dialog>` in modal mode: the browser supplies the focus trap,
 * inert background and Escape-to-close, which is the same pattern the
 * sibling studios use.
 */
export function Dialog({ open, title, onClose, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      // jsdom has no showModal; fall back to the `open` attribute there.
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click handler only closes on backdrop clicks; keyboard users close with Escape, which <dialog> handles natively.
    <dialog
      ref={ref}
      className={`dialog ${className ?? ''}`}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
