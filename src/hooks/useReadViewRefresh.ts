import { useEffect } from 'react';
import { checkDiskChanges } from '@/services/documentActions';
import { useStore } from '@/store';

const POLL_MS = 3000;

/**
 * Read view is often left open beside whatever edits the file, so while it
 * is showing a file from disk the app looks for outside changes itself
 * instead of waiting for the window to regain focus. checkDiskChanges
 * reloads a document without unsaved changes and never prompts.
 */
export function useReadViewRefresh(): void {
  const watching = useStore(
    (s) => s.screen === 'editor' && s.viewMode === 'read' && s.fileHandle !== null
  );
  useEffect(() => {
    if (!watching) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void checkDiskChanges();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [watching]);
}
