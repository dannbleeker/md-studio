import { closesFence, openFence } from './fences';
import { frontMatterLines } from './frontMatter';

/**
 * The visual pane keeps empty paragraphs and list items (Enter twice) by
 * serializing them as a literal `<br />`, which would then land in the
 * user's Markdown. Markdown has no empty paragraph: these markers are
 * dropped from what the visual pane reports. The editor keeps its empty
 * paragraph meanwhile, so the cursor stays where the user put it.
 */
const MARKER = /^<br\s*\/?\s*>$/i;
const LIST_ITEM_MARKER = /^(\s*(?:[-*+]|\d{1,9}[.)]))[ \t]+<br\s*\/?\s*>[ \t]*$/i;

export function dropEmptyLineMarkers(markdown: string): string {
  if (!markdown.includes('<br')) return markdown;
  const lines = markdown.split('\n');
  // Front matter is metadata, not paragraphs: kept as written.
  const front = frontMatterLines(markdown);
  const out: string[] = lines.slice(0, front);
  let fence: string | null = null;
  for (let i = front; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      out.push(line);
      continue;
    }
    fence = openFence(line);
    if (fence) {
      out.push(line);
      continue;
    }
    const before = out.at(-1);
    const after = lines[i + 1];
    // A marker that is a whole paragraph: drop it and one blank line around it.
    if (
      MARKER.test(line.trim()) &&
      (before === undefined || before.trim() === '') &&
      (after === undefined || after.trim() === '')
    ) {
      if (after !== undefined) i++;
      continue;
    }
    out.push(line.replace(LIST_ITEM_MARKER, '$1'));
  }
  return out.join('\n');
}
