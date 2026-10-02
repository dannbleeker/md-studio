import { EditorView } from '@codemirror/view';
import type { Heading } from '@/domain/headings';
import { editors } from './editorRegistry';

const HEADINGS = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6';

/**
 * Brings the `index`-th heading to the top of both panes and puts the text
 * cursor on it. Used by the outline and the command palette.
 */
export function jumpToHeading(headings: readonly Heading[], index: number): void {
  const heading = headings[index];
  if (!heading) return;
  editors.linkedScrollPausedUntil = performance.now() + 600;
  const text = editors.text;
  if (text) {
    const line = text.state.doc.line(Math.min(heading.line + 1, text.state.doc.lines));
    text.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 8 }),
    });
  }
  const target = editors.visual?.dom.querySelectorAll<HTMLElement>(HEADINGS)[index];
  const scroller = target?.closest<HTMLElement>('.pane-scroll');
  if (target && scroller) {
    scroller.scrollTop +=
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
  }
}
