import {
  type EmbedKind,
  parseWikiRef,
  splitLinkTarget,
  type WikiRef,
  wikilinkLabel,
} from '@/domain/embeds';
import { isWebImage } from '@/domain/imagePaths';
import {
  descend,
  MAX_LIVE_TRANSCLUSIONS,
  selectNoteContent,
  startChain,
  type TranscludeChain,
} from '@/domain/transclusion';
import { t } from '@/i18n';
import {
  type DocContext,
  getVault,
  noteRelativePath,
  peekAttachment,
  peekNoteRead,
  type ResolvedAttachment,
  type ResolveOptions,
  readNoteText,
  resolveAttachment,
  subscribeAttachments,
} from '@/services/attachments';
import { useStore } from '@/store';
import {
  audioElement,
  fileChip,
  imageElement,
  pdfElement,
  placeholder,
  videoElement,
  wikilinkChip,
} from './mediaRenderers';

/**
 * Draws wiki tokens and Markdown images in the visual pane. Everything
 * shown is derived from the token's text; the document is never written
 * from here. This module and what it pulls in load on demand, so a note
 * without embeds never pays for them.
 */

export interface EmbedRenderContext {
  doc: () => DocContext;
  chain: TranscludeChain;
  /** undefined is the host note; a path is the transcluded note this embed sits in. */
  fromNotePath: string | null | undefined;
  signal: { cancelled: boolean };
  /** The embed stands for a Markdown link, so its path is tried next to the note first. */
  markdown?: boolean;
}

// ---------------------------------------------------------------------------
// Deferral until visible
// ---------------------------------------------------------------------------

type Pending = () => void | Promise<void>;
const waiting = new Map<Element, Pending>();
let observer: IntersectionObserver | null = null;
/** Loads that have started and not settled, so a print can wait for them as well as the unstarted. */
const inflight = new Set<Promise<void>>();
/**
 * Views whose last answer was "still scanning the vault", with the document each asked about.
 * They show a loading chip until the scan ends and notifies them, which no load in flight covers.
 */
const awaitingScan = new Map<object, DocContext>();

function start(run: Pending): Promise<void> {
  const loading = Promise.resolve(run());
  const forget = () => {
    inflight.delete(loading);
  };
  inflight.add(loading);
  loading.then(forget, forget);
  return loading;
}

/**
 * Runs `run` once `el` is near the viewport (one observer for every embed).
 * Without IntersectionObserver (jsdom, very old browsers) it runs at once.
 * A pane hidden by the view mode never intersects, so text-only view
 * loads nothing until a print asks for everything (see flushPendingEmbeds).
 * Returns a cancel function.
 */
function whenVisible(el: Element, run: Pending): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    void start(run);
    return () => {};
  }
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = waiting.get(entry.target);
          if (!cb) continue;
          waiting.delete(entry.target);
          observer?.unobserve(entry.target);
          void start(cb);
        }
      },
      { rootMargin: '400px' }
    );
    // Print shows the whole pane, but nothing scrolls into view at print time. The browser
    // does not wait for this: the Print command and Ctrl+P await flushPendingEmbeds first.
    window.addEventListener('beforeprint', () => {
      makeImagesEager();
      void flushPendingEmbeds();
    });
  }
  waiting.set(el, run);
  observer.observe(el);
  return () => {
    waiting.delete(el);
    observer?.unobserve(el);
  };
}

/**
 * Loads every embed still waiting for the viewport, and resolves once they
 * have all settled. Printing needs this: the print layout shows the whole
 * visual pane, including embeds far below the fold and those in a pane the
 * view mode hides, none of which an IntersectionObserver would ever report.
 */
