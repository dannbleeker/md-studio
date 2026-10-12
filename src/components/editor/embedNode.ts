import { remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx';
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import type { Mark, NodeType, Node as PmNode } from '@milkdown/kit/prose/model';
import { Plugin, type Transaction } from '@milkdown/kit/prose/state';
import type { RemarkPlugin } from '@milkdown/kit/transformer';
import { $nodeSchema, $prose } from '@milkdown/kit/utils';
import { EMBED_NODE_NAME, findWikiRefs, parseWikiRef } from '@/domain/embeds';

/** mdast type of a token found by `remarkEmbeds`; custom so real inline HTML is never touched. */
const MDAST_TYPE = 'obsidianEmbed';

/**
 * One inline atom for every `![[...]]` and `[[...]]` token. The only
 * attribute is the token's exact source text: whatever the view shows is
 * derived from it, and it is written back through the `obsidianEmbed` node
 * type (see `embedToMarkdown`: the value is emitted verbatim), so a visual
 * edit never escapes the brackets or loses the token.
 */
const embedSchema = $nodeSchema(EMBED_NODE_NAME, () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  marks: '',
  attrs: { raw: { default: '' } },
  // Plain-text copies (Ctrl+C into the text pane or another app) carry the
  // token: without this a partial selection drops it from text/plain.
  leafText: (node) => String(node.attrs.raw ?? ''),
  parseDOM: [
    {
      tag: 'span[data-md-embed]',
      // Pasted HTML can carry any data-raw. The value is written to the
      // document verbatim, so only a single well-formed token is accepted.
      getAttrs: (dom) => {
        const raw = (dom as HTMLElement).getAttribute('data-raw') ?? '';
        return parseWikiRef(raw)?.raw === raw ? { raw } : false;
      },
    },
  ],
  toDOM: (node) => [
    'span',
    { class: 'md-embed', 'data-md-embed': '', 'data-raw': String(node.attrs.raw ?? '') },
    String(node.attrs.raw ?? ''),
  ],
  parseMarkdown: {
    match: (node) => node.type === MDAST_TYPE,
    runner: (state, node, type) => {
      state.addNode(type, { raw: String(node.value ?? '') });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === EMBED_NODE_NAME,
    runner: (state, node) => {
      // Not 'html': mdast-util-to-markdown turns the line ending before an
      // html node into a space, which loses hard and soft breaks.
      state.addNode(MDAST_TYPE, undefined, String(node.attrs.raw ?? ''));
    },
  },
}));

/**
 * Writes an `obsidianEmbed` node as its source text. A token never needs escaping, except
 * for a bare pipe in a table cell: a chip copied, dragged or edited into a cell from a
 * paragraph still holds `|`, which would end the cell and split the token. Pipes that are
 * already escaped (an odd number of backslashes before them) are left alone.
 */
const embedHandler = (
  node: { value?: unknown },
  _parent?: unknown,
  state?: { stack: string[] }
): string => {
  const value = String(node.value ?? '');
  if (!state?.stack.includes('tableCell')) return value;
  return value.replace(/(\\*)\|/g, (whole, slashes: string) =>
    slashes.length % 2 === 1 ? whole : `${slashes}\\|`
  );
};
embedHandler.peek = (node: { value?: unknown }): string => String(node.value ?? '').charAt(0);

/**
 * Milkdown's text handler returns text that ends in whitespace unescaped
 * when it has no `*_\`, which skips every escape in it (a marker at the
 * start of a line, `\|` in a table cell, `\[`): a token right after it is
 * enough to hit that. Applied by the visual pane's editor config, because
 * Milkdown's own handlers win over any remark plugin's. Only text directly
 * before or after a token takes the new path; everything else keeps Milkdown's
 * handler, so a document without tokens serializes as it always did.
 */
export function configureEmbedStringify(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (options) => {
    const fallback = options.handlers?.text;
    return {
      ...options,
      handlers: {
        ...options.handlers,
        text: (node, parent, state, info) => {
          const siblings = parent?.children ?? [];
          const at = siblings.indexOf(node);
          const isToken = (n: { type: string } | undefined) => n?.type === MDAST_TYPE;
          // Text right after a token matters too: a `(` there would turn `]` + `(...)` into a link.
          if (fallback && !isToken(siblings[at + 1]) && !isToken(siblings[at - 1]))
            return fallback(node, parent, state, info);
          // Trailing whitespace is split off and written as typed: letting `safe`
          // see it at the end of a line would encode it as `&#x20;`. Everything
          // before it still goes through `safe`, so `\|`, `\[` and block markers
          // keep their escapes next to an embed.
          const value = node.value;
          const head = value.trimEnd();
          const tail = value.slice(head.length);
          if (head === '') return value;
          if (tail === '') return state.safe(value, { ...info, encode: [] });
          return state.safe(head, { ...info, after: ' ', encode: [] }) + tail;
        },
      },
    };
  });
}

