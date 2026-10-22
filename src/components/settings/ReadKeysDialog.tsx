import { readKeyBindings } from '@/domain/readKeys';
import { t } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { Dialog } from '../ui/Dialog';

const BINDINGS = readKeyBindings();

/** The plain-letter keys of Read view, listed from the same table that runs them. */
export function ReadKeysDialog() {
  const open = useUiStore((s) => s.readKeysOpen);
  const setOpen = useUiStore((s) => s.setReadKeysOpen);

  return (
    <Dialog open={open} title={t('readKeys.title')} onClose={() => setOpen(false)}>
      <div className="dialog-body settings">
        <h2>{t('readKeys.title')}</h2>
        <p>{t('readKeys.intro')}</p>
        <dl className="read-keys">
          {BINDINGS.map(({ action, keys }) => (
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
