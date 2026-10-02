import { openHandle } from '@/services/documentActions';

/**
 * Receives files the OS hands to the installed PWA, i.e. double-clicking a
 * .md file on Windows once MD Studio is installed and associated (see
 * `file_handlers` in vite.config.ts). The handle is writable, so Save goes
 * straight back to that file.
 */
export function registerLaunchQueue(): void {
  window.launchQueue?.setConsumer((params) => {
    const handle = params.files.find((f): f is FileSystemFileHandle => f.kind === 'file');
    if (handle) void openHandle(handle);
  });
}
