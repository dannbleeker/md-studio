import type { Node } from '@milkdown/kit/prose/model';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { parseWikiRef } from '@/domain/embeds';
import { t } from '@/i18n';
import type { DocContext } from '@/services/attachments';
import { useStore } from '@/store';

/**
 * The eager part of the embed views: a loading chip and the node view's
 * plumbing. Drawing, resolving and the services behind them load on first
 * use (see embedRender), so a note without embeds never pays for them; once
 * the module has arrived every later view mounts in the same tick.
 */

type Render = typeof import('./embedRender');
let loaded: Render | null = null;
let loading: Promise<Render> | null = null;

/** Runs `use` with the render module: at once when it is loaded, else after it arrives. */
export function withEmbedRender(use: (m: Render) => void): void {
  if (loaded) {
    use(loaded);
    return;
  }
  loading ??= import('./embedRender').then(
    (m) => {
      loaded = m;
      return m;
    },
    (error) => {
      // A failed chunk load (offline, stale build) is retried by the next view.
      loading = null;
      throw error;
    }
  );
  loading.then(use, () => {});
}

/**
 * Resolves once every embed that was waiting for the viewport has loaded.
 * Nothing to do (and nothing loaded) for a note without embeds. Print calls
 * this first, so the page does not show loading chips for what is off screen.
 */
export async function loadAllEmbeds(): Promise<void> {
  const render = loaded ?? (await loading?.catch(() => null));
  await render?.flushPendingEmbeds();
}

/** The open document, read at every render so a tab switch is noticed. */
export function liveDocContext(): DocContext {
  const { fileHandle, handleId } = useStore.getState();
  return { fileHandle, handleId };
}

export function loadingChip(): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'md-embed-chip md-embed-loading';
  chip.textContent = t('embed.loading');
  return chip;
}

/** Events inside controls, frames and transcluded notes belong to them, not to the editor. */
export const ownsEvent = (event: Event): boolean =>
  event.target instanceof Element &&
  event.target.closest('audio, video, iframe, a, input, .md-transclusion') !== null;

const BLOCK_KINDS = ['note', 'pdf', 'video'];

function hostClass(raw: string): string {
  const ref = parseWikiRef(raw);
  return ref?.embed && BLOCK_KINDS.includes(ref.kind)
    ? 'md-embed-host md-embed-block'
    : 'md-embed-host';
}

export const embedNodeView: NodeViewConstructor = (initial: Node) => {
  let node = initial;
  let raw = String(node.attrs.raw ?? '');
  const dom = document.createElement('span');
  dom.className = hostClass(raw);
  dom.append(loadingChip());
  const signal = { cancelled: false };
  let mounted: { update(raw: string): void; destroy(): void } | null = null;
  withEmbedRender((m) => {
    if (signal.cancelled) return;
    mounted = m.mountEmbed(dom, raw, {
      doc: liveDocContext,
      chain: { depth: 0, visited: [] },
      fromNotePath: undefined,
      signal,
    });
  });
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      const nextRaw = String(next.attrs.raw ?? '');
      if (nextRaw === raw) return true;
      raw = nextRaw;
      mounted?.update(raw);
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
};
