import { type BlockRange, splitBlocks } from './preserveBlocks';

/**
 * Link reference definitions (`[id]: url`) and footnotes act at a
 * distance: a definition changes how text far away renders, and a
 * reference only resolves against definitions elsewhere. The visual sync
 * (editor/applyMarkdown.ts) and the source-style merge
 * (editor/keepSourceStyle.ts) both have to treat them specially, and must
 * agree on what counts as one.
 */

/** A line that starts a link reference definition. */
const DEFINITION = /^ {0,3}\[[^\]]+\]:/m;
/** A definition line with a destination (`[id]: url`). */
const DEFINITION_LINE = /^ {0,3}\[[^\]]+\]:\s*\S/;

/** True when the text contains a link reference definition. */
export const hasReferenceDefinition = (markdown: string): boolean => DEFINITION.test(markdown);

/** A reference definition or footnote syntax: both act at a distance. */
export const actsAtDistance = (markdown: string): boolean =>
  hasReferenceDefinition(markdown) || markdown.includes('[^');

/** A block made only of link reference definitions (and their continuation lines). */
const isDefinitionBlock = (block: string) =>
  block.split('\n').every((line) => DEFINITION_LINE.test(line) || /^\s+\S/.test(line));

/**
 * Splits the definition blocks out of a document, so the rest can be
 * compared block by block (with the definitions in scope) and the
 * definitions put back afterwards. The serializer writes reference links
 * inline and drops their definitions. `placed` records where each
 * definition block stood: before the body block numbered `before`.
 */
export function splitDefinitions(md: string): {
  body: string;
  definitions: string;
  placed: PlacedDefinition[];
} {
  const blocks = splitBlocks(md);
  const placed: PlacedDefinition[] = [];
  let bodyBlocks = 0;
  for (const b of blocks) {
    const text = md.slice(b.start, b.end);
    if (isDefinitionBlock(text)) placed.push({ text, before: bodyBlocks });
    else bodyBlocks++;
  }
  if (placed.length === 0) return { body: md, definitions: '', placed };
  const defs = blocks.filter((b) => isDefinitionBlock(md.slice(b.start, b.end)));
  let body = '';
  let at = 0;
  for (const b of defs) {
    body += md.slice(at, b.start);
    at = b.end;
  }
  body += md.slice(at);
  return {
    body: `${body.replace(/\n{3,}/g, '\n\n').trim()}\n`,
    definitions: placed.map((d) => d.text).join('\n\n'),
    placed,
  };
}

/** A definition block and the number of body blocks before it. */
export type PlacedDefinition = { text: string; before: number };

/**
 * Puts definition blocks back into a merged body: each next to a body
 * block it stood beside, where that block was kept (`kept` maps an old
 * body block to its range in `body`, or null when it was rewritten).
 * Definitions with no kept neighbour go at the end.
 */
export function placeDefinitions(
  body: string,
  placed: PlacedDefinition[],
  kept: (oldBlock: number) => BlockRange | null
): string {
  // Keyed by insertion point: a kept block's start (definitions go in
  // front of it) or end (after it); the old gap stays on the other side.
  const groups = new Map<string, { offset: number; front: boolean; texts: string[] }>();
  const rest: string[] = [];
  for (const def of placed) {
    const next = kept(def.before);
    const prev = def.before > 0 ? kept(def.before - 1) : null;
    const point = next
      ? { offset: next.start, front: true }
      : prev
        ? { offset: prev.end, front: false }
        : null;
    if (!point) {
      rest.push(def.text);
      continue;
    }
    const key = `${point.offset}:${point.front}`;
    const group = groups.get(key) ?? { ...point, texts: [] };
    group.texts.push(def.text);
    groups.set(key, group);
  }
  let out = body;
  // From the end backwards, so earlier offsets stay valid.
  for (const { offset, front, texts } of [...groups.values()].sort((a, b) => b.offset - a.offset)) {
    const defs = texts.join('\n\n');
    out = front
      ? `${out.slice(0, offset)}${defs}\n\n${out.slice(offset)}`
      : `${out.slice(0, offset)}\n\n${defs}${out.slice(offset)}`;
  }
  return rest.length ? `${out.trimEnd()}\n\n${rest.join('\n\n')}\n` : out;
}
