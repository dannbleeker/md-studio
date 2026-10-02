import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { preserveUnchangedBlocks, splitBlocks } from '@/domain/preserveBlocks';
import { hasReferenceDefinition, splitDefinitions } from '@/domain/referenceDefinitions';

/**
 * Canonical form of a block = Milkdown's own parse + serialize, cached by
 * source text: between two edits almost every block is unchanged, so each
 * sync only parses the blocks around the edit.
 */
const normCache = new Map<string, string>();
const MAX_CACHE = 4000;

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
    const { body, definitions } = hasReferenceDefinition(oldMd)
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
    if (hasReferenceDefinition(oldMd) || hasReferenceDefinition(newMd)) {
      return canonical(merged) === newMd.trim() ? merged : newMd;
    }
    const region = merged.slice(check.text.start, check.text.end);
    const expected = newMd.slice(check.newMd.start, check.newMd.end);
    return canonical(region) === canonical(expected) ? merged : newMd;
  } catch {
    return newMd;
  }
}
