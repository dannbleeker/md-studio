/**
 * A Mac (or iPad with a keyboard): Command is the shortcut key there, and
 * Ctrl+F / Ctrl+H / Ctrl+K belong to text editing (forward, delete back,
 * kill line), so the app must leave them alone.
 */
export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
