import { remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx';
import type { RemarkPlugin } from '@milkdown/kit/transformer';
import { $nodeSchema } from '@milkdown/kit/utils';
import { EMBED_NODE_NAME, findWikiRefs, parseWikiRef, unescapeMarkdownText } from '@/domain/embeds';

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

/** Writes an `obsidianEmbed` node as its source text. A token never needs escaping. */
const embedHandler = (node: { value?: unknown }): string => String(node.value ?? '');
embedHandler.peek = (node: { value?: unknown }): string => String(node.value ?? '').charAt(0);

/**
 * The serializer's text handler returns text that ends in whitespace
 * unescaped, which skips every escape in it (a marker at the start of a
 * line, `\|` in a table cell, `\[`): an embed after a space is enough to hit
 * it. Applied by the visual pane's editor config, because Milkdown's own
 * handlers win over any remark plugin's.
 */
export function configureEmbedStringify(ctx: Ctx): void {
  ctx.update(remarkStringifyOptionsCtx, (options) => ({
    ...options,
    handlers: {
      ...options.handlers,
      text: (node, _parent, state, info) => {
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
  }));
}

export const embeds: MilkdownPlugin[] = [embedSchema].flat();

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

/**
 * The pieces a text node becomes, or null to leave it alone. The source
 * slice only locates tokens (it still has escapes such as a backslash
 * before a pipe in a table cell); every piece of plain text comes from the
 * node's own value, so blockquote markers, list indentation, line endings
 * and entities in the source cannot leak into the document. Any
 * disagreement between the two (a different token count, a token that
 * can't be found again) leaves the whole node as text, which is always
 * safe: the token is then plain text, as it was before this existed.
 */
function split(node: MdNode, source: string): MdNode[] | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  const value = node.value;
  if (typeof start !== 'number' || typeof end !== 'number' || typeof value !== 'string')
    return null;
  const opts = { code: 'ignore', frontMatter: 'ignore' } as const;
  const refs = findWikiRefs(source.slice(start, end), opts);
  if (refs.length === 0) return null;
  if (findWikiRefs(value, opts).length !== refs.length) return null;
  const out: MdNode[] = [];
  let cursor = 0;
  for (const ref of refs) {
    const needle = unescapeMarkdownText(ref.raw);
    const at = value.indexOf(needle, cursor);
    if (at < 0) return null;
    if (at > cursor) out.push({ type: 'text', value: value.slice(cursor, at) });
    out.push({ type: MDAST_TYPE, value: ref.raw });
    cursor = at + needle.length;
  }
  if (cursor < value.length) out.push({ type: 'text', value: value.slice(cursor) });
  return out;
}

function walk(node: MdNode, source: string): void {
  const children = node.children;
  if (!children) return;
  const inText = TEXT_PARENTS.has(node.type);
  if (!inText && !CONTAINERS.has(node.type)) return;
  let rebuilt: MdNode[] | null = null;
  children.forEach((child, i) => {
    const pieces = inText && child.type === 'text' ? split(child, source) : null;
    if (pieces) {
      rebuilt ??= children.slice(0, i);
      rebuilt.push(...pieces);
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
