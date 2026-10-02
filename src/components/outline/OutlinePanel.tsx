import { useEffect, useMemo, useState } from 'react';
import { findHeadings } from '@/domain/headings';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { editors } from '../editor/editorRegistry';
import { jumpToHeading } from '../editor/jumpToHeading';

/** Index of the heading at or above the text pane's top line. */
function activeHeading(lines: number[]): number {
  const view = editors.text;
  if (!view || lines.length === 0) return -1;
  const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 4);
  const topLine = view.state.doc.lineAt(top.from).number - 1;
  let active = -1;
  for (let i = 0; i < lines.length && (lines[i] ?? Infinity) <= topLine; i++) active = i;
  return active;
}

/**
 * The document's headings as a clickable table of contents. Clicking one
 * brings that section to the top of both panes; the heading of the section
 * currently at the top of the text pane is marked.
 */
export function OutlinePanel() {
  const markdown = useStore((s) => s.doc.markdown);
  const headings = useMemo(() => findHeadings(markdown), [markdown]);
  const minLevel = useMemo(() => Math.min(...headings.map((h) => h.level), 6), [headings]);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const scroller = editors.text?.scrollDOM;
    const lines = headings.map((h) => h.line);
    const update = () => setActive(activeHeading(lines));
    update();
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller?.removeEventListener('scroll', onScroll);
    };
  }, [headings]);

  const jump = (index: number) => {
    jumpToHeading(headings, index);
    setActive(index);
  };

  return (
    <nav className="outline" aria-label={t('outline.title')}>
      <h2 className="outline-title">{t('outline.title')}</h2>
      {headings.length === 0 ? (
        <p className="muted outline-empty">{t('outline.empty')}</p>
      ) : (
        <ol>
          {headings.map((h, i) => (
            <li
              key={`${h.line}-${h.text}`}
              style={{ paddingLeft: `${(h.level - minLevel) * 0.9}rem` }}
            >
              <button
                type="button"
                className="outline-item"
                aria-current={i === active ? 'location' : undefined}
                onClick={() => jump(i)}
              >
                {h.text || '—'}
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
