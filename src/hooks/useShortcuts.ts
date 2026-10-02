import { useEffect } from 'react';
import {
  closeTab,
  cycleTab,
  newDocument,
  openDocument,
  saveDocument,
} from '@/services/documentActions';
import { useStore } from '@/store';

/** App-wide keyboard shortcuts. Editor-local keys (bold, undo…) stay with each editor. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Mid-composition (IME) keys belong to the text being composed, and
      // an open dialog (settings, confirm, palette…) owns the keyboard:
      // Alt+W behind a modal would close a tab the user can't even see.
      if (e.isComposing || document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const s = useStore.getState();
      const key = e.key.toLowerCase();
      // With Alt, e.key is layout-dependent (macOS Option+W types "∑"), so
      // the Alt shortcuts match the physical key instead.
      const altKey = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : key;
      let handled = true;
      if (mod && key === 's') void saveDocument(e.shiftKey);
      else if (mod && !e.shiftKey && key === 'o') void openDocument();
      else if (e.altKey && !mod && altKey === 'n') void newDocument();
      // Alt, not Ctrl: browsers keep Ctrl+W / Ctrl+Tab / Ctrl+PageDown for themselves.
      else if (e.altKey && !mod && altKey === 'w' && s.screen === 'editor') void closeTab();
      else if (e.altKey && !mod && key === 'pagedown') cycleTab(1);
      else if (e.altKey && !mod && key === 'pageup') cycleTab(-1);
      else if ((mod && key === 'k') || (mod && e.shiftKey && key === 'p')) s.setPaletteOpen(true);
      else if (mod && key === ',') s.setSettingsOpen(true);
      else if (mod && !e.shiftKey && key === 'f') s.setFind(true, false);
      else if (mod && !e.shiftKey && key === 'h') s.setFind(true, true);
      else if (mod && e.shiftKey && key === 'o')
        s.updateSettings({ showOutline: !s.settings.showOutline });
      else if (mod && !e.shiftKey && key === '1') s.setViewMode('split');
      else if (mod && !e.shiftKey && key === '2') s.setViewMode('text');
      else if (mod && !e.shiftKey && key === '3') s.setViewMode('visual');
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