export async function flushPendingEmbeds(): Promise<void> {
  // A transcluded note mounts its own embeds and images while it loads, and those
  // wait for the viewport too, so go round again until nothing is left. An embed whose
  // load has started is not in `waiting` but is not done either, and one told that the vault
  // is still being scanned is redrawn only when the scan ends: wait for both.
  for (
    let pass = 0;
    pass < MAX_FLUSH_PASSES && (waiting.size > 0 || inflight.size > 0 || awaitingScan.size > 0);
    pass++
  ) {
    const pending = [...waiting];
    waiting.clear();
    const loads: Array<Promise<void>> = [...inflight];
    for (const [el, run] of pending) {
      observer?.unobserve(el);
      loads.push(start(run));
    }
    await Promise.allSettled(loads);
    if (waiting.size === 0 && inflight.size === 0 && awaitingScan.size > 0) await finishScans();
  }
  await decodeImages(makeImagesEager());
}

/**
 * Waits for the scan of each vault a view is still waiting on. Its end notifies the views,
 * which redraw (and re-register) before this resolves; the next pass then picks them up.
 * Bounded, like the image decode: a huge vault must not hold a printout back for minutes.
 */
async function finishScans(): Promise<void> {
  const docs: DocContext[] = [];
  for (const doc of awaitingScan.values()) {
    if (!docs.some((known) => sameDoc(known, doc))) docs.push(doc);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    // Past the limit the printout shows what it has.
    timer = setTimeout(resolve, SCAN_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      Promise.allSettled(docs.map((doc) => getVault(doc, { complete: true }))),
      timeout,
    ]);
    await Promise.resolve();
  } finally {
    clearTimeout(timer);
    // Views the scan's end redraws have registered again by now if they still wait; any other
    // entry belongs to a view that is gone, and must not hold later prints back.
    awaitingScan.clear();
  }
}

const MAX_FLUSH_PASSES = 8;
/** Longest a printout waits for the first scan of a vault. */
const SCAN_TIMEOUT_MS = 10_000;
/** Print must not hang on one image that never decodes. */
const DECODE_TIMEOUT_MS = 5000;

/**
 * Images are lazy so a long note does not fetch them all, but a lazy image
 * below the fold is never painted into a printout. Print wants every one.
 */
