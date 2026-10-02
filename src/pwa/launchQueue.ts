import { openHandle } from '@/services/documentActions';

/**
 * Receives files the OS hands to the installed PWA, i.e. double-clicking a
 * .md file on Windows once MD Studio is installed and associated (see
 * `file_handlers` in vite.config.ts). The handle is writable, so Save goes
 * straight back to that file.
 */
export function registerLaunchQueue(): void {
  window.launchQueue?.setConsumer(async (params) => {
    // One after another: each open stores a handle and prunes unused ones.
    for (const handle of params.files) {
      if (handle.kind === 'file') await openHandle(handle as FileSystemFileHandle);
    }
  });
}
