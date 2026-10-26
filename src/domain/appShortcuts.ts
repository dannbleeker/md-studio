/**
 * The app-wide shortcuts as the help sheet lists them, PC style (forPlatform turns them into
 * Mac hints). The keys themselves are handled in hooks/useShortcuts.ts; keep the two in step.
 */
export type AppShortcut =
  | 'commands'
  | 'open'
  | 'newDocument'
  | 'save'
  | 'saveAs'
  | 'find'
  | 'replace'
  | 'print'
  | 'outline'
  | 'settings'
  | 'viewSplit'
  | 'viewText'
  | 'viewVisual'
  | 'viewRead'
  | 'nextTab'
  | 'previousTab'
  | 'closeTab'
  | 'back'
  | 'forward';

const SHORTCUTS: readonly (readonly [AppShortcut, string])[] = [
  ['commands', 'Ctrl+K'],
  ['open', 'Ctrl+O'],
  ['newDocument', 'Alt+N'],
  ['save', 'Ctrl+S'],
  ['saveAs', 'Ctrl+Shift+S'],
  ['find', 'Ctrl+F'],
  ['replace', 'Ctrl+H'],
  ['print', 'Ctrl+P'],
  ['outline', 'Ctrl+Shift+O'],
  ['settings', 'Ctrl+,'],
  ['viewSplit', 'Ctrl+1'],
  ['viewText', 'Ctrl+2'],
  ['viewVisual', 'Ctrl+3'],
  ['viewRead', 'Ctrl+4'],
  ['nextTab', 'Alt+PageDown'],
  ['previousTab', 'Alt+PageUp'],
  ['closeTab', 'Alt+W'],
  ['back', 'Alt+Left'],
  ['forward', 'Alt+Right'],
];

/** The shortcuts in the order the help sheet shows them. */
export function appShortcuts(): { action: AppShortcut; keys: string }[] {
  return SHORTCUTS.map(([action, keys]) => ({ action, keys }));
}