function makeImagesEager(): HTMLImageElement[] {
  const images = Array.from(document.images);
  for (const img of images) {
    if (img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
  }
  return images;
}

/** Resolves once each image with a source has decoded (or failed), or the timeout passes. */
async function decodeImages(images: readonly HTMLImageElement[]): Promise<void> {
  const decoding = images
    .filter((img) => img.getAttribute('src') && typeof img.decode === 'function')
    .map((img) => img.decode());
  if (decoding.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DECODE_TIMEOUT_MS);
  });
  try {
    await Promise.race([Promise.allSettled(decoding), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

type NoteModule = typeof import('./noteRenderer');
let noteModule: NoteModule | null = null;
const loadNotes = (): Promise<NoteModule> =>
  import('./noteRenderer').then((m) => {
    noteModule = m;
    return m;
  });

const NO_HANDLE = {};

/**
 * Embeds in the page that hold a note view, nested ones included. Each takes a slot
 * before it reads or draws a note and gives it back when destroyed, so the work
 * is bounded by MAX_LIVE_TRANSCLUSIONS however the notes nest.
 */
let liveNotes = 0;
let hostPaths = new WeakMap<object, string>();
// A chosen folder or a rescan can move the host in the vault: every view drops what was cached
// before it redraws (see the subscription in mountEmbed).
const forgetHostPaths = () => {
  hostPaths = new WeakMap();
};

/**
 * The host note's vault path ('' when it has none), cached per file handle. Only an
 * answer is cached: "no folder yet" must not stick once one is chosen.
 */
async function hostPathOf(doc: DocContext): Promise<string> {
  const key = doc.fileHandle ?? NO_HANDLE;
  const known = hostPaths.get(key);
  if (known !== undefined) return known;
  const path = await noteRelativePath(doc);
  if (path !== null) hostPaths.set(key, path);
  return path ?? '';
}

const sameDoc = (a: DocContext, b: DocContext) =>
  a.handleId === b.handleId && a.fileHandle === b.fileHandle;

/** A small stable hash of the shown text: it keys the render of a note, whoever's file it is. */
function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h >>> 0}`;
}

const BLOCK_KINDS: readonly EmbedKind[] = ['note', 'pdf', 'video'];
/** Kinds whose elements are costly: built only once visible, even from a cache hit. */
const HEAVY_KINDS: readonly EmbedKind[] = ['note', 'pdf'];

const optionsFor = (
  ctx: Pick<EmbedRenderContext, 'fromNotePath' | 'markdown'>
): ResolveOptions => ({
  ...(ctx.markdown ? { markdown: true } : {}),
  ...(ctx.fromNotePath === undefined ? {} : { fromNotePath: ctx.fromNotePath }),
});

// ---------------------------------------------------------------------------
// Wiki tokens
// ---------------------------------------------------------------------------

const nameOf = (ref: WikiRef) => ref.target || ref.fragment || ref.raw;

/**
 * Mounts one token into `host`. `update` follows a changed token; `destroy`
 * stops everything this embed started. The view remembers the document it
 * drew for (handle and file) and the token, and draws again when either
 * differs, because an unchanged token keeps its view across a tab switch.
 */
export function mountEmbed(
  host: HTMLElement,
  initial: string,
  ctx: EmbedRenderContext
): { update(raw: string): void; destroy(): void } {
  let raw = initial;
  let generation = 0;
  let destroyed = false;
  let seen: DocContext | null = null;
  let shownKey = '';
  let owned: { destroy(): void } | null = null;
  let stopVisible: (() => void) | null = null;
  let stopWeb: (() => void) | null = null;
  let stopLive: (() => void) | null = null;
  let liveTimer: ReturnType<typeof setTimeout> | null = null;
  let slot = false;
  /** Identifies this view in awaitingScan. */
  const scanKey = {};

  /** Takes this embed's slot for a note view (once); false when the page is at its limit. */
  function claimSlot(): boolean {
    if (slot) return true;
    if (liveNotes >= MAX_LIVE_TRANSCLUSIONS) return false;
    liveNotes++;
    slot = true;
    return true;
  }

  function showLimit(ref: WikiRef): void {
    setBlock(true);
    show(
      `limit|${raw}`,
      placeholder({ kind: 'limit', label: t('embed.limit', { name: nameOf(ref) }), raw })
    );
  }

  const stale = (my: number) =>
    destroyed || ctx.signal.cancelled || my !== generation || !seen || !sameDoc(seen, ctx.doc());

  const setBlock = (block: boolean) => host.classList.toggle('md-embed-block', block);

  function show(key: string, node: Node, handle?: { destroy(): void }): void {
    if (key === shownKey) {
      handle?.destroy();
      return;
    }
    owned?.destroy();
    owned = handle ?? null;
    shownKey = key;
    host.replaceChildren(node);
  }

  const showLoading = () =>
    show('loading', placeholder({ kind: 'loading', label: t('embed.loading') }));

  function showAttachment(ref: WikiRef, res: Extract<ResolvedAttachment, { state: 'ok' }>): void {
    setBlock(BLOCK_KINDS.includes(res.kind));
    const key = `ok|${raw}|${res.kind}|${res.url}|${res.ambiguous}`;
    if (key === shownKey) return;
    let node: HTMLElement;
    // Several files share the name: say which one is shown, whatever kind it is.
    const hint = res.ambiguous ? { title: t('embed.ambiguous', { path: res.path }) } : {};
    switch (res.kind) {
      case 'image':
        node = imageElement({ url: res.url, alt: ref.alt ?? res.name, size: ref.size, ...hint });
        break;
      case 'pdf':
        node = pdfElement({
          url: res.url,
          name: res.name,
          page: ref.pdf?.page ?? null,
          height: ref.pdf?.height ?? null,
          size: ref.size,
          ...hint,
        });
        break;
      case 'audio':
        node = audioElement({ url: res.url, name: res.name, ...hint });
        break;
      case 'video':
        node = videoElement({ url: res.url, name: res.name, size: ref.size, ...hint });
        break;
      default:
        node = fileChip({ url: res.url, name: res.name, ...hint });
    }
    show(key, node);
  }

  function showProblem(ref: WikiRef, res: Exclude<ResolvedAttachment, { state: 'ok' }>): void {
    const name = nameOf(ref);
    if (res.state === 'scanning') {
      // A better answer is coming: never Not found while the index is still being built.
      if (!shownKey.startsWith('ok|') && !shownKey.startsWith('note|')) showLoading();
      awaitingScan.set(scanKey, ctx.doc());
      return;
    }
    setBlock(false);
    if (res.state === 'missing') {
      const isNote = ref.kind === 'note';
      show(
        `missing|${raw}`,
        placeholder({
          kind: 'missing',
          label: t(
            res.tooLarge ? 'embed.noteTooLarge' : isNote ? 'embed.noteMissing' : 'embed.missing',
            { name }
          ),
          raw,
          ...(res.rootLooksLikeVault || res.tooLarge ? {} : { hint: t('embed.missingHint') }),
        })
      );
      return;
    }
    show(
      `unavailable|${raw}|${res.reason}`,
      placeholder({ kind: 'unavailable', label: t('embed.unavailable', { name }), raw })
    );
  }

  /** The chain for a note about to be entered: the top level is re-seeded with the host's real path. */
  function chainFor(hostPath: string | undefined): TranscludeChain | null {
    if (ctx.fromNotePath !== undefined || ctx.chain.depth > 0) return ctx.chain;
    return hostPath === undefined ? null : startChain(hostPath);
  }

  function cachedHostPath(doc: DocContext): string | undefined {
    return hostPaths.get(doc.fileHandle ?? NO_HANDLE);
  }

  /**
   * Shows a transcluded note. With `syncOnly` it only succeeds from caches
   * and returns false otherwise, so a rebuilt view can draw its first
   * frame at once; the async path fills in what is missing.
   */
  async function showNote(
    my: number,
    doc: DocContext,
    ref: WikiRef,
    read: Extract<ReturnType<typeof peekNoteRead>, { state: 'ok' }>,
    mod: NoteModule,
    syncOnly: boolean
  ): Promise<boolean> {
    let hostPath = cachedHostPath(doc);
    if (hostPath === undefined && !syncOnly) {
      hostPath = await hostPathOf(doc);
      if (stale(my)) return true;
    }
    const chain = chainFor(hostPath);
    if (!chain) return false;
    const name = nameOf(ref);
    setBlock(true);
    const entered = descend(chain, read.path, ref.fragment);
    if (!entered.ok) {
      show(
        `${entered.reason}|${raw}`,
        placeholder({
          kind: entered.reason,
          label: t(entered.reason === 'cycle' ? 'embed.cycle' : 'embed.depth', { name }),
          raw,
        })
      );
      return true;
    }
    const selected = selectNoteContent(read.text, ref.fragment);
    if (!selected) {
      show(
        `section|${raw}`,
        placeholder({
          kind: 'missing',
          label: t('embed.sectionMissing', { name: ref.target || read.path }),
          raw,
        })
      );
      return true;
    }
    if (!claimSlot()) {
      showLimit(ref);
      return true;
    }
    // Keyed on the text itself: a file date and size say nothing about which vault a note is
    // from, and two copies of a vault share both while their text differs.
    const cacheKey = [read.path, hashText(selected.markdown), ref.fragment ?? ''].join('|');
    // Web images follow the setting, and the embeds inside depend on the chain they were entered with.
    const webImages = useStore.getState().settings.webImages;
    const hint = read.ambiguous ? t('embed.ambiguous', { path: read.path }) : undefined;
    const key = [
      'note',
      cacheKey,
      doc.handleId ?? '',
      webImages ? 1 : 0,
      entered.chain.visited.join('\0'),
      hint ?? '',
    ].join('|');
    watchWeb();
    if (key === shownKey) return true;
    const args = {
      markdown: selected.markdown,
      cacheKey,
      notePath: read.path,
      title: [read.path.replace(/^.*\//, '').replace(/\.md$/i, '') || name, ref.fragment]
        .filter((s) => s)
        .join(' > '),
      ...(hint ? { hint } : {}),
      ctx,
      chain: entered.chain,
      mountEmbed,
      mountImage: mountImageResolver,
    };
    const hit = mod.peekNoteBlock(args);
    if (hit) {
      show(key, hit.el, hit);
      return true;
    }
    if (syncOnly) return false;
    const block = await mod.renderNoteBlock(args);
    if (stale(my)) {
      block.destroy();
      return true;
    }
    show(key, block.el, block);
    return true;
  }

  async function loadNote(my: number, doc: DocContext, ref: WikiRef): Promise<void> {
    // Before the read: the point is not to touch notes beyond the limit at all.
    if (!claimSlot()) {
      showLimit(ref);
      return;
    }
    const mod = noteModule ?? (await loadNotes());
    if (stale(my)) return;
    const read = await readNoteText(doc, ref.target, noteOptions());
    if (stale(my)) return;
    if (read.state === 'ok') {
      await showNote(my, doc, ref, read, mod, false);
      return;
    }
    showProblem(ref, read);
  }

  const noteOptions = () =>
    ctx.fromNotePath === undefined ? undefined : { fromNotePath: ctx.fromNotePath };

  async function load(my: number, doc: DocContext, ref: WikiRef): Promise<void> {
    awaitingScan.delete(scanKey);
    if (ref.kind === 'note') {
      await loadNote(my, doc, ref);
      return;
    }
    const res = await resolveAttachment(doc, ref.target, optionsFor(ctx));
    if (stale(my)) return;
    if (res.state !== 'ok') {
      showProblem(ref, res);
      return;
    }
    // A dotted note name (Meeting 2024.01.15) looks like an unknown file
    // until it resolves to a .md file.
    if (res.kind === 'note') await loadNote(my, doc, ref);
    else showAttachment(ref, res);
  }

  function showWeb(ref: WikiRef): void {
    setBlock(false);
    const allowed = useStore.getState().settings.webImages;
    if (!allowed) {
      const img = document.createElement('img');
      img.className = 'image-blocked';
      img.alt = ref.alt ?? t('image.blocked');
      img.title = t('image.blockedHint');
      show(`web-blocked|${raw}`, img);
      return;
    }
    show(`web|${raw}`, imageElement({ url: ref.target, alt: ref.alt ?? '', size: ref.size }));
  }

  function run(): void {
    if (destroyed || ctx.signal.cancelled) return;
    const my = ++generation;
    stopVisible?.();
    stopVisible = null;
    const doc = ctx.doc();
    // Another document's drawing must not stay on screen while this one loads.
    if (seen && !sameDoc(seen, doc)) shownKey = '';
    seen = { handleId: doc.handleId, fileHandle: doc.fileHandle };
    const ref = parseWikiRef(raw);
    if (!ref) {
      setBlock(false);
      show(`text|${raw}`, document.createTextNode(raw));
      return;
    }
    if (!ref.embed) {
      setBlock(false);
      show(`link|${raw}`, wikilinkChip(wikilinkLabel(ref), raw));
      return;
    }
    setBlock(BLOCK_KINDS.includes(ref.kind));
    if (isWebImage(ref.target)) {
      watchWeb();
      showWeb(ref);
      return;
    }
    if (ref.target === '' && ctx.fromNotePath === undefined) watchLive();
    let drawn = false;
    if (ref.kind === 'note') {
      const peeked = peekNoteRead(doc, ref.target, noteOptions());
      if (peeked?.state === 'ok' && noteModule) {
        // Fire-and-forget: a sync success only needs the cache; otherwise showNote leaves the loader to the async path.
        void showNote(my, doc, ref, peeked, noteModule, true);
        drawn =
          shownKey.startsWith('note|') ||
          shownKey.startsWith('cycle|') ||
          shownKey.startsWith('depth|');
      }
    } else {
      const peeked = peekAttachment(doc, ref.target, optionsFor(ctx));
      if (peeked?.state === 'ok' && !HEAVY_KINDS.includes(peeked.kind)) {
        showAttachment(ref, peeked);
        drawn = true;
      }
    }
    if (!drawn && shownKey === '') showLoading();
    stopVisible = whenVisible(host, () => {
      stopVisible = null;
      return load(my, doc, ref);
    });
  }

  /** Web images follow the Load web images setting while a view shows one. */
  function watchWeb(): void {
    if (stopWeb) return;
    stopWeb = useStore.subscribe((state, prev) => {
      if (state.settings.webImages !== prev.settings.webImages) run();
    });
  }

  /** A same-note embed shows the live editor text, so it follows edits after a pause. */
  function watchLive(): void {
    if (stopLive) return;
    stopLive = useStore.subscribe((state, prev) => {
      if (state.doc.markdown === prev.doc.markdown) return;
      if (liveTimer !== null) clearTimeout(liveTimer);
      liveTimer = setTimeout(() => {
        liveTimer = null;
        run();
      }, 600);
    });
  }

  const unsubscribe = subscribeAttachments(() => {
    forgetHostPaths();
    run();
  });
  run();

  return {
    update(next) {
      if (next === raw) return;
      raw = next;
      run();
    },
    destroy() {
      destroyed = true;
      generation++;
      stopVisible?.();
      stopWeb?.();
      stopLive?.();
      if (liveTimer !== null) clearTimeout(liveTimer);
      awaitingScan.delete(scanKey);
      unsubscribe();
      owned?.destroy();
      owned = null;
      if (slot) {
        slot = false;
        liveNotes--;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown images
// ---------------------------------------------------------------------------

/**
 * Whether a resolved file may back an <img>. Notes, PDFs, audio and video get embed
 * rendering instead; any other extension (ico, jfif, tiff, none at all) stays an image,
 * since the browser decides what it can draw.
 */
const isPlainFile = (hit: { kind: EmbedKind; path: string }): boolean =>
  hit.kind === 'image' ||
  hit.kind === 'other' ||
  // The classifier files an extensionless name under 'note'; only a real .md is one.
  (hit.kind === 'note' && !/\.md$/i.test(hit.path));

/**
 * Resolves a Markdown image link inside the vault and points `img` at the
 * file. The node's own `src` is never touched: only the element changes,
 * and it falls back to the written `src` when nothing resolves. Like the
 * embeds it redraws when the document changes under it.
 */
export function mountImageResolver(
  img: HTMLImageElement,
  initial: string,
  ctx: Pick<EmbedRenderContext, 'doc' | 'signal'> & { fromNotePath?: string | null }
): { update(src: string): void; destroy(): void } {
  let src = initial;
  let generation = 0;
  let destroyed = false;
  let seen: DocContext | null = null;
  let stopVisible: (() => void) | null = null;
  const scanKey = {};

  const set = (value: string) => {
    if (img.getAttribute('src') !== value) img.setAttribute('src', value);
  };

  function run(): void {
    if (destroyed || ctx.signal.cancelled) return;
    const my = ++generation;
    stopVisible?.();
    stopVisible = null;
    const doc = ctx.doc();
    const switched = seen !== null && !sameDoc(seen, doc);
    seen = { handleId: doc.handleId, fileHandle: doc.fileHandle };
    const { path, literal } = splitLinkTarget(src);
    const opts: ResolveOptions = {
      markdown: true,
      ...(ctx.fromNotePath === undefined ? {} : { fromNotePath: ctx.fromNotePath }),
      ...(literal !== path ? { alternates: [literal] } : {}),
    };
    const peeked = peekAttachment(doc, path, opts);
    if (peeked?.state === 'ok' && isPlainFile(peeked)) set(peeked.url);
    else if (switched) set(src);
    stopVisible = whenVisible(img, () => {
      stopVisible = null;
      awaitingScan.delete(scanKey);
      return resolveAttachment(doc, path, opts).then((res) => {
        if (destroyed || ctx.signal.cancelled || my !== generation) return;
        if (seen && !sameDoc(seen, ctx.doc())) return;
        if (res.state === 'ok' && isPlainFile(res)) set(res.url);
        else if (res.state === 'scanning') awaitingScan.set(scanKey, doc);
        else set(src);
      });
    });
  }

  const unsubscribe = subscribeAttachments(run);
  run();
  return {
    update(next) {
      if (next === src) return;
      src = next;
      set(src);
      run();
    },
    destroy() {
      destroyed = true;
      generation++;
      stopVisible?.();
      awaitingScan.delete(scanKey);
      unsubscribe();
    },
  };
}
