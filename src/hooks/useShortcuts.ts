import { useEffect } from 'react';
import { newDocument, openDocument, saveDocument } from '@/services/documentActions';
import { useStore } from '@/store';

/** App-wide keyboard shortcuts. Editor-local keys (bold, undo…) stay with each editor. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const s = useStore.getState();
      const key = e.key.toLowerCase();
      let handled = true;
      if (mod && key === 's') void saveDocument(e.shiftKey);
      else if (mod && key === 'o') void openDocument();
      else if (e.altKey && !mod && key === 'n') void newDocument();
      else if ((mod && key === 'k') || (mod && e.shiftKey && key === 'p')) s.setPaletteOpen(true);
      else if (mod && key === ',') s.setSettingsOpen(true);
      else if (mod && !e.shiftKey && key === '1') s.setViewMode('split');
      else if (mod && !e.shiftKey && key === '2') s.setViewMode('text');
      else if (mod && !e.shiftKey && key === '3') s.setViewMode('visual');
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
