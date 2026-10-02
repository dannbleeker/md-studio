import { t } from '@/i18n';
import { useStore } from '@/store';
import type { ThemePreference, ViewMode } from '@/store/settings';
import { Dialog } from '../ui/Dialog';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const VIEWS: ViewMode[] = ['split', 'text', 'visual'];

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const close = () => setOpen(false);

  return (
    <Dialog open={open} title={t('settings.title')} onClose={close}>
      <div className="dialog-body settings">
        <h2>{t('settings.title')}</h2>

        <fieldset>
          <legend>{t('settings.theme')}</legend>
          {THEMES.map((theme) => (
            <label key={theme} className="radio">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={() => update({ theme })}
              />
              {t(`settings.theme.${theme}`)}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{t('settings.defaultView')}</legend>
          {VIEWS.map((mode) => (
            <label key={mode} className="radio">
              <input
                type="radio"
                name="defaultView"
                value={mode}
                checked={settings.defaultViewMode === mode}
                onChange={() => update({ defaultViewMode: mode })}
              />
              {t(`view.${mode}`)}
            </label>
          ))}
        </fieldset>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.linkedScroll}
            onChange={(e) => update({ linkedScroll: e.target.checked })}
          />
          {t('settings.linkedScroll')}
        </label>

        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={close}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
