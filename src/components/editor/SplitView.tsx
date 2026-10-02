import { useCallback, useEffect, useRef } from 'react';
import { buildAnchors, fromAnchorPosition, toAnchorPosition } from '@/domain/scrollMap';
import { t } from '@/i18n';
import { perfMeasure } from '@/services/perfMarks';
import { useStore } from '@/store';
import type { ScrollAdapter } from './scrollAdapter';
import { TextPane } from './TextPane';
import { VisualPane } from './VisualPane';

type PaneId = 'text' | 'visual';

const atBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2;

/** Scroll `to` so it shows the same place in the document `from` shows. */
function syncScroll(from: ScrollAdapter, to: ScrollAdapter) {
  const started = performance.now();
  syncScrollNow(from, to);
  perfMeasure('linked-scroll', started);
}

function syncScrollNow(from: ScrollAdapter, to: ScrollAdapter) {
  const src = from.scroller;
  const dst = to.scroller;
  if (atBottom(src)) {
    dst.scrollTop = dst.scrollHeight;
    return;
  }
  const pos = toAnchorPosition(
    buildAnchors(from.headingOffsets(), src.scrollHeight),
    src.scrollTop
  );
  dst.scrollTop = fromAnchorPosition(buildAnchors(to.headingOffsets(), dst.scrollHeight), pos);
}

/**
 * Both panes stay mounted in every view mode; text-only and visual-only
 * just hide one. That keeps both editors live (no re-parse when switching
 * modes, sync never pauses) and lets HTML export read the visual pane even
 * when it is hidden.
 */
export function SplitView() {
  const viewMode = useStore((s) => s.viewMode);
  const linkedScroll = useStore((s) => s.settings.linkedScroll);
  const adapters = useRef<Record<PaneId, ScrollAdapter | null>>({ text: null, visual: null });
  // Only the pane the user is interacting with drives the other; this is
  // what stops the programmatic scroll on the follower from bouncing back.
  const leader = useRef<PaneId>('text');

  const setText = useCallback((a: ScrollAdapter | null) => {
    adapters.current.text = a;
  }, []);
  const setVisual = useCallback((a: ScrollAdapter | null) => {
    adapters.current.visual = a;
  }, []);

  useEffect(() => {
    if (viewMode !== 'split' || !linkedScroll) return;
    const { text, visual } = adapters.current;
    if (!text || !visual) return;

    const cleanups: Array<() => void> = [];
    for (const [id, self, other] of [
      ['text', text, visual],
      ['visual', visual, text],
    ] as const) {
      const claim = () => {
        leader.current = id;
      };
      let frame = 0;
      const onScroll = () => {
        if (leader.current !== id) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => syncScroll(self, other));
      };
      const el = self.scroller;
      const parent = el.closest('[data-pane]') ?? el;
      parent.addEventListener('pointerenter', claim);
      parent.addEventListener('pointerdown', claim);
      parent.addEventListener('focusin', claim);
      parent.addEventListener('wheel', claim, { passive: true });
      parent.addEventListener('touchstart', claim, { passive: true });
      el.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => {
        cancelAnimationFrame(frame);
        parent.removeEventListener('pointerenter', claim);
        parent.removeEventListener('pointerdown', claim);
        parent.removeEventListener('focusin', claim);
        parent.removeEventListener('wheel', claim);
        parent.removeEventListener('touchstart', claim);
        el.removeEventListener('scroll', onScroll);
      });
    }
    // Line the panes up immediately when linking is switched on.
    syncScroll(text, visual);
    return () => {
      for (const fn of cleanups) fn();
    };
  }, [viewMode, linkedScroll]);

  return (
    <div className="split" data-view={viewMode}>
      <section
        className="pane pane-text"
        data-pane="text"
        aria-label={t('pane.text')}
        hidden={viewMode === 'visual'}
      >
        <TextPane onAdapter={setText} />
      </section>
      <section
        className="pane pane-visual"
        data-pane="visual"
        aria-label={t('pane.visual')}
        hidden={viewMode === 'text'}
      >
        <VisualPane onAdapter={setVisual} />
      </section>
    </div>
  );
}
