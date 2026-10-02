import { splitBlocks } from './preserveBlocks';

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
 * inline and drops their definitions.
 */
export function splitDefinitions(md: string): { body: string; definitions: string } {
  const blocks = splitBlocks(md);
  const defs = blocks.filter((b) => isDefinitionBlock(md.slice(b.start, b.end)));
  if (defs.length === 0) return { body: md, definitions: '' };
  let body = '';
  let at = 0;
  for (const b of defs) {
    body += md.slice(at, b.start);
    at = b.end;
  }
  body += md.slice(at);
  return {
    body: `${body.replace(/\n{3,}/g, '\n\n').trim()}\n`,
    definitions: defs.map((b) => md.slice(b.start, b.end)).join('\n\n'),
  };
}
