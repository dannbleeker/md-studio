import { useEffect } from 'react';
import { opensAsDocument } from '@/domain/noteFiles';
import { openDroppedFile } from '@/services/documentActions';

/** Drop a Markdown file anywhere on the window to open it. */
export function useFileDrop(): void {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      // Never let the browser navigate away to a dropped file. Images
      // dropped on an editor are handled (and prevented) by that pane.
      e.preventDefault();
      for (const file of files) {
        if (opensAsDocument(file.name)) await openDroppedFile(file);
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
