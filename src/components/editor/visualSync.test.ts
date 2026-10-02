import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NESTING_LIMIT } from '@/domain/nesting';
import {
  createVisualSync,
  RECONCILE_AFTER_MS,
  type SyncHost,
  type SyncState,
  TEXT_TO_VISUAL_DEBOUNCE_MS,
  type VisualSync,
} from './visualSync';

/** A stand-in editor: it only remembers the Markdown it shows. */
type FakeEditor = { doc: string; destroyed: boolean };

/** Markdown containing this "can't be parsed" by the fake host. */
const BROKEN = '<<overflow>>';
const DEEP = '['.repeat(NESTING_LIMIT + 1);

function setup(initial = '# start') {
  let state: SyncState = { markdown: initial, viewMode: 'split', loadId: 0, source: 'load' };
  const log: string[] = [];
  let incrementalWorks = true;
  let current: FakeEditor | null = null;
  let failed = false;
  let failureNotices = 0;

  const host: SyncHost<FakeEditor> = {
    read: () => state,
    create: async (md) => {
      log.push(`create ${md}`);
      if (md.includes(BROKEN)) throw new Error('parse');
      return { doc: md, destroyed: false };
    },
    destroy: (editor) => {
      if (editor) editor.destroyed = true;
    },
    setEditor: (editor) => {
      current = editor;
    },
    applyFull: (editor, md) => {
      log.push(`full ${md}`);
      if (md.includes(BROKEN)) throw new Error('parse');
      editor.doc = md;
    },
    // Like the real one: nothing changed means nothing to do, and success.
    applyIncremental: (editor, oldMd, md) => {
      if (oldMd === md) return true;
      if (!incrementalWorks) return false;
      log.push(`incremental ${md}`);
      editor.doc = md;
      return true;
    },
    setFailed: (value, firstTime) => {
      failed = value;
      if (firstTime) failureNotices++;
    },
    measure: () => {},
  };

  const sync: VisualSync = createVisualSync(host);
  /** Simulates a store update, as the store subscription would pass it on. */
  const change = (patch: Partial<SyncState>) => {
    const prev = state;
    state = { ...state, ...patch };
    sync.onChange(state, prev);
  };
  const type = (markdown: string) => change({ markdown, source: 'text' });

  return {
    sync,
    change,
    type,
    log,
    shown: () => current?.doc,
    editor: () => current,
    failed: () => failed,
    failureNotices: () => failureNotices,
    noIncremental: () => {
      incrementalWorks = false;
    },
    /** Lets the editor's async creation settle. */
    settle: () => vi.advanceTimersByTimeAsync(0),
  };
}

