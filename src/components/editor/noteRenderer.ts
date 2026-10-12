import { Editor, parserCtx, remarkPluginsCtx, rootCtx, schemaCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { DOMSerializer, type Node as PmNode } from '@milkdown/kit/prose/model';
import type { RemarkPlugin } from '@milkdown/kit/transformer';
import { isRelativeUrl, isWebImage } from '@/domain/imagePaths';
import { tooDeeplyNested } from '@/domain/nesting';
import type { TranscludeChain } from '@/domain/transclusion';
import { useStore } from '@/store';
import { embeds, remarkEmbeds } from './embedNode';
import type { EmbedRenderContext } from './embedRender';
import { imageTitleFix } from './imageTitleFix';

/**
 * Renders another note's Markdown for a transclusion, read-only, inside an
 * atom node view. The result lives only in that view's DOM: it never enters
 * the document, the heading list, the scroll map or find.
 *
 * Parsing uses one headless Milkdown editor (schema and parser only), so the
 * note reads exactly as the visual pane would read it. Its output is then
 * rebuilt through an allow-list: the note may come from anywhere, and its
 * HTML never reaches the page unfiltered.
 */

const MAX_RENDER_CHARS = 200_000;
const CACHE_ENTRIES = 50;

type Parse = (markdown: string) => PmNode | null | undefined;
interface ParserTools {
  parse: Parse;
  serializer: DOMSerializer;
}

/**
 * Raw HTML in a note must stay text. The schema's html node would set
 * innerHTML, which starts loading an `<img onerror>` before any filter sees
 * it, so every html node becomes plain text before the parser runs.
 */
// Only flow containers take a paragraph in the html node's place. Everywhere else (links,
// emphasis, table cells, ...) the parent holds phrasing content, and a paragraph there is
// invalid: ProseMirror would drop the whole containing paragraph and the note's text with it.
const FLOW = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition']);
type MdNode = { type: string; value?: string; children?: MdNode[] };
const neutraliseHtml: RemarkPlugin = {
  plugin: () => (tree) => {
    const visit = (node: MdNode) => {
      const kids = node.children;
      if (!kids) return;
      kids.forEach((child, i) => {
        if (child.type === 'html') {
          const text: MdNode = { type: 'text', value: child.value ?? '' };
          kids[i] = FLOW.has(node.type) ? { type: 'paragraph', children: [text] } : text;
        } else visit(child);
      });
    };
    visit(tree as unknown as MdNode);
  },
  options: {},
};

let parserTools: Promise<ParserTools> | null = null;

/** The headless parser, created once. A failed creation is retried on the next call. */
function createParserEditor(): Promise<ParserTools> {
  if (parserTools) return parserTools;
  const made = Editor.make()
    .config((ctx) => {
      // Detached: this editor never shows anything.
      ctx.set(rootCtx, document.createElement('div'));
      ctx.update(remarkPluginsCtx, (plugins) => [
        ...plugins,
        neutraliseHtml,
        imageTitleFix,
        remarkEmbeds,
      ]);
    })
    .use(commonmark)
    .use(gfm)
    .use(embeds)
    .create()
    .then((editor) =>
      editor.action((ctx) => ({
        parse: ctx.get(parserCtx),
        serializer: DOMSerializer.fromSchema(ctx.get(schemaCtx)),
      }))
    );
  parserTools = made;
  made.catch(() => {
    if (parserTools === made) parserTools = null;
  });
  return made;
}

// ---------------------------------------------------------------------------
// Sanitiser
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'hr',
  'img',
  'span',
  'div',
]);
/** Dropped with everything inside; any other unknown element keeps its text. */
const DROPPED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'template',
  'noscript',
  'svg',
  'math',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'audio',
  'video',
  'source',
]);
const COPIED_ATTRS = ['class', 'title', 'colspan', 'rowspan', 'data-raw', 'data-md-embed'];
const HEADING = /^h([1-6])$/;
const SAFE_HREF = /^(?:https?:|mailto:)/i;