/** Marks Markdown can write around a token (`**![[a.png]]**`); the scanner reads those back as embeds. */
const KEPT_MARKS = new Set(['emphasis', 'strong', 'strike_through']);

/**
 * The marks an embed may carry. Link text is not scanned for tokens and the
 * serializer writes a code-marked embed as empty backticks, so neither mark
 * may sit on one.
 */
export const embedMarks = (marks: readonly Mark[]): Mark[] =>
  marks.filter((m) => KEPT_MARKS.has(m.type.name));

/**
 * A code block takes embeds in its schema so that converting a paragraph
 * (toolbar, the "``` " shortcut) or joining one into a code block keeps them
 * instead of ProseMirror dropping every node its `text*` content refuses.
 * `fixEmbeds` then turns them into their raw text in the same transaction
 * group, which is what code holds.
 */
const codeBlockKeepsEmbeds = codeBlockSchema.extendSchema((prev) => (ctx) => ({
  ...prev(ctx),
  content: `(text|${EMBED_NODE_NAME})*`,
}));

/** What `fixEmbeds` puts in place of the range `from`..`to`. */
type Fix = { from: number; to: number; node: PmNode };

/**
 * Whether the old document held only code between `from` and `to`. Positions are
 * taken back through the transactions that produced the new document.
 */
function wasCode(before: PmNode, trs: readonly Transaction[], from: number, to: number): boolean {
  let lo = from;
  let hi = to;
  for (let i = trs.length - 1; i >= 0; i--) {
    const inverse = trs[i]?.mapping.invert();
    if (!inverse) return false;
    lo = inverse.map(lo, 1);
    hi = inverse.map(hi, -1);
  }
  if (lo >= hi) return false;
  let code = true;
  before.nodesBetween(lo, hi, (node, _pos, parent) => {
    if (node.isText && !(parent?.type.spec.code || node.marks.some((m) => m.type.spec.code)))
      code = false;
    return code;
  });
  return code;
}

/**
 * Tokens in the plain text of `block` that were code in the old document: the
 * opposite of what `fixEmbeds` does to a chip in code, so that turning a block
 * into code and back, or toggling inline code on and off, restores the chips
 * instead of leaving text the serializer would escape. Text that was never code
 * (typed or escaped brackets) is left alone. Anything that is not plain text
 * (a chip, a code span) ends the line the scanner sees, so a token cannot reach
 * across it.
 */
function tokensFromCode(
  before: PmNode,
  trs: readonly Transaction[],
  block: PmNode,
  blockPos: number,
  type: NodeType
): Fix[] {
  let text = '';
  // The document position of each character of `text`; null for a separator.
  const at: (number | null)[] = [];
  const marks: (readonly Mark[])[] = [];
  block.forEach((child, offset) => {
    if (child.isText && !child.marks.some((m) => m.type.spec.code)) {
      const value = child.text ?? '';
      for (let i = 0; i < value.length; i++) {
        text += value[i];
        at.push(blockPos + 1 + offset + i);
        marks.push(child.marks);
      }
    } else {
      text += '\n';
      at.push(null);
      marks.push([]);
    }
  });
  if (!text.includes('[[')) return [];
  const out: Fix[] = [];
  // The same scan as `split`: a backslash in the text is a literal one.
  for (const ref of findWikiRefs(text.replaceAll('\\', '\u0000'), {
    code: 'ignore',
    frontMatter: 'ignore',
  })) {
    const first = at[ref.start];
    const last = at[ref.end - 1];
    if (first == null || last == null) continue;
    const raw = text.slice(ref.start, ref.end);
    if (parseWikiRef(raw)?.raw !== raw || !wasCode(before, trs, first, last + 1)) continue;
    out.push({
      from: first,
      to: last + 1,
      node: type.create({ raw }, null, embedMarks(marks[ref.start] ?? [])),
    });
  }
  return out;
}

