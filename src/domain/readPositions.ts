import type { AnchorPosition } from './scrollMap';

/**
 * Where the reader had got to in each file, kept across sessions: a heading
 * (counted among the document's headings) and how far through its section.
 * A heading and a fraction, not pixels, because the page can be laid out
 * differently next time (window size, reading width, images loaded).
 */
export type SavedPosition = AnchorPosition & { at: number };
export type SavedPositions = Readonly<Record<string, SavedPosition>>;

const MAX_ENTRIES = 100;
/** Near the very top there is nothing to resume. */
const TOP = 0.02;

const isPosition = (v: unknown): v is SavedPosition => {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    Number.isInteger(p.section) &&
    (p.section as number) >= 0 &&
    typeof p.fraction === 'number' &&
    p.fraction >= 0 &&
    p.fraction <= 1 &&
    typeof p.at === 'number'
  );
};

/** Whatever storage held, reduced to well-formed entries. */
export function parsePositions(raw: unknown): SavedPositions {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, SavedPosition> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isPosition(value))
      out[key] = { section: value.section, fraction: value.fraction, at: value.at };
  }
  return trim(out);
}

/** The newest entries only: the list must not grow without end. */
function trim(all: Record<string, SavedPosition>): Record<string, SavedPosition> {
  const keys = Object.keys(all);
  if (keys.length <= MAX_ENTRIES) return all;
  const newest = keys.sort((a, b) => (all[b]?.at ?? 0) - (all[a]?.at ?? 0)).slice(0, MAX_ENTRIES);
  return Object.fromEntries(newest.flatMap((k) => (all[k] ? [[k, all[k]]] : [])));
}

/** The list with `key` at `pos`, or without it when `pos` is the top (or nothing). */
export function rememberPosition(
  all: SavedPositions,
  key: string,
  pos: AnchorPosition | null,
  now: number
): SavedPositions {
  const { [key]: _old, ...rest } = all;
  if (!pos || (pos.section === 0 && pos.fraction < TOP)) return rest;
  return trim({ ...rest, [key]: { section: pos.section, fraction: pos.fraction, at: now } });
}
