import { t } from '@/i18n';
import { flushEditors } from '@/store/flush';
import { showToast } from '@/store/ui';

let reported = false;

/**
 * A lazy chunk failed to load. After a deploy, a tab still running the old
 * build asks for chunk names the server no longer has (the service worker
 * covers its precache, but not chunks cached on first use, nor a first
 * visit it doesn't control yet). Reloading picks up the new build; the
 * documents are persisted, so it loses nothing. Offered once, not forced:
 * the user may be mid-sentence.
 */
export function reportStaleBuild(): void {
  if (reported) return;
  reported = true;
  showToast(t('toast.staleBuild'), {
    label: t('toast.reload'),
    run: () => {
      flushEditors();
      location.reload();
    },
  });
}

/** Vite reports chunk preload failures as an event on window. */
export function registerStaleBuildHandler(): void {
  window.addEventListener('vite:preloadError', () => reportStaleBuild());
}

export function resetStaleBuildForTest(): void {
  reported = false;
}
