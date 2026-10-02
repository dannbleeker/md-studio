import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { preserveUnchangedBlocks, splitBlocks } from '@/domain/preserveBlocks';

/**
 * Canonical form of a block = Milkdown's own parse + serialize, cached by
 * source text: between two edits almost every block is unchanged, so each
 * sync only parses the blocks around the edit.
 */
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:/m;

const normCache = new Map<string, string>();
const MAX_CACHE = 4000;

/** A block made only of link reference definitions (`[id]: url`). */
const DEFINITION_LINE = /^ {0,3}\[[^\]]+\]:\s*\S/;
const isDefinitionBlock = (block: string) =>
  block.split('\n').every((line) => DEFINITION_LINE.test(line) || /^\s+\S/.test(line));

/**
 * The serializer writes reference links inline and drops their
 * definitions. Splits the definition blocks out of the old source, so the
 * rest can be compared block by block (with the definitions in scope) and
 * the definitions put back afterwards.
 */
function splitDefinitions(md: string): { body: string; definitions: string } {
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

/**
 * Applies `preserveUnchangedBlocks` with Milkdown's parser/serializer, so a
 * visual edit rewrites only the blocks it touched. Falls back to the plain
 * serializer output if the merged text wouldn't mean the same document
 * (for example a block that depends on a link reference elsewhere).
 */
export function keepSourceStyle(ctx: Ctx, oldMd: string, newMd: string): string {
  try {
    const parse = ctx.get(parserCtx);
    const serialize = ctx.get(serializerCtx);

    const canonical = (source: string): string => {
      const doc = parse(source);
      return doc ? serialize(doc).trim() : source.trim();
    };
    const { body, definitions } = REFERENCE_DEFINITION.test(oldMd)
      ? splitDefinitions(oldMd)
      : { body: oldMd, definitions: '' };
    // Each block is judged with the definitions in scope, so `[foo]` and
    // the serializer's inlined `[foo](url)` count as the same block.
    const scoped = definitions
      ? (source: string) => `${source}\n\n${definitions}`
      : (s: string) => s;
    const norm = (source: string): string => {
      const key = scoped(source);
      let hit = normCache.get(key);
      if (hit === undefined) {
        hit = canonical(key);
        if (normCache.size >= MAX_CACHE) normCache.clear();
        normCache.set(key, hit);
      }
      return hit;
    };
    const result = preserveUnchangedBlocks(body, newMd, splitBlocks, norm);
    const check = result.check;
    const merged = definitions ? `${result.text.trimEnd()}\n\n${definitions}\n` : result.text;
    if (merged === newMd || !check) return newMd;
    // Link reference definitions apply document-wide, so with any present
    // only a full comparison proves the merge (newMd is the serializer's
    // own output, hence already canonical). Otherwise context is local:
    // comparing the rewritten region with a neighbour on each side is
    // enough, and costs a few ms instead of a full re-parse.
    if (REFERENCE_DEFINITION.test(oldMd) || REFERENCE_DEFINITION.test(newMd)) {
      return canonical(merged) === newMd.trim() ? merged : newMd;
    }
    const region = merged.slice(check.text.start, check.text.end);
    const expected = newMd.slice(check.newMd.start, check.newMd.end);
    return canonical(region) === canonical(expected) ? merged : newMd;
  } catch {
    return newMd;
  }
}
