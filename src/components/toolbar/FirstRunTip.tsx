import { forPlatform } from '@/domain/keys';
import { t } from '@/i18n';
import { isMac } from '@/services/platform';
import { useStore } from '@/store';

/**
 * One line for a first visit to Read view: how to start editing and where every command is.
 * Gone for good once dismissed, or once Edit has been used.
 */
export function FirstRunTip() {
  const seen = useStore((s) => s.settings.tipSeen);
  const reading = useStore((s) => s.viewMode === 'read');
  if (seen || !reading) return null;
  return (
    <div className="first-run-tip" role="note">
      <span>{t('tip.firstRun', { keys: forPlatform('Ctrl+K', isMac()) })}</span>
      <button
        type="button"
        className="btn-icon"
        aria-label={t('tip.dismiss')}
        title={t('tip.dismiss')}
        onClick={() => useStore.getState().updateSettings({ tipSeen: true })}
      >
        ×
      </button>
    </div>
  );
}
