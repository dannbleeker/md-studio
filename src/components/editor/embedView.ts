import type { Node } from '@milkdown/kit/prose/model';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { parseWikiRef } from '@/domain/embeds';
import { parseMathToken } from '@/domain/math';
import { t } from '@/i18n';
import type { DocContext } from '@/services/attachments';
import { useStore } from '@/store';
import { prepareForPrint } from '@/store/flush';

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
  await (await mathModule)?.mathSettled();
}

/** The math drawing module, once a formula has asked for it; null until then. */
let mathModule: Promise<typeof import('./mathRender') | null> = Promise.resolve(null);

/**
 * Prints the document with every embed drawn. The Print command and Ctrl+P both come
 * here: the browser's own `beforeprint` cannot wait for an embed, so a printout started
 * from the menu would show loading chips for whatever was off screen.
 */
export async function printDocument(): Promise<void> {
  // First, so the embeds of the document being printed are the ones loaded.
  prepareForPrint();
  await loadAllEmbeds();
  window.print();
}

/** The open document, read at every render so a tab switch is noticed. */
export function liveDocContext(): DocContext {
  const { fileHandle, handleId } = useStore.getState();
  return { fileHandle, handleId };
}

function loadingChip(): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'md-embed-chip md-embed-loading';
  chip.textContent = t('embed.loading');
  return chip;
}

/**
 * Shows a token in a live editor's node view: a loading chip until the
 * render module has arrived, then the embed. A token changed meanwhile is
 * the one mounted. `markdown` resolves a path note-relative first, as a
 * Markdown link does.
 */
export function mountLiveEmbed(
  dom: HTMLElement,
  token: string,
  markdown = false
): { update(token: string): void; destroy(): void } {
  const signal = { cancelled: false };
  let current = token;
  let mounted: { update(raw: string): void; destroy(): void } | null = null;
  dom.append(loadingChip());
  withEmbedRender((m) => {
    if (signal.cancelled) return;
    mounted = m.mountEmbed(dom, current, {
      doc: liveDocContext,
      chain: { depth: 0, visited: [] },
      fromNotePath: undefined,
      signal,
      ...(markdown ? { markdown: true } : {}),
    });
  });
  return {
    update(next) {
      current = next;
      mounted?.update(next);
    },
    destroy() {
      signal.cancelled = true;
      mounted?.destroy();
      mounted = null;
    },
  };
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

/** A formula: its source until KaTeX has drawn it. A new source is drawn again; a node that stops being math is rebuilt. */
const mathNodeView: NodeViewConstructor = (initial: Node) => {
  let raw = String(initial.attrs.raw ?? '');
  const dom = document.createElement('span');
  const draw = () => {
    const display = parseMathToken(raw)?.display === true;
    dom.className = `md-embed-host md-math${display ? ' md-math-display' : ''}`;
    dom.textContent = raw;
    dom.dataset.raw = raw;
    mathModule = import('./mathRender').catch(() => null);
    void mathModule.then((m) => m?.renderMath(dom, raw));
  };
  draw();
  return {
    dom,
    update(next) {
      if (next.type !== initial.type) return false;
      const nextRaw = String(next.attrs.raw ?? '');
      if (!parseMathToken(nextRaw)) return false;
      if (nextRaw !== raw) {
        raw = nextRaw;
        draw();
      }
      return true;
    },
    ignoreMutation: () => true,
    stopEvent: ownsEvent,
  };
};

export const embedNodeView: NodeViewConstructor = (
  initial: Node,
  view,
  getPos,
  decorations,
  inner
) => {
  if (parseMathToken(String(initial.attrs.raw ?? '')))
    return mathNodeView(initial, view, getPos, decorations, inner);
  let node = initial;
  let raw = String(node.attrs.raw ?? '');
  const dom = document.createElement('span');
  dom.className = hostClass(raw);
  const embed = mountLiveEmbed(dom, raw);
  return {
    dom,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      const nextRaw = String(next.attrs.raw ?? '');
      if (nextRaw === raw) return true;
      // A wiki token that became a formula needs the formula's view.
      if (parseMathToken(nextRaw)) return false;
      raw = nextRaw;
      embed.update(raw);
      return true;
    },
    ignoreMutation: () => true,
    stopEvent: ownsEvent,
    destroy: () => embed.destroy(),
  };
};
