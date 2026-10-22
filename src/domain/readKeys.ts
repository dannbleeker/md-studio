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
  | 'focus'
  | 'help';

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
  '?': 'help',
};

/** What a key does in Read view; null for anything with a modifier and anything unmapped. */
export function readKeyAction(e: ReadKey & { shiftKey: boolean }): ReadAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === ' ') return e.shiftKey ? 'pageUp' : 'pageDown';
  return KEYS[e.key] ?? null;
}

/**
 * The keys of each action as they are shown to the reader, in the order the
 * help lists them. Built from KEYS so the help can never drift from what the
 * keys do; Shift+Space is the one binding KEYS does not hold.
 */
export function readKeyBindings(): { action: ReadAction; keys: string[] }[] {
  const shown = (key: string) => (key === ' ' ? 'Space' : key);
  const byAction = new Map<ReadAction, string[]>();
  for (const [key, action] of Object.entries(KEYS)) {
    byAction.set(action, [...(byAction.get(action) ?? []), shown(key)]);
  }
  byAction.set('pageUp', ['Shift+Space']);
  return [...byAction].map(([action, keys]) => ({ action, keys }));
}
