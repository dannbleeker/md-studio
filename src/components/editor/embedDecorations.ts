import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension, Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { findWikiRefs, type WikiRef } from '@/domain/embeds';
import '@/styles/textEmbeds.css';

/** Tokens inside these are literal text, not embeds (the scanner is not code-aware per line). */
const CODE_NODES = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'FrontMatterContent',
  'FrontMatterMark',
  'CodeText',
  'CodeMark',
  // The mounted YAML tree replaces FrontMatterContent, so its root is what an ancestor walk meets.
  'Stream',
]);

function inCode(state: EditorState, pos: number): boolean {
  for (
    let n: { name: string; parent: unknown } | null = syntaxTree(state).resolveInner(pos, 1);
    n;
  ) {
    if (CODE_NODES.has(n.name)) return true;
    n = n.parent as typeof n;
  }
  return false;
}

const mark = (cls: string) => Decoration.mark({ class: cls });

/** Splits a token into its opening marks, target, fragment, options and closing brackets. */
function pieces(ref: WikiRef, at: number): Range<Decoration>[] {
  const open = ref.embed ? 3 : 2;
  const innerEnd = ref.raw.length - 2;
  const inner = ref.raw.slice(open, innerEnd);
  const hash = inner.indexOf('#');
  let bar = inner.indexOf('|');
  // An escaped pipe (table cell) belongs to the options, backslash included.
  if (bar > 0 && inner[bar - 1] === '\\') bar -= 1;
  const fragEnd = bar < 0 ? inner.length : bar;
  const fragStart = hash >= 0 && hash < fragEnd ? hash : -1;
  const targetEnd = fragStart >= 0 ? fragStart : fragEnd;
  const out: Range<Decoration>[] = [];
  const add = (cls: string, from: number, to: number) => {
    if (to > from) out.push(mark(cls).range(at + from, at + to));
  };
  add('cm-embed-mark', 0, open);
  add('cm-embed-target', open, open + targetEnd);
  if (fragStart >= 0) add('cm-embed-frag', open + fragStart, open + fragEnd);
  if (bar >= 0) add('cm-embed-opts', open + bar, innerEnd);
  add('cm-embed-mark', innerEnd, ref.raw.length);
  return out;
}

function build(view: EditorView, isPlain: (state: EditorState) => boolean): DecorationSet {
  const { state } = view;
  if (isPlain(state)) return Decoration.none;
  const last = view.visibleRanges.at(-1);
  // Unparsed region (huge document): draw nothing rather than guess.
  if (last && !ensureSyntaxTree(state, last.to, 50)) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  let doneTo = -1;
  for (const { from, to } of view.visibleRanges) {
    let pos = Math.max(from, doneTo + 1);
    while (pos <= to) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (!line.text.includes('[[')) continue;
      for (const ref of findWikiRefs(line.text, { code: 'ignore' })) {
        const start = line.from + ref.start;
        if (inCode(state, start)) continue;
        ranges.push(
          mark(`cm-embed-${ref.embed ? ref.kind : 'link'}`).range(start, line.from + ref.end),
          ...pieces(ref, start)
        );
      }
      doneTo = line.to;
    }
  }
  return Decoration.set(ranges, true);
}

/**
 * Colours the parts of `[[...]]` and `![[...]]` in the text pane. Marks
 * only (no widgets), so line heights and the linked scroll are untouched.
 * `isPlain` tells when the nesting guard has swapped the parser out.
 */
export function embedDecorations(isPlain: (state: EditorState) => boolean): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view, isPlain);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = build(u.view, isPlain);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}
