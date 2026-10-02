import { tooDeeplyNested } from '@/domain/nesting';
import type { ChangeSource } from '@/store';
import type { ViewMode } from '@/store/settings';

/**
 * Keeping the visual pane in step with the store's Markdown: when to apply
 * text-pane edits, how (incremental or full), when to double-check, and
 * what to do when a document can't be parsed. Milkdown itself is behind
 * `SyncHost`, so this runs (and is tested) without an editor.
 */

/** Text-pane edits are batched for this long before the visual tree is updated. */
export const TEXT_TO_VISUAL_DEBOUNCE_MS = 150;

/**
 * After incremental updates, one full parse once typing has paused this
 * long guarantees the panes can never drift apart.
 */
export const RECONCILE_AFTER_MS = 2500;

/** The parts of the store the sync reacts to. */
export type SyncState = {
  markdown: string;
  viewMode: ViewMode;
  loadId: number;
  source: ChangeSource;
};

export type SyncHost<E> = {
  /** The store's current state. */
  read(): SyncState;
  /** A new editor showing `markdown`; rejects if it can't be parsed. */
  create(markdown: string): Promise<E>;
  /** Tears an editor down and empties the pane. */
  destroy(editor: E | null): void;
  /** The editor now in use (null while one is being built). */
  setEditor(editor: E | null): void;
  /** Replaces the changed top-level blocks; throws if the parser fails. */
  applyFull(editor: E, markdown: string): void;
  /** Applies only the changed blocks; false when it can't be sure, throws if the parser fails. */
  applyIncremental(editor: E, oldMd: string, newMd: string): boolean;
  /** Shows or clears the "can't show this document" state (inert pane). */
  setFailed(failed: boolean, firstTime: boolean): void;
  measure(name: string, started: number): void;
};

export type VisualSync = {
  /** Store changed (subscribe to the store and pass both states). */
  onChange(state: SyncState, prev: SyncState): void;
  /** The user is about to edit the visual pane. */
  onFocus(): void;
  dispose(): void;
};

export function createVisualSync<E>(host: SyncHost<E>): VisualSync {
  let disposed = false;
  let editor: E | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  /** An incremental update hasn't been checked against a full parse yet. */
  let reconcileDue = false;
  /** The Markdown the visual document currently represents. */
  let appliedMd = host.read().markdown;
  /** Text-only view: the hidden pane skips updates and catches up when shown. */
  let staleWhileHidden = false;
  // A document the parser can't handle (thousands of nested quotes or
  // emphasis markers overflow its stack) can't be shown, and the overflow
  // leaves Milkdown's parser broken for later documents too. The pane is
  // rebuilt empty and kept inert until the Markdown parses again: an edit
  // to a stale tree would be serialized over the Markdown. Documents known
  // to be too deep (domain/nesting.ts) aren't even tried: deep brackets
  // don't overflow, but take seconds to parse.
  let failed = false;

  const setFailed = (value: boolean) => {
    host.setFailed(value, value && !failed);
    failed = value;
  };

  const cancelReconcile = () => {
    clearTimeout(reconcileTimer);
    reconcileDue = false;
  };

  const applyAll = (markdown: string) => {
    if (!editor) return;
    cancelReconcile();
    if (failed || tooDeeplyNested([markdown])) {
      if (markdown !== appliedMd || !failed) void mount(markdown);
      return;
    }
    try {
      host.applyFull(editor, markdown);
      appliedMd = markdown;
    } catch {
      void mount(markdown);
    }
  };

  /** Brings the pane up to the store's Markdown (text-pane edits). */
  const catchUp = () => {
    clearTimeout(pending);
    pending = undefined;
    if (!editor) return;
    const { markdown, viewMode } = host.read();
    if (viewMode === 'text') {
      staleWhileHidden = true;
      return;
    }
    staleWhileHidden = false;
    if (failed || tooDeeplyNested([markdown])) {
      applyAll(markdown);
      return;
    }
    const started = performance.now();
    let incremental = false;
    try {
      incremental = host.applyIncremental(editor, appliedMd, markdown);
    } catch {
      // Settled by the full parse below, which rebuilds the pane if it fails too.
    }
    if (!incremental) applyAll(markdown);
    host.measure(incremental ? 'visual-sync:incremental' : 'visual-sync:full', started);
    if (incremental) {
      appliedMd = markdown;
      cancelReconcile();
      reconcileDue = true;
      reconcileTimer = setTimeout(() => {
        const t0 = performance.now();
        applyAll(host.read().markdown);
        host.measure('visual-sync:reconcile', t0);
      }, RECONCILE_AFTER_MS);
    }
  };

  /** (Re)builds the editor showing `markdown`, or empty and inert if it can't be parsed. */
  const mount = (markdown: string): Promise<void> => {
    const previous = editor;
    editor = null;
    host.setEditor(null);
    host.destroy(previous);
    cancelReconcile();
    appliedMd = markdown;
    const created = tooDeeplyNested([markdown])
      ? Promise.reject(new Error('nested too deeply'))
      : host.create(markdown);
    return created
      .then((made) => {
        setFailed(false);
        return made;
      })
      .catch(() => {
        host.destroy(null);
        setFailed(true);
        return host.create('');
      })
      .then((made) => {
        if (disposed) {
          host.destroy(made);
          return;
        }
        editor = made;
        host.setEditor(made);
        // The text pane may have changed while the editor was being built.
        catchUp();
      });
  };

  void mount(appliedMd);

  return {
    onChange(state, prev) {
      if (state.loadId !== prev.loadId) {
        if (state.viewMode === 'text') staleWhileHidden = true;
        else applyAll(state.markdown);
        return;
      }
      if (staleWhileHidden && state.viewMode !== 'text' && prev.viewMode === 'text') {
        catchUp();
        return;
      }
      if (state.markdown === prev.markdown) return;
      if (state.source === 'visual') {
        // This pane made the edit: its document is the truth, and a pending
        // reconcile could only disturb the cursor.
        appliedMd = state.markdown;
        cancelReconcile();
        return;
      }
      clearTimeout(pending);
      pending = setTimeout(catchUp, TEXT_TO_VISUAL_DEBOUNCE_MS);
    },

    onFocus() {
      // About to type here: land any batched text-pane edits first, so the
      // visual tree never edits a stale copy of the document.
      if (pending || staleWhileHidden) catchUp();
      // Settle any incremental update before the user edits this tree:
      // once they type, the tree is serialized as the truth, and a
      // divergence from a full parse would become permanent.
      if (reconcileDue) applyAll(host.read().markdown);
    },

    dispose() {
      disposed = true;
      clearTimeout(pending);
      clearTimeout(reconcileTimer);
      host.destroy(editor);
      editor = null;
      host.setEditor(null);
    },
  };
}
