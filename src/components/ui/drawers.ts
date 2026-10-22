import { isMobileNow } from '@/hooks/useIsMobile';
import { useStore } from '@/store';

/**
 * On a phone the folder and outline panels slide over the document instead
 * of sitting beside it, so picking something in one should get it out of
 * the way. Beside the document (wider screens) they stay where they are.
 */
export function closeDrawers(): void {
  if (!isMobileNow()) return;
  const { settings, updateSettings } = useStore.getState();
  if (settings.showFolder || settings.showOutline)
    updateSettings({ showFolder: false, showOutline: false });
}