function copyAttrs(from: Element, to: Element): void {
  for (const name of COPIED_ATTRS) {
    const value = from.getAttribute(name);
    if (value !== null) to.setAttribute(name, value);
  }
}

function cleanImage(from: Element, webImages: boolean): HTMLImageElement {
  const img = document.createElement('img');
  copyAttrs(from, img);
  // Only the vault path set below may reach the resolver, never a value carried in the HTML.
  img.removeAttribute('data-raw');
  img.setAttribute('alt', from.getAttribute('alt') ?? '');
  const src = (from.getAttribute('src') ?? '').trim();
  if (/^data:image\//i.test(src) || /^blob:/i.test(src)) {
    img.setAttribute('src', src);
  } else if (/^https?:\/\//i.test(src)) {
    if (webImages) img.setAttribute('src', src);
    else img.classList.add('image-blocked');
  } else if (isRelativeUrl(src) && !isWebImage(src)) {
    // A path inside the vault: the resolver turns it into a URL afterwards.
    img.setAttribute('data-raw', src);
  }
  return img;
}

function clean(from: Node, into: Node, webImages: boolean): void {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(document.createTextNode(child.nodeValue ?? ''));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.localName;
    if (DROPPED_TAGS.has(tag)) continue;
    const level = HEADING.exec(tag)?.[1];
    let out: Element;
    if (level) {
      // A transcluded heading must not join the host's outline or scroll map.
      out = document.createElement('div');
      out.className = 'md-transcluded-heading';
      out.setAttribute('role', 'heading');
      out.setAttribute('aria-level', level);
    } else if (tag === 'img') {
      into.appendChild(cleanImage(el, webImages));
      continue;
    } else if (tag === 'a') {
      const href = (el.getAttribute('href') ?? '').trim();
      if (SAFE_HREF.test(href)) {
        out = document.createElement('a');
        out.setAttribute('href', href);
        out.setAttribute('target', '_blank');
        out.setAttribute('rel', 'noopener noreferrer');
        copyAttrs(el, out);
      } else {
        // A relative or script link could navigate the app: plain text instead.
        out = document.createElement('span');
      }
    } else if (ALLOWED_TAGS.has(tag)) {
      out = document.createElement(tag);
      copyAttrs(el, out);
    } else {
      clean(el, into, webImages);
      continue;
    }
    into.appendChild(out);
    clean(el, out, webImages);
  }
}

// ---------------------------------------------------------------------------
// Rendering and cache
// ---------------------------------------------------------------------------

interface Rendered {
  template: HTMLTemplateElement;
  truncated: boolean;
}
const cache = new Map<string, Rendered>();

function remember(key: string, value: Rendered): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const webImagesOn = () => useStore.getState().settings.webImages;

function limited(markdown: string): { text: string; truncated: boolean } {
  if (markdown.length <= MAX_RENDER_CHARS) return { text: markdown, truncated: false };
  const head = markdown.slice(0, MAX_RENDER_CHARS);
  const cut = head.lastIndexOf('\n\n');
  return { text: cut > 0 ? head.slice(0, cut) : head, truncated: true };
}

/** How much of an unparsed note a placeholder shows. */
const PLAIN_CHARS = 2000;

/** A note that can't be parsed, shown as its opening text so the embed isn't blank. */
function plainPlaceholder(text: string): Rendered {
  const template = document.createElement('template');
  const pre = document.createElement('pre');
  pre.textContent = text.slice(0, PLAIN_CHARS);
  template.content.append(pre);
  return { template, truncated: text.length > PLAIN_CHARS };
}

async function build(markdown: string, webImages: boolean): Promise<Rendered> {
  const tools = await createParserEditor();
  const { text, truncated } = limited(markdown);
  // The host pane never parses such a document either: far-too-deep nesting can freeze
  // the page or overflow the stack, and a transcluded note may come from anywhere.
  if (tooDeeplyNested([text])) return plainPlaceholder(text);
  try {
    const doc = tools.parse(text);
    const template = document.createElement('template');
    if (doc) {
      const rendered = document.createElement('div');
      rendered.append(tools.serializer.serializeFragment(doc.content));
      clean(rendered, template.content, webImages);
    }
    return { template, truncated };
  } catch {
    return plainPlaceholder(text);
  }
}