describe('visual sync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('builds the editor with the store’s Markdown', async () => {
    const s = setup('# hello');
    await s.settle();
    expect(s.shown()).toBe('# hello');
    expect(s.log).toEqual(['create # hello']);
  });

  it('catches up with an edit made while the editor was being built', async () => {
    const s = setup('a');
    s.type('ab');
    await s.settle();
    expect(s.shown()).toBe('ab');
  });

  it('batches text-pane edits for the debounce, then applies them once', async () => {
    const s = setup('a');
    await s.settle();
    s.type('ab');
    s.type('abc');
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS - 1);
    expect(s.shown()).toBe('a');
    await vi.advanceTimersByTimeAsync(1);
    expect(s.shown()).toBe('abc');
    expect(s.log.filter((l) => l.startsWith('incremental'))).toEqual(['incremental abc']);
  });

  it('double-checks an incremental update with a full parse once typing pauses', async () => {
    const s = setup('a');
    await s.settle();
    s.type('ab');
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS);
    expect(s.log.at(-1)).toBe('incremental ab');
    await vi.advanceTimersByTimeAsync(RECONCILE_AFTER_MS - 1);
    expect(s.log.at(-1)).toBe('incremental ab');
    await vi.advanceTimersByTimeAsync(1);
    expect(s.log.at(-1)).toBe('full ab');
  });

  it('falls back to a full parse when the incremental update can’t be sure', async () => {
    const s = setup('a');
    await s.settle();
    s.noIncremental();
    s.type('b');
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS);
    expect(s.log.at(-1)).toBe('full b');
    // Nothing left to double-check.
    await vi.advanceTimersByTimeAsync(RECONCILE_AFTER_MS);
    expect(s.log.at(-1)).toBe('full b');
  });

  it('applies pending edits and settles the double-check as soon as the pane is focused', async () => {
    const s = setup('a');
    await s.settle();
    s.type('ab');
    s.sync.onFocus();
    expect(s.shown()).toBe('ab');
    // The incremental update is double-checked right away, not 2.5 s later.
    expect(s.log.slice(-2)).toEqual(['incremental ab', 'full ab']);
    await vi.advanceTimersByTimeAsync(RECONCILE_AFTER_MS);
    expect(s.log.at(-1)).toBe('full ab');
  });

  it('takes its own edits as the truth and drops a pending double-check', async () => {
    const s = setup('a');
    await s.settle();
    s.type('ab');
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS);
    s.change({ markdown: 'ab visual', source: 'visual' });
    await vi.advanceTimersByTimeAsync(RECONCILE_AFTER_MS);
    expect(s.log.at(-1)).toBe('incremental ab');
    // The next text edit is diffed against the visual edit, not the older text.
    s.type('ab visual!');
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS);
    expect(s.log.at(-1)).toBe('incremental ab visual!');
  });

  it('skips updates while hidden and catches up when shown', async () => {
    const s = setup('a');
    await s.settle();
    s.change({ viewMode: 'text' });
    s.type('hidden edit');
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS * 2);
    expect(s.shown()).toBe('a');
    s.change({ viewMode: 'split' });
    expect(s.shown()).toBe('hidden edit');
  });

  it('shows a load (tab switch, reload from disk) at once with a full parse', async () => {
    const s = setup('a');
    await s.settle();
    s.change({ markdown: 'other tab', source: 'load', loadId: 1 });
    expect(s.log.at(-1)).toBe('full other tab');
  });

  it('defers a load made while hidden until the pane is shown', async () => {
    const s = setup('a');
    await s.settle();
    s.change({ viewMode: 'text' });
    s.change({ markdown: 'other tab', source: 'load', loadId: 1 });
    expect(s.shown()).toBe('a');
    s.sync.onFocus();
    expect(s.shown()).toBe('other tab');
  });

  it('rebuilds the editor empty and inert when the parser fails, then recovers', async () => {
    const s = setup('a');
    await s.settle();
    const first = s.editor();
    s.noIncremental();
    s.type(`x ${BROKEN}`);
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS);
    expect(first?.destroyed).toBe(true);
    expect(s.shown()).toBe('');
    expect(s.failed()).toBe(true);
    expect(s.failureNotices()).toBe(1);

    // Still broken: no rebuild for the same text, and no second notice.
    s.sync.onFocus();
    expect(s.failureNotices()).toBe(1);

    s.type('fixed');
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS);
    await s.settle();
    expect(s.shown()).toBe('fixed');
    expect(s.failed()).toBe(false);
  });

  it('never parses a document nested too deeply', async () => {
    const s = setup('a');
    await s.settle();
    s.type(DEEP);
    await vi.advanceTimersByTimeAsync(TEXT_TO_VISUAL_DEBOUNCE_MS);
    await s.settle();
    expect(s.failed()).toBe(true);
    expect(s.log.some((l) => l.includes(DEEP))).toBe(false);
  });

  it('starts inert when the stored document can’t be parsed', async () => {
    const s = setup(`# ${BROKEN}`);
    await s.settle();
    expect(s.log).toEqual([`create # ${BROKEN}`, 'create ']);
    expect(s.failed()).toBe(true);
  });

  it('stops all work when disposed, including an editor still being built', async () => {
    const s = setup('a');
    s.sync.dispose();
    await s.settle();
    expect(s.editor()).toBeNull();
    s.type('after');
    await vi.advanceTimersByTimeAsync(RECONCILE_AFTER_MS * 2);
    expect(s.log).toEqual(['create a']);
  });
});
