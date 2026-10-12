/**
 * Vault file index and link target resolution. Pure: vault-relative paths in,
 * paths out, no DOM or storage. An index is built once per scan and resolved
 * against many times, so lookups go through basename buckets instead of
 * scanning every path.
 */
import { isAttachmentExtension } from './embeds';

/** Vault-relative, '/'-separated, normalised, unique, in input order. */
export interface VaultIndex {
  readonly paths: readonly string[];
}

export interface ResolvedTarget {
  path: string;
  /** More than one file matched at the step that decided. */
  ambiguous: boolean;
  candidates: number;
}

interface Lookup {
  /** NFC basename to the paths carrying it. */
  exact: Map<string, string[]>;
  /** Case-folded basename to the paths carrying it. */
  lower: Map<string, string[]>;
}

/**
 * The lookup maps sit beside the index rather than on it, so VaultIndex stays
 * a plain readonly value. Indexes are never mutated, so the maps are safe to share.
 */
const lookups = new WeakMap<VaultIndex, Lookup>();

/** macOS hands out NFD names while typed targets are NFC, so compare both in NFC. */
const nfc = (s: string): string => s.normalize('NFC');
export const fold = (s: string): string => nfc(s).toLowerCase();

/**
 * Collapses '.', '..', empty segments and backslashes. Returns null when the
 * path climbs above the vault root, and '' for the root itself.
 */
export function normalizePath(p: string): string | null {
  const out: string[] = [];
  for (const seg of p.split(/[\\/]/)) {
    if (seg === '' || seg === '.') continue;
    if (seg !== '..') {
      out.push(seg);
      continue;
    }
    if (out.length === 0) return null;
    out.pop();
  }
  return out.join('/');
}

export function joinPath(...parts: string[]): string | null {
  return normalizePath(parts.filter((part) => part !== '').join('/'));
}

/** Inputs are expected normalised already (see normalizePath). */
export function dirOf(p: string): string {
  const slash = p.lastIndexOf('/');
  return slash < 0 ? '' : p.slice(0, slash);
}