/** The sanitised HTML of a note's Markdown, with headings demoted and links neutralised. */
export async function renderNote(markdown: string): Promise<string> {
  return (await build(markdown, webImagesOn())).template.innerHTML;
}

type MountEmbed = (
  host: HTMLElement,
  raw: string,
  ctx: EmbedRenderContext
) => { update(raw: string): void; destroy(): void };
type MountImage = (
  img: HTMLImageElement,
  src: string,
  ctx: Pick<EmbedRenderContext, 'doc' | 'signal'> & { fromNotePath: string }
) => { destroy(): void };

export interface NoteBlockArgs {
  /** The text to show: a whole note or the selected section. */
  markdown: string;
  /** path|lastModified|size|fragment, so an edited note renders afresh. */
  cacheKey: string;
  notePath: string;
  /** Note name and fragment for the header. */
  title: string;
  /** The embedding view's context; its document and signal are shared. */
  ctx: EmbedRenderContext;
  /** The chain after entering this note, handed to the embeds inside it. */
  chain: TranscludeChain;
  mountEmbed: MountEmbed;
  mountImage: MountImage;
}

export interface NoteBlock {
  el: HTMLElement;
  destroy(): void;
}

const LINK_ALLOWED = (a: Element) => SAFE_HREF.test((a.getAttribute('href') ?? '').trim());

function instantiate(rendered: Rendered, args: NoteBlockArgs): NoteBlock {
  const root = document.createElement('div');
  root.className = 'md-transclusion';
  root.contentEditable = 'false';
  const header = document.createElement('div');
  header.className = 'md-transclusion-header';
  header.textContent = args.title;
  const body = document.createElement('div');
  body.className = 'md-transclusion-body';
  body.append(rendered.template.content.cloneNode(true));
  root.append(header, body);
  if (rendered.truncated) {
    const more = document.createElement('div');
    more.className = 'md-transclusion-more';
    more.textContent = '…';
    root.append(more);
  }
  const handles: { destroy(): void }[] = [];
  const ctx = args.ctx;
  for (const img of Array.from(body.querySelectorAll<HTMLImageElement>('img[data-raw]'))) {
    handles.push(
      args.mountImage(img, img.getAttribute('data-raw') ?? '', {
        doc: ctx.doc,
        signal: ctx.signal,
        fromNotePath: args.notePath,
      })
    );
  }
  for (const span of Array.from(body.querySelectorAll<HTMLElement>('span[data-md-embed]'))) {
    const raw = span.getAttribute('data-raw') ?? '';
    span.textContent = '';
    span.className = 'md-embed-host';
    handles.push(
      args.mountEmbed(span, raw, {
        doc: ctx.doc,
        chain: args.chain,
        fromNotePath: args.notePath,
        signal: ctx.signal,
      })
    );
  }
  // Links stay inert unless they are the few that are safe to open; the
  // note's own relative links must never navigate the app.
  const onClick = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest('a') : null;
    if (target && !LINK_ALLOWED(target)) event.preventDefault();
  };
  root.addEventListener('click', onClick);
  return {
    el: root,
    destroy() {
      root.removeEventListener('click', onClick);
      for (const h of handles) h.destroy();
      handles.length = 0;
    },
  };
}

const keyFor = (args: NoteBlockArgs, webImages: boolean) => `${args.cacheKey}|${webImages ? 1 : 0}`;

/** A block built from the cache alone, synchronously; null when this render hasn't happened yet. */
export function peekNoteBlock(args: NoteBlockArgs): NoteBlock | null {
  const hit = cache.get(keyFor(args, webImagesOn()));
  return hit ? instantiate(hit, args) : null;
}

export async function renderNoteBlock(args: NoteBlockArgs): Promise<NoteBlock> {
  const webImages = webImagesOn();
  const key = keyFor(args, webImages);
  let hit = cache.get(key);
  if (!hit) {
    hit = await build(args.markdown, webImages);
    remember(key, hit);
  }
  return instantiate(hit, args);
}
