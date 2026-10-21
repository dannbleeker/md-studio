import { t } from '@/i18n';

/**
 * Shows an already loaded image full size over the page. Click, Escape or
 * the close button dismisses it and focus returns to where it was. The
 * source is the image the document already shows, so nothing new is fetched.
 */
export function openLightbox(src: string, alt: string): void {
  if (document.querySelector('.lightbox')) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', alt || t('lightbox.label'));
  const img = document.createElement('img');
  img.className = 'lightbox-image';
  img.src = src;
  img.alt = alt;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', t('lightbox.close'));
  close.textContent = '×';
  box.append(img, close);

  const dismiss = () => {
    document.removeEventListener('keydown', onKey, true);
    box.remove();
    opener?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  };
  box.addEventListener('click', dismiss);
  document.addEventListener('keydown', onKey, true);
  document.body.append(box);
  close.focus();
}
