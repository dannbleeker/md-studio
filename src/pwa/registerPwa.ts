import { registerSW } from 'virtual:pwa-register';
import { t } from '@/i18n';
import { showToast } from '@/store/ui';

/**
 * The service worker fetches each new deploy in the background; when one is
 * waiting, a toast offers to reload into it. The open document is already
 * persisted, so reloading loses nothing.
 */
export function registerPwa(): void {
  const update = registerSW({
    onNeedRefresh: () =>
      showToast(t('toast.updateReady'), { label: t('toast.reload'), run: () => void update(true) }),
    onOfflineReady: () => showToast(t('toast.offlineReady')),
  });
}