/**
 * Appended after every change: an embed inside code (a block, or a code
 * mark on it) becomes its raw text with the marks that still fit, and any
 * other unsupported mark is removed from it. Both keep the token in the
 * source, whatever command, input rule, join or paste produced the state.
 * Text that stops being code (the block turned back into a paragraph, the
 * code mark removed) gets its tokens back as embeds, so those conversions are
 * reversible. Only the part of the document the change touched is scanned.
 */
function fixEmbeds(
  before: PmNode,
  tr: Transaction,
  trs: readonly Transaction[]
): Transaction | null {
  const { doc } = tr;
  const { schema } = doc.type;
  const type = schema.nodes[EMBED_NODE_NAME];
  const start = before.content.findDiffStart(doc.content);
  const ends = before.content.findDiffEnd(doc.content);
  if (!type || start == null || !ends) return null;
  const lo = Math.min(start, ends.b);
  const hi = Math.max(start, ends.b);
  // A mark or block-type change reports only the edge of what it touched:
  // scan whole textblocks.
  const $lo = doc.resolve(lo);
  const $hi = doc.resolve(hi);
  const from = $lo.parent.isTextblock ? $lo.start() : lo;
  const to = $hi.parent.isTextblock ? $hi.end() : hi;
  const fixes: Fix[] = [];
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.isTextblock && !node.type.spec.code) {
      fixes.push(...tokensFromCode(before, trs, node, pos, type));
      return true;
    }
    if (node.type !== type || !parent) return true;
    const code = parent.type.spec.code || node.marks.some((m) => m.type.spec.code);
    if (code || embedMarks(node.marks).length !== node.marks.length) {
      const raw = String(node.attrs.raw ?? '');
      fixes.push({
        from: pos,
        to: pos + node.nodeSize,
        node:
          code && raw
            ? schema.text(
                raw,
                node.marks.filter((m) => parent.type.allowsMarkType(m.type))
              )
            : type.create(node.attrs, null, embedMarks(node.marks)),
      });
    }
    return false;
  });
  if (fixes.length === 0) return null;
  // Back to front, so earlier positions stay valid.
  fixes.sort((x, y) => y.from - x.from);
  for (const fix of fixes) tr.replaceWith(fix.from, fix.to, fix.node);
  return tr;
}

const embedGuard = $prose(
  () =>
    new Plugin({
      appendTransaction: (trs, oldState, newState) =>
        trs.some((tr) => tr.docChanged) ? fixEmbeds(oldState.doc, newState.tr, trs) : null,
    })
);

export const embeds: MilkdownPlugin[] = [embedSchema, codeBlockKeepsEmbeds, embedGuard].flat();

type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

/**
 * Where a token may become an embed: ordinary text. Links, images and
 * inline code keep their text as it is, and so does anything else not
 * listed, because the walk below does not enter it.
 */
const TEXT_PARENTS = new Set(['paragraph', 'heading', 'tableCell', 'emphasis', 'strong', 'delete']);
/** Containers the walk passes through to reach those. */
const CONTAINERS = new Set([
  'root',
  'blockquote',
  'list',
  'listItem',
  'table',
  'tableRow',
  'footnoteDefinition',
]);

const SCAN = { code: 'ignore', frontMatter: 'ignore' } as const;

const placed = (node: MdNode): boolean =>
  typeof node.position?.start?.offset === 'number' && typeof node.position.end?.offset === 'number';

/**
 * The pieces each of `texts` becomes (null to leave a node alone), or null for all of
 * them. `lo`..`hi` is the source the nodes were read from. That slice only locates
 * tokens (it still has escapes such as a backslash before a pipe in a table cell);
 * every piece of plain text comes from the nodes' own values, so blockquote markers,
 * list indentation, line endings and entities in the source cannot leak into the
 * document. The values' tokens are paired with the source's by order. Any
 * disagreement (a different token count: an escaped token in the source looks like a
 * real one in the value) leaves all of them as text, which is always safe: the token
 * is then plain text, as it was before this existed.
 */
