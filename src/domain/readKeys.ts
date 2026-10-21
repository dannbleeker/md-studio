/** The keys of Read view, where a plain letter is a command because nothing is typed. */

export type ReadKey = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

export type ReadAction =
  | 'down'
  | 'up'
  | 'pageDown'
  | 'pageUp'
  | 'top'
  | 'bottom'
  | 'prevHeading'
  | 'nextHeading'
  | 'find'
  | 'focus';

const KEYS: Record<string, ReadAction> = {
  j: 'down',
  k: 'up',
  ' ': 'pageDown',
  g: 'top',
  G: 'bottom',
  '[': 'prevHeading',
  ']': 'nextHeading',
  '/': 'find',
  f: 'focus',
};

/** What a key does in Read view; null for anything with a modifier and anything unmapped. */
export function readKeyAction(e: ReadKey & { shiftKey: boolean }): ReadAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === ' ') return e.shiftKey ? 'pageUp' : 'pageDown';
  return KEYS[e.key] ?? null;
}