export function baseName(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

/** Lower-case extension of the base name, without the dot; '' when there is none. */
export function extOf(p: string): string {
  const name = baseName(p);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Path of `toPath` as seen from directory `fromDir`, using the fewest '../'.
 * Only directories are shared; the last segment of `toPath` is the file itself.
 */
export function relativePath(fromDir: string, toPath: string): string {
  const from = segmentsOf(normalizePath(fromDir) ?? '');
  const to = segmentsOf(normalizePath(toPath) ?? '');
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) {
    shared += 1;
  }
  return `${'../'.repeat(from.length - shared)}${to.slice(shared).join('/')}`;
}

function segmentsOf(dir: string): string[] {
  return dir === '' ? [] : dir.split('/');
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

function buildLookup(paths: readonly string[]): Lookup {
  const exact = new Map<string, string[]>();
  const lower = new Map<string, string[]>();
  for (const p of paths) {
    const base = baseName(p);
    pushTo(exact, nfc(base), p);
    pushTo(lower, fold(base), p);
  }
  return { exact, lower };
}

function freezeIndex(paths: string[], lookup: Lookup): VaultIndex {
  const index: VaultIndex = Object.freeze({ paths: Object.freeze(paths) });
  lookups.set(index, lookup);
  return index;
}

/** A hand-built { paths } value still resolves; its maps are built once and kept. */
function lookupOf(index: VaultIndex): Lookup {
  const known = lookups.get(index);
  if (known) return known;
  const built = buildLookup(index.paths);
  lookups.set(index, built);
  return built;
}

/** Drops entries that normalise to nothing and duplicates. Linear in the input size. */
export function buildVaultIndex(paths: readonly string[]): VaultIndex {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of paths) {
    const p = normalizePath(raw);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    kept.push(p);
  }
  return freezeIndex(kept, buildLookup(kept));
}

/**
 * Returns a new index with `path` added, or the same index when the path is
 * empty, invalid or already present. Copies the paths and the affected maps,
 * so it costs O(n) per call: use buildVaultIndex for bulk additions.
 */
export function addToIndex(index: VaultIndex, path: string): VaultIndex {
  const p = normalizePath(path);
  if (!p) return index;
  const lk = lookupOf(index);
  const base = baseName(p);
  const exactKey = nfc(base);
  const lowerKey = fold(base);
  const exactBucket = lk.exact.get(exactKey);
  if (exactBucket?.includes(p)) return index;
  const exact = new Map(lk.exact);
  const lower = new Map(lk.lower);
  exact.set(exactKey, [...(exactBucket ?? []), p]);
  lower.set(lowerKey, [...(lk.lower.get(lowerKey) ?? []), p]);
  return freezeIndex([...index.paths, p], { exact, lower });
}

type Step = 'exact' | 'suffix' | 'bare';

interface Pass {
  step: Step | 'rel';
  folded: boolean;
}

/**
 * Resolves a wikilink or Markdown link target to a file in the index.
 *
 * Wikilinks, first match wins: ./ and ../ from the note, exact vault path,
 * whole-segment suffix, bare name anywhere, note-relative, then the same
 * three again case-insensitively. Markdown links (opts.markdown) try the
 * note-relative step first, as the old image-only behaviour did, so
 * images/x.png beside Notes/Daily/n.md never picks a root-level images/x.png.
 *
 * Within a step, the name variants are tried in order ('.md' first for
 * extensionless names, the name itself first for unknown extensions).
 * Several matches at one step go to the nearest file to the note.
 */
export function resolveTarget(
  index: VaultIndex,
  target: string,
  fromNotePath: string | null,
  opts?: { note?: boolean; markdown?: boolean }
): ResolvedTarget | null {
  return resolveWithin(index, target, fromNotePath, opts ?? {}, true);
}

function resolveWithin(
  index: VaultIndex,
  target: string,
  fromNotePath: string | null,
  opts: { note?: boolean; markdown?: boolean },
  folded: boolean
): ResolvedTarget | null {
  const body = target.trim().normalize('NFC').replace(/\\/g, '/');
  // A trailing slash names a folder, and '.' or '..' name no file.
  if (body === '' || body.endsWith('/')) return null;
  // A leading slash is vault-absolute: only the exact path can match.
  const absolute = body.startsWith('/');
  const rel = absolute ? body.slice(1) : body;
  const name = baseName(rel);
  if (name === '' || name === '.' || name === '..') return null;

  const from = fromNotePath === null ? null : normalizePath(fromNotePath);
  const noteDir = from === null ? null : dirOf(from);
  const dotted = !absolute && (rel.startsWith('./') || rel.startsWith('../'));
  const relFirst = noteDir !== null && !absolute && (dotted || opts.markdown === true);

  const vaultSteps: Step[] = absolute ? ['exact'] : ['exact', 'suffix', 'bare'];
  const passes: Pass[] = [];
  if (relFirst) passes.push({ step: 'rel', folded: false });
  for (const step of vaultSteps) passes.push({ step, folded: false });
  if (noteDir !== null && !absolute && !relFirst) passes.push({ step: 'rel', folded: false });
  if (folded) for (const step of vaultSteps) passes.push({ step, folded: true });

  const variants = nameVariants(rel, opts.note === true);
  const lk = lookupOf(index);
  for (const pass of passes) {
    for (const v of variants) {
      const hits =
        pass.step === 'rel' ? relHits(lk, noteDir, v) : vaultMatches(lk, pass.step, pass.folded, v);
      if (hits.length > 0) return choose(hits, from);
    }
  }
  return null;
}

/**
 * Candidate file names for a target, in preference order. Extensionless names
 * and notes (note: true) try '.md' first; an attachment extension is taken as
 * is; any other extension is tried as given and then with '.md' appended, so
 * "Note v1.2" and "Dr. Smith" can be notes.
 */
function nameVariants(name: string, note: boolean): string[] {
  const ext = extOf(name);
  if (ext === 'md') return [name];
  if (note || ext === '') return [`${name}.md`, name];
  if (isAttachmentExtension(ext)) return [name];
  return [name, `${name}.md`];
}

function relHits(lk: Lookup, noteDir: string | null, v: string): string[] {
  if (noteDir === null) return [];
  const joined = joinPath(noteDir, v);
  return joined === null ? [] : vaultMatches(lk, 'exact', false, joined);
}

/**
 * Indexed paths matching one name variant at one step. The bucket narrows the
 * search to files with the same basename, so a step never scans the whole index.
 */
function vaultMatches(lk: Lookup, step: Step, folded: boolean, v: string): string[] {
  const p = normalizePath(v);
  if (!p) return [];
  const base = baseName(p);
  const bucket = (folded ? lk.lower : lk.exact).get(folded ? fold(base) : nfc(base));
  if (bucket === undefined) return [];
  const key = folded ? fold : nfc;
  const want = key(p);
  const nested = p.includes('/');
  if (step === 'exact') return bucket.filter((q) => key(q) === want);
  // Whole-segment suffix: "b/c.png" matches "a/b/c.png" but not "ab/c.png".
  if (step === 'suffix') return nested ? bucket.filter((q) => key(q).endsWith(`/${want}`)) : [];
  return nested ? [] : [...bucket];
}

/**
 * Among files a target could mean, the one nearest the note wins: most
 * shared leading folders with the note, then fewest segments, then plain
 * string order, so the choice never depends on scan order.
 */
function choose(hits: readonly string[], from: string | null): ResolvedTarget | null {
  const [best] = [...hits].sort(nearest(from));
  if (best === undefined) return null;
  return { path: best, ambiguous: hits.length > 1, candidates: hits.length };
}

function nearest(from: string | null): (a: string, b: string) => number {
  const noteDir = from === null ? null : segmentsOf(dirOf(from));
  return (a, b) => {
    if (noteDir !== null) {
      const shared =
        sharedDepth(segmentsOf(dirOf(b)), noteDir) - sharedDepth(segmentsOf(dirOf(a)), noteDir);
      if (shared !== 0) return shared;
    }
    const depth = a.split('/').length - b.split('/').length;
    if (depth !== 0) return depth;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  };
}

function sharedDepth(a: readonly string[], b: readonly string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

/**
 * The shortest whole-segment suffix that resolves back to exactly this path
 * (case-sensitive steps only, as the user would type it). For notes the
 * '.md' is dropped when that stays unique, including against an extensionless
 * file of the same stem. Falls back to the full path.
 */
export function shortestUniquePath(index: VaultIndex, path: string): string {
  const full = normalizePath(path);
  if (!full) return path;
  const segs = full.split('/');
  const isNote = extOf(full) === 'md' && baseName(full).length > 3;
  for (let n = 1; n <= segs.length; n += 1) {
    const suffix = segs.slice(segs.length - n).join('/');
    if (isNote) {
      const stem = suffix.slice(0, -3);
      if (uniqueFor(index, stem, full, true)) return stem;
    }
    if (uniqueFor(index, suffix, full, false)) return suffix;
  }
  return full;
}

function uniqueFor(index: VaultIndex, candidate: string, full: string, stem: boolean): boolean {
  const r = resolveWithin(index, candidate, null, {}, false);
  if (r === null || r.ambiguous || r.path !== full) return false;
  if (!stem) return true;
  // Dropping .md is only safe when no other file answers to the same stem.
  const lk = lookupOf(index);
  const steps: Step[] = ['exact', 'suffix', 'bare'];
  return !nameVariants(candidate, false).some((v) =>
    steps.some((step) => vaultMatches(lk, step, false, v).some((q) => q !== full))
  );
}