function splitTexts(texts: MdNode[], source: string, lo: number, hi: number): MdNode[][] | null {
  const refs = findWikiRefs(source.slice(lo, hi), SCAN);
  if (refs.length === 0) return null;
  // Every backslash in a value is a literal one (escapes are already resolved), so none
  // of them may escape a token: `\\![[a.png]]` in the source is a backslash and then a token.
  const scans = texts.map((t) => {
    const value = t.value ?? '';
    return { value, found: findWikiRefs(value.replaceAll('\\', '\u0000'), SCAN) };
  });
  if (scans.reduce((n, scan) => n + scan.found.length, 0) !== refs.length) return null;
  let next = 0;
  return scans.map(({ value, found }) => {
    const out: MdNode[] = [];
    let cursor = 0;
    for (const at of found) {
      const ref = refs[next++];
      if (at.start > cursor) out.push({ type: 'text', value: value.slice(cursor, at.start) });
      // `\![[a.png]]` or `&#33;[[a.png]]`: the bang is a literal character, so the
      // source token is a plain link and the value's embed range holds one bang too many.
      if (at.embed && !ref?.embed) out.push({ type: 'text', value: '!' });
      out.push({ type: MDAST_TYPE, value: ref?.raw ?? '' });
      cursor = at.end;
    }
    if (found.length > 0 && cursor < value.length)
      out.push({ type: 'text', value: value.slice(cursor) });
    return out;
  });
}

/**
 * The replacement pieces for the text children of `parent`, by child index. A text
 * node with a position is paired with its own source. The GFM autolink transform
 * rebuilds the text around an escaped address or URL (`a\@b.co`) without positions,
 * so such a run of siblings is paired together with the source between its neighbours
 * that have one; otherwise every token beside an escaped address would stay text.
 */
function splitChildren(parent: MdNode, source: string): Map<number, MdNode[]> {
  const out = new Map<number, MdNode[]>();
  const kids = parent.children ?? [];
  const apply = (indices: number[], lo: number | undefined, hi: number | undefined): void => {
    if (typeof lo !== 'number' || typeof hi !== 'number' || indices.length === 0) return;
    const texts = indices.flatMap((i) => {
      const kid = kids[i];
      return kid && typeof kid.value === 'string' ? [kid] : [];
    });
    if (texts.length !== indices.length) return;
    const parts = splitTexts(texts, source, lo, hi);
    parts?.forEach((pieces, k) => {
      const index = indices[k];
      if (index !== undefined && pieces.length > 0) out.set(index, pieces);
    });
  };
  for (let i = 0; i < kids.length; ) {
    const kid = kids[i];
    if (!kid) break;
    if (placed(kid)) {
      if (kid.type === 'text') apply([i], kid.position?.start?.offset, kid.position?.end?.offset);
      i++;
      continue;
    }
    let last = i;
    while (kids[last + 1] && !placed(kids[last + 1] as MdNode)) last++;
    const indices: number[] = [];
    for (let k = i; k <= last; k++) if (kids[k]?.type === 'text') indices.push(k);
    apply(
      indices,
      kids[i - 1]?.position?.end?.offset ?? parent.position?.start?.offset,
      kids[last + 1]?.position?.start?.offset ?? parent.position?.end?.offset
    );
    i = last + 1;
  }
  return out;
}

function walk(node: MdNode, source: string): void {
  const children = node.children;
  if (!children) return;
  const inText = TEXT_PARENTS.has(node.type);
  if (!inText && !CONTAINERS.has(node.type)) return;
  const pieces = inText ? splitChildren(node, source) : null;
  let rebuilt: MdNode[] | null = null;
  children.forEach((child, i) => {
    const replacement = pieces?.get(i);
    if (replacement) {
      rebuilt ??= children.slice(0, i);
      rebuilt.push(...replacement);
    } else {
      walk(child, source);
      rebuilt?.push(child);
    }
  });
  if (rebuilt) node.children = rebuilt;
}

/**
 * Turns wiki tokens in ordinary text into `obsidianEmbed` nodes. Runs after
 * the front matter plugin (whose rebuilt nodes carry rebased positions) and
 * the image title fix.
 */
export const remarkEmbeds: RemarkPlugin = {
  plugin: function (this: { data(): { toMarkdownExtensions?: unknown[] } }) {
    // remark-stringify reads this list when it serializes, so the order of
    // plugins does not matter.
    const data = this.data();
    const extensions = data.toMarkdownExtensions ?? [];
    extensions.push({ handlers: { [MDAST_TYPE]: embedHandler } });
    data.toMarkdownExtensions = extensions;
    return (tree, file) => {
      walk(tree as unknown as MdNode, String(file.value));
    };
  },
  options: {},
};
