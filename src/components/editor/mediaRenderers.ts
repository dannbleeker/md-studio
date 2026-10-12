import type { EmbedSize } from '@/domain/embeds';
import { t } from '@/i18n';

/**
 * DOM builders for resolved attachments, shared by the embed views. They
 * only build elements; resolution, deferral and cleanup live in
 * embedRender. Nothing here reads or writes the document.
 */

const PDF_HEIGHT = 400;
const PDF_MAX_HEIGHT = 1200;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A link to the file in a new tab: the fallback wherever an inline viewer is missing or blocked. */
export function openLink(url: string, name: string): HTMLAnchorElement {
  const a = el('a', 'md-embed-open', t('embed.open'));
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = name;
  return a;
}

export function imageElement(p: {
  url: string;
  alt: string;
  size: EmbedSize | null;
  title?: string;
}): HTMLImageElement {
  const img = el('img', 'md-embed-image');
  // A vault file is already deferred until its embed is near the viewport, so a lazy image
  // would only be left blank in a printout; a remote one still benefits.
  if (!p.url.startsWith('blob:')) img.loading = 'lazy';
  img.alt = p.alt;
  if (p.title) img.title = p.title;
  if (p.size) {
    img.width = p.size.width;
    if (p.size.height !== null) img.height = p.size.height;
  }
  img.src = p.url;
  return img;
}

export function pdfElement(p: {
  url: string;
  name: string;
  page: number | null;
  height: number | null;
  size: EmbedSize | null;
  title?: string;
}): HTMLElement {
  const box = el('div', 'md-embed-pdf');
  if (p.title) box.title = p.title;
  const frame = el('iframe', 'md-embed-pdf-frame');
  frame.title = t('embed.pdf', { name: p.name });
  frame.src = p.page ? `${p.url}#page=${p.page}` : p.url;
  frame.style.height = `${Math.min(p.height ?? p.size?.height ?? PDF_HEIGHT, PDF_MAX_HEIGHT)}px`;
  if (p.size) frame.style.width = `${p.size.width}px`;
  const bar = el('div', 'md-embed-bar');
  bar.append(
    el('span', 'md-embed-label', t('embed.pdf', { name: p.name })),
    openLink(p.url, p.name)
  );
  box.append(frame, bar);
  return box;
}

/** Shown when the browser cannot play the file: the Open link is still there. */
function unsupported(url: string, name: string, title?: string): HTMLElement {
  const note = el('span', 'md-embed-chip md-embed-unsupported');
  if (title) note.title = title;
  note.append(
    el('span', 'md-embed-label', t('embed.mediaUnsupported', { name })),
    openLink(url, name)
  );
  return note;
}

export function audioElement(p: { url: string; name: string; title?: string }): HTMLElement {
  const box = el('span', 'md-embed-media');
  const audio = el('audio', 'md-embed-audio');
  audio.controls = true;
  audio.preload = 'none';
  audio.src = p.url;
  audio.title = [t('embed.audio', { name: p.name }), p.title].filter(Boolean).join('\n');
  audio.addEventListener('error', () => box.replaceChildren(unsupported(p.url, p.name, p.title)), {
    once: true,
  });
  box.append(audio);
  return box;
}

export function videoElement(p: {
  url: string;
  name: string;
  size: EmbedSize | null;
  title?: string;
}): HTMLElement {
  const box = el('span', 'md-embed-media');
  const video = el('video', 'md-embed-video');
  video.controls = true;
  video.preload = 'none';
  video.src = p.url;
  video.title = [t('embed.video', { name: p.name }), p.title].filter(Boolean).join('\n');
  if (p.size) {
    video.width = p.size.width;
    if (p.size.height !== null) video.height = p.size.height;
  }
  video.addEventListener('error', () => box.replaceChildren(unsupported(p.url, p.name, p.title)), {
    once: true,
  });
  box.append(video);
  return box;
}

export function fileChip(p: { url: string; name: string; title?: string }): HTMLElement {
  const chip = el('span', 'md-embed-chip md-embed-file');
  if (p.title) chip.title = p.title;
  const open = openLink(p.url, p.name);
  open.download = p.name;
  chip.append(el('span', 'md-embed-label', t('embed.file', { name: p.name })), open);
  return chip;
}

type PlaceholderKind = 'loading' | 'missing' | 'unavailable' | 'cycle' | 'depth' | 'limit';

/**
 * A labelled stand-in. The original token is always shown with it, so the
 * source is never hidden behind a failure.
 */
export function placeholder(p: {
  kind: PlaceholderKind;
  label: string;
  raw?: string;
  hint?: string;
}): HTMLElement {
  const chip = el('span', `md-embed-chip md-embed-${p.kind}`);
  chip.append(el('span', 'md-embed-label', p.label));
  if (p.raw) chip.append(el('code', 'md-embed-raw', p.raw));
  if (p.hint) chip.title = p.hint;
  return chip;
}

/** A plain wikilink, [[Note|alias]]: an inert chip; navigation is out of scope. */
export function wikilinkChip(text: string, raw: string): HTMLElement {
  const chip = el('span', 'md-wikilink', text);
  chip.title = raw;
  return chip;
}
