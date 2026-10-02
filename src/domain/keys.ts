/**
 * Shortcut hints are written once, PC style ("Ctrl+Shift+O"). On a Mac the
 * app's shortcuts use Command, and the hints are shown the Mac way.
 */
export function forPlatform(text: string, mac: boolean): string {
  if (!mac) return text;
  return text
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Alt\+/g, '⌥')
    .replace(/Shift\+/g, '⇧');
}
