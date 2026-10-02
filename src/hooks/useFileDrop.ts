import { useEffect } from 'react';
import { openDroppedFile } from '@/services/documentActions';

const MARKDOWN = /\.(md|markdown|mdown|mkd|txt)$/i;

/** Drop a Markdown file anywhere on the window to open it. */
export function useFileDrop(): void {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      // Never let the browser navigate away to a dropped file. Images
      // dropped on an editor are handled (and prevented) by that pane.
      e.preventDefault();
      if (MARKDOWN.test(file.name)) void openDroppedFile(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
