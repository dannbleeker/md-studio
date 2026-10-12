import type { Node } from '@milkdown/kit/prose/model';
import type { NodeView, NodeViewConstructor } from '@milkdown/kit/prose/view';
import { classifyTarget, embedTokenFor, parseAltSize } from '@/domain/embeds';
import { isRelativeUrl, isWebImage } from '@/domain/imagePaths';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { liveDocContext, loadingChip, ownsEvent, withEmbedRender } from './embedView';

/**
 * Renders Markdown images in the visual pane. Relative links (images saved
 * next to the document, or elsewhere in the vault) can't load from the
 * app's origin, so they are read from the chosen folder and shown through an
 * object URL. Web images load only when the Load web images setting is on;
 * until then the image shows its alt text. A size written in the alt text
 * (`![alt|300](p.png)`) sets the width and is hidden from the shown alt.
 * The node's own `src` and `alt` are never touched, so the Markdown keeps
 * the link either way.
 *
 * A link to a PDF, audio or video file is drawn like the wiki embed of the same
 * path. Other extensions stay an <img>.
 */

/**
 * The embed token for a target the embed renderer draws instead of an <img>,
 * else null. A path a token cannot hold (`a|b.pdf`, `C%23.pdf`) stays an <img>:
 * nothing could mount it, so the view would sit on its loading chip for good.
 */
function embedToken(src: string): string | null {
  if (!isRelativeUrl(src) || isWebImage(src)) return null;
  const kind = classifyTarget(src.split(/[?#]/)[0] ?? '');
  // An unknown extension stays an <img>: browsers draw formats the embeds table
  // does not list (ico, jfif, apng, tiff), and a broken one shows its alt text.
  if (kind !== 'pdf' && kind !== 'audio' && kind !== 'video') return null;
  return embedTokenFor(src);
}

type Resolver = { update(src: string): void; destroy(): void };

function embedBacked(initial: Node, initialToken: string): NodeView {
  let node = initial;
  let src = String(node.attrs.src ?? '');
  let token = initialToken;
  const dom = document.createElement('span');
  dom.className = 'md-embed-host';
  dom.append(loadingChip());
  const signal = { cancelled: false };
  let mounted: { update(raw: string): void; destroy(): void } | null = null;
  withEmbedRender((m) => {
    if (signal.cancelled) return;
    mounted = m.mountEmbed(dom, token, {
      doc: liveDocContext,
      chain: { depth: 0, visited: [] },
      fromNotePath: undefined,
      signal,
      // A Markdown link, so a path is tried next to the note before the vault root.
      markdown: true,
    });
  });
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      const nextSrc = String(next.attrs.src ?? '');
      // Another kind of target needs another element: let the editor rebuild the view.
      const nextToken = embedToken(nextSrc);
      if (nextToken === null) return false;
      node = next;
      if (nextSrc === src) return true;
      src = nextSrc;
      token = nextToken;
      // Before the module arrives nothing is mounted: the pending mount reads the new token.
      withEmbedRender(() => mounted?.update(nextToken));
      return true;
    },
    ignoreMutation: () => true,
    stopEvent: ownsEvent,
    destroy() {
      signal.cancelled = true;
      mounted?.destroy();
      mounted = null;
    },
  };
}

function imageBacked(initial: Node): NodeView {
  const img = document.createElement('img');
  let node = initial;
  let current = '';
  let blocked = false;
  let resolver: Resolver | null = null;
  const signal = { cancelled: false };

  const render = () => {
    const src = String(node.attrs.src ?? '');
    const { alt, size } = parseAltSize(String(node.attrs.alt ?? ''));
    const title = String(node.attrs.title ?? '');
    const block = isWebImage(src) && !useStore.getState().settings.webImages;
    img.alt = block && !alt ? t('image.blocked') : alt;
    img.title = block ? [title, t('image.blockedHint')].filter(Boolean).join('\n') : title;
    img.classList.toggle('image-blocked', block);
    if (size) {
      img.width = size.width;
      if (size.height !== null) img.height = size.height;
      else img.removeAttribute('height');
    } else {
      img.removeAttribute('width');
      img.removeAttribute('height');
    }
    if (src === current && block === blocked) return;
    current = src;
    blocked = block;
    if (block || !isRelativeUrl(src)) {
      // Nothing to resolve: a resolver left running would put a vault file back.
      resolver?.destroy();
      resolver = null;
      if (block) img.removeAttribute('src');
      else img.src = src;
      return;
    }
    img.src = src; // shows the alt text if it can't be resolved
    if (resolver) {
      resolver.update(src);
      return;
    }
    img.loading = 'lazy';
    withEmbedRender((m) => {
      // A web setting flip may have changed what the view shows meanwhile.
      if (signal.cancelled || resolver || blocked || !isRelativeUrl(current)) return;
      resolver = m.mountImageResolver(img, current, { doc: liveDocContext, signal });
    });
  };
  render();
  // Turning the setting on (or off) applies to images already on screen.
  const unsubscribe = useStore.subscribe((state, prev) => {
    if (state.settings.webImages !== prev.settings.webImages) render();
  });
  return {
    dom: img,
    update(next) {
      if (next.type !== initial.type) return false;
      // A target that now needs an embed (or no longer does) can't reuse this element.
      if (embedToken(String(next.attrs.src ?? '')) !== null) return false;
      node = next;
      render();
      return true;
    },
    ignoreMutation: () => true,
    destroy() {
      signal.cancelled = true;
      unsubscribe();
      resolver?.destroy();
      resolver = null;
    },
  };
}

export const imageNodeView: NodeViewConstructor = (initial: Node) => {
  const token = embedToken(String(initial.attrs.src ?? ''));
  return token === null ? imageBacked(initial) : embedBacked(initial, token);
};
