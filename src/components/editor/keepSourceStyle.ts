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
    const norm = (source: string): string => {
      let hit = normCache.get(source);
      if (hit === undefined) {
        hit = canonical(source);
        if (normCache.size >= MAX_CACHE) normCache.clear();
        normCache.set(source, hit);
      }
      return hit;
    };
    const { text: merged, check } = preserveUnchangedBlocks(oldMd, newMd, splitBlocks, norm);
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
