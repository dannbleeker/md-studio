import { appShortcuts } from '@/domain/appShortcuts';
import { forPlatform } from '@/domain/keys';
import { readKeyBindings } from '@/domain/readKeys';
import { t } from '@/i18n';
import { isMac } from '@/services/platform';
import { useUiStore } from '@/store/ui';
import { Dialog } from '../ui/Dialog';

const READ_KEYS = readKeyBindings();
const APP_KEYS = appShortcuts();

/** The app's shortcuts and Read view's plain-letter keys, listed from the tables that run them. */
export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const mac = isMac();

  return (
    <Dialog open={open} title={t('shortcuts.title')} onClose={() => setOpen(false)}>
      <div className="dialog-body settings">
        <h2>{t('shortcuts.title')}</h2>
        <p>{t('shortcuts.intro')}</p>
        <h3>{t('shortcuts.everywhere')}</h3>
        <dl className="read-keys">
          {APP_KEYS.map(({ action, keys }) => (
            <div key={action}>
              <dt>
                <kbd>{forPlatform(keys, mac)}</kbd>
              </dt>
              <dd>{t(`shortcuts.${action}`)}</dd>
            </div>
          ))}
        </dl>
        <h3>{t('readKeys.title')}</h3>
        <p>{t('readKeys.intro')}</p>
        <dl className="read-keys">
          {READ_KEYS.map(({ action, keys }) => (
            <div key={action}>
              <dt>
                {keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{t(`readKeys.${action}`)}</dd>
            </div>
          ))}
        </dl>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            {t('reader.done')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
