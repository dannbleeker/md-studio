import { useEffect } from 'react';
import { printDocument } from '@/components/editor/embedView';
import {
  closeTab,
  cycleTab,
  newDocument,
  openDocument,
  saveDocument,
} from '@/services/documentActions';
import { goBack, goForward } from '@/services/noteHistory';
import { isMac } from '@/services/platform';
import { useStore } from '@/store';
import type { ViewMode } from '@/store/settings';
import { useUiStore } from '@/store/ui';

/** Ctrl+1 … Ctrl+4 (Command on a Mac) switch the view. */
const VIEW_KEYS: ReadonlyMap<string, ViewMode> = new Map([
  ['1', 'split'],
  ['2', 'text'],
  ['3', 'visual'],
  ['4', 'read'],
]);

/**
 * The key a Ctrl (Command) shortcut names. e.key is right on any layout that
 * types Latin letters, even one that moves them (Dvorak, AZERTY). A non-Latin
 * layout types its own letter (Ctrl+ы on Russian), and AZERTY's digit row
 * types symbols (Ctrl+& for Ctrl+1): there the physical key stands in, as it
 * does for the browser's own shortcuts. Only those two cases: AZERTY's comma
 * sits on the M key and must stay Ctrl+,.
 */
function shortcutKey(e: KeyboardEvent): string {
  const key = e.key.toLowerCase();
  const digit = /^Digit(\d)$/.exec(e.code)?.[1];
  if (digit && !/^\d$/.test(key)) return digit;
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
  if (letter && key.length === 1 && !/[ -~]/.test(key)) return letter.toLowerCase();
  return key;
}

/** App-wide keyboard shortcuts. Editor-local keys (bold, undo…) stay with each editor. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Mid-composition (IME) keys belong to the text being composed, and
      // an open dialog (settings, confirm, palette…) owns the keyboard:
      // Alt+W behind a modal would close a tab the user can't even see.
      if (e.isComposing || document.querySelector('dialog[open]')) return;
      const mac = isMac();
      // Command on a Mac (Ctrl is for text editing there), Ctrl elsewhere.
      const mod = mac ? e.metaKey : e.ctrlKey;
      // Option+N, Option+E… type accented letters on a Mac: a dead key
      // starts a character, never an app shortcut.
      if (e.altKey && e.key === 'Dead') return;
      const s = useStore.getState();
      const editor = s.screen === 'editor';
      const key = shortcutKey(e);
      // With Alt, e.key is layout-dependent (macOS Option+W types "∑"), so
      // the Alt shortcuts match the physical key instead.
      const altKey = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : key;
      const alt = e.altKey && !mod;
      const plainMod = mod && !e.shiftKey;
      const shiftMod = mod && e.shiftKey;
      const view = VIEW_KEYS.get(key);
      let handled = true;
      if (mod && key === 's') void saveDocument(e.shiftKey);
      else if (plainMod && key === 'o') void openDocument();
      else if (alt && altKey === 'n') void newDocument();
      // Alt, not Ctrl: browsers keep Ctrl+W / Ctrl+Tab / Ctrl+PageDown for themselves.
      else if (alt && altKey === 'w' && editor) void closeTab();
      else if (alt && key === 'pagedown') cycleTab(1);
      else if (alt && key === 'pageup') cycleTab(-1);
      // The browser's own history keys: this app's notes have their own history.
      else if (alt && !e.shiftKey && key === 'arrowleft' && editor) void goBack();
      else if (alt && !e.shiftKey && key === 'arrowright' && editor) void goForward();
      else if ((mod && key === 'k') || (shiftMod && key === 'p'))
        useUiStore.getState().setPaletteOpen(true);
      else if (mod && key === ',') useUiStore.getState().setSettingsOpen(true);
      // The browser's own print would run before off-screen embeds have loaded.
      else if (plainMod && key === 'p' && editor) void printDocument();
      else if (plainMod && key === 'f') useUiStore.getState().setFind(true, false);
      else if (plainMod && key === 'h') useUiStore.getState().setFind(true, true);
      else if (shiftMod && key === 'o') s.updateSettings({ showOutline: !s.settings.showOutline });
      else if (plainMod && view) s.setViewMode(view);
      else handled = false;
      if (handled) {
        e.preventDefault();
        // Keep CodeMirror's own Mod-f (its search panel) from also firing.
        e.stopPropagation();
      }
    };
    // Capture phase: runs before the editors' own keymaps, so Ctrl+F opens
    // the app's find bar instead of CodeMirror's built-in search panel.
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);
}
